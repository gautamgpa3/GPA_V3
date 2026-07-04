from datetime import date

from sqlalchemy import text
from sqlmodel import SQLModel, Session, create_engine, select

from backend.core.config import DATABASE_URL
from backend.models.activity import ActivityLog
from backend.models.client import Client
from backend.models.master_data import Category, Owner, Priority, RepeatType, Status
from backend.models.message_schedule import ClientMessageSchedule
from backend.models.task import Task

engine = create_engine(
    DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False},
)

SEED_DATA = {
    Category: ["Client", "Personal", "Finance", "Friend"],
    Priority: ["Urgent", "High", "Normal", "Low"],
    Status: ["Pending", "Going On", "Waiting", "Blocked", "Completed", "Delayed", "Cancelled"],
    Owner: ["Me"],
    RepeatType: ["None", "Daily", "Weekly", "Monthly", "Quarterly", "Yearly", "Custom Days"],
}

TASK_COLUMNS = {
    "uuid": "TEXT",
    "category": "TEXT DEFAULT 'Client'",
    "priority": "TEXT DEFAULT 'Normal'",
    "status": "TEXT DEFAULT 'Pending'",
    "client_id": "INTEGER",
    "start_date": "DATE",
    "due_date": "DATE",
    "reminder": "BOOLEAN DEFAULT 1",
    "repeat_type": "TEXT DEFAULT 'None'",
    "repeat_every": "INTEGER DEFAULT 1",
    "owner": "TEXT DEFAULT 'Me'",
    "issue": "TEXT DEFAULT ''",
    "notes": "TEXT DEFAULT ''",
    "archived": "BOOLEAN DEFAULT 0",
    "telegram_sent": "BOOLEAN DEFAULT 0",
    "completed_at": "DATETIME",
    "created_at": "DATETIME",
    "updated_at": "DATETIME",
}


def create_db():
    SQLModel.metadata.create_all(engine)
    migrate_task_table()
    seed_master_data()


def migrate_task_table():
    with engine.begin() as connection:
        existing = {
            row[1]
            for row in connection.execute(text("PRAGMA table_info(tasks)")).fetchall()
        }
        for column, definition in TASK_COLUMNS.items():
            if column not in existing:
                connection.execute(text(f"ALTER TABLE tasks ADD COLUMN {column} {definition}"))

        today = date.today().isoformat()
        connection.execute(text("UPDATE tasks SET uuid = lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(6))) WHERE uuid IS NULL OR uuid = ''"))
        connection.execute(text("UPDATE tasks SET category = 'Client' WHERE category IS NULL OR category = '' OR category = 'General'"))
        connection.execute(text("UPDATE tasks SET priority = 'Normal' WHERE priority IS NULL OR priority = '' OR priority = 'Medium'"))
        connection.execute(text("UPDATE tasks SET status = 'Pending' WHERE status IS NULL OR status = ''"))
        connection.execute(text("UPDATE tasks SET start_date = :today WHERE start_date IS NULL"), {"today": today})
        connection.execute(text("UPDATE tasks SET reminder = 1 WHERE reminder IS NULL"))
        connection.execute(text("UPDATE tasks SET repeat_type = 'None' WHERE repeat_type IS NULL OR repeat_type = ''"))
        connection.execute(text("UPDATE tasks SET repeat_every = 1 WHERE repeat_every IS NULL OR repeat_every < 1"))
        connection.execute(text("UPDATE tasks SET owner = 'Me' WHERE owner IS NULL OR owner = ''"))
        connection.execute(text("UPDATE tasks SET issue = '' WHERE issue IS NULL"))
        connection.execute(text("UPDATE tasks SET notes = '' WHERE notes IS NULL"))
        connection.execute(text("UPDATE tasks SET archived = 0 WHERE archived IS NULL"))
        connection.execute(text("UPDATE tasks SET telegram_sent = 0 WHERE telegram_sent IS NULL"))


def seed_master_data():
    with Session(engine) as session:
        for model, names in SEED_DATA.items():
            if model is Category:
                existing_items = session.exec(select(model)).all()
                for item in existing_items:
                    if item.name not in names:
                        item.active = False
                        session.add(item)
            for index, name in enumerate(names, start=1):
                exists = session.exec(select(model).where(model.name == name)).first()
                if not exists:
                    session.add(model(name=name, sort_order=index))
                else:
                    exists.sort_order = index
                    exists.active = True
                    session.add(exists)
        session.commit()


def get_session():
    with Session(engine) as session:
        yield session

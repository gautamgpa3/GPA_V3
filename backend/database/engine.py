from datetime import date

from sqlalchemy import text
from sqlmodel import SQLModel, Session, create_engine, select

from backend.core.config import DATABASE_URL
from backend.models.activity import ActivityLog
from backend.models.client import Client
from backend.models.contact import Contact
from backend.models.master_data import Category, Owner, Priority, RepeatType, Status
from backend.models.message_schedule import ClientMessageSchedule
from backend.models.message_template import MessageTemplate
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
    "task_time": "TEXT DEFAULT ''",
    "topic": "TEXT DEFAULT ''",
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

ACTIVITY_COLUMNS = {
    "details": "TEXT DEFAULT ''",
}

CLIENT_COLUMNS = {
    "category": "TEXT DEFAULT 'Client'",
    "email": "TEXT DEFAULT ''",
    "birth_date": "DATE",
}

CONTACT_COLUMNS = {
    "phone": "TEXT DEFAULT ''",
    "whatsapp": "TEXT DEFAULT ''",
    "email": "TEXT DEFAULT ''",
    "company": "TEXT DEFAULT ''",
    "address": "TEXT DEFAULT ''",
    "notes": "TEXT DEFAULT ''",
    "active": "BOOLEAN DEFAULT 1",
    "created_at": "DATETIME",
    "updated_at": "DATETIME",
}

MESSAGE_TEMPLATES = [
    ("client_general", "Client general", "Hello {client_name}, please submit required documents for {work_scope}."),
    ("client_notes", "Task notes", "Hello {client_name}, please submit required documents for {notes}."),
    ("client_block", "Client block", "Hello {client_name}, please submit required documents for {block}."),
    ("task_created", "Task received update", "Hello {client_name}, your work of {task_title} is received and we are working on it. We will update you on the progress."),
    ("task_updated", "Task progress update", "Hello {client_name}, update for {task_title}: {update_details}."),
    ("task_completed", "Task completed update", "Hello {client_name}, your work of {task_title} has been completed."),
    ("client_birthday", "Birthday greeting", "Happy Birthday {client_name}. Wishing you a wonderful year ahead."),
    (
        "telegram_daily",
        "Telegram daily summary",
        "Good morning, Gautam. You have {pending_count} pending task(s), {meeting_count} meeting-related item(s), {bni_tomorrow_count} BNI item(s) tomorrow, and {overdue_count} overdue follow-up(s).",
    ),
]


def create_db():
    SQLModel.metadata.create_all(engine)
    migrate_task_table()
    migrate_activity_table()
    migrate_client_table()
    migrate_contact_table()
    seed_master_data()
    seed_message_templates()


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
        connection.execute(text("UPDATE tasks SET task_time = '' WHERE task_time IS NULL"))
        connection.execute(text("UPDATE tasks SET topic = '' WHERE topic IS NULL"))
        connection.execute(text("UPDATE tasks SET start_date = :today WHERE start_date IS NULL"), {"today": today})
        connection.execute(text("UPDATE tasks SET reminder = 1 WHERE reminder IS NULL"))
        connection.execute(text("UPDATE tasks SET repeat_type = 'None' WHERE repeat_type IS NULL OR repeat_type = ''"))
        connection.execute(text("UPDATE tasks SET repeat_every = 1 WHERE repeat_every IS NULL OR repeat_every < 1"))
        connection.execute(text("UPDATE tasks SET owner = 'Me' WHERE owner IS NULL OR owner = ''"))
        connection.execute(text("UPDATE tasks SET issue = '' WHERE issue IS NULL"))
        connection.execute(text("UPDATE tasks SET notes = '' WHERE notes IS NULL"))
        connection.execute(text("UPDATE tasks SET archived = 0 WHERE archived IS NULL"))
        connection.execute(text("UPDATE tasks SET telegram_sent = 0 WHERE telegram_sent IS NULL"))


def migrate_activity_table():
    with engine.begin() as connection:
        existing = {
            row[1]
            for row in connection.execute(text("PRAGMA table_info(activity_logs)")).fetchall()
        }
        for column, definition in ACTIVITY_COLUMNS.items():
            if column not in existing:
                connection.execute(text(f"ALTER TABLE activity_logs ADD COLUMN {column} {definition}"))
        connection.execute(text("UPDATE activity_logs SET details = '' WHERE details IS NULL"))


def migrate_client_table():
    with engine.begin() as connection:
        existing = {
            row[1]
            for row in connection.execute(text("PRAGMA table_info(clients)")).fetchall()
        }
        for column, definition in CLIENT_COLUMNS.items():
            if column not in existing:
                connection.execute(text(f"ALTER TABLE clients ADD COLUMN {column} {definition}"))
        connection.execute(text("UPDATE clients SET category = 'Client' WHERE category IS NULL OR category = '' OR category = 'General'"))


def migrate_contact_table():
    with engine.begin() as connection:
        existing = {
            row[1]
            for row in connection.execute(text("PRAGMA table_info(contacts)")).fetchall()
        }
        for column, definition in CONTACT_COLUMNS.items():
            if column not in existing:
                connection.execute(text(f"ALTER TABLE contacts ADD COLUMN {column} {definition}"))
        connection.execute(text("UPDATE contacts SET phone = '' WHERE phone IS NULL"))
        connection.execute(text("UPDATE contacts SET whatsapp = '' WHERE whatsapp IS NULL"))
        connection.execute(text("UPDATE contacts SET email = '' WHERE email IS NULL"))
        connection.execute(text("UPDATE contacts SET company = '' WHERE company IS NULL"))
        connection.execute(text("UPDATE contacts SET address = '' WHERE address IS NULL"))
        connection.execute(text("UPDATE contacts SET notes = '' WHERE notes IS NULL"))
        connection.execute(text("UPDATE contacts SET active = 1 WHERE active IS NULL"))


def seed_master_data():
    with Session(engine) as session:
        for model, names in SEED_DATA.items():
            for index, name in enumerate(names, start=1):
                exists = session.exec(select(model).where(model.name == name)).first()
                if not exists:
                    session.add(model(name=name, sort_order=index))
                else:
                    exists.sort_order = index
                    exists.active = True
                    session.add(exists)
        session.commit()


def seed_message_templates():
    with Session(engine) as session:
        for key, name, body in MESSAGE_TEMPLATES:
            exists = session.exec(select(MessageTemplate).where(MessageTemplate.key == key)).first()
            if exists:
                exists.name = name
                session.add(exists)
                continue
            session.add(MessageTemplate(key=key, name=name, body=body))
        session.commit()


def get_session():
    with Session(engine) as session:
        yield session

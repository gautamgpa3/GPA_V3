from sqlmodel import SQLModel, Session, create_engine

from backend.core.config import DATABASE_URL
from backend.models.task import Task

engine = create_engine(
    DATABASE_URL,
    echo=True,
    connect_args={"check_same_thread": False},
)


def create_db():
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session

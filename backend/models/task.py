from datetime import date, datetime
from typing import Optional
from uuid import uuid4

from sqlmodel import Field, SQLModel


class Task(SQLModel, table=True):
    __tablename__ = "tasks"

    id: Optional[int] = Field(default=None, primary_key=True)
    uuid: str = Field(default_factory=lambda: str(uuid4()), index=True, unique=True)
    title: str
    description: str = ""
    category: str = "Client"
    priority: str = "Normal"
    status: str = "Pending"
    client_id: Optional[int] = None
    task_time: str = ""
    topic: str = ""
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    reminder: bool = True
    repeat_type: str = "None"
    repeat_every: int = 1
    owner: str = "Me"
    issue: str = ""
    notes: str = ""
    archived: bool = False
    telegram_sent: bool = False
    completed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

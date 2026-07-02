from datetime import date, datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class Task(SQLModel, table=True):
    __tablename__ = "tasks"

    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    description: str = ""
    category: str = "General"
    priority: str = "Normal"
    status: str = "Pending"
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    reminder: bool = True
    repeat_type: str = "None"
    repeat_every: int = 1
    owner: str = "Me"
    issue: str = ""
    notes: str = ""
    archived: bool = False
    completed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class Task(SQLModel, table=True):
    __tablename__ = "tasks"

    id: Optional[int] = Field(default=None, primary_key=True)

    title: str
    description: str = ""

    status: str = "Pending"

    priority: str = "Medium"

    category: str = "General"

    due_date: Optional[datetime] = None

    completed_at: Optional[datetime] = None

    created_at: datetime = Field(default_factory=datetime.now)

    updated_at: datetime = Field(default_factory=datetime.now)

from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class MessageTemplate(SQLModel, table=True):
    __tablename__ = "message_templates"

    id: Optional[int] = Field(default=None, primary_key=True)
    key: str = Field(index=True, unique=True)
    name: str
    body: str
    active: bool = True
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class Contact(SQLModel, table=True):
    __tablename__ = "contacts"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)
    phone: str = ""
    whatsapp: str = ""
    email: str = ""
    company: str = ""
    address: str = ""
    notes: str = ""
    active: bool = True
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class Client(SQLModel, table=True):
    __tablename__ = "clients"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)
    phone: str = ""
    whatsapp: str = ""
    address: str = ""
    gst_no: str = ""
    work_scope: str = ""
    notes: str = ""
    active: bool = True
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

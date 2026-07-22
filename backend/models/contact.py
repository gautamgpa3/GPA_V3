from datetime import date, datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class Contact(SQLModel, table=True):
    __tablename__ = "contacts"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)
    first_name: str = ""
    last_name: str = ""
    phone: str = ""
    phone_label: str = "Mobile"
    whatsapp: str = ""
    whatsapp_label: str = "WhatsApp"
    email: str = ""
    company: str = ""
    address: str = ""
    location_url: str = ""
    birth_date: date | None = None
    important_date: date | None = None
    important_date_label: str = ""
    related_name: str = ""
    social_profile: str = ""
    notes: str = ""
    google_resource_name: str = ""
    google_etag: str = ""
    active: bool = True
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

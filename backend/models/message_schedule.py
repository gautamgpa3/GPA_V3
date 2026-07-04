from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class ClientMessageSchedule(SQLModel, table=True):
    __tablename__ = "client_message_schedules"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    message_type: str = "general"
    channel: str = "whatsapp"
    audience: str = "all"
    client_ids: str = ""
    cadence: str = "weekly"
    day_of_week: int = 0
    day_of_month: int = 1
    send_time: str = "10:00"
    active: bool = True
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

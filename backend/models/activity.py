from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class ActivityLog(SQLModel, table=True):
    __tablename__ = "activity_logs"

    id: Optional[int] = Field(default=None, primary_key=True)
    action: str
    entity_type: str
    entity_id: Optional[int] = None
    entity_uuid: str = ""
    summary: str
    created_at: datetime = Field(default_factory=datetime.now)

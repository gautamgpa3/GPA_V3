from typing import Optional

from sqlmodel import Field, SQLModel


class Category(SQLModel, table=True):
    __tablename__ = "categories"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)
    sort_order: int = 0
    active: bool = True


class Priority(SQLModel, table=True):
    __tablename__ = "priorities"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)
    sort_order: int = 0
    active: bool = True


class Status(SQLModel, table=True):
    __tablename__ = "statuses"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)
    sort_order: int = 0
    active: bool = True


class Owner(SQLModel, table=True):
    __tablename__ = "owners"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)
    sort_order: int = 0
    active: bool = True


class RepeatType(SQLModel, table=True):
    __tablename__ = "repeat_types"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)
    sort_order: int = 0
    active: bool = True

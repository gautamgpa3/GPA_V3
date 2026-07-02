from calendar import monthrange
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from backend.database.engine import get_session
from backend.models.master_data import Category, Owner, Priority, RepeatType, Status
from backend.models.task import Task

router = APIRouter(prefix="/api", tags=["Tasks"])


class TaskBase(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    category: str = "General"
    priority: str = "Normal"
    status: str = "Pending"
    start_date: date | None = None
    due_date: date | None = None
    reminder: bool = True
    repeat_type: str = "None"
    repeat_every: int = Field(default=1, ge=1)
    owner: str = "Me"
    issue: str = ""
    notes: str = ""
    archived: bool = False


class TaskCreate(TaskBase):
    pass


class TaskUpdate(TaskBase):
    pass


def now() -> datetime:
    return datetime.now()


def add_months(value: date, months: int) -> date:
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, monthrange(year, month)[1])
    return date(year, month, day)


def next_date(value: date | None, repeat_type: str, repeat_every: int) -> date | None:
    if not value:
        return None
    every = max(repeat_every or 1, 1)
    repeat = (repeat_type or "None").lower()
    if repeat == "daily":
        return value + timedelta(days=every)
    if repeat == "weekly":
        return value + timedelta(weeks=every)
    if repeat == "monthly":
        return add_months(value, every)
    if repeat == "quarterly":
        return add_months(value, every * 3)
    if repeat == "yearly":
        return add_months(value, every * 12)
    if repeat == "custom days":
        return value + timedelta(days=every)
    return None


def normalize_task_data(task_data: TaskCreate | TaskUpdate) -> dict:
    data = task_data.model_dump()
    data["title"] = data["title"].strip()
    data["category"] = data["category"].strip() or "General"
    data["priority"] = data["priority"].strip() or "Normal"
    data["status"] = data["status"].strip() or "Pending"
    data["repeat_type"] = data["repeat_type"].strip() or "None"
    data["owner"] = data["owner"].strip() or "Me"
    data["issue"] = data["issue"].strip()
    data["notes"] = data["notes"].strip()
    if data["start_date"] is None:
        data["start_date"] = date.today()
    if data["repeat_type"] == "None":
        data["repeat_every"] = 1
    return data


def apply_task_data(task: Task, task_data: TaskCreate | TaskUpdate) -> Task:
    for field, value in normalize_task_data(task_data).items():
        setattr(task, field, value)
    if task.status == "Completed" and task.completed_at is None:
        task.completed_at = now()
    if task.status != "Completed":
        task.completed_at = None
    task.updated_at = now()
    return task


def create_next_occurrence(task: Task) -> Task | None:
    next_due = next_date(task.due_date, task.repeat_type, task.repeat_every)
    next_start = next_date(task.start_date, task.repeat_type, task.repeat_every)
    if not next_due and not next_start:
        return None

    return Task(
        title=task.title,
        description=task.description,
        category=task.category,
        priority=task.priority,
        status="Pending",
        start_date=next_start or next_due,
        due_date=next_due,
        reminder=task.reminder,
        repeat_type=task.repeat_type,
        repeat_every=task.repeat_every,
        owner=task.owner,
        issue="",
        notes=f"Auto-created after task #{task.id} was completed.",
        archived=False,
    )


def get_task_or_404(task_id: int, session: Session) -> Task:
    task = session.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


def master_names(session: Session, model) -> list[str]:
    statement = select(model).where(model.active == True).order_by(model.sort_order, model.name)  # noqa: E712
    return [item.name for item in session.exec(statement).all()]


@router.get("/master-data")
def get_master_data(session: Session = Depends(get_session)):
    return {
        "categories": master_names(session, Category),
        "priorities": master_names(session, Priority),
        "statuses": master_names(session, Status),
        "owners": master_names(session, Owner),
        "repeat_types": master_names(session, RepeatType),
    }


@router.get("/tasks")
def get_tasks(include_archived: bool = False, session: Session = Depends(get_session)):
    statement = select(Task)
    if not include_archived:
        statement = statement.where(Task.archived == False)  # noqa: E712
    return session.exec(statement.order_by(Task.due_date, Task.priority, Task.id)).all()


@router.post("/tasks")
def create_task(task_data: TaskCreate, session: Session = Depends(get_session)):
    task = Task(created_at=now(), **normalize_task_data(task_data))
    session.add(task)
    session.commit()
    session.refresh(task)
    return task


@router.put("/tasks/{task_id}")
def update_task(task_id: int, task_data: TaskUpdate, session: Session = Depends(get_session)):
    task = apply_task_data(get_task_or_404(task_id, session), task_data)
    session.add(task)
    session.commit()
    session.refresh(task)
    return task


@router.put("/tasks/{task_id}/complete")
def complete_task(task_id: int, session: Session = Depends(get_session)):
    task = get_task_or_404(task_id, session)
    if task.status != "Completed":
        task.status = "Completed"
        task.completed_at = now()
        task.updated_at = now()
        session.add(task)
        next_task = create_next_occurrence(task)
        if next_task:
            session.add(next_task)
    session.commit()
    session.refresh(task)
    return task


@router.delete("/tasks/{task_id}")
def delete_task(task_id: int, session: Session = Depends(get_session)):
    task = get_task_or_404(task_id, session)
    session.delete(task)
    session.commit()
    return {"success": True, "message": "Task deleted successfully"}

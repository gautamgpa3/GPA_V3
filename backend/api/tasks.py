from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session, select

from backend.database.engine import get_session
from backend.models.task import Task

router = APIRouter(prefix="/api/tasks", tags=["Tasks"])


class TaskCreate(BaseModel):
    title: str
    description: str = ""
    priority: str = "Medium"
    category: str = "General"
    due_date: datetime | None = None

class TaskUpdate(BaseModel):
    title: str
    description: str = ""
    priority: str = "Medium"
    category: str = "General"
    status: str = "Pending"
    due_date: datetime | None = None


@router.get("/")
def get_tasks(session: Session = Depends(get_session)):
    return session.exec(select(Task)).all()


@router.post("/")
def create_task(
    task: TaskCreate,
    session: Session = Depends(get_session),
):
    db_task = Task(
        title=task.title,
        description=task.description,
        priority=task.priority,
        category=task.category,
        due_date=task.due_date,
    )

    session.add(db_task)
    session.commit()
    session.refresh(db_task)

    return db_task
@router.put("/{task_id}/complete")
def complete_task(
    task_id: int,
    session: Session = Depends(get_session),
):
    task = session.get(Task, task_id)

    if not task:
        return {"success": False, "message": "Task not found"}

    task.status = "Completed"
    task.completed_at = datetime.now()
    task.updated_at = datetime.now()

    session.add(task)
    session.commit()
    session.refresh(task)

    return task
@router.put("/{task_id}")
def update_task(
    task_id: int,
    task_data: TaskUpdate,
    session: Session = Depends(get_session),
):
    task = session.get(Task, task_id)

    if not task:
        return {"success": False, "message": "Task not found"}

    task.title = task_data.title
    task.description = task_data.description
    task.priority = task_data.priority
    task.category = task_data.category
    task.status = task_data.status
    task.due_date = task_data.due_date
    task.updated_at = datetime.now()

    session.add(task)
    session.commit()
    session.refresh(task)

    return task


@router.delete("/{task_id}")
def delete_task(
    task_id: int,
    session: Session = Depends(get_session),
):
    task = session.get(Task, task_id)

    if not task:
        return {"success": False, "message": "Task not found"}

    session.delete(task)
    session.commit()

    return {
        "success": True,
        "message": "Task deleted successfully"
    }

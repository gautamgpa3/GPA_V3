from calendar import monthrange
from datetime import date, datetime, timedelta
from re import search

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from backend.database.engine import get_session
from backend.models.activity import ActivityLog
from backend.models.client import Client
from backend.models.master_data import Category, Owner, Priority, RepeatType, Status
from backend.models.task import Task

router = APIRouter(prefix="/api", tags=["Tasks"])


class TaskBase(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    category: str = "Client"
    priority: str = "Normal"
    status: str = "Pending"
    client_id: int | None = None
    start_date: date | None = None
    due_date: date
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


class MasterItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class MasterItemUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    active: bool = True


class ClientBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    phone: str = Field(min_length=1, max_length=40)
    whatsapp: str = ""
    address: str = ""
    gst_no: str = ""
    work_scope: str = ""
    notes: str = ""
    active: bool = True


class AssistantCommand(BaseModel):
    text: str = Field(min_length=1, max_length=1000)


class ClientCreate(ClientBase):
    pass


class ClientUpdate(ClientBase):
    pass


MASTER_MODELS = {
    "categories": Category,
    "owners": Owner,
}


def now() -> datetime:
    return datetime.now()


def log_activity(session: Session, action: str, entity_type: str, summary: str, entity_id: int | None = None, entity_uuid: str = ""):
    session.add(
        ActivityLog(
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            entity_uuid=entity_uuid,
            summary=summary,
        )
    )


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


def normalize_task_data(task_data: TaskCreate | TaskUpdate, session: Session) -> dict:
    data = task_data.model_dump()
    data["title"] = data["title"].strip()
    if not data["title"]:
        raise HTTPException(status_code=400, detail="Task title is required")
    data["category"] = data["category"].strip() or "Client"
    data["priority"] = data["priority"].strip() or "Normal"
    data["status"] = data["status"].strip() or "Pending"
    data["repeat_type"] = data["repeat_type"].strip() or "None"
    data["owner"] = data["owner"].strip() or "Me"
    data["issue"] = data["issue"].strip()
    data["notes"] = data["notes"].strip()
    if data["start_date"] is None:
        data["start_date"] = date.today()
    if data["due_date"] < data["start_date"]:
        raise HTTPException(status_code=400, detail="Due date cannot be before start date")
    if data["repeat_type"] == "None":
        data["repeat_every"] = 1
    ensure_master_value(session, Category, data["category"], "category")
    ensure_master_value(session, Priority, data["priority"], "priority")
    ensure_master_value(session, Status, data["status"], "status")
    ensure_master_value(session, Owner, data["owner"], "assigned to")
    ensure_master_value(session, RepeatType, data["repeat_type"], "repeat type")
    if data["client_id"] is not None and not session.get(Client, data["client_id"]):
        raise HTTPException(status_code=400, detail="Selected client does not exist")
    return data


def apply_task_data(task: Task, task_data: TaskCreate | TaskUpdate, session: Session) -> Task:
    for field, value in normalize_task_data(task_data, session).items():
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
        client_id=task.client_id,
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


def master_items(session: Session, model) -> list[dict]:
    statement = select(model).where(model.active == True).order_by(model.sort_order, model.name)  # noqa: E712
    return [{"id": item.id, "name": item.name} for item in session.exec(statement).all()]


def get_master_model(master_type: str):
    model = MASTER_MODELS.get(master_type)
    if not model:
        raise HTTPException(status_code=404, detail="Master data type not found")
    return model


def ensure_master_value(session: Session, model, value: str, label: str):
    exists = session.exec(
        select(model).where(model.name == value, model.active == True)  # noqa: E712
    ).first()
    if not exists:
        raise HTTPException(status_code=400, detail=f"Invalid {label}: {value}")


def normalize_client_data(client_data: ClientCreate | ClientUpdate) -> dict:
    data = client_data.model_dump()
    for key, value in data.items():
        if isinstance(value, str):
            data[key] = value.strip()
    if not data["name"]:
        raise HTTPException(status_code=400, detail="Client name is required")
    if not data["phone"]:
        raise HTTPException(status_code=400, detail="Client phone is required")
    return data


def parse_assistant_date(text: str) -> date:
    lower = text.lower()
    today = date.today()
    if "tomorrow" in lower:
        return today + timedelta(days=1)
    if "next monday" in lower:
        days = (7 - today.weekday()) % 7
        return today + timedelta(days=days or 7)
    days_match = search(r"after\s+(\d+)\s+days?", lower)
    if days_match:
        return today + timedelta(days=int(days_match.group(1)))
    return today


def assistant_task_title(text: str) -> str:
    cleaned = text.strip()
    for prefix in ("remind me to", "remind me", "schedule", "add", "create task"):
        if cleaned.lower().startswith(prefix):
            cleaned = cleaned[len(prefix):].strip()
    for marker in (" tomorrow", " next monday", " after "):
        index = cleaned.lower().find(marker)
        if index >= 0:
            cleaned = cleaned[:index].strip()
    return cleaned[:200] or "Voice task"


def task_matches(task: Task, text: str) -> bool:
    terms = [term for term in text.lower().replace("complete", "").replace("task", "").split() if len(term) > 2]
    haystack = f"{task.title} {task.description} {task.category} {task.owner} {task.issue} {task.notes}".lower()
    return all(term in haystack for term in terms[:4]) if terms else False


@router.get("/master-data")
def get_master_data(session: Session = Depends(get_session)):
    return {
        "categories": master_names(session, Category),
        "priorities": master_names(session, Priority),
        "statuses": master_names(session, Status),
        "owners": master_names(session, Owner),
        "repeat_types": master_names(session, RepeatType),
        "category_items": master_items(session, Category),
        "owner_items": master_items(session, Owner),
    }


@router.post("/master-data/{master_type}")
def create_master_item(master_type: str, item_data: MasterItemCreate, session: Session = Depends(get_session)):
    model = get_master_model(master_type)
    name = item_data.name.strip()
    existing = session.exec(select(model).where(model.name == name)).first()
    if existing:
        existing.active = True
        session.add(existing)
        log_activity(session, "RESTORED", master_type, f"Restored {master_type}: {existing.name}", existing.id)
        session.commit()
        session.refresh(existing)
        return existing
    sort_order = len(session.exec(select(model)).all()) + 1
    item = model(name=name, sort_order=sort_order)
    session.add(item)
    session.flush()
    log_activity(session, "CREATED", master_type, f"Added {master_type}: {item.name}", item.id)
    session.commit()
    session.refresh(item)
    return item


@router.put("/master-data/{master_type}/{item_id}")
def update_master_item(master_type: str, item_id: int, item_data: MasterItemUpdate, session: Session = Depends(get_session)):
    model = get_master_model(master_type)
    item = session.get(model, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Master data item not found")
    item.name = item_data.name.strip()
    item.active = item_data.active
    session.add(item)
    log_activity(session, "UPDATED", master_type, f"Updated {master_type}: {item.name}", item.id)
    session.commit()
    session.refresh(item)
    return item


@router.delete("/master-data/{master_type}/{item_id}")
def delete_master_item(master_type: str, item_id: int, session: Session = Depends(get_session)):
    model = get_master_model(master_type)
    item = session.get(model, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Master data item not found")
    item.active = False
    session.add(item)
    log_activity(session, "DELETED", master_type, f"Deleted {master_type}: {item.name}", item.id)
    session.commit()
    return {"success": True, "message": "Master data item deleted"}


@router.get("/clients")
def get_clients(include_inactive: bool = False, session: Session = Depends(get_session)):
    statement = select(Client)
    if not include_inactive:
        statement = statement.where(Client.active == True)  # noqa: E712
    return session.exec(statement.order_by(Client.name)).all()


@router.post("/clients")
def create_client(client_data: ClientCreate, session: Session = Depends(get_session)):
    data = normalize_client_data(client_data)
    existing = session.exec(select(Client).where(Client.name == data["name"])).first()
    if existing:
        raise HTTPException(status_code=400, detail="Client name already exists")
    client = Client(**data, updated_at=now())
    session.add(client)
    session.flush()
    log_activity(session, "CREATED", "client", f"Added client: {client.name}", client.id)
    session.commit()
    session.refresh(client)
    return client


@router.put("/clients/{client_id}")
def update_client(client_id: int, client_data: ClientUpdate, session: Session = Depends(get_session)):
    client = session.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    data = normalize_client_data(client_data)
    duplicate = session.exec(select(Client).where(Client.name == data["name"], Client.id != client_id)).first()
    if duplicate:
        raise HTTPException(status_code=400, detail="Client name already exists")
    for field, value in data.items():
        setattr(client, field, value)
    client.updated_at = now()
    session.add(client)
    log_activity(session, "UPDATED", "client", f"Updated client: {client.name}", client.id)
    session.commit()
    session.refresh(client)
    return client


@router.delete("/clients/{client_id}")
def delete_client(client_id: int, session: Session = Depends(get_session)):
    client = session.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    client.active = False
    client.updated_at = now()
    session.add(client)
    log_activity(session, "DELETED", "client", f"Deleted client: {client.name}", client.id)
    session.commit()
    return {"success": True, "message": "Client deleted"}


@router.get("/tasks")
def get_tasks(include_archived: bool = False, session: Session = Depends(get_session)):
    statement = select(Task)
    if not include_archived:
        statement = statement.where(Task.archived == False)  # noqa: E712
    return session.exec(statement.order_by(Task.due_date, Task.priority, Task.id)).all()


@router.get("/activity")
def get_activity(limit: int = 25, session: Session = Depends(get_session)):
    statement = select(ActivityLog).order_by(ActivityLog.created_at.desc()).limit(max(1, min(limit, 100)))
    return session.exec(statement).all()


@router.post("/tasks")
def create_task(task_data: TaskCreate, session: Session = Depends(get_session)):
    task = Task(created_at=now(), **normalize_task_data(task_data, session))
    session.add(task)
    session.flush()
    log_activity(session, "CREATED", "task", f"Added task: {task.title}", task.id, task.uuid)
    session.commit()
    session.refresh(task)
    return task


@router.put("/tasks/{task_id}")
def update_task(task_id: int, task_data: TaskUpdate, session: Session = Depends(get_session)):
    task = apply_task_data(get_task_or_404(task_id, session), task_data, session)
    session.add(task)
    log_activity(session, "UPDATED", "task", f"Updated task: {task.title}", task.id, task.uuid)
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
        log_activity(session, "COMPLETED", "task", f"Completed task: {task.title}", task.id, task.uuid)
        next_task = create_next_occurrence(task)
        if next_task:
            session.add(next_task)
            session.flush()
            log_activity(session, "CREATED", "task", f"Auto-created recurring task: {next_task.title}", next_task.id, next_task.uuid)
    session.commit()
    session.refresh(task)
    return task


@router.delete("/tasks/{task_id}")
def delete_task(task_id: int, session: Session = Depends(get_session)):
    task = get_task_or_404(task_id, session)
    log_activity(session, "DELETED", "task", f"Deleted task: {task.title}", task.id, task.uuid)
    session.delete(task)
    session.commit()
    return {"success": True, "message": "Task deleted successfully"}


@router.post("/assistant/command")
def assistant_command(command: AssistantCommand, session: Session = Depends(get_session)):
    text = command.text.strip()
    lower = text.lower()

    if any(phrase in lower for phrase in ("show pending", "pending tasks", "what work is pending", "what is pending")):
        tasks = session.exec(select(Task).where(Task.status != "Completed", Task.archived == False).order_by(Task.due_date)).all()  # noqa: E712
        return {
            "action": "ANSWER",
            "message": f"{len(tasks)} pending task(s).",
            "tasks": tasks[:10],
        }

    if lower.startswith("how many") and "pending" in lower:
        count = len(session.exec(select(Task).where(Task.status != "Completed", Task.archived == False)).all())  # noqa: E712
        return {"action": "ANSWER", "message": f"{count} pending task(s) remain."}

    if lower.startswith("complete") or lower.startswith("mark") and "complete" in lower:
        candidates = session.exec(select(Task).where(Task.status != "Completed", Task.archived == False).order_by(Task.due_date)).all()  # noqa: E712
        task = next((item for item in candidates if task_matches(item, lower)), candidates[0] if candidates and "first" in lower else None)
        if not task:
            return {"action": "NEEDS_CLARIFICATION", "message": "I could not find the task to complete."}
        task.status = "Completed"
        task.completed_at = now()
        task.updated_at = now()
        session.add(task)
        log_activity(session, "COMPLETED", "task", f"AI completed task: {task.title}", task.id, task.uuid)
        session.commit()
        session.refresh(task)
        return {"action": "COMPLETED_TASK", "message": f"Completed: {task.title}", "task": task}

    if "remind me" in lower or lower.startswith("schedule") or lower.startswith("add"):
        due = parse_assistant_date(lower)
        title = assistant_task_title(text)
        task = Task(
            title=title,
            description=f"Captured from assistant: {text}",
            category="Client",
            priority="Normal",
            status="Pending",
            start_date=date.today(),
            due_date=due,
            owner="Me",
            notes=text,
        )
        session.add(task)
        session.flush()
        log_activity(session, "CREATED", "task", f"AI added task: {task.title}", task.id, task.uuid)
        session.commit()
        session.refresh(task)
        return {"action": "CREATED_TASK", "message": f"Added: {task.title}", "task": task}

    return {
        "action": "NEEDS_CLARIFICATION",
        "message": "I did not understand that yet. Try: Remind me to call Kalpesh tomorrow, show pending tasks, or complete the first task.",
    }

from calendar import monthrange
from datetime import date, datetime, timedelta
from re import search, sub

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from backend.database.engine import get_session
from backend.models.activity import ActivityLog
from backend.models.client import Client
from backend.models.master_data import Category, Owner, Priority, RepeatType, Status
from backend.models.message_schedule import ClientMessageSchedule
from backend.models.message_template import MessageTemplate
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
    category: str = "Client"
    phone: str = Field(min_length=1, max_length=40)
    whatsapp: str = ""
    address: str = ""
    gst_no: str = ""
    work_scope: str = ""
    birth_date: date | None = None
    notes: str = ""
    active: bool = True


class AssistantCommand(BaseModel):
    text: str = Field(min_length=1, max_length=1000)


class ClientCreate(ClientBase):
    pass


class ClientUpdate(ClientBase):
    pass


class MessageScheduleBase(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    message_type: str = "general"
    channel: str = "whatsapp"
    audience: str = "all"
    client_ids: list[int] = []
    cadence: str = "weekly"
    day_of_week: int = Field(default=0, ge=0, le=6)
    day_of_month: int = Field(default=1, ge=1, le=31)
    send_time: str = Field(default="10:00", pattern=r"^\d{2}:\d{2}$")
    active: bool = True


class MessageScheduleCreate(MessageScheduleBase):
    pass


class MessageScheduleUpdate(MessageScheduleBase):
    pass


class MessageTemplateUpdate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)
    active: bool = True


MASTER_MODELS = {
    "categories": Category,
    "priorities": Priority,
    "statuses": Status,
    "owners": Owner,
    "repeat-types": RepeatType,
    "repeat_types": RepeatType,
}


def now() -> datetime:
    return datetime.now()


def log_activity(
    session: Session,
    action: str,
    entity_type: str,
    summary: str,
    entity_id: int | None = None,
    entity_uuid: str = "",
    details: str = "",
):
    session.add(
        ActivityLog(
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            entity_uuid=entity_uuid,
            summary=summary,
            details=details,
        )
    )


TASK_AUDIT_FIELDS = [
    "title",
    "description",
    "category",
    "priority",
    "status",
    "client_id",
    "start_date",
    "due_date",
    "reminder",
    "repeat_type",
    "repeat_every",
    "owner",
    "issue",
    "notes",
    "archived",
]


def display_audit_value(value) -> str:
    if value is None:
        return "blank"
    if isinstance(value, bool):
        return "Yes" if value else "No"
    text = str(value).strip()
    return text or "blank"


def task_change_details(task: Task, data: dict) -> str:
    changes = []
    for field in TASK_AUDIT_FIELDS:
        old_value = getattr(task, field)
        new_value = data.get(field)
        if old_value != new_value:
            label = field.replace("_", " ").title()
            changes.append(f"{label}: {display_audit_value(old_value)} -> {display_audit_value(new_value)}")
    return "; ".join(changes)


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
    ensure_master_value(session, Priority, data["priority"], "priority")
    ensure_master_value(session, Status, data["status"], "status")
    ensure_master_value(session, Owner, data["owner"], "assigned to")
    ensure_master_value(session, RepeatType, data["repeat_type"], "repeat type")
    client = session.get(Client, data["client_id"]) if data["client_id"] is not None else None
    if data["client_id"] is not None and not client:
        raise HTTPException(status_code=400, detail="Selected client does not exist")
    if client:
        data["category"] = client.category or "Client"
    ensure_master_value(session, Category, data["category"], "category")
    return data


def apply_task_data(task: Task, task_data: TaskCreate | TaskUpdate, session: Session) -> tuple[Task, str]:
    data = normalize_task_data(task_data, session)
    changes = task_change_details(task, data)
    for field, value in data.items():
        setattr(task, field, value)
    if task.status == "Completed" and task.completed_at is None:
        task.completed_at = now()
    if task.status != "Completed":
        task.completed_at = None
    task.updated_at = now()
    return task, changes


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
    statement = select(model).where(model.active == True).order_by(model.name)  # noqa: E712
    return [item.name for item in session.exec(statement).all()]


def master_items(session: Session, model) -> list[dict]:
    statement = select(model).where(model.active == True).order_by(model.name)  # noqa: E712
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


def normalize_phone_number(value: str, label: str, required: bool = False) -> str:
    digits = sub(r"\D", "", value or "")
    if not digits:
        if required:
            raise HTTPException(status_code=400, detail=f"{label} is required")
        return ""
    if len(digits) != 10:
        raise HTTPException(status_code=400, detail=f"{label} must be exactly 10 digits")
    return digits


def normalize_client_data(client_data: ClientCreate | ClientUpdate, session: Session) -> dict:
    data = client_data.model_dump()
    for key, value in data.items():
        if isinstance(value, str):
            data[key] = value.strip()
    if not data["name"]:
        raise HTTPException(status_code=400, detail="Client name is required")
    data["category"] = data["category"] or "Client"
    ensure_master_value(session, Category, data["category"], "category")
    data["phone"] = normalize_phone_number(data["phone"], "Mobile / SMS", required=True)
    data["whatsapp"] = normalize_phone_number(data["whatsapp"], "WhatsApp")
    return data


def normalize_schedule_data(schedule_data: MessageScheduleCreate | MessageScheduleUpdate, session: Session) -> dict:
    data = schedule_data.model_dump()
    data["name"] = data["name"].strip()
    data["message_type"] = data["message_type"].strip().lower()
    data["channel"] = data["channel"].strip().lower()
    data["audience"] = data["audience"].strip().lower()
    data["cadence"] = data["cadence"].strip().lower()
    if data["message_type"] not in {"general", "notes", "block"}:
        raise HTTPException(status_code=400, detail="Invalid message type")
    if data["channel"] not in {"whatsapp", "sms"}:
        raise HTTPException(status_code=400, detail="Invalid channel")
    if data["audience"] not in {"all", "selected"}:
        raise HTTPException(status_code=400, detail="Invalid audience")
    if data["cadence"] not in {"daily", "weekly", "monthly"}:
        raise HTTPException(status_code=400, detail="Invalid cadence")
    hour, minute = [int(part) for part in data["send_time"].split(":")]
    if hour > 23 or minute > 59:
        raise HTTPException(status_code=400, detail="Invalid send time")
    client_ids = sorted({int(client_id) for client_id in data.pop("client_ids")})
    for client_id in client_ids:
        client = session.get(Client, client_id)
        if not client or not client.active:
            raise HTTPException(status_code=400, detail=f"Invalid client selected: {client_id}")
    if data["audience"] == "selected" and not client_ids:
        raise HTTPException(status_code=400, detail="Select at least one client")
    data["client_ids"] = ",".join(str(client_id) for client_id in client_ids)
    return data


def render_template(template: str, values: dict[str, object]) -> str:
    result = template
    for key, value in values.items():
        result = result.replace(f"{{{key}}}", str("" if value is None else value))
    return result.strip()


def message_template_body(session: Session, key: str, fallback: str) -> str:
    template = session.exec(
        select(MessageTemplate).where(MessageTemplate.key == key, MessageTemplate.active == True)  # noqa: E712
    ).first()
    return template.body if template else fallback


def schedule_client_ids(schedule: ClientMessageSchedule) -> list[int]:
    return [int(value) for value in schedule.client_ids.split(",") if value.strip().isdigit()]


def schedule_payload(schedule: ClientMessageSchedule) -> dict:
    data = schedule.model_dump()
    data["client_ids"] = schedule_client_ids(schedule)
    return data


def schedule_is_due(schedule: ClientMessageSchedule, at_time: datetime) -> bool:
    try:
        hour, minute = [int(part) for part in schedule.send_time.split(":")]
    except ValueError:
        return False
    if (at_time.hour, at_time.minute) < (hour, minute):
        return False
    if schedule.cadence == "daily":
        return True
    if schedule.cadence == "weekly":
        return at_time.weekday() == schedule.day_of_week
    if schedule.cadence == "monthly":
        return at_time.day == min(schedule.day_of_month, monthrange(at_time.year, at_time.month)[1])
    return False


def client_message_content(session: Session, client: Client, message_type: str) -> str:
    if message_type == "notes":
        tasks = session.exec(
            select(Task).where(
                Task.client_id == client.id,
                Task.archived == False,  # noqa: E712
                Task.status != "Completed",
            )
        ).all()
        return "; ".join(task.notes.strip() for task in tasks if task.notes.strip())
    if message_type == "block":
        active_tasks_for_client = session.exec(
            select(Task).where(
                Task.client_id == client.id,
                Task.archived == False,  # noqa: E712
                Task.status != "Completed",
            )
        ).all()
        blockers = []
        for task in active_tasks_for_client:
            block_text = (task.issue or task.notes or "").strip()
            if task.status == "Blocked" or block_text:
                blockers.append(block_text or f"{task.title} is blocked.")
        return "; ".join(blockers)
    return client.work_scope.strip() or "your pending work"


def client_message_text(session: Session, client: Client, message_type: str) -> str:
    message_content = client_message_content(session, client, message_type)
    if not message_content:
        return ""
    key = f"client_{message_type}"
    fallback_variables = {
        "general": "{work_scope}",
        "notes": "{notes}",
        "block": "{block}",
    }
    fallback = f"Hello {{client_name}}, please submit required documents for {fallback_variables.get(message_type, '{work_scope}')}."
    template = message_template_body(session, key, fallback)
    return render_template(
        template,
        {
            "client_name": client.name,
            "work_scope": message_content,
            "notes": message_content,
            "block": message_content,
        },
    )


def birthday_message_text(session: Session, client: Client) -> str:
    template = message_template_body(session, "client_birthday", "Happy Birthday {client_name}. Wishing you a wonderful year ahead.")
    return render_template(
        template,
        {
            "client_name": client.name,
            "birth_date": client.birth_date.isoformat() if client.birth_date else "",
        },
    )


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


def active_tasks(session: Session) -> list[Task]:
    return session.exec(
        select(Task).where(Task.status != "Completed", Task.archived == False).order_by(Task.due_date, Task.priority)  # noqa: E712
    ).all()


def task_contains(task: Task, *terms: str) -> bool:
    haystack = f"{task.title} {task.description} {task.category} {task.issue} {task.notes}".lower()
    return any(term.lower() in haystack for term in terms)


def build_briefing(session: Session) -> dict:
    today = date.today()
    tomorrow = today + timedelta(days=1)
    tasks = active_tasks(session)
    due_today = [task for task in tasks if task.due_date == today]
    overdue = [task for task in tasks if task.due_date and task.due_date < today]
    upcoming = [task for task in tasks if task.due_date and today < task.due_date <= today + timedelta(days=7)]
    meetings = [task for task in tasks if task_contains(task, "meeting", "meet", "bni")]
    bni_tomorrow = [task for task in tasks if task.due_date == tomorrow and task_contains(task, "bni")]
    quotations_due = [task for task in due_today if task_contains(task, "quotation", "quote")]
    priorities = sorted(due_today + overdue, key=lambda item: (item.due_date or today, item.priority != "Urgent", item.priority != "High"))[:6]

    suggestions = []
    if quotations_due:
        suggestions.append(f"Finish {quotations_due[0].title} today.")
    if overdue:
        suggestions.append(f"Clear {len(overdue)} overdue follow-up(s) before new work.")
    if bni_tomorrow:
        suggestions.append("Prepare for tomorrow's BNI item today.")
    if not suggestions:
        suggestions.append("No urgent pattern found. Keep today's active list clean.")

    return {
        "greeting": "Good morning, Gautam.",
        "date": today.isoformat(),
        "pending_count": len(tasks),
        "meeting_count": len(meetings),
        "bni_tomorrow_count": len(bni_tomorrow),
        "overdue_count": len(overdue),
        "due_today_count": len(due_today),
        "tasks": tasks,
        "priorities": priorities,
        "upcoming": upcoming[:6],
        "suggestions": suggestions,
        "message": (
            f"Good morning, Gautam. You have {len(tasks)} pending task(s), "
            f"{len(meetings)} meeting-related item(s), {len(bni_tomorrow)} BNI item(s) tomorrow, "
            f"and {len(overdue)} overdue follow-up(s)."
        ),
    }


def client_context(session: Session, text: str) -> dict | None:
    clients = session.exec(select(Client).where(Client.active == True).order_by(Client.name)).all()  # noqa: E712
    client = next((item for item in clients if item.name.lower() in text.lower()), None)
    if not client:
        return None
    tasks = session.exec(
        select(Task).where(Task.client_id == client.id, Task.archived == False).order_by(Task.due_date)  # noqa: E712
    ).all()
    activity = session.exec(
        select(ActivityLog).where(ActivityLog.entity_type == "client", ActivityLog.entity_id == client.id).order_by(ActivityLog.created_at.desc()).limit(5)
    ).all()
    return {
        "client": client,
        "pending_tasks": [task for task in tasks if task.status != "Completed"],
        "completed_tasks": [task for task in tasks if task.status == "Completed"][:5],
        "activity": activity,
        "message": f"{client.name}: {len([task for task in tasks if task.status != 'Completed'])} pending task(s). Work scope: {client.work_scope or 'not recorded'}.",
    }


@router.get("/master-data")
def get_master_data(session: Session = Depends(get_session)):
    return {
        "categories": master_names(session, Category),
        "priorities": master_names(session, Priority),
        "statuses": master_names(session, Status),
        "owners": master_names(session, Owner),
        "repeat_types": master_names(session, RepeatType),
        "category_items": master_items(session, Category),
        "priority_items": master_items(session, Priority),
        "status_items": master_items(session, Status),
        "owner_items": master_items(session, Owner),
        "repeat_type_items": master_items(session, RepeatType),
    }


@router.get("/message-templates")
def get_message_templates(session: Session = Depends(get_session)):
    return session.exec(select(MessageTemplate).where(MessageTemplate.active == True).order_by(MessageTemplate.id)).all()  # noqa: E712


@router.put("/message-templates/{template_key}")
def update_message_template(template_key: str, template_data: MessageTemplateUpdate, session: Session = Depends(get_session)):
    template = session.exec(select(MessageTemplate).where(MessageTemplate.key == template_key)).first()
    if not template:
        raise HTTPException(status_code=404, detail="Message template not found")
    template.body = template_data.body.strip()
    template.active = template_data.active
    template.updated_at = now()
    session.add(template)
    log_activity(session, "UPDATED", "message_template", f"Updated message template: {template.name}", template.id)
    session.commit()
    session.refresh(template)
    return template


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
    data = normalize_client_data(client_data, session)
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
    data = normalize_client_data(client_data, session)
    duplicate = session.exec(select(Client).where(Client.name == data["name"], Client.id != client_id)).first()
    if duplicate:
        raise HTTPException(status_code=400, detail="Client name already exists")
    for field, value in data.items():
        setattr(client, field, value)
    client.updated_at = now()
    session.add(client)
    linked_tasks = session.exec(select(Task).where(Task.client_id == client.id)).all()
    for task in linked_tasks:
        task.category = client.category
        task.updated_at = now()
        session.add(task)
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


@router.get("/client-message-schedules")
def get_message_schedules(session: Session = Depends(get_session)):
    schedules = session.exec(select(ClientMessageSchedule).order_by(ClientMessageSchedule.send_time, ClientMessageSchedule.name)).all()
    return [schedule_payload(schedule) for schedule in schedules]


@router.post("/client-message-schedules")
def create_message_schedule(schedule_data: MessageScheduleCreate, session: Session = Depends(get_session)):
    data = normalize_schedule_data(schedule_data, session)
    schedule = ClientMessageSchedule(**data, updated_at=now())
    session.add(schedule)
    session.flush()
    log_activity(session, "CREATED", "client_message_schedule", f"Added message schedule: {schedule.name}", schedule.id)
    session.commit()
    session.refresh(schedule)
    return schedule_payload(schedule)


@router.put("/client-message-schedules/{schedule_id}")
def update_message_schedule(schedule_id: int, schedule_data: MessageScheduleUpdate, session: Session = Depends(get_session)):
    schedule = session.get(ClientMessageSchedule, schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Message schedule not found")
    data = normalize_schedule_data(schedule_data, session)
    for field, value in data.items():
        setattr(schedule, field, value)
    schedule.updated_at = now()
    session.add(schedule)
    log_activity(session, "UPDATED", "client_message_schedule", f"Updated message schedule: {schedule.name}", schedule.id)
    session.commit()
    session.refresh(schedule)
    return schedule_payload(schedule)


@router.delete("/client-message-schedules/{schedule_id}")
def delete_message_schedule(schedule_id: int, session: Session = Depends(get_session)):
    schedule = session.get(ClientMessageSchedule, schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Message schedule not found")
    session.delete(schedule)
    log_activity(session, "DELETED", "client_message_schedule", f"Deleted message schedule: {schedule.name}", schedule.id)
    session.commit()
    return {"success": True, "message": "Message schedule deleted"}


@router.get("/client-message-due")
def get_due_client_messages(session: Session = Depends(get_session)):
    at_time = now()
    schedules = session.exec(select(ClientMessageSchedule).where(ClientMessageSchedule.active == True)).all()  # noqa: E712
    active_clients = session.exec(select(Client).where(Client.active == True).order_by(Client.name)).all()  # noqa: E712
    due_messages = []
    for client in active_clients:
        if not client.birth_date or client.birth_date.month != at_time.month or client.birth_date.day != at_time.day:
            continue
        phone = client.whatsapp or client.phone
        message = birthday_message_text(session, client)
        if not phone or not message:
            continue
        due_messages.append(
            {
                "schedule_id": "",
                "schedule_name": "Birthday greeting",
                "client_id": client.id,
                "client_name": client.name,
                "channel": "whatsapp",
                "message_type": "birthday",
                "phone": phone,
                "message": message,
                "send_time": "09:00",
            }
        )
    for schedule in schedules:
        if not schedule_is_due(schedule, at_time):
            continue
        selected_ids = set(schedule_client_ids(schedule))
        clients = active_clients if schedule.audience == "all" else [client for client in active_clients if client.id in selected_ids]
        for client in clients:
            message = client_message_text(session, client, schedule.message_type)
            phone = client.whatsapp or client.phone if schedule.channel == "whatsapp" else client.phone
            if not message or not phone:
                continue
            due_messages.append(
                {
                    "schedule_id": schedule.id,
                    "schedule_name": schedule.name,
                    "client_id": client.id,
                    "client_name": client.name,
                    "channel": schedule.channel,
                    "message_type": schedule.message_type,
                    "phone": phone,
                    "message": message,
                    "send_time": schedule.send_time,
                }
            )
    return due_messages


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


@router.get("/briefing")
def get_briefing(session: Session = Depends(get_session)):
    return build_briefing(session)


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
    task, changes = apply_task_data(get_task_or_404(task_id, session), task_data, session)
    session.add(task)
    log_activity(session, "UPDATED", "task", f"Updated task: {task.title}", task.id, task.uuid, changes or "No field changes")
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

    if lower in {"good morning", "morning", "start my day"} or "plan my day" in lower:
        briefing = build_briefing(session)
        return {
            "action": "BRIEFING",
            "message": f"{briefing['message']} Would you like me to plan your day?",
            "briefing": briefing,
        }

    if "prepare me" in lower and "meeting" in lower:
        briefing = build_briefing(session)
        meetings = briefing["priorities"] + [task for task in briefing["upcoming"] if task_contains(task, "meeting", "meet", "bni")]
        return {
            "action": "MEETING_PREP",
            "message": f"I found {len(meetings)} meeting-related priority item(s).",
            "tasks": meetings[:8],
            "briefing": briefing,
        }

    if "going to meet" in lower or "meet " in lower:
        context = client_context(session, lower)
        if context:
            return {"action": "CLIENT_CONTEXT", **context}
        return {"action": "NEEDS_CLARIFICATION", "message": "I could not match that person to a saved client yet."}

    if "today's work is finished" in lower or "todays work is finished" in lower:
        today = date.today()
        tomorrow = today + timedelta(days=1)
        moved = []
        for task in active_tasks(session):
            if task.due_date and task.due_date <= today:
                task.start_date = tomorrow
                task.due_date = tomorrow
                task.updated_at = now()
                session.add(task)
                moved.append(task)
        log_activity(session, "PLANNED", "day", f"AI closed the day and moved {len(moved)} unfinished task(s) to tomorrow")
        session.commit()
        return {
            "action": "DAY_CLOSED",
            "message": f"Day closed. I moved {len(moved)} unfinished task(s) to tomorrow and wrote the activity log.",
            "tasks": moved,
        }

    if any(phrase in lower for phrase in ("show pending", "pending tasks", "what work is pending", "what is pending")):
        tasks = active_tasks(session)
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

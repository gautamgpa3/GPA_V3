import argparse
import json
import os
from datetime import date
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from sqlmodel import Session, select

from backend.api.tasks import build_briefing, get_due_client_messages
from backend.database.engine import create_db, engine
from backend.models.activity import ActivityLog


REMINDER_ENTITY = "telegram_daily_reminder"


def load_dotenv_file() -> None:
    env_path = Path(".env")
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def already_sent_today(session: Session, today: date) -> bool:
    return (
        session.exec(
            select(ActivityLog).where(
                ActivityLog.entity_type == REMINDER_ENTITY,
                ActivityLog.entity_uuid == today.isoformat(),
            )
        ).first()
        is not None
    )


def task_line(task) -> str:
    due = task.due_date.isoformat() if task.due_date else "No due date"
    return f"- {task.title} ({task.priority}, due {due})"


def build_message(session: Session) -> str:
    briefing = build_briefing(session)
    due_messages = get_due_client_messages(session)
    lines = [
        briefing["message"],
        "",
        f"Due today: {briefing['due_today_count']}",
        f"Overdue: {briefing['overdue_count']}",
        f"Pending: {briefing['pending_count']}",
        f"Client messages ready: {len(due_messages)}",
    ]

    priorities = briefing.get("priorities", [])[:5]
    if priorities:
        lines.extend(["", "Today's priorities:"])
        lines.extend(task_line(task) for task in priorities)

    suggestions = briefing.get("suggestions", [])[:3]
    if suggestions:
        lines.extend(["", "Suggestions:"])
        lines.extend(f"- {item}" for item in suggestions)

    if due_messages:
        lines.extend(["", "Client reminders ready:"])
        lines.extend(f"- {item['client_name']} ({item['message_type']} via {item['channel']})" for item in due_messages[:5])

    return "\n".join(lines)


def send_telegram_message(token: str, chat_id: str, message: str) -> None:
    payload = urlencode(
        {
            "chat_id": chat_id,
            "text": message,
            "disable_web_page_preview": "true",
        }
    ).encode("utf-8")
    request = Request(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data=payload,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urlopen(request, timeout=30) as response:
        result = json.loads(response.read().decode("utf-8"))
    if not result.get("ok"):
        raise RuntimeError(f"Telegram rejected reminder: {result}")


def run(force: bool = False, dry_run: bool = False) -> str:
    load_dotenv_file()
    create_db()
    today = date.today()
    with Session(engine) as session:
        if not force and already_sent_today(session, today):
            return f"Telegram reminder already sent for {today.isoformat()}."

        message = build_message(session)
        if dry_run:
            return message

        token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
        chat_id = os.getenv("TELEGRAM_CHAT_ID", "").strip()
        if not token or not chat_id:
            raise RuntimeError("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required.")

        send_telegram_message(token, chat_id, message)
        session.add(
            ActivityLog(
                action="SENT",
                entity_type=REMINDER_ENTITY,
                entity_uuid=today.isoformat(),
                summary=f"Sent Telegram daily reminder for {today.isoformat()}",
            )
        )
        session.commit()
        return f"Telegram reminder sent for {today.isoformat()}."


def main() -> None:
    parser = argparse.ArgumentParser(description="Send GPA daily Telegram reminder")
    parser.add_argument("--force", action="store_true", help="send even if today's reminder was already sent")
    parser.add_argument("--dry-run", action="store_true", help="print message without sending")
    args = parser.parse_args()
    print(run(force=args.force, dry_run=args.dry_run))


if __name__ == "__main__":
    main()

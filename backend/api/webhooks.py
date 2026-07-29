import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import PlainTextResponse
from sqlmodel import Session

from backend.database.engine import engine
from backend.models.activity import ActivityLog
from backend.services.whatsapp_business import whatsapp_settings


router = APIRouter(prefix="/webhooks", tags=["Webhooks"])


def add_webhook_activity(session: Session, action: str, summary: str, details: dict):
    session.add(
        ActivityLog(
            action=action,
            entity_type="whatsapp",
            summary=summary,
            details=json.dumps(details, ensure_ascii=True),
        )
    )


@router.get("/whatsapp")
def verify_whatsapp_webhook(request: Request):
    settings = whatsapp_settings()
    params = request.query_params
    mode = params.get("hub.mode", "")
    token = params.get("hub.verify_token", "")
    challenge = params.get("hub.challenge", "")
    if mode == "subscribe" and settings.verify_token and token == settings.verify_token:
        return PlainTextResponse(challenge)
    raise HTTPException(status_code=403, detail="Invalid WhatsApp webhook verification token")


@router.post("/whatsapp")
async def receive_whatsapp_webhook(request: Request):
    payload = await request.json()
    with Session(engine) as session:
        for entry in payload.get("entry", []):
            for change in entry.get("changes", []):
                value = change.get("value", {})
                for status in value.get("statuses", []):
                    message_id = status.get("id", "")
                    status_name = status.get("status", "unknown")
                    recipient = status.get("recipient_id", "")
                    add_webhook_activity(
                        session,
                        "WHATSAPP_STATUS",
                        f"WhatsApp {status_name}: {recipient}",
                        {"message_id": message_id, "status": status_name, "recipient": recipient, "raw": status},
                    )
                for message in value.get("messages", []):
                    sender = message.get("from", "")
                    text = (message.get("text") or {}).get("body", "")
                    add_webhook_activity(
                        session,
                        "WHATSAPP_REPLY",
                        f"WhatsApp reply from {sender}",
                        {"from": sender, "text": text, "raw": message},
                    )
        session.commit()
    return {"success": True}

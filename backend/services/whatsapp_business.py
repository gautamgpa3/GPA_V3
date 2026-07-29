import json
from dataclasses import dataclass
from os import getenv
from pathlib import Path
from re import sub
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


DEFAULT_WHATSAPP_FILE = "/opt/gpa-v3/secrets/whatsapp_business.env"


@dataclass
class WhatsAppSettings:
    enabled: bool
    auto_send: bool
    access_token: str
    phone_number_id: str
    api_version: str
    verify_token: str


def truthy(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}


def whatsapp_credentials_path() -> Path:
    return Path(getenv("GPA_WHATSAPP_BUSINESS_FILE", DEFAULT_WHATSAPP_FILE))


def load_key_value_file(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        clean = line.strip()
        if not clean or clean.startswith("#") or "=" not in clean:
            continue
        key, value = clean.split("=", 1)
        values[key.strip().upper()] = value.strip()
    return values


def whatsapp_settings(path: Path | None = None) -> WhatsAppSettings:
    values = load_key_value_file(path or whatsapp_credentials_path())
    enabled = truthy(values.get("ENABLED", getenv("GPA_WHATSAPP_ENABLED", "false")))
    auto_send = truthy(values.get("AUTO_SEND", getenv("GPA_WHATSAPP_AUTO_SEND", "false")))
    return WhatsAppSettings(
        enabled=enabled,
        auto_send=auto_send,
        access_token=values.get("ACCESS_TOKEN", getenv("GPA_WHATSAPP_ACCESS_TOKEN", "")),
        phone_number_id=values.get("PHONE_NUMBER_ID", getenv("GPA_WHATSAPP_PHONE_NUMBER_ID", "")),
        api_version=values.get("API_VERSION", getenv("GPA_WHATSAPP_API_VERSION", "v21.0")),
        verify_token=values.get("VERIFY_TOKEN", getenv("GPA_WHATSAPP_VERIFY_TOKEN", "")),
    )


def whatsapp_ready(settings: WhatsAppSettings | None = None) -> bool:
    current = settings or whatsapp_settings()
    return bool(current.enabled and current.access_token and current.phone_number_id)


def whatsapp_phone(value: str) -> str:
    digits = sub(r"\D", "", value or "")
    if len(digits) == 10:
        return f"91{digits}"
    if len(digits) == 12 and digits.startswith("91"):
        return digits
    return ""


def send_whatsapp_text(to_phone: str, message: str, settings: WhatsAppSettings | None = None) -> dict:
    current = settings or whatsapp_settings()
    if not whatsapp_ready(current):
        return {"success": False, "skipped": True, "reason": "WhatsApp Business is not configured or not enabled."}
    recipient = whatsapp_phone(to_phone)
    if not recipient:
        return {"success": False, "skipped": True, "reason": "Client WhatsApp number is not a valid Indian phone number."}
    if not message.strip():
        return {"success": False, "skipped": True, "reason": "WhatsApp message is blank."}

    url = f"https://graph.facebook.com/{current.api_version}/{current.phone_number_id}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": recipient,
        "type": "text",
        "text": {"preview_url": False, "body": message.strip()},
    }
    request = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {current.access_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=45) as response:
            body = response.read().decode("utf-8")
            data = json.loads(body) if body else {}
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="ignore")
        return {"success": False, "skipped": False, "reason": f"WhatsApp API HTTP {error.code}: {detail[:250]}"}
    except URLError as error:
        return {"success": False, "skipped": False, "reason": f"WhatsApp API connection failed: {error.reason}"}

    message_id = ""
    messages = data.get("messages") or []
    if messages:
        message_id = str(messages[0].get("id") or "")
    return {"success": True, "skipped": False, "message_id": message_id, "response": data}

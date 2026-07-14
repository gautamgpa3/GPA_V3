import base64
import hashlib
import hmac
import secrets
import time
from pathlib import Path
from os import getenv

from fastapi import HTTPException, Request, Response


PROJECT_ROOT = Path(__file__).resolve().parents[2]
AUTH_FILE = Path(getenv("GPA_AUTH_FILE", PROJECT_ROOT / "gpa_credentials.txt"))
COOKIE_NAME = "gpa_session"
SESSION_SECONDS = 60 * 60 * 24 * 30


def _default_credentials() -> dict[str, str]:
    return {
        "username": "gautam",
        "password": "ChangeMe@123",
        "secret": secrets.token_urlsafe(32),
    }


def ensure_auth_file() -> None:
    if AUTH_FILE.exists():
        return
    AUTH_FILE.parent.mkdir(parents=True, exist_ok=True)
    credentials = _default_credentials()
    AUTH_FILE.write_text(
        "\n".join(f"{key}={value}" for key, value in credentials.items()) + "\n",
        encoding="utf-8",
    )


def load_credentials() -> dict[str, str]:
    ensure_auth_file()
    values: dict[str, str] = {}
    for line in AUTH_FILE.read_text(encoding="utf-8").splitlines():
        clean = line.strip()
        if not clean or clean.startswith("#") or "=" not in clean:
            continue
        key, value = clean.split("=", 1)
        values[key.strip().lower()] = value.strip()
    if not values.get("username") or not values.get("password"):
        raise HTTPException(status_code=500, detail="Login credentials file is not configured correctly")
    if not values.get("secret"):
        values["secret"] = values["password"]
    return values


def _signature(message: str, secret: str) -> str:
    return hmac.new(secret.encode("utf-8"), message.encode("utf-8"), hashlib.sha256).hexdigest()


def create_session_token(username: str) -> str:
    credentials = load_credentials()
    expires_at = int(time.time()) + SESSION_SECONDS
    message = f"{username}|{expires_at}"
    signature = _signature(message, credentials["secret"])
    raw = f"{message}|{signature}".encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("utf-8")


def verify_session_token(token: str | None) -> bool:
    if not token:
        return False
    try:
        raw = base64.urlsafe_b64decode(token.encode("utf-8")).decode("utf-8")
        username, expires_at_text, signature = raw.rsplit("|", 2)
        expires_at = int(expires_at_text)
    except Exception:
        return False
    credentials = load_credentials()
    if not hmac.compare_digest(username, credentials["username"]):
        return False
    if expires_at < int(time.time()):
        return False
    expected = _signature(f"{username}|{expires_at}", credentials["secret"])
    return hmac.compare_digest(signature, expected)


def check_login(username: str, password: str) -> bool:
    credentials = load_credentials()
    return hmac.compare_digest(username, credentials["username"]) and hmac.compare_digest(password, credentials["password"])


def set_login_cookie(response: Response, username: str) -> None:
    response.set_cookie(
        COOKIE_NAME,
        create_session_token(username),
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=SESSION_SECONDS,
        path="/",
    )


def clear_login_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")


def is_authenticated(request: Request) -> bool:
    return verify_session_token(request.cookies.get(COOKIE_NAME))

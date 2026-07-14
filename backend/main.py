from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.core.config import APP_NAME, APP_VERSION
from backend.core.auth import check_login, clear_login_cookie, ensure_auth_file, is_authenticated, set_login_cookie
from backend.database.engine import create_db
from backend.api.tasks import router as task_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db()
    ensure_auth_file()
    print("Database Ready")
    yield


app = FastAPI(
    title=APP_NAME,
    version=APP_VERSION,
    lifespan=lifespan,
)
app.include_router(task_router)


class LoginRequest(BaseModel):
    username: str
    password: str


@app.middleware("http")
async def require_login(request: Request, call_next):
    path = request.url.path
    public_paths = {"/health", "/api/auth/status", "/api/auth/login", "/api/auth/logout"}
    if path.startswith("/api") and path not in public_paths and not is_authenticated(request):
        return JSONResponse({"detail": "Login required"}, status_code=401)
    return await call_next(request)


@app.get("/api/auth/status")
def auth_status(request: Request):
    return {"authenticated": is_authenticated(request)}


@app.post("/api/auth/login")
def auth_login(login: LoginRequest, response: Response):
    username = login.username.strip()
    password = login.password
    if not check_login(username, password):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    set_login_cookie(response, username)
    return {"authenticated": True}


@app.post("/api/auth/logout")
def auth_logout(response: Response):
    clear_login_cookie(response)
    return {"authenticated": False}


@app.get("/api")
def home():
    return {
        "Application": APP_NAME,
        "Version": APP_VERSION,
        "Status": "Running"
    }


@app.get("/health")
def health():
    return {
        "status": "OK"
    }


FRONTEND_DIR = Path(__file__).resolve().parents[1] / "frontend"

if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

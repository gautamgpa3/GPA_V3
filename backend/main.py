from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from backend.core.config import APP_NAME, APP_VERSION
from backend.database.engine import create_db
from backend.api.tasks import router as task_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db()
    print("Database Ready")
    yield


app = FastAPI(
    title=APP_NAME,
    version=APP_VERSION,
    lifespan=lifespan,
)
app.include_router(task_router)


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

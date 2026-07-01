from contextlib import asynccontextmanager

from fastapi import FastAPI

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


@app.get("/")
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

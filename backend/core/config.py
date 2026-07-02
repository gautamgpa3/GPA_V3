import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]

DATABASE_PATH = Path(os.getenv("GPA_DATABASE_PATH", BASE_DIR / "database" / "gpa.db"))

DATABASE_URL = os.getenv("GPA_DATABASE_URL", f"sqlite:///{DATABASE_PATH}")

APP_NAME = "GPA - Gautam Personal Assistant"

APP_VERSION = "3.0.0"

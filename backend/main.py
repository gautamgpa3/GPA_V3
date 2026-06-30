from fastapi import FastAPI
from fastapi.responses import JSONResponse

app = FastAPI(
    title="GPA - Gautam Personal Assistant",
    version="3.0.0",
    description="Private AI Assistant for Gautam"
)


@app.get("/")
async def root():
    return JSONResponse(
        {
            "application": "GPA",
            "version": "3.0.0",
            "status": "Running",
            "message": "Welcome to GPA Version 3"
        }
    )


@app.get("/health")
async def health():
    return {
        "status": "healthy"
    }
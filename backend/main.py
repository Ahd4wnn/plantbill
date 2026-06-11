from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from config import settings
from routers import health, sessions, bills, admin, expenses
from auth.dependencies import get_current_user

app = FastAPI(title="PlantBill Backend")

# Configure CORS
origins = [
    settings.FRONTEND_ORIGIN,
    "http://localhost:5173", # fallback default
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(health.router)
app.include_router(sessions.router)
app.include_router(bills.router)
app.include_router(admin.router)
app.include_router(expenses.router)

@app.get("/")
async def root():
    return {"message": "Welcome to PlantBill Backend API. Go to /health for status."}

@app.get("/api/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return {
        "id": current_user["id"],
        "full_name": current_user.get("full_name"),
        "role": current_user["role"]
    }

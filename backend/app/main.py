"""ShipDev FastAPI main application."""

from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.approval import router as approval_router
from app.api.v1.evidence import router as evidence_router
from app.api.v1.platforms import router as platforms_router
from app.api.v1.tasks import router as tasks_router
from app.api.v1.transitions import router as transitions_router
from app.core.config import settings
from app.core.state_machine import (
    InvalidStateTransitionError,
    MissingEvidenceError,
    UnauthorizedTransitionError,
)
from app.db.session import init_db
from app.repositories.task_repository import TaskImmutableError, TaskNotFoundError


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan event handler: initialize database on application startup."""
    init_db()
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Backend API and verification engine for ShipDev human-supervised multi-agent engineering workflow.",
    lifespan=lifespan,
)

# CORS Middleware to support Pratham's Next.js frontend
allowed_origins = [
    settings.FRONTEND_ORIGIN,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API v1 routers
app.include_router(tasks_router, prefix="/api/v1")
app.include_router(evidence_router, prefix="/api/v1")
app.include_router(transitions_router, prefix="/api/v1")
app.include_router(approval_router, prefix="/api/v1")
app.include_router(platforms_router, prefix="/api/v1")


# Custom exception handlers for clean HTTP status mapping
@app.exception_handler(TaskNotFoundError)
async def task_not_found_handler(request: Request, exc: TaskNotFoundError):
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={"error": "Not Found", "detail": str(exc)},
    )


@app.exception_handler(TaskImmutableError)
async def task_immutable_handler(request: Request, exc: TaskImmutableError):
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={"error": "Conflict", "detail": str(exc)},
    )


@app.exception_handler(InvalidStateTransitionError)
async def invalid_transition_handler(request: Request, exc: InvalidStateTransitionError):
    return JSONResponse(
        status_code=422,
        content={"error": "Invalid State Transition", "detail": str(exc)},
    )


@app.exception_handler(UnauthorizedTransitionError)
async def unauthorized_transition_handler(request: Request, exc: UnauthorizedTransitionError):
    return JSONResponse(
        status_code=status.HTTP_403_FORBIDDEN,
        content={"error": "Unauthorized Transition", "detail": str(exc)},
    )


@app.exception_handler(MissingEvidenceError)
async def missing_evidence_handler(request: Request, exc: MissingEvidenceError):
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"error": "Missing Evidence", "detail": str(exc)},
    )


@app.get("/", tags=["Root"])
async def root():
    """Root status and API information endpoint."""
    return {
        "status": "ok",
        "service": settings.PROJECT_NAME,
        "environment": settings.ENVIRONMENT,
        "version": settings.VERSION,
        "docs_url": "/docs",
        "health_url": "/health",
        "api_v1_url": "/api/v1",
    }


@app.get("/health", tags=["Health"])
async def health_check():
    """System health check endpoint."""
    return {
        "status": "ok",
        "environment": settings.ENVIRONMENT,
        "version": settings.VERSION,
    }

"""Task management REST routes."""

import asyncio
from typing import List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse

from app.api.deps import get_repository, get_workspace_repository
from app.core.config import settings
from app.core.events import event_broadcaster, format_heartbeat, format_sse
from app.core.state_machine import TaskStatus
from app.models.task import (
    ApprovalRecordResponse,
    TaskCreate,
    TaskResponse,
    TransitionResponse,
)
from app.repositories.task_repository import TaskRepository
from app.repositories.workspace_repository import WorkspaceRepository

router = APIRouter(prefix="/tasks", tags=["Tasks"])


@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    payload: TaskCreate,
    x_workspace_id: Optional[str] = Header(None, alias="X-Workspace-ID"),
    authorization: Optional[str] = Header(None),
    x_caller_type: Optional[str] = Header(None, alias="X-Caller-Type"),
    x_caller_id: Optional[str] = Header(None, alias="X-Caller-ID"),
    repo: TaskRepository = Depends(get_repository),
    ws_repo: WorkspaceRepository = Depends(get_workspace_repository),
):
    """Create a new bug report task within the authorized workspace boundary."""
    ws_resolver = WorkspaceRepository(db_path=repo.db_path) if repo.db_path else ws_repo
    explicit_ws = x_workspace_id or payload.workspace_id
    target_ws = (explicit_ws or "ws_personal_default").strip()
    if explicit_ws:
        try:
            ws = ws_resolver.get_workspace(target_ws)
        except Exception:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Workspace '{target_ws}' not found.")
        actor_id = "local-operator" if (authorization or x_caller_type == "human") else (x_caller_id or "local-operator")
        if not ws_resolver.get_member(target_ws, actor_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access Denied: User '{actor_id}' is not an authorized member of workspace '{target_ws}'.",
            )
    return repo.create_task(payload, workspace_id=target_ws)


@router.get("", response_model=List[TaskResponse])
async def list_tasks(
    task_status: Optional[TaskStatus] = Query(None, alias="status", description="Filter tasks by workflow status"),
    workspace_id: Optional[str] = Query(None, description="Filter tasks by workspace"),
    x_workspace_id: Optional[str] = Header(None, alias="X-Workspace-ID"),
    authorization: Optional[str] = Header(None),
    x_caller_type: Optional[str] = Header(None, alias="X-Caller-Type"),
    x_caller_id: Optional[str] = Header(None, alias="X-Caller-ID"),
    repo: TaskRepository = Depends(get_repository),
    ws_repo: WorkspaceRepository = Depends(get_workspace_repository),
):
    """List tasks, optionally filtered by status and workspace boundary."""
    target_ws = (workspace_id or x_workspace_id or "").strip()
    if target_ws:
        ws_resolver = WorkspaceRepository(db_path=repo.db_path) if repo.db_path else ws_repo
        try:
            ws = ws_resolver.get_workspace(target_ws)
        except Exception:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Workspace '{target_ws}' not found.")
        actor_id = "local-operator" if (authorization or x_caller_type == "human") else (x_caller_id or "local-operator")
        if not ws_resolver.get_member(target_ws, actor_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access Denied: User '{actor_id}' is not an authorized member of workspace '{target_ws}'.",
            )
    return repo.list_tasks(status=task_status, workspace_id=target_ws if target_ws else None)


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: str,
    x_workspace_id: Optional[str] = Header(None, alias="X-Workspace-ID"),
    authorization: Optional[str] = Header(None),
    x_caller_type: Optional[str] = Header(None, alias="X-Caller-Type"),
    x_caller_id: Optional[str] = Header(None, alias="X-Caller-ID"),
    repo: TaskRepository = Depends(get_repository),
    ws_repo: WorkspaceRepository = Depends(get_workspace_repository),
):
    """Get complete task details by ID within workspace boundary."""
    target_ws = (x_workspace_id or "").strip()
    if target_ws:
        ws_resolver = WorkspaceRepository(db_path=repo.db_path) if repo.db_path else ws_repo
        try:
            ws = ws_resolver.get_workspace(target_ws)
        except Exception:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Workspace '{target_ws}' not found.")
        actor_id = "local-operator" if (authorization or x_caller_type == "human") else (x_caller_id or "local-operator")
        if not ws_resolver.get_member(target_ws, actor_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access Denied: User '{actor_id}' is not an authorized member of workspace '{target_ws}'.",
            )
    return repo.get_task(task_id, workspace_id=target_ws if target_ws else None)


@router.get("/{task_id}/history", response_model=List[TransitionResponse])
async def get_task_history(
    task_id: str,
    x_workspace_id: Optional[str] = Header(None, alias="X-Workspace-ID"),
    repo: TaskRepository = Depends(get_repository),
):
    """Get chronological immutable state transition history for a task."""
    repo.get_task(task_id, workspace_id=x_workspace_id)  # Validate task exists in workspace
    return repo.get_transitions_for_task(task_id)


@router.get("/{task_id}/approvals", response_model=List[ApprovalRecordResponse])
async def get_task_approvals(
    task_id: str,
    x_workspace_id: Optional[str] = Header(None, alias="X-Workspace-ID"),
    repo: TaskRepository = Depends(get_repository),
):
    """Get human approval and rejection records for a task."""
    repo.get_task(task_id, workspace_id=x_workspace_id)  # Validate task exists in workspace
    return repo.get_approval_records_for_task(task_id)


@router.get(
    "/{task_id}/events",
    summary="Stream real-time task lifecycle events via SSE",
    response_class=StreamingResponse,
    responses={
        200: {
            "content": {"text/event-stream": {}},
            "description": "Real-time stream of task lifecycle transition events.",
        },
        404: {"description": "Task not found."},
    },
)
async def stream_task_events(
    task_id: str,
    request: Request,
    last_event_id: Optional[str] = Header(None, alias="Last-Event-ID"),
    query_last_event_id: Optional[str] = Query(None, alias="last_event_id"),
    replay_all: bool = Query(False, description="Replay all historical transitions from inception"),
    max_events: Optional[int] = Query(None, ge=1, description="Optional maximum number of events to receive before closing stream"),
    timeout: Optional[float] = Query(None, gt=0, description="Optional maximum duration in seconds to stream before closing"),
    repo: TaskRepository = Depends(get_repository),
):
    """Stream real-time task lifecycle events via Server-Sent Events (SSE).

    - Emits real-time `task_transition` events whenever a state change commits.
    - Recovers missed events via `Last-Event-ID` header or `?last_event_id=` query param.
    - Sends periodic heartbeat pings (`: ping - <timestamp>`) to prevent timeouts.
    - Cleans up subscriptions gracefully on client disconnect.
    """
    repo.get_task(task_id)  # Validate task exists, raises TaskNotFoundError (404) if not

    clean_last_id = (last_event_id or query_last_event_id or "").strip() or None

    async def event_generator():
        # Subscribe queue before replaying to prevent race conditions
        queue = event_broadcaster.subscribe(task_id)
        replayed_ids = set()
        events_emitted = 0
        loop = asyncio.get_running_loop()
        start_time = loop.time()

        try:
            # Replay missed events from SQLite persistence
            if clean_last_id or replay_all:
                missed = repo.get_transitions_after(
                    task_id=task_id,
                    last_event_id=clean_last_id if not replay_all else None,
                )
                for tr in missed:
                    replayed_ids.add(tr.id)
                    payload = {
                        "event_id": tr.id,
                        "task_id": tr.task_id,
                        "from_status": tr.from_status.value,
                        "to_status": tr.to_status.value,
                        "actor_type": tr.actor_type.value,
                        "actor_id": tr.actor_id,
                        "reason": tr.reason,
                        "evidence_id": tr.evidence_id,
                        "timestamp": tr.created_at,
                    }
                    yield format_sse(
                        event_type="task_transition",
                        data=payload,
                        event_id=tr.id,
                    )
                    events_emitted += 1
                    if max_events is not None and events_emitted >= max_events:
                        return

            # Stream live events with periodic heartbeats
            while True:
                if await request.is_disconnected():
                    break

                # Explicit subscriber overflow: notify client and close stream for persistent replay
                if getattr(queue, "overflowed", False):
                    yield format_sse(
                        event_type="stream_overflow",
                        data={
                            "error": "queue_overflow",
                            "message": "Subscriber event buffer overflowed. Reconnect using Last-Event-ID to replay persistent history.",
                            "task_id": task_id,
                            "missed_from_event_id": getattr(queue, "overflow_event_id", None),
                        },
                    )
                    break

                if timeout is not None:
                    elapsed = loop.time() - start_time
                    if elapsed >= timeout:
                        break
                    remaining_timeout = min(settings.SSE_HEARTBEAT_INTERVAL, max(0.01, timeout - elapsed))
                else:
                    remaining_timeout = settings.SSE_HEARTBEAT_INTERVAL

                try:
                    event_data = await asyncio.wait_for(
                        queue.get(),
                        timeout=remaining_timeout,
                    )
                    # Deduplicate in case an event was committed and replayed during connection setup
                    if event_data.get("event_id") in replayed_ids:
                        continue
                    yield format_sse(
                        event_type="task_transition",
                        data=event_data,
                        event_id=event_data.get("event_id"),
                    )
                    events_emitted += 1
                    if max_events is not None and events_emitted >= max_events:
                        break
                except asyncio.TimeoutError:
                    if await request.is_disconnected():
                        break
                    if timeout is not None and (loop.time() - start_time) >= timeout:
                        break
                    yield format_heartbeat()

        except asyncio.CancelledError:
            pass
        finally:
            event_broadcaster.unsubscribe(task_id, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


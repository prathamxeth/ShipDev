"""Task management REST routes."""

import asyncio
from typing import List, Optional
from fastapi import APIRouter, Depends, Header, Query, Request, status
from fastapi.responses import StreamingResponse

from app.api.deps import get_repository
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

router = APIRouter(prefix="/tasks", tags=["Tasks"])


@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    payload: TaskCreate,
    repo: TaskRepository = Depends(get_repository),
):
    """Create a new bug report task (text or Wispr Flow voice transcript)."""
    return repo.create_task(payload)


@router.get("", response_model=List[TaskResponse])
async def list_tasks(
    status: Optional[TaskStatus] = Query(None, description="Filter tasks by workflow status"),
    repo: TaskRepository = Depends(get_repository),
):
    """List tasks, optionally filtered by status."""
    return repo.list_tasks(status=status)


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: str,
    repo: TaskRepository = Depends(get_repository),
):
    """Get complete task details by ID."""
    return repo.get_task(task_id)


@router.get("/{task_id}/history", response_model=List[TransitionResponse])
async def get_task_history(
    task_id: str,
    repo: TaskRepository = Depends(get_repository),
):
    """Get chronological immutable state transition history for a task."""
    repo.get_task(task_id)  # Validate task exists
    return repo.get_transitions_for_task(task_id)


@router.get("/{task_id}/approvals", response_model=List[ApprovalRecordResponse])
async def get_task_approvals(
    task_id: str,
    repo: TaskRepository = Depends(get_repository),
):
    """Get human approval and rejection records for a task."""
    repo.get_task(task_id)  # Validate task exists
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


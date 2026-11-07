"""In-process thread-safe pub/sub event broadcaster for Server-Sent Events (SSE)."""

import asyncio
import json
import threading
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Set


def format_sse(event_type: str, data: Dict[str, Any], event_id: Optional[str] = None) -> str:
    """Format a payload as a standard W3C Server-Sent Event text block."""
    parts = []
    if event_id:
        parts.append(f"id: {event_id}")
    parts.append(f"event: {event_type}")
    parts.append(f"data: {json.dumps(data)}")
    return "\n".join(parts) + "\n\n"


def format_heartbeat() -> str:
    """Format an SSE comment ping to keep client connections active."""
    now_iso = datetime.now(timezone.utc).isoformat()
    return f": ping - {now_iso}\n\n"


class EventBroadcaster:
    """Thread-safe event broadcaster managing task-specific subscriber queues."""

    def __init__(self):
        self._subscribers: Dict[str, Set[asyncio.Queue]] = {}
        self._lock = threading.Lock()

    def subscribe(self, task_id: str) -> asyncio.Queue:
        """Register a new subscriber queue for the specified task ID."""
        queue: asyncio.Queue = asyncio.Queue(maxsize=100)
        with self._lock:
            if task_id not in self._subscribers:
                self._subscribers[task_id] = set()
            self._subscribers[task_id].add(queue)
        return queue

    def unsubscribe(self, task_id: str, queue: asyncio.Queue) -> None:
        """Remove a subscriber queue when client disconnects."""
        with self._lock:
            if task_id in self._subscribers:
                self._subscribers[task_id].discard(queue)
                if not self._subscribers[task_id]:
                    del self._subscribers[task_id]

    def publish(self, task_id: str, event_data: Dict[str, Any]) -> None:
        """Publish an event to all subscribers listening to task_id."""
        with self._lock:
            queues = list(self._subscribers.get(task_id, set()))

        for q in queues:
            try:
                q.put_nowait(event_data)
            except asyncio.QueueFull:
                try:
                    q.get_nowait()
                    q.put_nowait(event_data)
                except Exception:
                    pass
            except Exception:
                pass

    def subscriber_count(self, task_id: str) -> int:
        """Return number of active subscriber queues for task_id."""
        with self._lock:
            return len(self._subscribers.get(task_id, set()))


# Global singleton instance
event_broadcaster = EventBroadcaster()

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


class SubscriberQueue(asyncio.Queue):
    """Subscriber queue with explicit overflow tracking and zero silent event loss.

    NEVER silently discards lifecycle events. If the queue is saturated,
    marks itself as overflowed and records the unbuffered event ID so the
    streaming route can notify the client to resync via persistent SQLite history.
    """

    def __init__(self, maxsize: int = 100):
        super().__init__(maxsize=maxsize)
        self.overflowed: bool = False
        self.overflow_event_id: Optional[str] = None

    def mark_overflow(self, unbuffered_event_id: Optional[str] = None) -> None:
        """Mark subscriber as overflowed without silently dropping buffered events."""
        self.overflowed = True
        if not self.overflow_event_id:
            self.overflow_event_id = unbuffered_event_id


class EventBroadcaster:
    """Thread-safe event broadcaster managing task-specific subscriber queues."""

    def __init__(self):
        self._subscribers: Dict[str, Set[SubscriberQueue]] = {}
        self._lock = threading.Lock()

    def subscribe(self, task_id: str, maxsize: int = 100) -> SubscriberQueue:
        """Register a new subscriber queue for the specified task ID."""
        queue = SubscriberQueue(maxsize=maxsize)
        with self._lock:
            if task_id not in self._subscribers:
                self._subscribers[task_id] = set()
            self._subscribers[task_id].add(queue)
        return queue

    def unsubscribe(self, task_id: str, queue: SubscriberQueue) -> None:
        """Remove a subscriber queue when client disconnects."""
        with self._lock:
            if task_id in self._subscribers:
                self._subscribers[task_id].discard(queue)
                if not self._subscribers[task_id]:
                    del self._subscribers[task_id]

    def publish(self, task_id: str, event_data: Dict[str, Any]) -> None:
        """Publish an event to all subscribers listening to task_id.

        NEVER silently discards events. If a subscriber's buffer is full,
        explicitly flags subscriber overflow with the event ID so the streaming handler
        can notify the client to resync via persistent SQLite transition history.
        """
        with self._lock:
            queues = list(self._subscribers.get(task_id, set()))

        event_id = event_data.get("event_id")
        for q in queues:
            try:
                q.put_nowait(event_data)
            except asyncio.QueueFull:
                # Explicit subscriber overflow: do not evict/discard queued events
                if hasattr(q, "mark_overflow"):
                    q.mark_overflow(unbuffered_event_id=event_id)

    def subscriber_count(self, task_id: str) -> int:
        """Return number of active subscriber queues for task_id."""
        with self._lock:
            return len(self._subscribers.get(task_id, set()))


# Global singleton instance
event_broadcaster = EventBroadcaster()

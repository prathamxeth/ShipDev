/**
 * ShipDev Real-Time Task Lifecycle SSE Client
 *
 * Establishes a persistent Server-Sent Events (SSE) stream to
 * /api/v1/tasks/{taskId}/events, listening for 'task_transition' events.
 *
 * Capabilities:
 * - Automatic browser reconnection with Last-Event-ID header recovery.
 * - Initial chronological transition replay via ?replay_all=true.
 * - Live state synchronization for agent triage, reproduction, fix, and verification.
 * - Visible connection state tracking (connecting, connected, disconnected).
 */

import { SSEConnectionStatus, TaskTransitionEvent } from "@/types";
import { getTaskEventsUrl } from "./api";

/**
 * Validates task ID format to prevent path traversal or malformed SSE connections.
 */
export function isValidTaskId(taskId: unknown): taskId is string {
  if (typeof taskId !== "string") return false;
  const trimmed = taskId.trim();
  return /^[a-zA-Z0-9_\-]{3,100}$/.test(trimmed);
}

export interface TaskSSEHandlers {
  onTransition: (event: TaskTransitionEvent) => void;
  onStatusChange?: (status: SSEConnectionStatus) => void;
  onError?: (error: Event) => void;
}

export function subscribeToTaskEvents(
  taskId: string,
  handlers: TaskSSEHandlers,
  replayAll = true
): () => void {
  if (typeof window === "undefined" || !isValidTaskId(taskId)) {
    return () => {};
  }

  const url = getTaskEventsUrl(taskId, replayAll);
  handlers.onStatusChange?.("connecting");

  let eventSource: EventSource | null = null;
  try {
    eventSource = new EventSource(url);
  } catch (err) {
    handlers.onStatusChange?.("disconnected");
    return () => {};
  }

  eventSource.onopen = () => {
    handlers.onStatusChange?.("connected");
  };

  // Backend emits event_type="task_transition"
  eventSource.addEventListener("task_transition", (event: MessageEvent) => {
    try {
      const data: TaskTransitionEvent = JSON.parse(event.data);
      handlers.onTransition(data);
    } catch {
      // Malformed JSON payload safely ignored
    }
  });

  eventSource.onerror = (err) => {
    // If the readyState is CLOSED (2), mark disconnected
    if (eventSource?.readyState === EventSource.CLOSED) {
      handlers.onStatusChange?.("disconnected");
    } else {
      // Browser EventSource automatically reconnects on error
      handlers.onStatusChange?.("connecting");
    }
    handlers.onError?.(err);
  };

  return () => {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  };
}


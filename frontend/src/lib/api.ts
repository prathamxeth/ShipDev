/**
 * ShipDev Typed API Client
 *
 * Implements direct typed communication with Ayush's FastAPI backend for read/creation endpoints,
 * and proxies sensitive human approval operations through the Next.js Server-Side BFF.
 */

import {
  ApprovalRecord,
  ApprovalRequest,
  BackendHealth,
  Evidence,
  EvidenceCreate,
  RejectionRequest,
  Task,
  TaskCreatePayload,
  TaskStatus,
  TransitionHistory,
} from "@/types";

// Base URL for direct backend access (configurable via NEXT_PUBLIC_API_URL)
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
const BACKEND_HOST = API_BASE_URL.replace(/\/api\/v1\/?$/, "");

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

/**
 * Reusable fetch wrapper with robust error handling and structured error extraction.
 */
async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      cache: "no-store",
    });
  } catch (err: any) {
    throw new ApiError(
      `Network connection failure: unable to reach endpoint at ${url}. ${err.message || ""}`,
      0,
      { originalError: err }
    );
  }

  // Handle empty 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  // Parse JSON response or fallback to text
  let body: any;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      body = await response.json();
    } catch {
      body = null;
    }
  } else {
    body = await response.text().catch(() => null);
  }

  if (!response.ok) {
    // Extract informative error detail from FastAPI response structures
    let errorMessage = `HTTP ${response.status} ${response.statusText}`;

    if (body) {
      if (typeof body === "object") {
        if (body.error && body.detail) {
          errorMessage = `${body.error}: ${body.detail}`;
        } else if (typeof body.detail === "string") {
          errorMessage = body.detail;
        } else if (typeof body.error === "string") {
          errorMessage = body.error;
        } else if (Array.isArray(body.detail) && body.detail[0]?.msg) {
          // Pydantic validation error array
          errorMessage = body.detail.map((e: any) => `${e.loc?.join(".") || "field"}: ${e.msg}`).join("; ");
        }
      } else if (typeof body === "string" && body.trim().length > 0) {
        errorMessage = body;
      }
    }

    throw new ApiError(errorMessage, response.status, body);
  }

  return body as T;
}

/* =========================================================================
 * 1. Read-Only Backend Endpoints (Direct to FastAPI :8000)
 * ========================================================================= */

/**
 * Check backend health status (`GET /health`)
 */
export async function checkBackendHealth(): Promise<{ ok: boolean; data?: BackendHealth; error?: string }> {
  try {
    const data = await request<BackendHealth>(`${BACKEND_HOST}/health`);
    return { ok: true, data };
  } catch (err: any) {
    return {
      ok: false,
      error: err.message || "FastAPI backend is offline at http://localhost:8000",
    };
  }
}

/**
 * List tasks with optional workflow status filter (`GET /api/v1/tasks[?status=...]`)
 */
export async function getTasks(statusFilter?: TaskStatus): Promise<Task[]> {
  const url = new URL(`${API_BASE_URL}/tasks`);
  if (statusFilter) {
    url.searchParams.set("status", statusFilter);
  }
  return request<Task[]>(url.toString());
}

/**
 * Get complete task details by ID (`GET /api/v1/tasks/{task_id}`)
 */
export async function getTaskById(taskId: string): Promise<Task> {
  return request<Task>(`${API_BASE_URL}/tasks/${taskId}`);
}

/**
 * List execution and verification evidence for a task (`GET /api/v1/tasks/{task_id}/evidence`)
 */
export async function getTaskEvidence(taskId: string): Promise<Evidence[]> {
  return request<Evidence[]>(`${API_BASE_URL}/tasks/${taskId}/evidence`);
}

/**
 * Get single evidence artifact by ID (`GET /api/v1/evidence/{evidence_id}`)
 */
export async function getEvidenceById(evidenceId: string): Promise<Evidence> {
  return request<Evidence>(`${API_BASE_URL}/evidence/${evidenceId}`);
}

/**
 * Get chronological state transition audit history (`GET /api/v1/tasks/{task_id}/history`)
 */
export async function getTaskHistory(taskId: string): Promise<TransitionHistory[]> {
  return request<TransitionHistory[]>(`${API_BASE_URL}/tasks/${taskId}/history`);
}

/**
 * Get human approval and rejection records (`GET /api/v1/tasks/{task_id}/approvals`)
 */
export async function getTaskApprovals(taskId: string): Promise<ApprovalRecord[]> {
  return request<ApprovalRecord[]>(`${API_BASE_URL}/tasks/${taskId}/approvals`);
}

/**
 * Returns the SSE event stream URL for real-time task lifecycle monitoring.
 * In browser runtime, connects via the Same-Origin Next.js SSE proxy (/api/tasks/{taskId}/events)
 * to avoid CORS restrictions and prevent credential leakage.
 */
export function getTaskEventsUrl(taskId: string, replayAll = true): string {
  const query = replayAll ? "?replay_all=true" : "";
  if (typeof window !== "undefined") {
    return `/api/tasks/${encodeURIComponent(taskId)}/events${query}`;
  }
  const url = new URL(`${API_BASE_URL}/tasks/${encodeURIComponent(taskId)}/events`);
  if (replayAll) {
    url.searchParams.set("replay_all", "true");
  }
  return url.toString();
}

/**
 * Submit a new bug report task (`POST /api/v1/tasks`)
 */
export async function createTask(payload: TaskCreatePayload): Promise<Task> {
  return request<Task>(`${API_BASE_URL}/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: payload.title,
      description: payload.description,
      reported_by: payload.reported_by,
      input_source: payload.input_source || "text",
      repository_url: payload.repository_url || null,
      branch_name: payload.branch_name || null,
    }),
  });
}

/* =========================================================================
 * 2. Sensitive Human Gate Actions (Brokered via Next.js Server-Side BFF)
 *
 * Browser clients call `/api/gate/*` without credentials.
 * The Next.js BFF validates Origin and injects HUMAN_APPROVAL_SECRET Bearer token server-side.
 * Operator identity is server-derived to prevent client-side identity spoofing.
 * ========================================================================= */

/**
 * Human engineer approves proposed fix via secure BFF (`POST /api/gate/approve`)
 */
export async function approveTaskViaBFF(
  taskId: string,
  payload?: { comments?: string }
): Promise<Task> {
  return request<Task>("/api/gate/approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      taskId,
      comments: payload?.comments || null,
    }),
  });
}

/**
 * Human engineer rejects proposed fix via secure BFF (`POST /api/gate/reject`)
 */
export async function rejectTaskViaBFF(
  taskId: string,
  payload: { feedback: string; return_to?: TaskStatus }
): Promise<Task> {
  return request<Task>("/api/gate/reject", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      taskId,
      feedback: payload.feedback,
      return_to: payload.return_to || "FIX_PROPOSED",
    }),
  });
}

/**
 * Human engineer marks an approved task as completed via secure BFF (`POST /api/gate/complete`)
 */
export async function completeTaskViaBFF(taskId: string): Promise<Task> {
  return request<Task>("/api/gate/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      taskId,
    }),
  });
}

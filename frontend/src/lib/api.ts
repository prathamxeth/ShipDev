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
  CompanionSummaryResponse,
  Evidence,
  EvidenceCreate,
  PlatformConnectionInfo,
  PlatformHealthItem,
  PlatformMapping,
  PlatformType,
  RejectionRequest,
  ReviewerRole,
  SharePreviewResponse,
  Task,
  TaskCreatePayload,
  TaskStatus,
  TransitionHistory,
  Workspace,
  WorkspaceRole,
  WorkspaceSharingAudit,
  WorkspaceType,
} from "@/types";

// Base URL for direct backend access (configurable via NEXT_PUBLIC_API_URL)
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
const BACKEND_HOST = API_BASE_URL.replace(/\/api\/v1\/?$/, "");

let currentActiveWorkspaceId = "ws_personal_default";

export function setActiveWorkspaceId(id: string) {
  currentActiveWorkspaceId = id;
}

export function getActiveWorkspaceId(): string {
  return currentActiveWorkspaceId;
}

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
  if (!headers.has("X-Workspace-ID") && currentActiveWorkspaceId) {
    headers.set("X-Workspace-ID", currentActiveWorkspaceId);
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
export async function getTasks(statusFilter?: TaskStatus, workspaceId?: string): Promise<Task[]> {
  const url = new URL(`${API_BASE_URL}/tasks`);
  if (statusFilter) {
    url.searchParams.set("status", statusFilter);
  }
  const targetWs = workspaceId || currentActiveWorkspaceId;
  if (targetWs) {
    url.searchParams.set("workspace_id", targetWs);
  }
  return request<Task[]>(url.toString(), {
    headers: { "X-Workspace-ID": targetWs },
  });
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

/* =========================================================================
 * 3. Multi-Platform Gateways & Reviewer Role Management (Phase 2)
 * ========================================================================= */

/**
 * Fetch connection health and webhook endpoints for all platforms
 */
export async function getPlatformHealth(): Promise<{ platforms: PlatformHealthItem[] }> {
  return request<{ platforms: PlatformHealthItem[] }>(`${API_BASE_URL}/platforms/health`);
}

/**
 * Fetch active conversation-to-task correlations
 */
export async function getPlatformMappings(): Promise<PlatformMapping[]> {
  return request<PlatformMapping[]>(`${API_BASE_URL}/platforms/mappings`);
}

/**
 * Fetch authorized reviewer roles across platforms
 */
export async function getPlatformRoles(): Promise<ReviewerRole[]> {
  return request<ReviewerRole[]>(`${API_BASE_URL}/platforms/roles`);
}

/**
 * Assign an authorized reviewer role to a chat user
 */
export async function assignPlatformRole(payload: {
  platform: PlatformType;
  user_id: string;
  role: string;
  user_handle?: string;
}): Promise<ReviewerRole> {
  return request<ReviewerRole>(`${API_BASE_URL}/platforms/roles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/* =========================================================================
 * 4. Workspace Isolation & Explicit Sharing Operations
 * ========================================================================= */

/**
 * List all workspaces accessible by the current authenticated user
 */
export async function getWorkspaces(): Promise<Workspace[]> {
  return request<Workspace[]>(`${API_BASE_URL}/workspaces`);
}

/**
 * Create a new workspace (Personal or Team)
 */
export async function createWorkspace(payload: {
  name: string;
  workspace_type: WorkspaceType;
}): Promise<Workspace> {
  return request<Workspace>(`${API_BASE_URL}/workspaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/**
 * Preview resource sharing without mutating or syncing
 */
export async function previewShareResource(payload: {
  resource_type: "task" | "memory";
  resource_id: string;
  target_workspace_id: string;
}): Promise<SharePreviewResponse> {
  return request<SharePreviewResponse>(`${API_BASE_URL}/workspaces/share/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/**
 * Confirmed execution of resource sharing to another workspace
 */
export async function executeShareResource(payload: {
  resource_type: "task" | "memory";
  resource_id: string;
  target_workspace_id: string;
  confirmed: boolean;
}): Promise<Task> {
  return request<Task>(`${API_BASE_URL}/workspaces/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/**
 * Get immutable cross-workspace transfer audit records
 */
export async function getWorkspaceSharingAudit(workspaceId: string): Promise<WorkspaceSharingAudit[]> {
  return request<WorkspaceSharingAudit[]>(`${API_BASE_URL}/workspaces/${encodeURIComponent(workspaceId)}/audit`);
}

/**
 * Get aggregate companion summary for desktop menu-bar popover
 */
export async function getCompanionSummary(workspaceId?: string): Promise<CompanionSummaryResponse> {
  const targetWs = workspaceId || currentActiveWorkspaceId;
  return request<CompanionSummaryResponse>(`${API_BASE_URL}/workspaces/${encodeURIComponent(targetWs)}/companion-summary`);
}

/**
 * Get user-friendly, non-technical platform connection info
 */
export async function getPlatformConnections(workspaceId?: string): Promise<PlatformConnectionInfo[]> {
  const targetWs = workspaceId || currentActiveWorkspaceId;
  return request<PlatformConnectionInfo[]>(`${API_BASE_URL}/platforms/connections`, {
    headers: { "X-Workspace-ID": targetWs },
  });
}

/**
 * Connect a platform integration effortlessly
 */
export async function connectPlatform(
  platform: PlatformType,
  payload?: { account_name?: string; target_name?: string },
  workspaceId?: string
): Promise<PlatformConnectionInfo> {
  const targetWs = workspaceId || currentActiveWorkspaceId;
  return request<PlatformConnectionInfo>(`${API_BASE_URL}/platforms/${platform}/connect`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Workspace-ID": targetWs,
    },
    body: JSON.stringify(payload || {}),
  });
}

/**
 * Disconnect a platform integration
 */
export async function disconnectPlatform(
  platform: PlatformType,
  workspaceId?: string
): Promise<PlatformConnectionInfo> {
  const targetWs = workspaceId || currentActiveWorkspaceId;
  return request<PlatformConnectionInfo>(`${API_BASE_URL}/platforms/${platform}/disconnect`, {
    method: "POST",
    headers: {
      "X-Workspace-ID": targetWs,
    },
  });
}

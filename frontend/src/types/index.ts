export type TaskStatus =
  | "REPORTED"
  | "TRIAGED"
  | "REPRODUCING"
  | "REPRODUCED"
  | "FIX_PROPOSED"
  | "VERIFYING"
  | "AWAITING_HUMAN_APPROVAL"
  | "APPROVED"
  | "COMPLETED"
  | "TRIAGE_FAILED"
  | "REPRODUCTION_FAILED"
  | "VERIFICATION_FAILED"
  | "REJECTED"
  | "FAILED";

export type CallerType = "human" | "agent";

export interface Task {
  id: string;
  title: string;
  description: string;
  reported_by: string;
  input_source: "text" | "wispr_flow" | string;
  status: TaskStatus;
  repository_url?: string | null;
  branch_name?: string | null;
  workspace_id?: string | null;
  workspace_type?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskCreatePayload {
  title: string;
  description: string;
  reported_by: string;
  input_source?: string;
  repository_url?: string;
  branch_name?: string;
}

export interface Evidence {
  id: string;
  task_id: string;
  stage: "reproduction" | "verification" | "test_run" | string;
  command_executed: string;
  exit_code: number;
  stdout?: string | null;
  stderr?: string | null;
  patch_diff?: string | null;
  metadata_json?: string | null;
  is_mock: boolean;
  recorded_at: string;
}

export interface EvidenceCreate {
  stage: "reproduction" | "verification" | "test_run" | string;
  command_executed: string;
  exit_code: number;
  stdout?: string | null;
  stderr?: string | null;
  patch_diff?: string | null;
  metadata?: Record<string, any> | null;
  is_mock?: boolean;
}

export interface TransitionHistory {
  id: string;
  task_id: string;
  from_status: TaskStatus;
  to_status: TaskStatus;
  actor_type: CallerType;
  actor_id: string;
  reason?: string | null;
  evidence_id?: string | null;
  created_at: string;
}

export interface TransitionRequest {
  target_status: TaskStatus;
  actor_type: CallerType;
  actor_id: string;
  reason?: string | null;
  evidence_id?: string | null;
}

export interface ApprovalRecord {
  id: string;
  task_id: string;
  decision: "approved" | "rejected";
  reviewer_id: string;
  feedback?: string | null;
  decided_at: string;
}

export interface ApprovalRequest {
  reviewer_id?: string | null;
  comments?: string | null;
}

export interface RejectionRequest {
  reviewer_id?: string | null;
  feedback: string;
  return_to?: TaskStatus; // defaults to "FIX_PROPOSED"
}

export interface BackendHealth {
  status: string;
  environment: string;
  version: string;
}

export interface HumanGateResult {
  ok: boolean;
  task?: Task;
  error?: string;
  statusCode?: number;
}

export type SSEConnectionStatus = "connecting" | "connected" | "disconnected";

export interface TaskTransitionEvent {
  event_id: string;
  task_id: string;
  from_status: TaskStatus;
  to_status: TaskStatus;
  actor_type: CallerType;
  actor_id: string;
  reason?: string | null;
  evidence_id?: string | null;
  timestamp: string;
}

export type PlatformType = "slack" | "teams" | "discord" | "telegram";

export interface PlatformHealthItem {
  platform: PlatformType;
  configured: boolean;
  status: string;
  webhook_endpoint: string;
}

export interface PlatformMapping {
  id: string;
  platform: PlatformType;
  conversation_id: string;
  thread_id?: string | null;
  user_id: string;
  user_display_name?: string | null;
  task_id: string;
  intent_category?: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ReviewerRole {
  id: string;
  platform: PlatformType;
  user_id: string;
  user_handle?: string | null;
  role: string;
  assigned_by: string;
  created_at: string;
}

export type WorkspaceType = "PERSONAL" | "TEAM";

export type WorkspaceRole = "owner" | "admin" | "lead" | "operator" | "member";

export interface Workspace {
  id: string;
  name: string;
  workspace_type: WorkspaceType;
  owner_user_id: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  joined_at: string;
}

export interface WorkspaceSharingAudit {
  id: string;
  source_workspace_id: string;
  target_workspace_id: string;
  resource_type: string;
  resource_id: string;
  shared_by_user_id: string;
  content_preview?: string | null;
  created_at: string;
}

export interface SharePreviewResponse {
  source_workspace_id: string;
  target_workspace_id: string;
  target_workspace_name: string;
  resource_type: string;
  resource_id: string;
  preview_title: string;
  preview_description: string;
  evidence_count: number;
  will_share: string[];
  will_NOT_share: string[];
  confirmed: boolean;
  warning: string;
}

export interface CompanionSummaryResponse {
  workspace_id: string;
  workspace_name: string;
  workspace_type: WorkspaceType;
  pending_approval_count: number;
  pending_approvals: Array<{ id: string; title: string; reported_by: string }>;
  active_task_count: number;
  active_tasks: Array<{ id: string; title: string; status: TaskStatus; updated_at: string }>;
  platforms: PlatformType[];
  agent_status: string;
}

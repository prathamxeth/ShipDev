"use client";

import React, { useState } from "react";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Lock,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  SplitSquareVertical,
  UserCheck,
} from "lucide-react";
import { ApprovalRecord, Evidence, Task, TaskStatus } from "@/types";
import { approveTaskViaBFF, rejectTaskViaBFF, completeTaskViaBFF } from "@/lib/api";
import { AgentDetailModal, AgentIdentifier } from "@/components/modals/AgentDetailModal";

interface SwitchAgentWorkspaceProps {
  task: Task | null;
  evidenceList: Evidence[];
  approvals: ApprovalRecord[];
  isLoading: boolean;
  onTaskUpdated: (updatedTask: Task) => void;
  onToggleDiffMode: () => void;
}

export function SwitchAgentWorkspace({
  task,
  evidenceList,
  approvals,
  isLoading,
  onTaskUpdated,
  onToggleDiffMode,
}: SwitchAgentWorkspaceProps) {
  const [approvalComments, setApprovalComments] = useState("");
  const [rejectFeedback, setRejectFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [selectedAgentDetail, setSelectedAgentDetail] = useState<AgentIdentifier | null>(null);

  // Evidence extraction
  const reproEvidence = evidenceList.find((e) => e.stage === "reproduction");
  const verifyEvidence = evidenceList.find((e) => e.stage === "verification");

  const hasReproRun = Boolean(reproEvidence);
  const reproFailedAsExpected = reproEvidence ? reproEvidence.exit_code !== 0 : false;

  const hasVerifyRun = Boolean(verifyEvidence);
  const verifyPassed = verifyEvidence ? verifyEvidence.exit_code === 0 : false;
  const hasPatch = Boolean(verifyEvidence?.patch_diff || reproEvidence?.patch_diff);

  const isAwaitingApproval = task?.status === "AWAITING_HUMAN_APPROVAL";
  const isApproved = task?.status === "APPROVED";
  const isCompleted = task?.status === "COMPLETED";

  const originatingPlatform = task?.reported_by?.toLowerCase().includes("slack")
    ? { name: "Slack", icon: "💬", color: "bg-[#4A154B]/10 text-[#4A154B] border-[#4A154B]/30" }
    : task?.reported_by?.toLowerCase().includes("teams")
    ? { name: "MS Teams", icon: "👥", color: "bg-[#5B5FC7]/10 text-[#5B5FC7] border-[#5B5FC7]/30" }
    : task?.reported_by?.toLowerCase().includes("discord")
    ? { name: "Discord", icon: "🎮", color: "bg-[#5865F2]/10 text-[#5865F2] border-[#5865F2]/30" }
    : task?.reported_by?.toLowerCase().includes("telegram")
    ? { name: "Telegram", icon: "✈️", color: "bg-[#229ED9]/10 text-[#229ED9] border-[#229ED9]/30" }
    : null;

  // Accurate Agent Execution States
  type AgentExecutionState = "Ready" | "Working" | "Waiting for approval" | "Completed" | "Needs attention";

  interface AgentStatusMeta {
    state: AgentExecutionState;
    label: string;
    dotColor: string;
  }

  const getDiagnosisStatus = (): AgentStatusMeta => {
    if (!task) return { state: "Ready", label: "Standby • Ready", dotColor: "bg-gray-400" };
    if (task.status === "REPORTED") return { state: "Working", label: "Analyzing bug report...", dotColor: "bg-sky-500 animate-pulse" };
    if (task.status === "TRIAGE_FAILED") return { state: "Needs attention", label: "Triage Failed", dotColor: "bg-rose-500" };
    return { state: "Completed", label: "✓ Defect Identified", dotColor: "bg-emerald-500" };
  };

  const getTesterStatus = (): AgentStatusMeta => {
    if (!task) return { state: "Ready", label: "Standby • Sandbox Ready", dotColor: "bg-gray-400" };
    if (task.status === "REPORTED") return { state: "Ready", label: "Standby", dotColor: "bg-gray-400" };
    if (task.status === "TRIAGED" || task.status === "REPRODUCING") {
      return { state: "Working", label: "Executing reproduction in sandbox...", dotColor: "bg-sky-500 animate-pulse" };
    }
    if (task.status === "REPRODUCTION_FAILED") return { state: "Needs attention", label: "Reproduction Failed", dotColor: "bg-rose-500" };
    return {
      state: "Completed",
      label: reproFailedAsExpected ? "✓ Issue Confirmed (exit 1)" : "✓ Executed",
      dotColor: "bg-emerald-500",
    };
  };

  const getSolutionStatus = (): AgentStatusMeta => {
    if (!task) return { state: "Ready", label: "Standby • Fixer Ready", dotColor: "bg-gray-400" };
    if (["REPORTED", "TRIAGED", "REPRODUCING"].includes(task.status)) {
      return { state: "Ready", label: "Standby", dotColor: "bg-gray-400" };
    }
    if (task.status === "REPRODUCED") {
      return { state: "Working", label: "Synthesizing minimal patch...", dotColor: "bg-sky-500 animate-pulse" };
    }
    if (["REJECTED", "REVISION_REQUESTED"].includes(task.status)) {
      return { state: "Needs attention", label: "Revision Requested by Reviewer", dotColor: "bg-rose-500" };
    }
    return { state: "Completed", label: "✓ Solution Ready", dotColor: "bg-emerald-500" };
  };

  const getReviewerStatus = (): AgentStatusMeta => {
    if (!task) return { state: "Ready", label: "Standby • Verifier Ready", dotColor: "bg-gray-400" };
    if (["REPORTED", "TRIAGED", "REPRODUCING"].includes(task.status)) {
      return { state: "Ready", label: "Standby", dotColor: "bg-gray-400" };
    }
    if (task.status === "FIX_PROPOSED") {
      return { state: "Ready", label: "Ready for verification", dotColor: "bg-gray-400" };
    }
    if (task.status === "VERIFYING") {
      return { state: "Working", label: "Executing regression test suite...", dotColor: "bg-sky-500 animate-pulse" };
    }
    if (["VERIFICATION_FAILED", "FAILED"].includes(task.status)) {
      return { state: "Needs attention", label: "Verification Failed", dotColor: "bg-rose-500" };
    }
    if (task.status === "AWAITING_HUMAN_APPROVAL") {
      return { state: "Waiting for approval", label: "✓ Verified • Awaiting Human Approval", dotColor: "bg-amber-500" };
    }
    return { state: "Completed", label: "✓ All Tests Passed (exit 0)", dotColor: "bg-emerald-500" };
  };

  const renderStateBadge = (state: AgentExecutionState) => {
    switch (state) {
      case "Working":
        return (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-clay-pill bg-sky-50 text-sky-700 border border-sky-200 text-[9px] font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
            Working
          </span>
        );
      case "Waiting for approval":
        return (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-clay-pill bg-amber-50 text-amber-800 border border-amber-300 text-[9px] font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Waiting for approval
          </span>
        );
      case "Completed":
        return (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-clay-pill bg-emerald-50 text-emerald-800 border border-emerald-300 text-[9px] font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
            Completed
          </span>
        );
      case "Needs attention":
        return (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-clay-pill bg-rose-50 text-rose-800 border border-rose-300 text-[9px] font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
            Needs attention
          </span>
        );
      case "Ready":
      default:
        return (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-clay-pill bg-clay-surface-card text-clay-muted border border-clay-hairline text-[9px] font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
            Ready
          </span>
        );
    }
  };

  const diagMeta = getDiagnosisStatus();
  const testMeta = getTesterStatus();
  const solnMeta = getSolutionStatus();
  const revwMeta = getReviewerStatus();

  // Decision Handlers
  const handleApprove = async () => {
    if (!task) return;
    setIsSubmitting(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const updated = await approveTaskViaBFF(task.id, {
        comments: approvalComments.trim() || undefined,
        workspaceId: task.workspace_id,
      });
      setActionSuccess("Patch approved by supervisor. Ready to ship.");
      onTaskUpdated(updated);
      setApprovalComments("");
    } catch (err: any) {
      setActionError(err.message || "Failed to submit approval.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!task) return;
    if (!rejectFeedback.trim()) {
      setActionError("Feedback explaining the reason for adjustment is required.");
      return;
    }
    setIsSubmitting(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const updated = await rejectTaskViaBFF(task.id, {
        feedback: rejectFeedback.trim(),
        return_to: "FIX_PROPOSED",
        workspaceId: task.workspace_id,
      });
      setActionSuccess("Feedback sent. Fix assistant will prepare an updated solution.");
      onTaskUpdated(updated);
      setRejectFeedback("");
      setShowRejectForm(false);
    } catch (err: any) {
      setActionError(err.message || "Failed to submit feedback.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleComplete = async () => {
    if (!task) return;
    setIsSubmitting(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const updated = await completeTaskViaBFF(task.id, {
        workspaceId: task.workspace_id,
      });
      setActionSuccess("Task marked as completed and verified.");
      onTaskUpdated(updated);
    } catch (err: any) {
      setActionError(err.message || "Failed to complete task.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getHumanFriendlyStatus = (status: TaskStatus) => {
    switch (status) {
      case "REPORTED":
        return {
          title: "Investigating Issue",
          desc: "Analyzing the problem and locating the affected code.",
          color: "text-clay-teal font-semibold",
        };
      case "TRIAGED":
        return {
          title: "Issue Located",
          desc: "Isolated the exact code line. Starting automated reproduction.",
          color: "text-clay-lavender-ink font-semibold",
        };
      case "REPRODUCING":
        return {
          title: "Testing Reproduction",
          desc: "Confirming the reported defect in a secure sandbox.",
          color: "text-clay-lavender-ink font-semibold",
        };
      case "REPRODUCED":
        return {
          title: "Defect Confirmed",
          desc: "Automated check confirmed the problem. Preparing a solution.",
          color: "text-clay-peach-ink font-semibold",
        };
      case "FIX_PROPOSED":
        return {
          title: "Solution Ready",
          desc: "Proposed code fix generated. Running verification checks.",
          color: "text-clay-teal font-semibold",
        };
      case "VERIFYING":
        return {
          title: "Verifying Solution",
          desc: "Running full test suite against the proposed fix.",
          color: "text-clay-peach-ink font-semibold",
        };
      case "AWAITING_HUMAN_APPROVAL":
        return {
          title: "Ready for Your Approval",
          desc: "All verification tests passed. Please review and approve the fix.",
          color: "text-clay-peach-ink font-bold",
        };
      case "APPROVED":
        return {
          title: "Solution Approved",
          desc: "Ready to ship to main branch.",
          color: "text-clay-mint-ink font-bold",
        };
      case "COMPLETED":
        return {
          title: "Shipped to Production",
          desc: "Issue successfully resolved and verified.",
          color: "text-clay-mint-ink font-bold",
        };
      case "REJECTED":
        return {
          title: "Adjustments Requested",
          desc: "Returned to Fix Assistant with your feedback.",
          color: "text-clay-coral-ink font-bold",
        };
      default:
        return {
          title: status,
          desc: "Automated workflow in progress.",
          color: "text-clay-muted font-medium",
        };
    }
  };

  const statusInfo = task
    ? getHumanFriendlyStatus(task.status)
    : {
        title: "Autonomous Team Standby",
        desc: "Specialized agents are online and ready to diagnose, reproduce, and repair issues.",
        color: "text-clay-ink font-semibold",
      };

  return (
    <aside className="w-80 lg:w-92 border-l border-clay-hairline bg-clay-surface-soft flex flex-col shrink-0 select-text overflow-y-auto h-full text-xs text-clay-ink">
      {/* Top Header */}
      <div className="h-10 px-4 border-b border-clay-hairline bg-clay-canvas flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-clay-primary" />
          <h2 className="font-semibold text-clay-ink tracking-wide uppercase text-[11px] font-sans">
            Smart Assistants
          </h2>
        </div>

        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${isLoading ? "bg-amber-400 animate-pulse" : "bg-clay-success"}`} />
          <span className="text-[10px] font-sans text-clay-muted font-medium">
            {isLoading ? "Syncing..." : "Active"}
          </span>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-3.5 flex-1 overflow-y-auto">
        {/* CURRENT ACTIVITY BANNER */}
        <div
          className={`p-3.5 rounded-clay-lg border flex flex-col gap-1.5 shadow-clay-card transition-colors ${
            isAwaitingApproval
              ? "bg-clay-peach/25 border-clay-peach/50 text-clay-ink"
              : isApproved
              ? "bg-clay-mint/25 border-clay-mint/50 text-[#136149]"
              : isCompleted
              ? "bg-clay-mint/20 border-clay-mint/40 text-[#136149]"
              : "bg-white border-clay-hairline text-clay-ink"
          }`}
        >
          {originatingPlatform && task && (
            <div className={`flex items-center justify-between px-2 py-0.5 rounded-clay-md border text-[10px] font-sans font-medium ${originatingPlatform.color} mb-0.5`}>
              <span className="flex items-center gap-1.5 font-semibold">
                <span>{originatingPlatform.icon}</span>
                <span>{originatingPlatform.name} Origin</span>
              </span>
              <span className="font-mono text-[9px] truncate max-w-[130px]">
                {task.reported_by}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <h3 className={`text-xs ${statusInfo.color}`}>
              {statusInfo.title}
            </h3>
            {isAwaitingApproval && (
              <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-clay-pill bg-clay-peach/40 text-clay-peach-ink border border-clay-peach/60 font-semibold">
                <Lock className="w-2.5 h-2.5" />
                Needs Review
              </span>
            )}
          </div>
          <p className="text-[11px] text-clay-body leading-relaxed font-sans">
            {statusInfo.desc}
          </p>
        </div>

        {/* AGENT ROSTER - ACCURATE LIVE STATUS */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-sans font-semibold uppercase tracking-wider text-clay-muted">
              Specialized Assistants
            </span>
            <span className="text-[10px] text-clay-muted font-mono">
              {task
                ? isAwaitingApproval
                  ? "1 Waiting for approval"
                  : isCompleted
                  ? "All Completed"
                  : "Live Execution"
                : "4 Ready • Standby"}
            </span>
          </div>

          {/* 1. Diagnosis Assistant */}
          <div
            onClick={() => setSelectedAgentDetail("shipdev-triager")}
            className="p-3.5 rounded-clay-lg bg-white hover:bg-clay-surface-card border border-clay-hairline hover:border-clay-primary/40 shadow-clay-soft hover:shadow-clay-card flex flex-col justify-between min-h-[105px] cursor-pointer transition-all group"
            title="Inspect diagnosis assistant"
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${diagMeta.dotColor}`} />
                  <span className="font-semibold text-clay-ink text-xs group-hover:text-clay-primary transition-colors">
                    Diagnosis Assistant
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-clay-teal bg-clay-teal/10 px-2 py-0.5 rounded-clay-pill font-medium">
                    Diagnosis
                  </span>
                  {renderStateBadge(diagMeta.state)}
                </div>
              </div>
              <p className="text-[11px] text-clay-body font-sans leading-relaxed line-clamp-2">
                Analyzes the bug report, pinpoints the affected source file, and locates the error.
              </p>
            </div>
            <div className="text-[10px] pt-2 border-t border-clay-hairline flex items-center justify-between text-clay-muted mt-2">
              <span className="text-clay-body font-medium">
                {diagMeta.label}
              </span>
              <span className="text-clay-primary font-medium flex items-center gap-0.5">
                Inspect ↗
              </span>
            </div>
          </div>

          {/* 2. Automated Tester */}
          <div
            onClick={() => setSelectedAgentDetail("shipdev-triager")}
            className="p-3.5 rounded-clay-lg bg-white hover:bg-clay-surface-card border border-clay-hairline hover:border-clay-lavender shadow-clay-soft hover:shadow-clay-card flex flex-col justify-between min-h-[105px] cursor-pointer transition-all group"
            title="Inspect reproduction runner"
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${testMeta.dotColor}`} />
                  <span className="font-semibold text-clay-ink text-xs group-hover:text-clay-lavender-ink transition-colors">
                    Automated Tester
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-clay-lavender-ink bg-clay-lavender/25 px-2 py-0.5 rounded-clay-pill font-semibold">
                    Sandbox Test
                  </span>
                  {renderStateBadge(testMeta.state)}
                </div>
              </div>
              <p className="text-[11px] text-clay-body font-sans leading-relaxed line-clamp-2">
                Runs automated test scenarios in an isolated environment to verify the issue.
              </p>
            </div>
            <div className="text-[10px] pt-2 border-t border-clay-hairline flex items-center justify-between text-clay-muted mt-2">
              <span className="text-clay-body font-medium">
                {testMeta.label}
              </span>
              <span className="text-clay-muted">Details ↗</span>
            </div>
          </div>

          {/* 3. Solution Assistant */}
          <div
            onClick={() => setSelectedAgentDetail("shipdev-fixer")}
            className="p-3.5 rounded-clay-lg bg-white hover:bg-clay-surface-card border border-clay-hairline hover:border-clay-teal shadow-clay-soft hover:shadow-clay-card flex flex-col justify-between min-h-[105px] cursor-pointer transition-all group"
            title="Inspect solution generator"
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${solnMeta.dotColor}`} />
                  <span className="font-semibold text-clay-ink text-xs group-hover:text-clay-teal transition-colors">
                    Solution Assistant
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-clay-teal bg-clay-teal/10 px-2 py-0.5 rounded-clay-pill font-medium">
                    Code Fixer
                  </span>
                  {renderStateBadge(solnMeta.state)}
                </div>
              </div>
              <p className="text-[11px] text-clay-body font-sans leading-relaxed line-clamp-2">
                Crafts a minimal, targeted code solution that fixes the defect safely.
              </p>
            </div>
            <div className="text-[10px] pt-2 border-t border-clay-hairline flex items-center justify-between text-clay-muted mt-2">
              <span className="text-clay-body font-medium">
                {solnMeta.label}
              </span>
              <span className="text-clay-teal font-medium flex items-center gap-0.5">
                Inspect ↗
              </span>
            </div>
          </div>

          {/* 4. Quality Reviewer */}
          <div
            onClick={() => setSelectedAgentDetail("shipdev-verifier")}
            className="p-3.5 rounded-clay-lg bg-white hover:bg-clay-surface-card border border-clay-hairline hover:border-[#136149] shadow-clay-soft hover:shadow-clay-card flex flex-col justify-between min-h-[105px] cursor-pointer transition-all group"
            title="Inspect quality reviewer"
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${revwMeta.dotColor}`} />
                  <span className="font-semibold text-clay-ink text-xs group-hover:text-[#136149] transition-colors">
                    Quality Reviewer
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-[#136149] bg-clay-mint/25 px-2 py-0.5 rounded-clay-pill font-semibold">
                    Verification
                  </span>
                  {renderStateBadge(revwMeta.state)}
                </div>
              </div>
              <p className="text-[11px] text-clay-body font-sans leading-relaxed line-clamp-2">
                Independently validates that all tests pass before requesting your approval.
              </p>
            </div>
            <div className="text-[10px] pt-2 border-t border-clay-hairline flex items-center justify-between text-clay-muted mt-2">
              <span className="text-clay-body font-medium">
                {revwMeta.label}
              </span>
              <span className="text-[#136149] font-medium flex items-center gap-0.5">
                Inspect ↗
              </span>
            </div>
          </div>

          {/* Review Proposed Solution Changes Button */}
          {hasPatch && (
            <button
              onClick={onToggleDiffMode}
              className="w-full py-2.5 px-3.5 rounded-clay-lg bg-clay-surface-card hover:bg-clay-surface-strong border border-clay-hairline text-clay-ink font-medium text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-clay-soft"
            >
              <SplitSquareVertical className="w-3.5 h-3.5 text-clay-primary" />
              <span>Review Proposed Solution Changes</span>
            </button>
          )}
        </div>

        {/* HUMAN GATE APPROVAL CONSOLE */}
        <div className="mt-auto pt-3 border-t border-clay-hairline flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-sans font-semibold uppercase tracking-wider text-clay-ink flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-clay-primary" />
              <span>Your Review & Decision</span>
            </span>
            <span className="text-[9px] text-clay-muted font-sans">
              Human in the Loop
            </span>
          </div>

          {actionSuccess && (
            <div className="p-2.5 rounded-clay-md bg-clay-mint/20 border border-clay-mint/40 text-[#136149] text-xs font-sans flex items-center gap-2 shadow-clay-soft">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#136149] shrink-0" />
              <span>{actionSuccess}</span>
            </div>
          )}

          {actionError && (
            <div className="p-2.5 rounded-clay-md bg-clay-coral/15 border border-clay-coral/40 text-clay-coral text-xs font-sans flex items-center gap-2 shadow-clay-soft">
              <AlertCircle className="w-3.5 h-3.5 text-clay-coral shrink-0" />
              <span>{actionError}</span>
            </div>
          )}

          {/* When awaiting approval */}
          {isAwaitingApproval && (
            <div className="flex flex-col gap-2.5">
              {/* Review Checklist */}
              <div className="p-3 rounded-clay-lg bg-white border border-clay-hairline shadow-clay-soft flex flex-col gap-2 text-[11px] font-sans">
                <div className="flex items-center gap-2 text-clay-body">
                  <CheckCircle2 className="w-3.5 h-3.5 text-clay-success shrink-0" />
                  <span>Issue verified in isolated sandbox</span>
                </div>
                <div className="flex items-center gap-2 text-clay-body">
                  <CheckCircle2 className="w-3.5 h-3.5 text-clay-success shrink-0" />
                  <span>Targeted fix passes all test cases</span>
                </div>
                <div className="flex items-center gap-2 text-clay-body">
                  <CheckCircle2 className="w-3.5 h-3.5 text-clay-success shrink-0" />
                  <span>Ready for your final review and deploy</span>
                </div>
              </div>

              {/* Comments box */}
              {!showRejectForm ? (
                <>
                  <input
                    type="text"
                    value={approvalComments}
                    onChange={(e) => setApprovalComments(e.target.value)}
                    placeholder="Add an optional approval note..."
                    aria-label="Approval comments"
                    style={{ outline: "none", boxShadow: "none" }}
                    className="w-full px-3 py-2 rounded-clay-md bg-clay-surface-soft border border-clay-hairline text-xs text-clay-ink placeholder-clay-muted outline-none focus:outline-none focus:ring-0 shadow-clay-soft"
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={handleApprove}
                      disabled={isSubmitting}
                      className="w-full py-2.5 px-3 rounded-clay-md bg-clay-primary hover:bg-clay-primary-active text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-clay-soft disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <UserCheck className="w-3.5 h-3.5" />
                      )}
                      <span>Approve & Ship</span>
                    </button>

                    <button
                      onClick={() => setShowRejectForm(true)}
                      disabled={isSubmitting}
                      className="w-full py-2.5 px-3 rounded-clay-md bg-white hover:bg-clay-coral/10 border border-clay-coral/60 text-clay-coral-ink text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-clay-soft"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Request Changes</span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex flex-col gap-2">
                  <textarea
                    rows={2}
                    value={rejectFeedback}
                    onChange={(e) => setRejectFeedback(e.target.value)}
                    placeholder="Explain what needs to be changed in the solution..."
                    aria-label="Explain required changes"
                    style={{ outline: "none", boxShadow: "none" }}
                    className="w-full p-2.5 rounded-clay-md bg-clay-surface-soft border border-clay-coral/60 text-xs text-clay-ink placeholder-clay-muted outline-none focus:outline-none focus:ring-0 resize-none shadow-clay-soft"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleReject}
                      disabled={isSubmitting || !rejectFeedback.trim()}
                      className="flex-1 py-2 rounded-clay-md bg-clay-coral hover:bg-clay-coral/90 text-white text-xs font-semibold cursor-pointer transition-colors disabled:opacity-40 shadow-clay-soft"
                    >
                      Confirm Request
                    </button>
                    <button
                      onClick={() => setShowRejectForm(false)}
                      className="py-2 px-3 rounded-clay-md border border-clay-hairline bg-white hover:bg-clay-surface-card text-clay-muted hover:text-clay-ink text-xs cursor-pointer shadow-clay-soft"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* When approved */}
          {isApproved && (
            <button
              onClick={handleComplete}
              disabled={isSubmitting}
              className="w-full py-2.5 px-3 rounded-clay-md bg-clay-teal hover:bg-clay-teal/90 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-clay-soft disabled:opacity-50"
            >
              {isSubmitting ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              <span>Deploy Solution to Main</span>
            </button>
          )}

          {/* When completed */}
          {isCompleted && (
            <div className="p-3 rounded-clay-lg bg-clay-mint/25 border border-clay-mint/50 flex items-center justify-between text-xs text-[#136149] shadow-clay-soft">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-clay-success shrink-0" />
                <span className="font-semibold">
                  Fix Deployed to Production
                </span>
              </span>
              <span className="text-[#136149] font-bold">Verified</span>
            </div>
          )}

          {/* Standby / In-Progress Supervisory Note */}
          {!isAwaitingApproval && !isApproved && !isCompleted && (
            <div className="p-3 rounded-clay-lg bg-white border border-clay-hairline text-center flex flex-col items-center justify-center gap-1.5 shadow-clay-soft">
              <div className="flex items-center gap-1.5 text-clay-ink font-semibold text-xs">
                <ShieldCheck className="w-4 h-4 text-clay-primary" />
                <span>{task ? "Supervisory Verification Active" : "Supervisory Gate Standby"}</span>
              </div>
              <p className="text-[10px] text-clay-muted leading-relaxed font-sans">
                {task
                  ? "Changes require verified test evidence and supervisor sign-off before shipping."
                  : "Select an issue from the architecture map or left panel to inspect real-time progress."}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* AGENT DETAIL MODAL */}
      <AgentDetailModal
        isOpen={Boolean(selectedAgentDetail)}
        onClose={() => setSelectedAgentDetail(null)}
        agentId={selectedAgentDetail}
        switchConnected={true}
      />
    </aside>
  );
}

"use client";

import React, { useState } from "react";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Clock,
  CornerDownLeft,
  ExternalLink,
  FileCheck2,
  GitBranch,
  Lock,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  SplitSquareVertical,
  Terminal,
  User,
  UserCheck,
  XCircle,
} from "lucide-react";
import { ApprovalRecord, Evidence, Task, TaskStatus } from "@/types";
import { approveTaskViaBFF, rejectTaskViaBFF, completeTaskViaBFF } from "@/lib/api";

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

  if (isLoading) {
    return (
      <aside className="w-80 lg:w-92 border-l border-clay-hairline bg-clay-surface-soft p-4 flex flex-col gap-3 shrink-0">
        <div className="h-4 w-1/2 bg-clay-surface-card rounded-clay-md animate-pulse" />
        <div className="h-24 w-full bg-clay-surface-card rounded-clay-lg animate-pulse" />
        <div className="h-32 w-full bg-clay-surface-card rounded-clay-lg animate-pulse" />
      </aside>
    );
  }

  if (!task) {
    return (
      <aside className="w-80 lg:w-92 border-l border-clay-hairline bg-clay-surface-soft p-6 flex flex-col items-center justify-center text-center text-clay-muted shrink-0 select-none">
        <Bot className="w-8 h-8 mb-2 text-clay-muted" />
        <span className="text-xs font-mono">Select a bug to inspect the AI Engineering Team</span>
      </aside>
    );
  }

  // Evidence extraction
  const reproEvidence = evidenceList.find((e) => e.stage === "reproduction");
  const verifyEvidence = evidenceList.find((e) => e.stage === "verification");

  const hasReproRun = Boolean(reproEvidence);
  const reproExitCode = reproEvidence ? reproEvidence.exit_code : null;
  const reproFailedAsExpected = reproEvidence ? reproEvidence.exit_code !== 0 : false;

  const hasVerifyRun = Boolean(verifyEvidence);
  const verifyExitCode = verifyEvidence ? verifyEvidence.exit_code : null;
  const verifyPassed = verifyEvidence ? verifyEvidence.exit_code === 0 : false;
  const hasPatch = Boolean(verifyEvidence?.patch_diff || reproEvidence?.patch_diff);

  const isAwaitingApproval = task.status === "AWAITING_HUMAN_APPROVAL";
  const isApproved = task.status === "APPROVED";
  const isCompleted = task.status === "COMPLETED";

  // Human Gate Handlers
  const handleApprove = async () => {
    setIsSubmitting(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const updated = await approveTaskViaBFF(task.id, {
        comments: approvalComments.trim() || undefined,
      });
      setActionSuccess("Patch approved by human supervisor.");
      onTaskUpdated(updated);
      setApprovalComments("");
    } catch (err: any) {
      setActionError(err.message || "Failed to submit approval.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!rejectFeedback.trim()) {
      setActionError("Feedback explaining the reason for rejection is required.");
      return;
    }
    setIsSubmitting(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const updated = await rejectTaskViaBFF(task.id, {
        feedback: rejectFeedback.trim(),
        return_to: "FIX_PROPOSED",
      });
      setActionSuccess("Patch rejected. Task returned to Fix Agent for re-attempt.");
      onTaskUpdated(updated);
      setRejectFeedback("");
      setShowRejectForm(false);
    } catch (err: any) {
      setActionError(err.message || "Failed to submit rejection.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleComplete = async () => {
    setIsSubmitting(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const updated = await completeTaskViaBFF(task.id);
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
          title: "Investigating issue",
          desc: "Triage agent is analyzing bug report and locating affected source code.",
          color: "text-clay-teal font-semibold",
        };
      case "TRIAGED":
        return {
          title: "Analysis complete",
          desc: "Target isolated in demo/buggy_app/calculator.py. Handing off to sandbox reproduction.",
          color: "text-clay-lavender-ink font-semibold",
        };
      case "REPRODUCING":
        return {
          title: "Reproducing failure",
          desc: "Executing regression test suite in isolated sandbox workspace.",
          color: "text-clay-lavender-ink font-semibold",
        };
      case "REPRODUCED":
        return {
          title: "Defect confirmed",
          desc: "Reproduction confirmed genuine test failure (exit code 1). Handing off to Fix Agent.",
          color: "text-clay-peach-ink font-semibold",
        };
      case "FIX_PROPOSED":
        return {
          title: "Preparing a fix",
          desc: "Candidate patch diff generated. Handing off to independent verification.",
          color: "text-clay-teal font-semibold",
        };
      case "VERIFYING":
        return {
          title: "Running verification",
          desc: "Verifier agent executing full test suite against patched workspace.",
          color: "text-clay-peach-ink font-semibold",
        };
      case "AWAITING_HUMAN_APPROVAL":
        return {
          title: "Waiting for your approval",
          desc: "All verification tests passed. Review the patch diff and decide.",
          color: "text-clay-peach-ink font-bold",
        };
      case "APPROVED":
        return {
          title: "Approved by human",
          desc: "Ready to ship to repository and complete.",
          color: "text-clay-mint-ink font-bold",
        };
      case "COMPLETED":
        return {
          title: "Completed & shipped",
          desc: "Defect successfully resolved and verified.",
          color: "text-clay-mint-ink font-bold",
        };
      case "REJECTED":
        return {
          title: "Changes requested",
          desc: "Returned to Fix Agent for re-attempt with human feedback.",
          color: "text-clay-coral-ink font-bold",
        };
      default:
        return {
          title: status,
          desc: "Agent processing in progress.",
          color: "text-clay-muted font-medium",
        };
    }
  };

  const statusInfo = getHumanFriendlyStatus(task.status);

  return (
    <aside className="w-80 lg:w-92 border-l border-clay-hairline bg-clay-surface-soft flex flex-col shrink-0 select-text overflow-y-auto h-full text-xs text-clay-ink">
      {/* Top Header */}
      <div className="h-9 px-3 border-b border-clay-hairline bg-clay-canvas flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-clay-primary" />
          <h2 className="font-semibold text-clay-ink tracking-wide uppercase text-[11px]">
            AI Engineering Team
          </h2>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-clay-success" />
          <span className="text-[10px] font-mono text-clay-muted font-medium">Switch Live</span>
        </div>
      </div>

      <div className="p-3 flex flex-col gap-3.5 flex-1 overflow-y-auto">
        {/* CURRENT ACTIVITY BANNER (Kicker removed per Impeccable craft floor) */}
        <div
          className={`p-3.5 rounded-clay-xl border flex flex-col gap-1.5 shadow-clay-card ${
            isAwaitingApproval
              ? "bg-clay-peach/25 border-clay-peach/50 text-clay-ink"
              : isApproved
              ? "bg-clay-mint/25 border-clay-mint/50 text-[#136149]"
              : isCompleted
              ? "bg-clay-mint/20 border-clay-mint/40 text-[#136149]"
              : "bg-white border-clay-hairline text-clay-ink"
          }`}
        >
          <div className="flex items-center justify-between">
            <h3 className={`text-xs ${statusInfo.color}`}>
              {statusInfo.title}
            </h3>
            {isAwaitingApproval && (
              <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-clay-pill bg-clay-peach/40 text-clay-peach-ink border border-clay-peach/60 font-semibold">
                <Lock className="w-2.5 h-2.5" />
                Human Gate
              </span>
            )}
          </div>
          <p className="text-[11px] text-clay-body leading-relaxed font-sans">
            {statusInfo.desc}
          </p>
        </div>

        {/* SWITCH INCIDENT ROOM INFO */}
        <div className="p-2.5 rounded-clay-lg bg-white border border-clay-hairline shadow-clay-soft flex items-center justify-between text-[11px] font-mono">
          <div className="flex items-center gap-2 text-clay-ink">
            <MessageSquare className="w-3.5 h-3.5 text-clay-primary" />
            <span className="text-clay-ink font-semibold">#shipdev-command-center</span>
          </div>
          <span className="text-[10px] text-clay-muted">Mattermost Bridged</span>
        </div>

        {/* AGENT ROSTER */}
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-clay-muted px-1">
            Active Agents & Roles
          </span>

          {/* 1. Triage Agent */}
          <div className="p-2.5 rounded-clay-lg bg-white border border-clay-hairline shadow-clay-soft flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-clay-teal" />
                <span className="font-mono font-semibold text-clay-ink">
                  shipdev-triager
                </span>
              </div>
              <span className="text-[10px] font-mono text-clay-teal bg-clay-teal/10 px-1.5 py-0.5 rounded-clay-pill">
                Triage Agent
              </span>
            </div>
            <p className="text-[11px] text-clay-body font-sans leading-relaxed">
              Analyzes bug reports, maps defects to source files, and dispatches to sandbox.
            </p>
            <div className="text-[10px] font-mono text-clay-muted pt-1 border-t border-clay-hairline flex items-center justify-between">
              <span>Status: {task.status !== "REPORTED" ? "Analysis Posted" : "Investigating"}</span>
              <span className="text-clay-muted">UUID: bd717264</span>
            </div>
          </div>

          {/* 2. Sandbox Reproduction Agent */}
          <div className="p-2.5 rounded-clay-lg bg-white border border-clay-hairline shadow-clay-soft flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    reproFailedAsExpected ? "bg-clay-lavender" : "bg-clay-muted"
                  }`}
                />
                <span className="font-mono font-semibold text-clay-ink">
                  Reproduction Agent
                </span>
              </div>
              <span className="text-[10px] font-mono text-clay-lavender-ink bg-clay-lavender/25 px-1.5 py-0.5 rounded-clay-pill font-semibold">
                Sandbox Runner
              </span>
            </div>
            <p className="text-[11px] text-clay-body font-sans leading-relaxed">
              Executes regression tests in pristine temporary workspaces without touching production.
            </p>
            <div className="text-[10px] font-mono pt-1 border-t border-clay-hairline flex items-center justify-between">
              <span className="text-clay-body">
                {hasReproRun ? (
                  reproFailedAsExpected ? (
                    <span className="text-clay-lavender-ink font-semibold">✓ Defect Confirmed (Exit 1)</span>
                  ) : (
                    <span className="text-clay-muted">Executed (Exit {reproExitCode})</span>
                  )
                ) : (
                  <span className="text-clay-muted">Pending run</span>
                )}
              </span>
              <span className="text-clay-muted">pytest</span>
            </div>
          </div>

          {/* 3. Fix Agent */}
          <div className="p-2.5 rounded-clay-lg bg-white border border-clay-hairline shadow-clay-soft flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    hasPatch ? "bg-clay-teal" : "bg-clay-muted"
                  }`}
                />
                <span className="font-mono font-semibold text-clay-ink">
                  Fix Agent
                </span>
              </div>
              <span className="text-[10px] font-mono text-clay-teal bg-clay-teal/10 px-1.5 py-0.5 rounded-clay-pill font-medium">
                Patch Generator
              </span>
            </div>
            <p className="text-[11px] text-clay-body font-sans leading-relaxed">
              Synthesizes minimal isolated code fix and generates unified diff.
            </p>
            {hasPatch && (
              <button
                onClick={onToggleDiffMode}
                className="mt-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-clay-md bg-clay-surface-card hover:bg-clay-surface-strong border border-clay-hairline text-clay-ink font-mono text-[11px] transition-colors cursor-pointer shadow-clay-soft"
              >
                <SplitSquareVertical className="w-3 h-3 text-clay-primary" />
                <span>Compare Proposed Patch</span>
              </button>
            )}
          </div>

          {/* 4. Verification Agent */}
          <div className="p-2.5 rounded-clay-lg bg-white border border-clay-hairline shadow-clay-soft flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    verifyPassed ? "bg-clay-mint" : "bg-clay-muted"
                  }`}
                />
                <span className="font-mono font-semibold text-clay-ink">
                  shipdev-verifier
                </span>
              </div>
              <span className="text-[10px] font-mono text-[#136149] bg-clay-mint/25 px-1.5 py-0.5 rounded-clay-pill font-semibold">
                Verifier Agent
              </span>
            </div>
            <p className="text-[11px] text-clay-body font-sans leading-relaxed">
              Independently validates full test suite against patched workspace before human handoff.
            </p>
            <div className="text-[10px] font-mono pt-1 border-t border-clay-hairline flex items-center justify-between">
              <span className="text-clay-body">
                {hasVerifyRun ? (
                  verifyPassed ? (
                    <span className="text-[#136149] font-semibold">✓ All Tests Passed (Exit 0)</span>
                  ) : (
                    <span className="text-clay-coral font-semibold">✗ Verification Failed (Exit {verifyExitCode})</span>
                  )
                ) : (
                  <span className="text-clay-muted">Pending run</span>
                )}
              </span>
              <span className="text-clay-muted">UUID: 7dc5d295</span>
            </div>
          </div>
        </div>

        {/* HUMAN GATE APPROVAL CONSOLE */}
        <div className="mt-auto pt-3 border-t border-clay-hairline flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-clay-ink flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-clay-primary" />
              <span>Human Approval Gate</span>
            </span>
            <span className="text-[9px] font-mono text-clay-muted">Immutable Boundary</span>
          </div>

          {actionSuccess && (
            <div className="p-2 rounded-clay-md bg-clay-mint/20 border border-clay-mint/40 text-[#136149] text-[11px] font-sans flex items-center gap-2 shadow-clay-soft">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#136149] shrink-0" />
              <span>{actionSuccess}</span>
            </div>
          )}

          {actionError && (
            <div className="p-2 rounded-clay-md bg-clay-coral/15 border border-clay-coral/40 text-clay-coral text-[11px] font-sans flex items-center gap-2 shadow-clay-soft">
              <AlertCircle className="w-3.5 h-3.5 text-clay-coral shrink-0" />
              <span>{actionError}</span>
            </div>
          )}

          {/* When awaiting approval */}
          {isAwaitingApproval && (
            <div className="flex flex-col gap-2">
              {/* Review Checklist */}
              <div className="p-2.5 rounded-clay-lg bg-white border border-clay-hairline shadow-clay-soft flex flex-col gap-1.5 font-mono text-[10px]">
                <div className="flex items-center gap-1.5 text-clay-body">
                  <CheckCircle2 className="w-3 h-3 text-clay-success shrink-0" />
                  <span>Reproduction verified (exit code 1)</span>
                </div>
                <div className="flex items-center gap-1.5 text-clay-body">
                  <CheckCircle2 className="w-3 h-3 text-clay-success shrink-0" />
                  <span>Verification passed (exit code 0)</span>
                </div>
                <div className="flex items-center gap-1.5 text-clay-body">
                  <CheckCircle2 className="w-3 h-3 text-clay-success shrink-0" />
                  <span>Unified patch diff ready for review</span>
                </div>
              </div>

              {/* Comments box */}
              {!showRejectForm ? (
                <>
                  <input
                    type="text"
                    value={approvalComments}
                    onChange={(e) => setApprovalComments(e.target.value)}
                    placeholder="Approval comments (optional)..."
                    aria-label="Approval comments"
                    className="w-full px-2.5 py-1.5 rounded-clay-md bg-white border border-clay-hairline text-xs font-mono text-clay-ink placeholder-clay-muted outline-none focus:border-clay-primary shadow-clay-soft"
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={handleApprove}
                      disabled={isSubmitting}
                      className="w-full py-2 px-3 rounded-clay-md bg-clay-primary hover:bg-clay-primary-active text-white font-mono text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-clay-soft disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <UserCheck className="w-3.5 h-3.5" />
                      )}
                      <span>Approve Fix</span>
                    </button>

                    <button
                      onClick={() => setShowRejectForm(true)}
                      disabled={isSubmitting}
                      className="w-full py-2 px-3 rounded-clay-md bg-white hover:bg-clay-coral/10 border border-clay-coral/60 text-clay-coral-ink font-mono text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-clay-soft"
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
                    placeholder="Explain required changes for the Fix Agent..."
                    aria-label="Explain required changes for the Fix Agent"
                    className="w-full p-2 rounded-clay-md bg-white border border-clay-coral/60 text-xs font-mono text-clay-ink placeholder-clay-muted outline-none resize-none shadow-clay-soft"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleReject}
                      disabled={isSubmitting || !rejectFeedback.trim()}
                      className="flex-1 py-1.5 rounded-clay-md bg-clay-coral hover:bg-clay-coral/90 text-white font-mono text-xs font-semibold cursor-pointer transition-colors disabled:opacity-40 shadow-clay-soft"
                    >
                      Confirm Rejection
                    </button>
                    <button
                      onClick={() => setShowRejectForm(false)}
                      className="py-1.5 px-3 rounded-clay-md border border-clay-hairline bg-white hover:bg-clay-surface-card text-clay-muted hover:text-clay-ink font-mono text-xs cursor-pointer shadow-clay-soft"
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
              className="w-full py-2 px-3 rounded-clay-md bg-clay-teal hover:bg-clay-teal/90 text-white font-mono text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-clay-soft disabled:opacity-50"
            >
              {isSubmitting ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              <span>Complete & Ship Fix</span>
            </button>
          )}

          {/* When completed */}
          {isCompleted && (
            <div className="p-2.5 rounded-clay-lg bg-clay-mint/25 border border-clay-mint/50 flex items-center justify-between font-mono text-[11px] text-[#136149] shadow-clay-soft">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-clay-success" />
                <span className="font-semibold">Fix Shipped to Main</span>
              </span>
              <span className="text-[#136149] font-semibold">Verified</span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}


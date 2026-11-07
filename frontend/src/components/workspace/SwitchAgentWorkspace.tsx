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
      <aside className="w-80 lg:w-92 border-l border-[#1e1e1e] bg-[#050505] p-4 flex flex-col gap-3 shrink-0">
        <div className="h-4 w-1/2 bg-[#181818] rounded animate-pulse" />
        <div className="h-24 w-full bg-[#141414] rounded-lg animate-pulse" />
        <div className="h-32 w-full bg-[#141414] rounded-lg animate-pulse" />
      </aside>
    );
  }

  if (!task) {
    return (
      <aside className="w-80 lg:w-92 border-l border-[#1e1e1e] bg-[#050505] p-6 flex flex-col items-center justify-center text-center text-neutral-500 shrink-0 select-none">
        <Bot className="w-8 h-8 mb-2 text-neutral-600" />
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
          color: "text-blue-400",
        };
      case "TRIAGED":
        return {
          title: "Analysis complete",
          desc: "Target isolated in demo/buggy_app/calculator.py. Handing off to sandbox reproduction.",
          color: "text-purple-400",
        };
      case "REPRODUCING":
        return {
          title: "Reproducing failure",
          desc: "Executing regression test suite in isolated sandbox workspace.",
          color: "text-blue-400 animate-pulse",
        };
      case "REPRODUCED":
        return {
          title: "Defect confirmed",
          desc: "Reproduction confirmed genuine test failure (exit code 1). Handing off to Fix Agent.",
          color: "text-purple-400",
        };
      case "FIX_PROPOSED":
        return {
          title: "Preparing a fix",
          desc: "Candidate patch diff generated. Handing off to independent verification.",
          color: "text-cyan-400",
        };
      case "VERIFYING":
        return {
          title: "Running verification",
          desc: "Verifier agent executing full test suite against patched workspace.",
          color: "text-indigo-400 animate-pulse",
        };
      case "AWAITING_HUMAN_APPROVAL":
        return {
          title: "Waiting for your approval",
          desc: "All verification tests passed. Review the patch diff and decide.",
          color: "text-amber-400 font-bold",
        };
      case "APPROVED":
        return {
          title: "Approved by human",
          desc: "Ready to ship to repository and complete.",
          color: "text-emerald-400 font-bold",
        };
      case "COMPLETED":
        return {
          title: "Completed & shipped",
          desc: "Defect successfully resolved and verified.",
          color: "text-emerald-400 font-bold",
        };
      case "REJECTED":
        return {
          title: "Changes requested",
          desc: "Returned to Fix Agent for re-attempt with human feedback.",
          color: "text-rose-400",
        };
      default:
        return {
          title: status,
          desc: "Agent processing in progress.",
          color: "text-neutral-400",
        };
    }
  };

  const statusInfo = getHumanFriendlyStatus(task.status);

  return (
    <aside className="w-80 lg:w-92 border-l border-[#1e1e1e] bg-[#050505] flex flex-col shrink-0 select-text overflow-y-auto h-full text-xs">
      {/* Top Header */}
      <div className="h-9 px-3 border-b border-[#1e1e1e] bg-[#080808] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-[#f54e00]" />
          <span className="font-semibold text-neutral-200 tracking-wide uppercase text-[11px]">
            AI Engineering Team
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#22c55e]" />
          <span className="text-[10px] font-mono text-neutral-400">Switch Live</span>
        </div>
      </div>

      <div className="p-3 flex flex-col gap-3.5 flex-1 overflow-y-auto">
        {/* CURRENT ACTIVITY BANNER */}
        <div
          className={`p-3 rounded-xl border flex flex-col gap-1.5 ${
            isAwaitingApproval
              ? "bg-amber-950/40 border-amber-500/50 text-amber-200 shadow-[0_0_15px_rgba(245,158,11,0.1)]"
              : isApproved
              ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-200"
              : isCompleted
              ? "bg-emerald-950/30 border-emerald-600/40 text-emerald-300"
              : "bg-[#0c0c0c] border-[#1e1e1e] text-neutral-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-mono font-semibold tracking-wider text-neutral-400">
              Current Activity
            </span>
            {isAwaitingApproval && (
              <span className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                <Lock className="w-2.5 h-2.5" />
                Human Gate
              </span>
            )}
          </div>
          <div className={`text-xs font-semibold ${statusInfo.color}`}>
            {statusInfo.title}
          </div>
          <p className="text-[11px] text-neutral-400 leading-relaxed font-sans">
            {statusInfo.desc}
          </p>
        </div>

        {/* SWITCH INCIDENT ROOM INFO */}
        <div className="p-2.5 rounded-lg bg-[#0e0e0e] border border-[#202020] flex items-center justify-between text-[11px] font-mono">
          <div className="flex items-center gap-2 text-neutral-300">
            <MessageSquare className="w-3.5 h-3.5 text-[#f54e00]" />
            <span className="text-white font-medium">#shipdev-command-center</span>
          </div>
          <span className="text-[10px] text-neutral-500">Mattermost Bridged</span>
        </div>

        {/* AGENT ROSTER */}
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-neutral-400 px-1">
            Active Agents & Roles
          </span>

          {/* 1. Triage Agent */}
          <div className="p-2.5 rounded-lg bg-[#0a0a0a] border border-[#1e1e1e] flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                <span className="font-mono font-semibold text-neutral-200">
                  shipdev-triager
                </span>
              </div>
              <span className="text-[10px] font-mono text-neutral-500">Triage Agent</span>
            </div>
            <p className="text-[11px] text-neutral-400 font-sans leading-relaxed">
              Analyzes bug reports, maps defects to source files, and dispatches to sandbox.
            </p>
            <div className="text-[10px] font-mono text-neutral-500 pt-1 border-t border-[#181818] flex items-center justify-between">
              <span>Status: {task.status !== "REPORTED" ? "Analysis Posted" : "Investigating"}</span>
              <span className="text-neutral-600">UUID: bd717264</span>
            </div>
          </div>

          {/* 2. Sandbox Reproduction Agent */}
          <div className="p-2.5 rounded-lg bg-[#0a0a0a] border border-[#1e1e1e] flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    reproFailedAsExpected ? "bg-purple-400" : "bg-neutral-600"
                  }`}
                />
                <span className="font-mono font-semibold text-neutral-200">
                  Reproduction Agent
                </span>
              </div>
              <span className="text-[10px] font-mono text-neutral-500">Sandbox Runner</span>
            </div>
            <p className="text-[11px] text-neutral-400 font-sans leading-relaxed">
              Executes regression tests in pristine temporary workspaces without touching production.
            </p>
            <div className="text-[10px] font-mono pt-1 border-t border-[#181818] flex items-center justify-between">
              <span className="text-neutral-400">
                {hasReproRun ? (
                  reproFailedAsExpected ? (
                    <span className="text-purple-400 font-medium">✓ Defect Confirmed (Exit 1)</span>
                  ) : (
                    <span className="text-neutral-500">Executed (Exit {reproExitCode})</span>
                  )
                ) : (
                  <span className="text-neutral-600">Pending run</span>
                )}
              </span>
              <span className="text-neutral-600">pytest</span>
            </div>
          </div>

          {/* 3. Fix Agent */}
          <div className="p-2.5 rounded-lg bg-[#0a0a0a] border border-[#1e1e1e] flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    hasPatch ? "bg-cyan-400" : "bg-neutral-600"
                  }`}
                />
                <span className="font-mono font-semibold text-neutral-200">
                  Fix Agent
                </span>
              </div>
              <span className="text-[10px] font-mono text-neutral-500">Patch Generator</span>
            </div>
            <p className="text-[11px] text-neutral-400 font-sans leading-relaxed">
              Synthesizes minimal isolated code fix and generates unified diff.
            </p>
            {hasPatch && (
              <button
                onClick={onToggleDiffMode}
                className="mt-1 flex items-center justify-center gap-1.5 py-1 px-2 rounded bg-[#161616] hover:bg-[#202020] border border-[#2a2a2a] text-[#f54e00] hover:text-[#ff6a26] font-mono text-[11px] transition-colors cursor-pointer"
              >
                <SplitSquareVertical className="w-3 h-3" />
                <span>Compare Proposed Patch</span>
              </button>
            )}
          </div>

          {/* 4. Verification Agent */}
          <div className="p-2.5 rounded-lg bg-[#0a0a0a] border border-[#1e1e1e] flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    verifyPassed ? "bg-emerald-400" : "bg-neutral-600"
                  }`}
                />
                <span className="font-mono font-semibold text-neutral-200">
                  shipdev-verifier
                </span>
              </div>
              <span className="text-[10px] font-mono text-neutral-500">Verifier Agent</span>
            </div>
            <p className="text-[11px] text-neutral-400 font-sans leading-relaxed">
              Independently validates full test suite against patched workspace before human handoff.
            </p>
            <div className="text-[10px] font-mono pt-1 border-t border-[#181818] flex items-center justify-between">
              <span className="text-neutral-400">
                {hasVerifyRun ? (
                  verifyPassed ? (
                    <span className="text-emerald-400 font-medium">✓ All Tests Passed (Exit 0)</span>
                  ) : (
                    <span className="text-rose-400 font-medium">✗ Verification Failed (Exit {verifyExitCode})</span>
                  )
                ) : (
                  <span className="text-neutral-600">Pending run</span>
                )}
              </span>
              <span className="text-neutral-600">UUID: 7dc5d295</span>
            </div>
          </div>
        </div>

        {/* HUMAN GATE APPROVAL CONSOLE */}
        <div className="mt-auto pt-3 border-t border-[#1e1e1e] flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#f54e00]" />
              <span>Human Approval Gate</span>
            </span>
            <span className="text-[9px] font-mono text-neutral-500">Immutable Boundary</span>
          </div>

          {actionSuccess && (
            <div className="p-2 rounded bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-[11px] font-sans flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>{actionSuccess}</span>
            </div>
          )}

          {actionError && (
            <div className="p-2 rounded bg-rose-950/40 border border-rose-800/60 text-rose-300 text-[11px] font-sans flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span>{actionError}</span>
            </div>
          )}

          {/* When awaiting approval */}
          {isAwaitingApproval && (
            <div className="flex flex-col gap-2">
              {/* Review Checklist */}
              <div className="p-2.5 rounded-lg bg-[#0e0e0e] border border-[#222222] flex flex-col gap-1.5 font-mono text-[10px]">
                <div className="flex items-center gap-1.5 text-neutral-300">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span>Reproduction verified (exit code 1)</span>
                </div>
                <div className="flex items-center gap-1.5 text-neutral-300">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span>Verification passed (exit code 0)</span>
                </div>
                <div className="flex items-center gap-1.5 text-neutral-300">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
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
                    className="w-full px-2.5 py-1.5 rounded-md bg-[#121212] border border-[#262626] text-xs font-mono text-white placeholder-neutral-500 outline-none focus:border-[#f54e00]"
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={handleApprove}
                      disabled={isSubmitting}
                      className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-sm disabled:opacity-50"
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
                      className="w-full py-2 px-3 rounded-lg bg-transparent hover:bg-rose-500/10 border border-rose-500/60 text-rose-400 hover:text-rose-300 font-mono text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
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
                    className="w-full p-2 rounded-md bg-[#121212] border border-rose-500/60 text-xs font-mono text-white placeholder-neutral-500 outline-none resize-none"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleReject}
                      disabled={isSubmitting || !rejectFeedback.trim()}
                      className="flex-1 py-1.5 rounded-md bg-rose-600 hover:bg-rose-500 text-white font-mono text-xs font-semibold cursor-pointer transition-colors disabled:opacity-40"
                    >
                      Confirm Rejection
                    </button>
                    <button
                      onClick={() => setShowRejectForm(false)}
                      className="py-1.5 px-3 rounded-md border border-[#2a2a2a] text-neutral-400 hover:text-white font-mono text-xs cursor-pointer"
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
              className="w-full py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-mono text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-sm disabled:opacity-50"
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
            <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/50 flex items-center justify-between font-mono text-[11px] text-emerald-300">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Fix Shipped to Main</span>
              </span>
              <span className="text-emerald-500">Verified</span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}


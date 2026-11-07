"use client";

import React, { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  CornerDownLeft,
  Lock,
  RotateCcw,
  ShieldCheck,
  UserCheck,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Task } from "@/types";
import { approveTaskViaBFF, rejectTaskViaBFF, completeTaskViaBFF } from "@/lib/api";

interface HumanGateConsoleProps {
  task: Task;
  onActionSuccess: (updatedTask: Task) => void;
}

export function HumanGateConsole({ task, onActionSuccess }: HumanGateConsoleProps) {
  const [comments, setComments] = useState("");
  const [rejectFeedback, setRejectFeedback] = useState("");
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const isAwaitingApproval = task.status === "AWAITING_HUMAN_APPROVAL";
  const isApproved = task.status === "APPROVED";
  const isCompleted = task.status === "COMPLETED";

  const handleApprove = async () => {
    setIsSubmitting(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const updatedTask = await approveTaskViaBFF(task.id, {
        comments: comments.trim() || undefined,
      });
      setActionSuccess("Patch successfully approved by human supervisor.");
      onActionSuccess(updatedTask);
      setComments("");
    } catch (err: any) {
      setActionError(err.message || "Failed to submit approval.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!rejectFeedback.trim()) {
      setActionError("Human feedback explaining the rejection reason is mandatory.");
      return;
    }

    setIsSubmitting(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const updatedTask = await rejectTaskViaBFF(task.id, {
        feedback: rejectFeedback.trim(),
        return_to: "FIX_PROPOSED",
      });
      setActionSuccess("Patch rejected. Task returned to FIX_PROPOSED for agent re-attempt.");
      onActionSuccess(updatedTask);
      setRejectFeedback("");
      setShowRejectBox(false);
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
      const updatedTask = await completeTaskViaBFF(task.id);
      setActionSuccess("Task marked as completed and verified.");
      onActionSuccess(updatedTask);
    } catch (err: any) {
      setActionError(err.message || "Failed to complete task.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3.5 rounded-lg bg-oled-base border border-oled-border select-text">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider font-mono flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
          <span>Human Gate Actions</span>
        </span>
        <span className="text-[10px] font-mono text-zinc-500">Same-Origin Protected</span>
      </div>

      {/* Action Feedback Alerts */}
      {actionError && (
        <div className="p-2.5 rounded bg-rose-950/40 border border-rose-900/60 flex items-start gap-2 text-xs text-rose-300 animate-in fade-in">
          <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <span className="leading-snug">{actionError}</span>
        </div>
      )}

      {actionSuccess && (
        <div className="p-2.5 rounded bg-emerald-950/40 border border-emerald-900/60 flex items-start gap-2 text-xs text-emerald-300 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span className="leading-snug">{actionSuccess}</span>
        </div>
      )}

      {/* Non-spoofable Operator Badge (Replaces freeform text input) */}
      <div className="flex items-center justify-between text-xs py-1 px-2 rounded bg-oled-panel border border-oled-border">
        <span className="text-zinc-400 font-mono text-[11px]">Gate Operator:</span>
        <span className="font-mono text-[11px] text-zinc-300 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
          <span>Server Derived (Local Operator)</span>
        </span>
      </div>

      {/* 1. STATE: AWAITING_HUMAN_APPROVAL */}
      {isAwaitingApproval && (
        <div className="flex flex-col gap-2.5 pt-2 border-t border-oled-border">
          <div className="text-[11px] text-zinc-400 leading-relaxed">
            All automated tests passed. Review the patch diff and test logs before signing off.
          </div>

          {/* Optional Reviewer Comments for Approval */}
          {!showRejectBox && (
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-mono text-zinc-400">Review Notes (Optional)</label>
              <textarea
                rows={2}
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Reviewed reproduction logs and patch diff. Tests verify fix."
                className="bg-oled-panel border border-oled-border text-xs text-slate-200 placeholder-zinc-600 rounded p-2 focus:outline-none focus:border-blue-500 resize-none font-sans"
              />
            </div>
          )}

          {/* Main Action Buttons: Approve vs Reject */}
          {!showRejectBox ? (
            <div className="flex items-center gap-2">
              <Button
                variant="success"
                size="sm"
                className="flex-1 gap-1.5"
                isLoading={isSubmitting}
                onClick={handleApprove}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                <span>Approve Fix</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-zinc-400 hover:text-rose-300 hover:border-rose-900/60"
                disabled={isSubmitting}
                onClick={() => setShowRejectBox(true)}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reject...</span>
              </Button>
            </div>
          ) : (
            /* Reject Box (Mandatory Feedback) */
            <div className="p-2.5 rounded bg-rose-950/20 border border-rose-900/40 flex flex-col gap-2 animate-in fade-in">
              <div className="flex items-center justify-between text-xs text-rose-300 font-semibold font-mono">
                <span className="flex items-center gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
                  <span>Reject Fix with Feedback</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowRejectBox(false)}
                  className="text-[10px] text-zinc-400 hover:text-zinc-200 font-mono"
                >
                  Cancel
                </button>
              </div>

              <textarea
                rows={3}
                required
                value={rejectFeedback}
                onChange={(e) => setRejectFeedback(e.target.value)}
                placeholder="Explain why the patch is rejected (e.g. breaks backward compatibility with v1 API clients)..."
                className="bg-oled-base border border-rose-900/40 text-xs text-slate-200 placeholder-zinc-500 rounded p-2 focus:outline-none focus:border-rose-500 resize-none font-sans"
              />

              <Button
                variant="danger"
                size="sm"
                className="gap-1.5 w-full"
                isLoading={isSubmitting}
                onClick={handleReject}
              >
                <CornerDownLeft className="w-3.5 h-3.5" />
                <span>Submit Rejection to Agents</span>
              </Button>
            </div>
          )}
        </div>
      )}

      {/* 2. STATE: APPROVED (Awaiting completion) */}
      {isApproved && (
        <div className="flex flex-col gap-2.5 pt-2 border-t border-oled-border">
          <div className="text-[11px] text-emerald-300 leading-relaxed flex items-center gap-1.5">
            <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Fix approved by human reviewer. Ready for final release.</span>
          </div>

          <Button
            variant="primary"
            size="sm"
            className="w-full gap-1.5"
            isLoading={isSubmitting}
            onClick={handleComplete}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Mark Task Completed</span>
          </Button>
        </div>
      )}

      {/* 3. STATE: COMPLETED */}
      {isCompleted && (
        <div className="pt-2 border-t border-oled-border text-center text-xs text-emerald-400 flex items-center justify-center gap-1.5 py-1">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span className="font-medium">Lifecycle Completed</span>
        </div>
      )}

      {/* 4. OTHER INTERMEDIATE STATES */}
      {!isAwaitingApproval && !isApproved && !isCompleted && (
        <div className="pt-2 border-t border-oled-border flex items-center gap-2 text-zinc-500 text-[11px]">
          <Lock className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
          <span>Human gate controls activate once verification tests pass.</span>
        </div>
      )}
    </div>
  );
}

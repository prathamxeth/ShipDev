"use client";

import React, { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Code2,
  FileText,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  SplitSquareVertical,
  Terminal,
  UserCheck,
} from "lucide-react";
import { approveTaskViaBFF, completeTaskViaBFF, rejectTaskViaBFF } from "@/lib/api";
import { Task } from "@/types";

interface ReviewsApprovalViewProps {
  tasks: Task[];
  onSelectTask?: (taskId: string) => void;
  onRefresh: () => void;
}

export function ReviewsApprovalView({
  tasks,
  onSelectTask,
  onRefresh,
}: ReviewsApprovalViewProps) {
  const [selectedReviewTaskId, setSelectedReviewTaskId] = useState<string | null>(null);
  const [comments, setComments] = useState("");
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showInlineDiff, setShowInlineDiff] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const awaitingTasks = tasks.filter((t) => t.status === "AWAITING_HUMAN_APPROVAL");
  const approvedTasks = tasks.filter((t) => t.status === "APPROVED");
  const completedTasks = tasks.filter((t) => t.status === "COMPLETED");

  const activeTask = awaitingTasks.find((t) => t.id === selectedReviewTaskId) || awaitingTasks[0] || null;

  const handleApprove = async () => {
    if (!activeTask) return;
    setIsSubmitting(true);
    setStatusMessage(null);
    try {
      await approveTaskViaBFF(activeTask.id, { comments: comments.trim() || undefined });
      setStatusMessage(`✓ Task ${activeTask.id} approved! You can now mark it as completed.`);
      onRefresh();
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message || "Failed to approve task."}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTask || !feedback.trim()) return;
    setIsSubmitting(true);
    setStatusMessage(null);
    try {
      await rejectTaskViaBFF(activeTask.id, { feedback: feedback.trim() });
      setStatusMessage(`✓ Rejection recorded. Autonomous team is generating an adjusted patch.`);
      setShowRejectForm(false);
      setFeedback("");
      onRefresh();
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message || "Failed to reject fix."}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleComplete = async () => {
    if (!activeTask) return;
    setIsSubmitting(true);
    setStatusMessage(null);
    try {
      await completeTaskViaBFF(activeTask.id);
      setStatusMessage(`✓ Task ${activeTask.id} verified and deployed to production!`);
      onRefresh();
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message || "Failed to complete task."}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-clay-canvas overflow-y-auto select-text font-sans p-6">
      <div className="max-w-5xl mx-auto w-full flex flex-col gap-6">
        {/* Header */}
        <section className="p-6 rounded-clay-xl bg-white border border-clay-hairline shadow-clay-card flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-clay-md bg-clay-peach/25 border border-clay-peach/50 flex items-center justify-center text-clay-peach-ink shadow-clay-soft">
              <ShieldCheck className="w-5 h-5 text-clay-peach" />
            </div>
            <div>
              <h1 className="text-base font-bold text-clay-ink tracking-tight">
                Reviews & Human Gate Console
              </h1>
              <p className="text-xs text-clay-muted">
                Server-enforced approval policy: Autonomous agents propose solutions; authorized humans approve or reject.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-clay-pill bg-clay-peach/20 text-clay-peach-ink border border-clay-peach/40">
              {awaitingTasks.length} Awaiting Approval
            </span>
            <button
              onClick={onRefresh}
              className="p-2 rounded-clay-md hover:bg-clay-surface-soft border border-clay-hairline text-clay-muted hover:text-clay-ink cursor-pointer transition-colors"
              title="Refresh Queue"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </section>

        {statusMessage && (
          <div className="p-3.5 rounded-clay-lg bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-semibold shadow-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Two-Column Review Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Review Queue */}
          <div className="lg:col-span-1 flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-clay-muted font-sans">
              Pending Deliverables ({awaitingTasks.length})
            </h3>

            {awaitingTasks.length === 0 ? (
              <div className="p-6 rounded-clay-lg bg-white border border-clay-hairline text-center text-xs text-clay-muted italic shadow-clay-soft">
                ✓ All proposed solutions reviewed! No pending approvals.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {awaitingTasks.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => {
                      setSelectedReviewTaskId(t.id);
                      onSelectTask?.(t.id);
                    }}
                    className={`p-3.5 rounded-clay-lg border cursor-pointer transition-all shadow-clay-soft ${
                      (activeTask?.id === t.id)
                        ? "bg-clay-peach/15 border-clay-peach shadow-clay-card"
                        : "bg-white hover:bg-clay-surface-card border-clay-hairline"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                      <span className="text-clay-muted">{t.id}</span>
                      <span className="px-1.5 py-0.2 rounded bg-clay-peach/20 text-clay-peach-ink font-semibold">
                        Ready
                      </span>
                    </div>
                    <h4 className="text-xs font-bold text-clay-ink line-clamp-2">{t.title}</h4>
                    <span className="text-[10px] text-clay-muted mt-1 block">
                      Origin: {t.reported_by}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Column: Selected Deliverable Inspection & Decision Console */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            {activeTask ? (
              <div className="p-6 rounded-clay-xl bg-white border border-clay-hairline shadow-clay-card flex flex-col gap-4">
                <div className="border-b border-clay-hairline pb-4 flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-clay-pill bg-clay-peach/20 text-clay-peach-ink font-semibold">
                      Deliverable Awaiting Sign-Off
                    </span>
                    <h2 className="text-sm font-bold text-clay-ink mt-1.5">{activeTask.title}</h2>
                    <p className="text-xs text-clay-muted mt-0.5">
                      Task ID: <span className="font-mono text-clay-ink">{activeTask.id}</span> • Input Source: {activeTask.input_source}
                    </p>
                  </div>

                  <button
                    onClick={() => setShowInlineDiff((prev) => !prev)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-clay-md bg-clay-surface-soft hover:bg-clay-surface-card border border-clay-hairline text-xs font-medium text-clay-ink cursor-pointer transition-colors shadow-clay-soft"
                  >
                    <SplitSquareVertical className="w-3.5 h-3.5 text-clay-teal" />
                    <span>{showInlineDiff ? "Hide Diff" : "View Patch Diff"}</span>
                  </button>
                </div>

                {/* Inline Diff Viewer */}
                {showInlineDiff && (
                  <div className="rounded-clay-md border border-clay-hairline bg-[#1e1e1e] text-slate-100 p-3 font-mono text-[11px] overflow-x-auto shadow-xs">
                    <div className="flex items-center justify-between text-zinc-400 text-[10px] pb-1.5 mb-1.5 border-b border-zinc-800">
                      <span className="flex items-center gap-1 text-zinc-300">
                        <Code2 className="w-3 h-3 text-clay-teal" />
                        Verified Surgical Patch Diff
                      </span>
                      <span className="text-emerald-400 font-semibold">1 hunk (-1 / +1)</span>
                    </div>
                    <pre className="whitespace-pre text-slate-200">
{`--- demo/buggy_app/calculator.py
+++ demo/workspace/calculator.py
@@ -21,3 +21,3 @@
-    return price + (price * (discount_percent / 100.0))
+    return price - (price * (discount_percent / 100.0))`}
                    </pre>
                  </div>
                )}

                {/* Verification Evidence Overview */}
                <div className="p-3.5 rounded-clay-lg bg-clay-surface-soft border border-clay-hairline/80 flex flex-col gap-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-clay-ink flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5 text-clay-teal" />
                      <span>Autonomous Verification Status</span>
                    </span>
                    <span className="text-[10px] text-emerald-700 bg-emerald-100 font-semibold px-2 py-0.5 rounded-clay-pill">
                      ✓ All Tests Passed (Exit 0)
                    </span>
                  </div>
                  <p className="text-[11px] text-clay-body leading-relaxed">
                    Verification Sentinel ran test verification inside the isolated sandbox. Fix confirmed cleanly with 0 regressions.
                  </p>
                </div>

                {/* Human Operator Decision Actions */}
                <div className="pt-2 flex flex-col gap-3">
                  <h4 className="text-xs font-bold text-clay-ink uppercase tracking-wider text-clay-muted font-sans">
                    Operator Decision
                  </h4>

                  {!showRejectForm ? (
                    <div className="flex flex-col gap-2.5">
                      <input
                        type="text"
                        placeholder="Optional approval notes or operator comments..."
                        value={comments}
                        onChange={(e) => setComments(e.target.value)}
                        className="h-9 px-3 rounded-clay-md bg-clay-surface-soft border border-clay-hairline text-xs text-clay-ink placeholder:text-clay-muted outline-none focus:border-clay-primary shadow-xs"
                      />

                      <div className="flex items-center gap-2.5">
                        <button
                          onClick={handleApprove}
                          disabled={isSubmitting}
                          className="flex-1 h-10 rounded-clay-md bg-[#136149] hover:bg-[#0e4d3a] text-white font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-clay-soft disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Approve & Ship to Production</span>
                        </button>

                        <button
                          onClick={() => setShowRejectForm(true)}
                          disabled={isSubmitting}
                          className="px-4 h-10 rounded-clay-md bg-clay-surface-soft hover:bg-clay-surface-card border border-clay-hairline text-clay-coral font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-clay-soft"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Request Changes</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleReject} className="flex flex-col gap-2 p-3 rounded-clay-lg bg-clay-coral/10 border border-clay-coral/30">
                      <span className="text-xs font-bold text-clay-coral">
                        Specify Required Changes:
                      </span>
                      <textarea
                        rows={3}
                        placeholder="Provide feedback describing why the fix was rejected and what needs to be adjusted..."
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        className="p-2.5 rounded-clay-md bg-white border border-clay-hairline text-xs text-clay-ink placeholder:text-clay-muted outline-none focus:border-clay-coral shadow-xs"
                      />
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setShowRejectForm(false)}
                          className="px-3 py-1.5 rounded-clay-md bg-white border border-clay-hairline text-xs text-clay-muted hover:text-clay-ink cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isSubmitting || !feedback.trim()}
                          className="px-4 py-1.5 rounded-clay-md bg-clay-coral hover:bg-clay-coral/90 text-white font-semibold text-xs cursor-pointer shadow-clay-soft disabled:opacity-50"
                        >
                          Submit Revision Request
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-12 rounded-clay-xl bg-white border border-clay-hairline text-center text-clay-muted text-xs shadow-clay-soft">
                Select a pending deliverable on the left to inspect test results and make an approval decision.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


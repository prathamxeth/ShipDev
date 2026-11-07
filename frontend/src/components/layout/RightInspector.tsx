"use client";

import React from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileCheck2,
  GitBranch,
  Info,
  Lock,
  RotateCcw,
  ShieldCheck,
  UserCheck,
  XCircle,
} from "lucide-react";
import { ApprovalRecord, Evidence, Task } from "@/types";
import { StatusPill } from "@/components/ui/StatusPill";
import { Skeleton } from "@/components/ui/Skeleton";
import { HumanGateConsole } from "@/components/approval/HumanGateConsole";

interface RightInspectorProps {
  task: Task | null;
  evidenceList: Evidence[];
  approvals: ApprovalRecord[];
  isLoading: boolean;
  onTaskUpdated?: (updatedTask: Task) => void;
}

export function RightInspector({
  task,
  evidenceList,
  approvals,
  isLoading,
  onTaskUpdated,
}: RightInspectorProps) {
  if (isLoading) {
    return (
      <aside className="w-80 lg:w-88 border-l border-oled-border bg-oled-panel p-4 flex flex-col gap-4 shrink-0">
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-32 w-full" />
      </aside>
    );
  }

  if (!task) {
    return (
      <aside className="w-80 lg:w-88 border-l border-oled-border bg-oled-panel p-6 flex flex-col items-center justify-center text-center text-zinc-500 shrink-0 select-none">
        <Info className="w-6 h-6 mb-2 text-zinc-600" />
        <span className="text-xs">Select a task to inspect verification evidence</span>
      </aside>
    );
  }

  // Evidence verification checklist items
  const reproEvidence = evidenceList.find((e) => e.stage === "reproduction");
  const verifyEvidence = evidenceList.find((e) => e.stage === "verification");

  const hasReproRun = Boolean(reproEvidence);
  const reproConfirmedFailure = reproEvidence ? reproEvidence.exit_code !== 0 : false;

  const hasVerifyRun = Boolean(verifyEvidence);
  const verifyTestsPassed = verifyEvidence ? verifyEvidence.exit_code === 0 : false;
  const hasPatchDiff = verifyEvidence
    ? Boolean(verifyEvidence.patch_diff && verifyEvidence.patch_diff.trim().length > 0)
    : false;
  const isAuthenticNonMock = verifyEvidence ? !verifyEvidence.is_mock : false;

  const isAwaitingHuman = task.status === "AWAITING_HUMAN_APPROVAL";
  const isApproved = task.status === "APPROVED";
  const isCompleted = task.status === "COMPLETED";

  return (
    <aside className="w-80 lg:w-88 border-l border-oled-border bg-oled-panel flex flex-col shrink-0 select-text overflow-y-auto h-full">
      {/* Top Header */}
      <div className="p-3 border-b border-oled-border flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
          <span>Inspector & Gate</span>
        </span>
        <StatusPill status={task.status} size="sm" />
      </div>

      <div className="p-3 flex flex-col gap-4">
        {/* Human Gate Status Banner */}
        <div
          className={`p-3 rounded-lg border flex flex-col gap-2 ${
            isAwaitingHuman
              ? "bg-amber-950/40 border-amber-500/40 text-amber-300"
              : isApproved
              ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
              : isCompleted
              ? "bg-blue-950/40 border-blue-500/40 text-blue-300"
              : "bg-oled-base border-oled-border text-zinc-400"
          }`}
        >
          <div className="flex items-center gap-2 font-semibold text-xs">
            {isAwaitingHuman ? (
              <>
                <Lock className="w-4 h-4 text-amber-400" />
                <span className="text-amber-200">Human Approval Gate Pending</span>
              </>
            ) : isApproved ? (
              <>
                <UserCheck className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-200">Human Sign-off Granted</span>
              </>
            ) : isCompleted ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-blue-400" />
                <span className="text-blue-200">Task Completed & Deployed</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-4 h-4 text-zinc-500" />
                <span className="text-zinc-300">Agents Executing Pipeline</span>
              </>
            )}
          </div>

          <p className="text-[11px] leading-relaxed text-zinc-400">
            {isAwaitingHuman
              ? "Verification tests passed. AI agents cannot complete tasks autonomously. Requires explicit human sign-off."
              : isApproved
              ? "Changes approved by human reviewer. Ready for final deployment."
              : isCompleted
              ? "Task verified and completed."
              : "Autonomous agents are diagnosing and testing. Human gate will activate upon verification."}
          </p>

          <div className="pt-2 border-t border-zinc-800/60 flex items-center gap-1 text-[10px] text-zinc-500 font-mono">
            <Lock className="w-3 h-3 text-zinc-600" />
            <span>Secure Gate: Brokered via Next.js BFF</span>
          </div>
        </div>

        {/* Interactive Human Gate Action Console */}
        <HumanGateConsole
          task={task}
          onActionSuccess={(updatedTask) => {
            if (onTaskUpdated) {
              onTaskUpdated(updatedTask);
            }
          }}
        />

        {/* Verification Evidence Checklist */}
        <div className="flex flex-col gap-2">
          <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider font-mono">
            Evidence Verification Checklist
          </div>

          <div className="p-3 rounded bg-oled-base border border-oled-border flex flex-col gap-2 text-xs">
            {/* 1. Repro Command */}
            <div className="flex items-center justify-between">
              <span className="text-zinc-300 flex items-center gap-1.5">
                {hasReproRun ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-zinc-600" />
                )}
                <span>Reproduction Run</span>
              </span>
              <span className="font-mono text-[11px] text-zinc-500">
                {hasReproRun ? "Executed" : "Pending"}
              </span>
            </div>

            {/* 2. Failure Confirmed */}
            <div className="flex items-center justify-between">
              <span className="text-zinc-300 flex items-center gap-1.5">
                {reproConfirmedFailure ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-zinc-600" />
                )}
                <span>Bug Reproduced (Exit ≠ 0)</span>
              </span>
              <span className="font-mono text-[11px] text-zinc-500">
                {reproEvidence ? `exit ${reproEvidence.exit_code}` : "—"}
              </span>
            </div>

            {/* 3. Patch Diff Generated */}
            <div className="flex items-center justify-between">
              <span className="text-zinc-300 flex items-center gap-1.5">
                {hasPatchDiff ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-zinc-600" />
                )}
                <span>Patch Diff Attached</span>
              </span>
              <span className="font-mono text-[11px] text-zinc-500">
                {hasPatchDiff ? "Attached" : "Missing"}
              </span>
            </div>

            {/* 4. Verification Test Pass */}
            <div className="flex items-center justify-between">
              <span className="text-zinc-300 flex items-center gap-1.5">
                {verifyTestsPassed ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-zinc-600" />
                )}
                <span>Tests Passed (Exit = 0)</span>
              </span>
              <span className="font-mono text-[11px] text-zinc-500">
                {verifyEvidence ? `exit ${verifyEvidence.exit_code}` : "—"}
              </span>
            </div>

            {/* 5. Non-Mock Authenticity Check */}
            <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60">
              <span className="text-zinc-300 flex items-center gap-1.5">
                {isAuthenticNonMock ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-zinc-600" />
                )}
                <span>Cryptographic Authenticity</span>
              </span>
              <span
                className={`font-mono text-[10px] px-1.5 py-0.2 rounded ${
                  isAuthenticNonMock
                    ? "bg-emerald-950/60 text-emerald-400"
                    : "bg-zinc-800 text-zinc-500"
                }`}
              >
                {verifyEvidence
                  ? verifyEvidence.is_mock
                    ? "MOCK"
                    : "AUTHENTIC"
                  : "UNTESTED"}
              </span>
            </div>
          </div>
        </div>

        {/* Previous Approvals / Rejections History */}
        {approvals && approvals.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider font-mono">
              Review Records ({approvals.length})
            </div>

            <div className="flex flex-col gap-1.5">
              {approvals.map((appr, idx) => {
                const isAppr = appr.decision === "approved";
                return (
                  <div
                    key={appr.id || idx}
                    className="p-2.5 rounded bg-oled-base border border-oled-border flex flex-col gap-1 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`font-mono text-[11px] font-semibold ${
                          isAppr ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {isAppr ? "Approved" : "Rejected"}
                      </span>
                      <span className="font-mono text-[10px] text-zinc-500">
                        reviewer: {appr.reviewer_id}
                      </span>
                    </div>
                    {appr.feedback && (
                      <p className="text-zinc-300 text-[11px]">{appr.feedback}</p>
                    )}
                    <span className="text-[9px] font-mono text-zinc-600">
                      {new Date(appr.decided_at).toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Task Metadata Details */}
        <div className="flex flex-col gap-2">
          <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider font-mono">
            Task Metadata
          </div>

          <div className="p-3 rounded bg-oled-base border border-oled-border flex flex-col gap-2 font-mono text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Task ID</span>
              <span className="text-zinc-300">{task.id}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Input Source</span>
              <span className="text-zinc-300">{task.input_source}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Reported By</span>
              <span className="text-zinc-300">{task.reported_by}</span>
            </div>
            {task.branch_name && (
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Target Branch</span>
                <span className="text-blue-400">{task.branch_name}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Created At</span>
              <span className="text-zinc-400">
                {new Date(task.created_at).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

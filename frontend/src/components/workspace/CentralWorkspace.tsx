"use client";

import React, { useState } from "react";
import {
  AlertCircle,
  Clock,
  Code2,
  FileText,
  GitBranch,
  History,
  MessageSquare,
  Mic,
  Terminal,
  User,
} from "lucide-react";
import { Evidence, Task, TransitionHistory } from "@/types";
import { StatusPill } from "@/components/ui/StatusPill";
import { LifecycleStepper } from "@/components/workspace/LifecycleStepper";
import { DiffViewer } from "@/components/workspace/DiffViewer";
import { TerminalLogs } from "@/components/workspace/TerminalLogs";
import { SwitchWarRoom } from "@/components/workspace/SwitchWarRoom";
import { AuditTimeline } from "@/components/workspace/AuditTimeline";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";

interface CentralWorkspaceProps {
  task: Task | null;
  evidenceList: Evidence[];
  history: TransitionHistory[];
  isLoading: boolean;
}

type WorkspaceTab = "diff" | "logs" | "switch" | "timeline";

export function CentralWorkspace({
  task,
  evidenceList,
  history,
  isLoading,
}: CentralWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("diff");

  if (isLoading) {
    return (
      <main className="flex-1 flex flex-col bg-oled-base overflow-hidden p-6 gap-4">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-4 w-1/4" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="flex-1 w-full" />
      </main>
    );
  }

  if (!task) {
    return (
      <main className="flex-1 flex items-center justify-center bg-oled-base p-6">
        <EmptyState
          icon={<FileText className="w-10 h-10 text-zinc-600" />}
          title="No Task Selected"
          description="Select an engineering bug report from the left queue to view agent reproduction evidence, patch diffs, and verification logs."
        />
      </main>
    );
  }

  // Find latest patch diff from evidence if present
  const latestPatchEvidence = [...evidenceList]
    .reverse()
    .find((e) => e.patch_diff && e.patch_diff.trim().length > 0);

  const patchDiff = latestPatchEvidence?.patch_diff || null;

  return (
    <main className="flex-1 flex flex-col bg-oled-base overflow-hidden border-r border-oled-border">
      {/* Task Top Header */}
      <div className="p-4 border-b border-oled-border bg-oled-panel flex flex-col gap-2 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <StatusPill status={task.status} size="md" />
            <span className="text-xs font-mono text-zinc-500">ID: {task.id}</span>
          </div>

          <div className="flex items-center gap-3 text-xs text-zinc-400">
            {task.input_source === "wispr_flow" && (
              <span className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/60">
                <Mic className="w-3 h-3 text-purple-400" />
                <span>Voice Report</span>
              </span>
            )}

            <div className="flex items-center gap-1 font-mono text-[11px] text-zinc-400">
              <User className="w-3 h-3 text-zinc-500" />
              <span>{task.reported_by}</span>
            </div>

            <div className="flex items-center gap-1 font-mono text-[11px] text-zinc-500">
              <Clock className="w-3 h-3" />
              <span>{new Date(task.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        <h1 className="text-base font-semibold text-slate-100 tracking-tight">
          {task.title}
        </h1>

        <p className="text-xs text-zinc-400 leading-relaxed max-w-4xl line-clamp-2">
          {task.description}
        </p>
      </div>

      {/* 14-State Lifecycle Stepper */}
      <LifecycleStepper currentStatus={task.status} />

      {/* Workspace Navigation Tabs */}
      <div className="h-10 px-3 bg-oled-panel border-b border-oled-border flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab("diff")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeTab === "diff"
                ? "bg-zinc-800 text-slate-100 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Patch Diff</span>
            {patchDiff && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 ml-0.5" />
            )}
          </button>

          <button
            onClick={() => setActiveTab("logs")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeTab === "logs"
                ? "bg-zinc-800 text-slate-100 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Sandbox Execution</span>
            {evidenceList.length > 0 && (
              <span className="text-[10px] font-mono px-1 rounded bg-zinc-700 text-zinc-300">
                {evidenceList.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("switch")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeTab === "switch"
                ? "bg-purple-950/70 text-purple-200 border border-purple-800/60 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 text-purple-400" />
            <span>Switch Collaboration</span>
          </button>

          <button
            onClick={() => setActiveTab("timeline")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeTab === "timeline"
                ? "bg-zinc-800 text-slate-100 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Audit Log</span>
            {history.length > 0 && (
              <span className="text-[10px] font-mono px-1 rounded bg-zinc-700 text-zinc-300">
                {history.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Primary Tab Content Panel */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab === "diff" && (
          <DiffViewer
            patchDiff={patchDiff}
            stageName={latestPatchEvidence?.stage || "Proposed Patch"}
          />
        )}
        {activeTab === "logs" && <TerminalLogs evidenceList={evidenceList} />}
        {activeTab === "switch" && <SwitchWarRoom taskId={task.id} />}
        {activeTab === "timeline" && <AuditTimeline history={history} />}
      </div>
    </main>
  );
}


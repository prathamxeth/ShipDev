"use client";

import React, { useState } from "react";
import {
  AlertTriangle,
  Clock,
  Filter,
  Mic,
  RefreshCw,
  Search,
} from "lucide-react";
import { Task, TaskStatus } from "@/types";
import { StatusPill } from "@/components/ui/StatusPill";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";

interface LeftSidebarProps {
  tasks: Task[];
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
}

type FilterCategory = "all" | "active" | "awaiting" | "closed";

export function LeftSidebar({
  tasks,
  selectedTaskId,
  onSelectTask,
  isLoading,
  error,
  onRetry,
}: LeftSidebarProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterCategory>("all");

  const filteredTasks = tasks.filter((t) => {
    // Search filter
    const matchesSearch =
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.id.toLowerCase().includes(search.toLowerCase()) ||
      t.reported_by.toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;

    // Category filter
    if (filter === "awaiting") {
      return t.status === "AWAITING_HUMAN_APPROVAL";
    }
    if (filter === "active") {
      return [
        "REPORTED",
        "TRIAGED",
        "REPRODUCING",
        "REPRODUCED",
        "FIX_PROPOSED",
        "VERIFYING",
      ].includes(t.status);
    }
    if (filter === "closed") {
      return ["APPROVED", "COMPLETED", "TRIAGE_FAILED", "REPRODUCTION_FAILED", "VERIFICATION_FAILED", "REJECTED", "FAILED"].includes(
        t.status
      );
    }
    return true;
  });

  const awaitingCount = tasks.filter((t) => t.status === "AWAITING_HUMAN_APPROVAL").length;

  return (
    <aside className="w-80 lg:w-88 border-r border-oled-border bg-oled-panel flex flex-col shrink-0 select-none h-full overflow-hidden">
      {/* Top Filter and Search section */}
      <div className="p-3 border-b border-oled-border flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <span>Engineering Queue</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 bg-zinc-900 text-zinc-400 rounded-full border border-zinc-800">
              {tasks.length}
            </span>
          </span>

          {awaitingCount > 0 && (
            <span className="text-[10px] font-mono px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded-full border border-amber-500/40 animate-pulse">
              {awaitingCount} Awaiting Gate
            </span>
          )}
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter queue by title, ID..."
            className="w-full bg-oled-base border border-oled-border text-xs text-slate-200 placeholder-zinc-500 rounded pl-8 pr-2.5 py-1.5 focus:outline-none focus:border-zinc-700 transition-colors"
          />
        </div>

        {/* Filter categories tabs */}
        <div className="flex items-center gap-1 p-0.5 bg-oled-base border border-oled-border rounded text-[11px]">
          <button
            onClick={() => setFilter("all")}
            className={`flex-1 py-1 rounded text-center font-medium transition-colors ${
              filter === "all" ? "bg-zinc-800 text-slate-100" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter("active")}
            className={`flex-1 py-1 rounded text-center font-medium transition-colors ${
              filter === "active" ? "bg-zinc-800 text-slate-100" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Active
          </button>
          <button
            onClick={() => setFilter("awaiting")}
            className={`flex-1 py-1 rounded text-center font-medium transition-colors ${
              filter === "awaiting" ? "bg-amber-950/60 text-amber-300 border border-amber-800/40" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Review
          </button>
          <button
            onClick={() => setFilter("closed")}
            className={`flex-1 py-1 rounded text-center font-medium transition-colors ${
              filter === "closed" ? "bg-zinc-800 text-slate-100" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Closed
          </button>
        </div>
      </div>

      {/* Task List container */}
      <div className="flex-1 overflow-y-auto divide-y divide-oled-border-subtle p-1">
        {/* Loading state */}
        {isLoading && (
          <div className="flex flex-col gap-2 p-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="p-3 bg-oled-base/40 rounded border border-oled-border flex flex-col gap-2">
                <Skeleton className="h-4 w-3/4" />
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-4 w-20" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error / Offline state */}
        {!isLoading && error && (
          <div className="p-4 m-2 rounded bg-rose-950/30 border border-rose-900/40 text-center flex flex-col items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-400" />
            <div className="text-xs font-medium text-rose-300">Backend Disconnected</div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Unable to reach FastAPI at <code className="text-zinc-300 font-mono">http://localhost:8000</code>.
            </p>
            <Button variant="secondary" size="xs" onClick={onRetry} className="gap-1.5 mt-1">
              <RefreshCw className="w-3 h-3" />
              <span>Retry Connection</span>
            </Button>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && filteredTasks.length === 0 && (
          <div className="p-6 text-center text-zinc-500 flex flex-col items-center gap-2">
            <Filter className="w-6 h-6 text-zinc-600" />
            <p className="text-xs">No tasks match current filter</p>
          </div>
        )}

        {/* Task Cards */}
        {!isLoading &&
          !error &&
          filteredTasks.map((task) => {
            const isSelected = task.id === selectedTaskId;
            const isWispr = task.input_source === "wispr_flow";

            return (
              <button
                key={task.id}
                onClick={() => onSelectTask(task.id)}
                className={`w-full text-left p-3 rounded transition-all flex flex-col gap-2 my-0.5 border ${
                  isSelected
                    ? "bg-oled-elevated border-blue-500/40 shadow-sm ring-1 ring-blue-500/20"
                    : "bg-oled-base hover:bg-oled-hover border-oled-border"
                }`}
              >
                {/* Task Title & Wispr Indicator */}
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-xs font-medium text-slate-200 line-clamp-2 leading-snug">
                    {task.title}
                  </h4>
                  {isWispr && (
                    <span
                      title="Submitted via Wispr Flow voice transcription"
                      className="shrink-0 flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/60"
                    >
                      <Mic className="w-2.5 h-2.5 text-purple-400" />
                      <span>Wispr</span>
                    </span>
                  )}
                </div>

                {/* Status Pill & Metadata footer */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-oled-border/60">
                  <StatusPill status={task.status} size="sm" />
                  <div className="flex items-center gap-1 text-[10px] font-mono text-zinc-500">
                    <Clock className="w-2.5 h-2.5" />
                    <span>{task.id.slice(0, 8)}</span>
                  </div>
                </div>
              </button>
            );
          })}
      </div>
    </aside>
  );
}


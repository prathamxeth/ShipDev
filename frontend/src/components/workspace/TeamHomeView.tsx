"use client";

import React from "react";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Code2,
  FileCheck,
  MessageSquare,
  Plus,
  ShieldCheck,
  Users,
  Zap,
} from "lucide-react";
import { Task } from "@/types";

interface TeamHomeViewProps {
  tasks: Task[];
  onOpenReviews: () => void;
  onOpenStudio: () => void;
  onOpenRooms: () => void;
  onSelectTask: (taskId: string) => void;
  onNewTaskClick: () => void;
}

export function TeamHomeView({
  tasks,
  onOpenReviews,
  onOpenStudio,
  onOpenRooms,
  onSelectTask,
  onNewTaskClick,
}: TeamHomeViewProps) {
  const awaitingReviews = tasks.filter((t) => t.status === "AWAITING_HUMAN_APPROVAL");
  const inProgressTasks = tasks.filter(
    (t) => t.status !== "COMPLETED" && t.status !== "FAILED" && t.status !== "AWAITING_HUMAN_APPROVAL"
  );
  const completedTasks = tasks.filter((t) => t.status === "COMPLETED" || t.status === "APPROVED");

  return (
    <div className="flex-1 flex flex-col h-full bg-clay-canvas overflow-y-auto select-text font-sans p-6">
      <div className="max-w-5xl mx-auto w-full flex flex-col gap-6">
        {/* 1. Team Header */}
        <section className="p-6 rounded-clay-xl bg-white border border-clay-hairline shadow-clay-card flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-clay-md bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700 shadow-clay-soft">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-base font-bold text-clay-ink tracking-tight">
                  Team Workspace — Engineering & Product
                </h1>
                <p className="text-xs text-clay-muted">
                  Organization-wide collaboration, Slack/Teams bots, shared policies, and human approval gates
                </p>
              </div>
            </div>

            <button
              onClick={onNewTaskClick}
              className="h-9 px-3.5 rounded-clay-md bg-clay-primary hover:bg-clay-primary-active text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shadow-clay-soft"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Team Task</span>
            </button>
          </div>

          {/* Operational Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="p-3 rounded-clay-md bg-clay-surface-soft border border-clay-hairline flex flex-col">
              <span className="text-[10px] uppercase font-mono text-clay-muted">In Progress</span>
              <span className="text-base font-bold text-clay-ink">{inProgressTasks.length}</span>
            </div>
            <div className="p-3 rounded-clay-md bg-clay-surface-soft border border-clay-hairline flex flex-col">
              <span className="text-[10px] uppercase font-mono text-clay-muted">Pending Review</span>
              <span className="text-base font-bold text-clay-peach-ink">{awaitingReviews.length}</span>
            </div>
            <div className="p-3 rounded-clay-md bg-clay-surface-soft border border-clay-hairline flex flex-col">
              <span className="text-[10px] uppercase font-mono text-clay-muted">Verified & Shipped</span>
              <span className="text-base font-bold text-[#136149]">{completedTasks.length}</span>
            </div>
            <div className="p-3 rounded-clay-md bg-clay-surface-soft border border-clay-hairline flex flex-col">
              <span className="text-[10px] uppercase font-mono text-clay-muted">Connected Apps</span>
              <span className="text-base font-bold text-clay-teal">Slack & Teams</span>
            </div>
          </div>
        </section>

        {/* 2. Urgent: Human Review Banner if Pending */}
        {awaitingReviews.length > 0 && (
          <section className="p-4 rounded-clay-xl bg-clay-peach/25 border border-clay-peach/50 shadow-clay-soft flex items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-clay-peach shrink-0" />
              <div>
                <h3 className="font-bold text-clay-ink text-xs">
                  {awaitingReviews.length} Proposed Solution(s) Awaiting Human Sign-Off
                </h3>
                <p className="text-[11px] text-clay-body mt-0.5">
                  Autonomous agents have generated candidate code fixes and verified test results. A human operator approval is strictly required before shipping.
                </p>
              </div>
            </div>

            <button
              onClick={onOpenReviews}
              className="px-3.5 py-1.5 rounded-clay-md bg-clay-primary hover:bg-clay-primary-active text-white font-semibold text-xs shrink-0 cursor-pointer transition-colors shadow-clay-soft flex items-center gap-1.5"
            >
              <span>Inspect & Approve</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </section>
        )}

        {/* 3. Team Navigation Cards */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div
            onClick={onOpenReviews}
            className="p-4 rounded-clay-lg bg-white hover:bg-clay-surface-card border border-clay-hairline hover:border-clay-peach cursor-pointer transition-all shadow-clay-soft flex flex-col justify-between gap-3 group"
          >
            <div className="flex items-start justify-between">
              <div className="w-8 h-8 rounded-clay-md bg-clay-peach/25 text-clay-peach-ink flex items-center justify-center">
                <FileCheck className="w-4 h-4" />
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-clay-muted group-hover:text-clay-peach group-hover:translate-x-0.5 transition-all" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-clay-ink group-hover:text-clay-peach transition-colors">
                Reviews & Human Gate
              </h3>
              <p className="text-[11px] text-clay-muted mt-1 leading-relaxed">
                Server-enforced approval console for candidate deliverables and verified patches.
              </p>
            </div>
          </div>

          <div
            onClick={onOpenRooms}
            className="p-4 rounded-clay-lg bg-white hover:bg-clay-surface-card border border-clay-hairline hover:border-clay-lavender cursor-pointer transition-all shadow-clay-soft flex flex-col justify-between gap-3 group"
          >
            <div className="flex items-start justify-between">
              <div className="w-8 h-8 rounded-clay-md bg-clay-lavender/25 text-clay-lavender-ink flex items-center justify-center">
                <MessageSquare className="w-4 h-4" />
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-clay-muted group-hover:text-clay-lavender-ink group-hover:translate-x-0.5 transition-all" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-clay-ink group-hover:text-clay-lavender-ink transition-colors">
                Rooms & Slack Channels
              </h3>
              <p className="text-[11px] text-clay-muted mt-1 leading-relaxed">
                Collaborative team discussion rooms and synced external chat threads.
              </p>
            </div>
          </div>

          <div
            onClick={onOpenStudio}
            className="p-4 rounded-clay-lg bg-white hover:bg-clay-surface-card border border-clay-hairline hover:border-clay-primary cursor-pointer transition-all shadow-clay-soft flex flex-col justify-between gap-3 group"
          >
            <div className="flex items-start justify-between">
              <div className="w-8 h-8 rounded-clay-md bg-clay-primary/15 text-clay-primary flex items-center justify-center">
                <Code2 className="w-4 h-4" />
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-clay-muted group-hover:text-clay-primary group-hover:translate-x-0.5 transition-all" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-clay-ink group-hover:text-clay-primary transition-colors">
                Engineering Studio
              </h3>
              <p className="text-[11px] text-clay-muted mt-1 leading-relaxed">
                Full-featured IDE with Monaco editor, BugGraphCanvas, diff viewer, and sandbox.
              </p>
            </div>
          </div>
        </section>

        {/* 4. Active Team Tasks List */}
        <section className="p-5 rounded-clay-xl bg-white border border-clay-hairline shadow-clay-soft flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-clay-muted font-sans">
              Active Organization Queue
            </h2>
            <span className="text-xs text-clay-muted">
              {tasks.length} total tasks
            </span>
          </div>

          {tasks.length === 0 ? (
            <p className="text-xs text-clay-muted italic py-3 text-center">
              No tasks currently running in Team Workspace. Mention @ShipDev in Slack or MS Teams to dispatch an automated task.
            </p>
          ) : (
            <div className="divide-y divide-clay-hairline">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => onSelectTask(task.id)}
                  className="py-3 flex items-center justify-between text-xs hover:bg-clay-surface-soft px-2 rounded-clay-md cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        task.status === "AWAITING_HUMAN_APPROVAL"
                          ? "bg-amber-400 animate-pulse"
                          : task.status === "COMPLETED" || task.status === "APPROVED"
                          ? "bg-emerald-500"
                          : "bg-indigo-500"
                      }`}
                    />
                    <div>
                      <h4 className="font-semibold text-clay-ink">{task.title}</h4>
                      <p className="text-[10px] text-clay-muted">
                        ID: {task.id} • Origin: {task.reported_by}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-clay-pill bg-clay-surface-card border border-clay-hairline text-clay-body font-semibold">
                      {task.status.replace(/_/g, " ")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}


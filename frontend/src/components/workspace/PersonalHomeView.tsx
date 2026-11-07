"use client";

import React, { useState } from "react";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock,
  Code2,
  FileText,
  Lock,
  MessageSquare,
  Plus,
  Send,
  Sparkles,
  Zap,
} from "lucide-react";
import { Task } from "@/types";

interface PersonalHomeViewProps {
  tasks: Task[];
  onOpenAssistant: () => void;
  onOpenStudio: () => void;
  onOpenTasks: () => void;
  onSelectTask: (taskId: string) => void;
  onNewTaskClick: () => void;
}

export function PersonalHomeView({
  tasks,
  onOpenAssistant,
  onOpenStudio,
  onOpenTasks,
  onSelectTask,
  onNewTaskClick,
}: PersonalHomeViewProps) {
  const [quickInput, setQuickInput] = useState("");

  const activeTasks = tasks.filter((t) => t.status !== "COMPLETED" && t.status !== "FAILED");
  const completedTasks = tasks.filter((t) => t.status === "COMPLETED" || t.status === "APPROVED");

  return (
    <div className="flex-1 flex flex-col h-full bg-clay-canvas overflow-y-auto select-text font-sans p-6">
      <div className="max-w-5xl mx-auto w-full flex flex-col gap-6">
        {/* 1. Personal Welcome & AI Briefing */}
        <section className="p-6 rounded-clay-xl bg-white border border-clay-hairline shadow-clay-card flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-clay-md bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shadow-clay-soft">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-base font-bold text-clay-ink tracking-tight">
                  Personal Workspace
                </h1>
                <p className="text-xs text-clay-muted">
                  Private AI assistant, personal memory, and connected personal apps (Discord & Telegram)
                </p>
              </div>
            </div>

            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-clay-pill bg-emerald-50 text-emerald-800 border border-emerald-300 font-semibold text-[11px] shadow-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Isolated Environment</span>
            </span>
          </div>

          {/* AI Morning Briefing Ticker */}
          <div className="p-3.5 rounded-clay-lg bg-clay-surface-soft border border-clay-hairline flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-clay-ink">
              <Sparkles className="w-4 h-4 text-clay-teal shrink-0" />
              <span>
                <strong>AI Daily Briefing:</strong> You have{" "}
                <span className="font-semibold text-clay-primary">{activeTasks.length} active tasks</span> in your
                queue. Memory namespace is private; no organization data is accessible.
              </span>
            </div>
            <button
              onClick={onOpenAssistant}
              className="text-[11px] text-clay-primary font-semibold hover:underline flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <span>Chat with Assistant</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </section>

        {/* 2. Quick Command / Task Launcher */}
        <section className="p-5 rounded-clay-xl bg-white border border-clay-hairline shadow-clay-soft flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-clay-muted font-sans flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-clay-primary" />
            <span>Assign Work to Personal AI</span>
          </h2>

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Ask a question, request research, write a document, or debug a script..."
              value={quickInput}
              onChange={(e) => setQuickInput(e.target.value)}
              className="flex-1 h-10 px-3.5 rounded-clay-md bg-clay-surface-soft border border-clay-hairline text-xs text-clay-ink placeholder:text-clay-muted outline-none focus:border-clay-primary shadow-xs font-sans"
            />
            <button
              onClick={onNewTaskClick}
              className="h-10 px-4 rounded-clay-md bg-clay-primary hover:bg-clay-primary-active text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shadow-clay-soft"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Task</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-clay-muted">
            <span className="font-medium">Quick suggestions:</span>
            {[
              "Review discount formula in calculator.py",
              "Summarize today's Discord messages",
              "Plan Python async architecture",
              "Draft personal notes for weekly goals",
            ].map((s) => (
              <button
                key={s}
                onClick={() => setQuickInput(s)}
                className="px-2 py-0.5 rounded-clay-pill bg-clay-surface-card hover:bg-clay-surface-soft border border-clay-hairline text-clay-body hover:text-clay-ink transition-colors cursor-pointer text-[10px]"
              >
                {s}
              </button>
            ))}
          </div>
        </section>

        {/* 3. Action Cards Grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: AI Assistant */}
          <div
            onClick={onOpenAssistant}
            className="p-4 rounded-clay-lg bg-white hover:bg-clay-surface-card border border-clay-hairline hover:border-clay-teal cursor-pointer transition-all shadow-clay-soft flex flex-col justify-between gap-3 group"
          >
            <div className="flex items-start justify-between">
              <div className="w-8 h-8 rounded-clay-md bg-clay-teal/15 text-clay-teal flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-clay-muted group-hover:text-clay-teal group-hover:translate-x-0.5 transition-all" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-clay-ink group-hover:text-clay-teal transition-colors">
                Personal AI Assistant
              </h3>
              <p className="text-[11px] text-clay-muted mt-1 leading-relaxed">
                Direct private conversation with agent intelligence and personalized memory.
              </p>
            </div>
          </div>

          {/* Card 2: Engineering Studio */}
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
                Specialized IDE with Monaco editor, BugGraphCanvas, diff viewer, and terminal.
              </p>
            </div>
          </div>

          {/* Card 3: Personal Tasks */}
          <div
            onClick={onOpenTasks}
            className="p-4 rounded-clay-lg bg-white hover:bg-clay-surface-card border border-clay-hairline hover:border-clay-lavender cursor-pointer transition-all shadow-clay-soft flex flex-col justify-between gap-3 group"
          >
            <div className="flex items-start justify-between">
              <div className="w-8 h-8 rounded-clay-md bg-clay-lavender/25 text-clay-lavender-ink flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-clay-muted group-hover:text-clay-lavender-ink group-hover:translate-x-0.5 transition-all" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-clay-ink group-hover:text-clay-lavender-ink transition-colors">
                Personal Tasks Queue
              </h3>
              <p className="text-[11px] text-clay-muted mt-1 leading-relaxed">
                {activeTasks.length} in progress • {completedTasks.length} completed
              </p>
            </div>
          </div>
        </section>

        {/* 4. Active Tasks List */}
        <section className="p-5 rounded-clay-xl bg-white border border-clay-hairline shadow-clay-soft flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-clay-muted font-sans">
              Recent Personal Tasks
            </h2>
            <button
              onClick={onOpenTasks}
              className="text-xs text-clay-primary font-medium hover:underline cursor-pointer"
            >
              View all ({tasks.length})
            </button>
          </div>

          {tasks.length === 0 ? (
            <p className="text-xs text-clay-muted italic py-3 text-center">
              No personal tasks created yet. Click &quot;New Task&quot; above or message @ShipDev in Discord/Telegram.
            </p>
          ) : (
            <div className="divide-y divide-clay-hairline">
              {tasks.slice(0, 4).map((task) => (
                <div
                  key={task.id}
                  onClick={() => onSelectTask(task.id)}
                  className="py-3 flex items-center justify-between text-xs hover:bg-clay-surface-soft px-2 rounded-clay-md cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-clay-teal" />
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

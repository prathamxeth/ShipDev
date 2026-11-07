"use client";

import React, { useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  FileCode,
  GitBranch,
  History,
  Maximize2,
  Minimize2,
  Terminal,
  User,
  X,
  XCircle,
} from "lucide-react";
import { Evidence, Task, TransitionHistory } from "@/types";

interface BottomWorkspacePanelProps {
  task: Task | null;
  evidenceList: Evidence[];
  history: TransitionHistory[];
  patchDiff?: string | null;
  onNavigateToLine: (fileName: string, lineNumber: number) => void;
  height: number;
  onHeightChange: (newHeight: number) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

type TabType = "terminal" | "problems" | "tests" | "changes" | "activity";

export function BottomWorkspacePanel({
  task,
  evidenceList,
  history,
  patchDiff,
  onNavigateToLine,
  height,
  onHeightChange,
  isCollapsed,
  onToggleCollapse,
}: BottomWorkspacePanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>("terminal");
  const [selectedEvidenceIdx, setSelectedEvidenceIdx] = useState(0);
  const [copiedDiff, setCopiedDiff] = useState(false);

  const activeEvidence = evidenceList[selectedEvidenceIdx] || evidenceList[0];

  const handleCopyDiff = () => {
    if (!patchDiff) return;
    navigator.clipboard.writeText(patchDiff);
    setCopiedDiff(true);
    setTimeout(() => setCopiedDiff(false), 2000);
  };

  const handleStartResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = height;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = startY - moveEvent.clientY;
      const newHeight = Math.min(Math.max(startHeight + deltaY, 140), 600);
      onHeightChange(newHeight);
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  if (isCollapsed) {
    return (
      <div className="h-7 px-3 bg-clay-surface-soft border-t border-clay-hairline flex items-center justify-between text-xs font-mono text-clay-muted select-none shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleCollapse}
            className="flex items-center gap-1.5 text-clay-body hover:text-clay-ink transition-colors cursor-pointer"
          >
            <ChevronUp className="w-3.5 h-3.5 text-clay-primary" />
            <span>Show Dock (Terminal / Tests / Changes)</span>
          </button>
        </div>

        <div className="flex items-center gap-2 text-[10px] text-clay-muted">
          <span>{evidenceList.length} runs recorded</span>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ height: `${height}px` }}
      className="border-t border-clay-hairline bg-clay-surface-soft flex flex-col shrink-0 select-none overflow-hidden"
    >
      {/* Resizer Handle */}
      <div
        onMouseDown={handleStartResize}
        className="h-1.5 w-full bg-clay-hairline hover:bg-clay-primary cursor-row-resize transition-colors flex items-center justify-center group"
      >
        <div className="w-10 h-0.5 rounded-clay-pill bg-clay-muted group-hover:bg-clay-primary" />
      </div>

      {/* Dock Tabs Header */}
      <div className="h-8 px-3 bg-clay-canvas border-b border-clay-hairline flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none font-mono text-xs" role="tablist" aria-label="Dock workspace tabs">
          {(
            [
              { id: "terminal", label: "Terminal", icon: Terminal, count: evidenceList.length },
              { id: "problems", label: "Problems", icon: AlertCircle, count: task ? 1 : 0 },
              { id: "tests", label: "Test Results", icon: CheckCircle2, count: evidenceList.length },
              { id: "changes", label: "Changes", icon: FileCode, count: patchDiff ? 1 : 0 },
              { id: "activity", label: "Activity", icon: History, count: history.length },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                aria-controls={`dock-tabpanel-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-t-clay-md border-b-2 text-xs transition-colors cursor-pointer shrink-0 ${
                  isActive
                    ? "border-b-clay-primary text-clay-ink font-semibold bg-white shadow-clay-soft"
                    : "border-transparent text-clay-muted hover:text-clay-ink hover:bg-clay-surface-card"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? "text-clay-primary" : "text-clay-muted"}`} />
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span
                    className={`text-[10px] px-1.5 rounded-clay-pill font-mono ${
                      isActive ? "bg-clay-primary text-white" : "bg-clay-surface-card text-clay-muted border border-clay-hairline"
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right Dock Controls */}
        <div className="flex items-center gap-2 text-clay-muted">
          <button
            onClick={() => onHeightChange(height === 360 ? 190 : 360)}
            title="Toggle panel height"
            className="p-1 rounded-clay-xs hover:bg-clay-surface-card hover:text-clay-ink transition-colors cursor-pointer"
          >
            {height === 360 ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onToggleCollapse}
            title="Collapse dock"
            className="p-1 rounded-clay-xs hover:bg-clay-surface-card hover:text-clay-ink transition-colors cursor-pointer"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Dock Content Body */}
      <div className="flex-1 overflow-auto bg-clay-surface-soft p-3 font-mono text-xs select-text">
        {/* 1. TERMINAL TAB */}
        {activeTab === "terminal" && (
          <div className="flex flex-col gap-3 h-full">
            {evidenceList.length === 0 ? (
              <div className="h-full flex items-center justify-center text-clay-muted text-xs">
                No command executions recorded yet. Run the Switch bridge to execute tests in sandbox.
              </div>
            ) : (
              <>
                {/* Stage switcher pills */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 shrink-0">
                  <span className="text-clay-muted text-[11px]">Recorded executions:</span>
                  {evidenceList.map((ev, idx) => (
                    <button
                      key={ev.id || idx}
                      onClick={() => setSelectedEvidenceIdx(idx)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-clay-pill text-[11px] font-mono border transition-colors cursor-pointer ${
                        idx === selectedEvidenceIdx
                          ? "bg-clay-primary text-white border-clay-primary shadow-clay-soft"
                          : "bg-white text-clay-body hover:text-clay-ink border-clay-hairline"
                      }`}
                    >
                      {ev.exit_code === 0 ? (
                        <CheckCircle2 className="w-3 h-3 text-clay-success" />
                      ) : (
                        <XCircle className="w-3 h-3 text-clay-coral" />
                      )}
                      <span>{ev.stage}</span>
                      <span className="text-inherit opacity-75">({ev.exit_code})</span>
                    </button>
                  ))}
                </div>

                {activeEvidence && (
                  <div className="flex-1 flex flex-col gap-2 min-h-0 overflow-auto">
                    {/* Command bar */}
                    <div className="p-2.5 rounded-clay-lg bg-clay-surface-dark border border-clay-surface-dark-elevated text-white flex items-center justify-between shrink-0 shadow-clay-soft">
                      <div className="flex items-center gap-2">
                        <span className="text-clay-mint select-none font-bold">$</span>
                        <span className="font-semibold text-white">
                          {activeEvidence.command_executed}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-clay-pill font-mono border ${
                          activeEvidence.exit_code === 0
                            ? "bg-clay-mint/20 text-clay-mint border-clay-mint/40 font-semibold"
                            : "bg-clay-coral/20 text-clay-coral border-clay-coral/40 font-semibold"
                        }`}
                      >
                        exit: {activeEvidence.exit_code}
                      </span>
                    </div>

                    {/* Stdout Output */}
                    {activeEvidence.stdout && (
                      <div className="flex flex-col gap-1 min-h-0 flex-1">
                        <span className="text-[10px] text-clay-muted uppercase tracking-wider font-semibold">
                          Standard Output (stdout)
                        </span>
                        <pre className="p-3 rounded-clay-lg bg-clay-surface-dark border border-clay-surface-dark-elevated text-[#86efac] whitespace-pre-wrap text-[11px] leading-relaxed overflow-auto flex-1 font-mono">
                          {activeEvidence.stdout}
                        </pre>
                      </div>
                    )}

                    {/* Stderr Output */}
                    {activeEvidence.stderr && (
                      <div className="flex flex-col gap-1 shrink-0">
                        <span className="text-[10px] text-clay-coral uppercase tracking-wider font-semibold">
                          Standard Error (stderr)
                        </span>
                        <pre className="p-3 rounded-clay-lg bg-[#2a1015] border border-clay-coral/40 text-rose-300 whitespace-pre-wrap text-[11px] leading-relaxed overflow-auto font-mono">
                          {activeEvidence.stderr}
                        </pre>
                      </div>
                    )}

                    {!activeEvidence.stdout && !activeEvidence.stderr && (
                      <div className="p-3 rounded-clay-lg bg-clay-surface-dark border border-clay-surface-dark-elevated text-clay-muted text-[11px] italic">
                        Command completed with exit code {activeEvidence.exit_code} (no output streams captured).
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* 2. PROBLEMS TAB */}
        {activeTab === "problems" && (
          <div className="flex flex-col gap-2" id="dock-tabpanel-problems" role="tabpanel">
            {task ? (
              <div
                role="button"
                tabIndex={0}
                aria-label={`Jump to ${task.title} at line 22`}
                onClick={() => onNavigateToLine("calculator.py", 22)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onNavigateToLine("calculator.py", 22);
                  }
                }}
                className="p-2.5 rounded-clay-lg bg-white hover:bg-clay-surface-card border border-clay-hairline hover:border-clay-primary cursor-pointer transition-colors flex items-start gap-2.5 group shadow-clay-soft focus-visible:outline-2 focus-visible:outline-clay-primary"
              >
                <XCircle className="w-4 h-4 text-clay-coral-ink shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-clay-ink font-semibold group-hover:text-clay-primary transition-colors">
                      {task.title}
                    </span>
                    <span className="text-[10px] text-clay-muted bg-clay-surface-soft px-1.5 py-0.5 rounded-clay-xs border border-clay-hairline">
                      Line 22
                    </span>
                  </div>
                  <div className="text-[11px] text-clay-body font-sans mt-0.5">
                    demo/buggy_app/calculator.py: calculate_discount adds markup instead of subtracting discount.
                  </div>
                </div>
                <span className="text-[10px] font-mono text-clay-primary group-hover:underline font-semibold">
                  Jump to code ➔
                </span>
              </div>
            ) : (
              <div className="p-4 text-center text-clay-muted text-xs">
                No active issues or syntax problems detected.
              </div>
            )}
          </div>
        )}

        {/* 3. TEST RESULTS TAB */}
        {activeTab === "tests" && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Reproduction Test Result */}
              <div className="p-3.5 rounded-clay-xl bg-clay-peach/20 border border-clay-peach/40 flex flex-col gap-2 shadow-clay-soft">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-clay-ink">
                    Reproduction Suite
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-clay-pill font-mono bg-clay-coral/20 text-clay-coral border border-clay-coral/40 font-semibold">
                    1 FAILED (Exit 1)
                  </span>
                </div>
                <p className="text-[11px] text-clay-body font-sans">
                  test_calculate_discount_applies_correct_reduction failed against pristine code.
                </p>
                <div className="p-2 rounded-clay-md bg-white border border-clay-hairline text-[10px] text-clay-body font-mono">
                  Assert: calculate_discount(100.0, 20.0) == 80.0 (received 120.0)
                </div>
              </div>

              {/* Verification Test Result */}
              <div className="p-3.5 rounded-clay-xl bg-clay-mint/25 border border-clay-mint/50 flex flex-col gap-2 shadow-clay-soft">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-clay-ink">
                    Verification Suite
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-clay-pill font-mono bg-clay-mint/40 text-[#136149] border border-clay-mint/60 font-semibold">
                    4 PASSED (Exit 0)
                  </span>
                </div>
                <p className="text-[11px] text-clay-body font-sans">
                  All tests passed against patched workspace. No regressions detected.
                </p>
                <div className="p-2 rounded-clay-md bg-white border border-clay-hairline text-[10px] text-[#136149] font-mono space-y-0.5 font-medium">
                  <div>✓ test_add PASSED</div>
                  <div>✓ test_divide PASSED</div>
                  <div>✓ test_divide_by_zero PASSED</div>
                  <div>✓ test_calculate_discount_applies_correct_reduction PASSED</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 4. CHANGES TAB */}
        {activeTab === "changes" && (
          <div className="flex flex-col gap-2 h-full">
            {patchDiff ? (
              <>
                <div className="flex items-center justify-between pb-1 border-b border-clay-hairline">
                  <span className="text-clay-muted text-[11px]">
                    Unified Patch Diff (demo/buggy_app/calculator.py)
                  </span>
                  <button
                    onClick={handleCopyDiff}
                    className="flex items-center gap-1 text-[11px] text-clay-body hover:text-clay-ink transition-colors cursor-pointer bg-white px-2 py-1 rounded-clay-md border border-clay-hairline shadow-clay-soft"
                  >
                    {copiedDiff ? <CheckCircle2 className="w-3 h-3 text-clay-success" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedDiff ? "Copied Diff" : "Copy Diff"}</span>
                  </button>
                </div>
                <pre className="p-3 rounded-clay-lg bg-clay-surface-dark border border-clay-surface-dark-elevated text-white text-[11px] leading-relaxed overflow-auto flex-1 font-mono">
                  {patchDiff}
                </pre>
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-clay-muted text-xs">
                No candidate patch generated for this task yet.
              </div>
            )}
          </div>
        )}

        {/* 5. ACTIVITY TAB */}
        {activeTab === "activity" && (
          <div className="flex flex-col gap-2">
            {history.length === 0 ? (
              <div className="p-4 text-center text-clay-muted text-xs">
                No state machine transitions recorded yet.
              </div>
            ) : (
              <div className="space-y-1.5">
                {history.map((record, idx) => {
                  const isHuman = record.actor_type === "human";
                  return (
                    <div
                      key={record.id || idx}
                      className="p-2.5 rounded-clay-md bg-white border border-clay-hairline flex items-center justify-between text-[11px] shadow-clay-soft"
                    >
                      <div className="flex items-center gap-2">
                        {isHuman ? (
                          <User className="w-3.5 h-3.5 text-clay-success" />
                        ) : (
                          <Bot className="w-3.5 h-3.5 text-clay-lavender" />
                        )}
                        <span className="font-semibold text-clay-ink">{record.from_status}</span>
                        <ArrowRight className="w-3 h-3 text-clay-muted" />
                        <span className="font-semibold text-clay-primary">{record.to_status}</span>
                        <span className="text-clay-muted font-sans">by {record.actor_id}</span>
                      </div>
                      <span className="text-[10px] text-clay-muted font-mono">
                        {new Date(record.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


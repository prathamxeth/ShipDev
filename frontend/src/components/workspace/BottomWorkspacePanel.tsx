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
      <div className="h-7 px-3 bg-[#080808] border-t border-[#1e1e1e] flex items-center justify-between text-xs font-mono text-neutral-400 select-none shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleCollapse}
            className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer"
          >
            <ChevronUp className="w-3.5 h-3.5 text-[#f54e00]" />
            <span>Show Dock (Terminal / Tests / Changes)</span>
          </button>
        </div>

        <div className="flex items-center gap-2 text-[10px] text-neutral-500">
          <span>{evidenceList.length} runs recorded</span>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ height: `${height}px` }}
      className="border-t border-[#1e1e1e] bg-[#050505] flex flex-col shrink-0 select-none overflow-hidden"
    >
      {/* Resizer Handle */}
      <div
        onMouseDown={handleStartResize}
        className="h-1.5 w-full bg-[#141414] hover:bg-[#f54e00]/60 cursor-row-resize transition-colors flex items-center justify-center group"
      >
        <div className="w-10 h-0.5 rounded-full bg-neutral-600 group-hover:bg-[#f54e00]" />
      </div>

      {/* Dock Tabs Header */}
      <div className="h-8 px-3 bg-[#080808] border-b border-[#1e1e1e] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none font-mono text-xs">
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
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-t-md border-b-2 text-xs transition-colors cursor-pointer shrink-0 ${
                  isActive
                    ? "border-[#f54e00] text-white font-medium bg-[#0f0f0f]"
                    : "border-transparent text-neutral-400 hover:text-neutral-200 hover:bg-[#121212]"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? "text-[#f54e00]" : "text-neutral-500"}`} />
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span
                    className={`text-[10px] px-1.5 rounded-full font-mono ${
                      isActive ? "bg-[#f54e00]/20 text-[#f54e00]" : "bg-neutral-800 text-neutral-400"
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
        <div className="flex items-center gap-2 text-neutral-400">
          <button
            onClick={() => onHeightChange(height === 360 ? 190 : 360)}
            title="Toggle panel height"
            className="p-1 rounded hover:bg-[#1a1a1a] hover:text-white transition-colors cursor-pointer"
          >
            {height === 360 ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onToggleCollapse}
            title="Collapse dock"
            className="p-1 rounded hover:bg-[#1a1a1a] hover:text-white transition-colors cursor-pointer"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Dock Content Body */}
      <div className="flex-1 overflow-auto bg-[#000000] p-3 font-mono text-xs select-text">
        {/* 1. TERMINAL TAB */}
        {activeTab === "terminal" && (
          <div className="flex flex-col gap-3 h-full">
            {evidenceList.length === 0 ? (
              <div className="h-full flex items-center justify-center text-neutral-500 text-xs">
                No command executions recorded yet. Run the Switch bridge to execute tests in sandbox.
              </div>
            ) : (
              <>
                {/* Stage switcher pills */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 shrink-0">
                  <span className="text-neutral-500 text-[11px]">Recorded executions:</span>
                  {evidenceList.map((ev, idx) => (
                    <button
                      key={ev.id || idx}
                      onClick={() => setSelectedEvidenceIdx(idx)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono border transition-colors cursor-pointer ${
                        idx === selectedEvidenceIdx
                          ? "bg-[#181818] text-white border-[#f54e00]/80 shadow-xs"
                          : "bg-[#0c0c0c] text-neutral-400 hover:text-neutral-200 border-[#222222]"
                      }`}
                    >
                      {ev.exit_code === 0 ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <XCircle className="w-3 h-3 text-rose-400" />
                      )}
                      <span>{ev.stage}</span>
                      <span className="text-neutral-500">({ev.exit_code})</span>
                    </button>
                  ))}
                </div>

                {activeEvidence && (
                  <div className="flex-1 flex flex-col gap-2 min-h-0 overflow-auto">
                    {/* Command bar */}
                    <div className="p-2.5 rounded bg-[#0a0a0a] border border-[#1e1e1e] flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-2 text-neutral-200">
                        <span className="text-emerald-400 select-none">$</span>
                        <span className="font-semibold text-white">
                          {activeEvidence.command_executed}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-mono border ${
                          activeEvidence.exit_code === 0
                            ? "bg-emerald-950/60 text-emerald-300 border-emerald-800/80"
                            : "bg-rose-950/60 text-rose-300 border-rose-800/80"
                        }`}
                      >
                        exit: {activeEvidence.exit_code}
                      </span>
                    </div>

                    {/* Stdout Output */}
                    {activeEvidence.stdout && (
                      <div className="flex flex-col gap-1 min-h-0 flex-1">
                        <span className="text-[10px] text-neutral-500 uppercase tracking-wider">
                          Standard Output (stdout)
                        </span>
                        <pre className="p-3 rounded bg-[#070707] border border-[#161616] text-neutral-300 whitespace-pre-wrap text-[11px] leading-relaxed overflow-auto flex-1">
                          {activeEvidence.stdout}
                        </pre>
                      </div>
                    )}

                    {/* Stderr Output */}
                    {activeEvidence.stderr && (
                      <div className="flex flex-col gap-1 shrink-0">
                        <span className="text-[10px] text-rose-400 uppercase tracking-wider">
                          Standard Error (stderr)
                        </span>
                        <pre className="p-3 rounded bg-rose-950/20 border border-rose-900/40 text-rose-300 whitespace-pre-wrap text-[11px] leading-relaxed overflow-auto">
                          {activeEvidence.stderr}
                        </pre>
                      </div>
                    )}

                    {!activeEvidence.stdout && !activeEvidence.stderr && (
                      <div className="p-3 rounded bg-[#070707] border border-[#161616] text-neutral-500 text-[11px] italic">
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
          <div className="flex flex-col gap-2">
            {task ? (
              <div
                onClick={() => onNavigateToLine("calculator.py", 22)}
                className="p-2.5 rounded-lg bg-[#0e0e0e] hover:bg-[#141414] border border-[#202020] hover:border-[#f54e00]/60 cursor-pointer transition-colors flex items-start gap-2.5 group"
              >
                <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium group-hover:text-[#f54e00] transition-colors">
                      {task.title}
                    </span>
                    <span className="text-[10px] text-neutral-500 bg-[#181818] px-1.5 py-0.2 rounded border border-[#262626]">
                      Line 22
                    </span>
                  </div>
                  <div className="text-[11px] text-neutral-400 font-sans mt-0.5">
                    demo/buggy_app/calculator.py: calculate_discount adds markup instead of subtracting discount.
                  </div>
                </div>
                <span className="text-[10px] font-mono text-[#f54e00] group-hover:underline">
                  Jump to code ➔
                </span>
              </div>
            ) : (
              <div className="p-4 text-center text-neutral-500 text-xs">
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
              <div className="p-3 rounded-lg bg-[#0c0c0c] border border-[#1e1e1e] flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-neutral-200">
                    Reproduction Suite
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-rose-950/60 text-rose-300 border border-rose-800">
                    1 FAILED (Exit 1)
                  </span>
                </div>
                <p className="text-[11px] text-neutral-400 font-sans">
                  test_calculate_discount_applies_correct_reduction failed against pristine code.
                </p>
                <div className="p-2 rounded bg-[#070707] border border-[#161616] text-[10px] text-neutral-400">
                  Assert: calculate_discount(100.0, 20.0) == 80.0 (received 120.0)
                </div>
              </div>

              {/* Verification Test Result */}
              <div className="p-3 rounded-lg bg-[#0c0c0c] border border-[#1e1e1e] flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-neutral-200">
                    Verification Suite
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-emerald-950/60 text-emerald-300 border border-emerald-800">
                    4 PASSED (Exit 0)
                  </span>
                </div>
                <p className="text-[11px] text-neutral-400 font-sans">
                  All tests passed against patched workspace. No regressions detected.
                </p>
                <div className="p-2 rounded bg-[#070707] border border-[#161616] text-[10px] text-emerald-400/90 font-mono space-y-0.5">
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
                <div className="flex items-center justify-between pb-1 border-b border-[#1e1e1e]">
                  <span className="text-neutral-400 text-[11px]">
                    Unified Patch Diff (demo/buggy_app/calculator.py)
                  </span>
                  <button
                    onClick={handleCopyDiff}
                    className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-white transition-colors cursor-pointer"
                  >
                    {copiedDiff ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedDiff ? "Copied Diff" : "Copy Diff"}</span>
                  </button>
                </div>
                <pre className="p-3 rounded bg-[#070707] border border-[#161616] text-neutral-300 text-[11px] leading-relaxed overflow-auto flex-1 font-mono">
                  {patchDiff}
                </pre>
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-neutral-500 text-xs">
                No candidate patch generated for this task yet.
              </div>
            )}
          </div>
        )}

        {/* 5. ACTIVITY TAB */}
        {activeTab === "activity" && (
          <div className="flex flex-col gap-2">
            {history.length === 0 ? (
              <div className="p-4 text-center text-neutral-500 text-xs">
                No state machine transitions recorded yet.
              </div>
            ) : (
              <div className="space-y-1.5">
                {history.map((record, idx) => {
                  const isHuman = record.actor_type === "human";
                  return (
                    <div
                      key={record.id || idx}
                      className="p-2 rounded bg-[#0a0a0a] border border-[#1a1a1a] flex items-center justify-between text-[11px]"
                    >
                      <div className="flex items-center gap-2">
                        {isHuman ? (
                          <User className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Bot className="w-3.5 h-3.5 text-purple-400" />
                        )}
                        <span className="font-semibold text-white">{record.from_status}</span>
                        <ArrowRight className="w-3 h-3 text-neutral-500" />
                        <span className="font-semibold text-[#f54e00]">{record.to_status}</span>
                        <span className="text-neutral-500 font-sans">by {record.actor_id}</span>
                      </div>
                      <span className="text-[10px] text-neutral-500 font-mono">
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


"use client";

import React, { useState } from "react";
import { CheckCircle2, ChevronRight, ShieldAlert, Terminal, XCircle } from "lucide-react";
import { Evidence } from "@/types";
import { EmptyState } from "@/components/ui/EmptyState";

interface TerminalLogsProps {
  evidenceList: Evidence[];
}

export function TerminalLogs({ evidenceList }: TerminalLogsProps) {
  const [selectedIdx, setSelectedIdx] = useState(0);

  if (!evidenceList || evidenceList.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-6 bg-oled-base">
        <EmptyState
          icon={<Terminal className="w-8 h-8 text-zinc-600" />}
          title="No Execution Evidence Recorded"
          description="Reproduction and verification agents record command executions, terminal outputs, and exit codes here once initiated."
        />
      </div>
    );
  }

  const activeEvidence = evidenceList[selectedIdx] || evidenceList[0];

  return (
    <div className="h-full flex flex-col bg-oled-base overflow-hidden">
      {/* Evidence stage selector bar */}
      <div className="h-9 px-3 border-b border-oled-border bg-oled-panel flex items-center justify-between text-xs shrink-0 select-none">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <span className="text-zinc-500 font-mono text-[11px] mr-1">runs:</span>
          {evidenceList.map((ev, idx) => {
            const isSelected = idx === selectedIdx;
            const isZero = ev.exit_code === 0;

            return (
              <button
                key={ev.id || idx}
                onClick={() => setSelectedIdx(idx)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono transition-colors border ${
                  isSelected
                    ? "bg-zinc-800 text-slate-100 border-zinc-700"
                    : "bg-oled-base hover:bg-oled-hover text-zinc-400 border-oled-border"
                }`}
              >
                {isZero ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                ) : (
                  <XCircle className="w-3 h-3 text-rose-400" />
                )}
                <span>{ev.stage}</span>
                <span className="text-[10px] text-zinc-500">({ev.exit_code})</span>
              </button>
            );
          })}
        </div>

        {/* Mock verification tag check */}
        {activeEvidence.is_mock && (
          <div className="flex items-center gap-1 text-[11px] font-mono text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/60">
            <ShieldAlert className="w-3 h-3 text-amber-400" />
            <span>MOCK DATA (Unverified)</span>
          </div>
        )}
      </div>

      {/* Terminal View */}
      <div className="flex-1 overflow-auto p-3 font-mono text-[12px] flex flex-col gap-3 select-text bg-oled-black">
        {/* Command Executed box */}
        <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-zinc-300">
            <span className="text-emerald-400 select-none">$</span>
            <span className="font-semibold text-slate-100">
              {activeEvidence.command_executed}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] px-2 py-0.5 rounded font-mono border ${
                activeEvidence.exit_code === 0
                  ? "bg-emerald-950/60 text-emerald-300 border-emerald-800"
                  : "bg-rose-950/60 text-rose-300 border-rose-800"
              }`}
            >
              exit: {activeEvidence.exit_code}
            </span>
          </div>
        </div>

        {/* Stdout Output */}
        {activeEvidence.stdout && (
          <div className="flex flex-col gap-1">
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider font-mono">
              Standard Output (stdout)
            </div>
            <pre className="p-3 rounded bg-zinc-950/80 border border-zinc-900 text-zinc-300 whitespace-pre-wrap leading-relaxed overflow-x-auto text-[11px]">
              {activeEvidence.stdout}
            </pre>
          </div>
        )}

        {/* Stderr Output */}
        {activeEvidence.stderr && (
          <div className="flex flex-col gap-1">
            <div className="text-[11px] text-rose-400 uppercase tracking-wider font-mono">
              Standard Error (stderr)
            </div>
            <pre className="p-3 rounded bg-rose-950/20 border border-rose-900/30 text-rose-300 whitespace-pre-wrap leading-relaxed overflow-x-auto text-[11px]">
              {activeEvidence.stderr}
            </pre>
          </div>
        )}

        {!activeEvidence.stdout && !activeEvidence.stderr && (
          <div className="text-zinc-500 text-xs italic">
            Command finished with no output recorded.
          </div>
        )}
      </div>
    </div>
  );
}


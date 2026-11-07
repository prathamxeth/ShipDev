"use client";

import React, { useState } from "react";
import { Check, Copy, FileCode2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

interface DiffViewerProps {
  patchDiff?: string | null;
  stageName?: string;
}

export function DiffViewer({ patchDiff, stageName = "Proposed Patch" }: DiffViewerProps) {
  const [copied, setCopied] = useState(false);

  if (!patchDiff || patchDiff.trim().length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-6 bg-oled-base">
        <EmptyState
          icon={<FileCode2 className="w-8 h-8 text-zinc-600" />}
          title="No Patch Diff Generated"
          description="The AI triage and fix agents have not yet proposed or attached code changes for this task."
        />
      </div>
    );
  }

  const lines = patchDiff.split("\n");

  const handleCopy = () => {
    navigator.clipboard.writeText(patchDiff);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-full flex flex-col bg-oled-base overflow-hidden">
      {/* Header toolbar */}
      <div className="h-9 px-3 border-b border-oled-border bg-oled-panel flex items-center justify-between text-xs text-zinc-400 shrink-0">
        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span className="text-zinc-500">diff:</span>
          <span className="text-slate-200 font-medium">{stageName}</span>
          <span className="text-zinc-500">({lines.length} lines)</span>
        </div>

        <Button variant="ghost" size="xs" onClick={handleCopy} className="gap-1 text-zinc-400 hover:text-slate-200">
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? "Copied Diff" : "Copy Diff"}</span>
        </Button>
      </div>

      {/* Code diff view */}
      <div className="flex-1 overflow-auto p-2 font-mono text-[12px] leading-relaxed select-text">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, idx) => {
              const isAddition = line.startsWith("+") && !line.startsWith("+++");
              const isDeletion = line.startsWith("-") && !line.startsWith("---");
              const isHeader = line.startsWith("@@") || line.startsWith("diff --git") || line.startsWith("index ");

              return (
                <tr
                  key={idx}
                  className={`hover:bg-zinc-800/30 transition-colors ${
                    isAddition
                      ? "bg-emerald-950/30 text-emerald-300"
                      : isDeletion
                      ? "bg-rose-950/30 text-rose-300"
                      : isHeader
                      ? "bg-blue-950/20 text-blue-300 font-semibold"
                      : "text-zinc-300"
                  }`}
                >
                  <td className="w-10 pr-3 text-right text-zinc-600 select-none text-[11px]">
                    {idx + 1}
                  </td>
                  <td className="w-4 select-none text-center">
                    {isAddition ? "+" : isDeletion ? "-" : " "}
                  </td>
                  <td className="pl-2 whitespace-pre font-mono overflow-x-auto">
                    {line}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}


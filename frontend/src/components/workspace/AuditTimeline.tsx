"use client";

import React from "react";
import { ArrowRight, Bot, History, User } from "lucide-react";
import { TransitionHistory } from "@/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusPill } from "@/components/ui/StatusPill";

interface AuditTimelineProps {
  history: TransitionHistory[];
}

export function AuditTimeline({ history }: AuditTimelineProps) {
  if (!history || history.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-6 bg-oled-base">
        <EmptyState
          icon={<History className="w-8 h-8 text-zinc-600" />}
          title="No Transition History Recorded"
          description="State changes performed by AI agents or human supervisors will form an immutable audit trail here."
        />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 bg-oled-base select-text">
      <div className="max-w-2xl mx-auto flex flex-col gap-3">
        <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1 font-mono">
          State Machine Audit Log ({history.length} events)
        </div>

        <div className="relative border-l border-zinc-800 ml-3 flex flex-col gap-4 pb-4">
          {history.map((record, index) => {
            const isHuman = record.actor_type === "human";

            return (
              <div key={record.id || index} className="relative pl-6 flex flex-col gap-1.5">
                {/* Node icon */}
                <div
                  className={`absolute -left-2.5 top-0.5 w-5 h-5 rounded-full border flex items-center justify-center ${
                    isHuman
                      ? "bg-emerald-950 border-emerald-700 text-emerald-400"
                      : "bg-purple-950 border-purple-700 text-purple-400"
                  }`}
                >
                  {isHuman ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                </div>

                {/* Event header */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <StatusPill status={record.from_status} size="sm" />
                    <ArrowRight className="w-3 h-3 text-zinc-500" />
                    <StatusPill status={record.to_status} size="sm" />
                  </div>

                  <span className="text-[11px] font-mono text-zinc-500 ml-auto">
                    {new Date(record.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                </div>

                {/* Actor & Reason Card */}
                <div className="p-2.5 rounded bg-oled-panel border border-oled-border flex flex-col gap-1.5 text-xs">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-zinc-400">
                      actor:{" "}
                      <span className={isHuman ? "text-emerald-400 font-semibold" : "text-purple-400"}>
                        {record.actor_id}
                      </span>
                    </span>
                    <span className="text-zinc-600">type: {record.actor_type}</span>
                  </div>

                  {record.reason && (
                    <p className="text-zinc-300 text-xs leading-relaxed">
                      {record.reason}
                    </p>
                  )}

                  {record.evidence_id && (
                    <div className="text-[10px] font-mono text-blue-400/90 pt-1 border-t border-zinc-800/60">
                      verified evidence: {record.evidence_id}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}


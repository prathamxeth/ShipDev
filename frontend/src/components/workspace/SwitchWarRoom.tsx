"use client";

import React from "react";
import { Bot, ExternalLink, MessageSquare, ShieldAlert, Sparkles, Terminal } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface SwitchWarRoomProps {
  taskId: string;
}

export function SwitchWarRoom({ taskId }: SwitchWarRoomProps) {
  const mattermostUrl = "http://localhost:8065/shipdev/channels/shipdev-incident-room";

  return (
    <div className="h-full flex flex-col bg-oled-base overflow-y-auto p-4 select-text">
      <div className="max-w-3xl w-full mx-auto flex flex-col gap-4">
        {/* Switch War Room Header */}
        <div className="p-4 rounded-lg bg-oled-panel border border-oled-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded bg-purple-950/70 border border-purple-800/80 flex items-center justify-center shrink-0">
              <Bot className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-100">
                  Switch Incident Room: #shipdev-incident-room
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/60">
                  Switch Native
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Autonomous collaboration between triage and verification agents with human oversight.
              </p>
            </div>
          </div>

          <a
            href={mattermostUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-purple-950/60 text-purple-300 hover:bg-purple-900/60 border border-purple-800/80 transition-colors shrink-0"
          >
            <span>Open Mattermost Room</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Multi-Agent Roles & Constraints Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Triager Agent Card */}
          <div className="p-3.5 rounded bg-oled-panel border border-oled-border flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                <span className="text-xs font-semibold font-mono text-blue-300">
                  @shipdev-triager
                </span>
              </div>
              <span className="text-[10px] text-zinc-500 font-mono">Agent Role</span>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Analyzes incoming error logs and stack traces, isolates root cause in codebase, and drafts candidate patch diffs.
            </p>
            <div className="pt-2 border-t border-zinc-800/60 flex items-center gap-1.5 text-[11px] text-zinc-400">
              <ShieldAlert className="w-3.5 h-3.5 text-zinc-500" />
              <span>Strictly prohibited from declaring issues resolved.</span>
            </div>
          </div>

          {/* Verifier Agent Card */}
          <div className="p-3.5 rounded bg-oled-panel border border-oled-border flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-xs font-semibold font-mono text-emerald-300">
                  @shipdev-verifier
                </span>
              </div>
              <span className="text-[10px] text-zinc-500 font-mono">Agent Role</span>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Independently executes test suites in isolated sandbox against candidate patches, rejecting regressions back to triager.
            </p>
            <div className="pt-2 border-t border-zinc-800/60 flex items-center gap-1.5 text-[11px] text-zinc-400">
              <ShieldAlert className="w-3.5 h-3.5 text-zinc-500" />
              <span>Cannot complete tasks without human confirmation.</span>
            </div>
          </div>
        </div>

        {/* Live Switch Console status note */}
        <div className="p-4 rounded bg-zinc-950/60 border border-zinc-800 flex flex-col gap-2 text-xs text-zinc-400">
          <div className="flex items-center gap-2 text-slate-300 font-medium">
            <MessageSquare className="w-4 h-4 text-purple-400" />
            <span>Switch Collaboration State</span>
          </div>
          <p className="leading-relaxed">
            The agents interact via Switch Console and local Mattermost. When active, agent discourse, candidate diffs, and test runs are streamed into the war room. Real execution logs appear in the Sandbox Execution tab upon verification.
          </p>
        </div>
      </div>
    </div>
  );
}


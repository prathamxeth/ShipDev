"use client";

import React from "react";
import { Bot, CheckCircle2, Info, ShieldCheck, X } from "lucide-react";

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  switchConnected?: boolean;
}

export function AboutModal({
  isOpen,
  onClose,
  switchConnected = true,
}: AboutModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-xl bg-[#0c0c0c] border border-[#262626] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="h-11 px-4 border-b border-[#1e1e1e] flex items-center justify-between bg-[#080808]">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-[#f54e00]" />
            <h2 className="text-xs font-semibold text-white uppercase tracking-wider font-mono">
              About ShipDev
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-white p-1 rounded hover:bg-[#1a1a1a] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 flex flex-col gap-3.5 text-xs font-sans">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-[#141414] border border-[#222222]">
            <div className="w-10 h-10 rounded-lg bg-[#f54e00]/15 border border-[#f54e00]/40 flex items-center justify-center text-[#f54e00]">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white font-mono">
                ShipDev IDE v0.2
              </div>
              <div className="text-[11px] text-neutral-400">
                Human-Supervised Multi-Agent Engineering IDE
              </div>
            </div>
          </div>

          <div className="text-neutral-300 leading-relaxed space-y-2">
            <p>
              ShipDev is an AI-native software engineering workbench designed around autonomous multi-agent bug triage, isolated sandbox reproduction, and rigorous verification.
            </p>
            <p className="text-neutral-400">
              Powered by Switch agent orchestration and an immutable Human Approval Gate, ShipDev ensures that no AI-generated code merges into production without authenticated execution evidence and explicit human sign-off.
            </p>
          </div>

          {/* Architecture Checklist */}
          <div className="p-3 rounded-lg bg-[#0e0e0e] border border-[#1e1e1e] flex flex-col gap-1.5 font-mono text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-neutral-400">Switch Controller:</span>
              <span className={switchConnected ? "text-emerald-400 font-medium" : "text-amber-400"}>
                {switchConnected ? "Connected (:53640)" : "Connecting..."}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-400">Human Approval Gate:</span>
              <span className="text-emerald-400 font-medium">Active (Fail-Closed)</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-400">Sandbox Isolation:</span>
              <span className="text-emerald-400 font-medium">Subprocess Workspace</span>
            </div>
          </div>

          <div className="pt-2 border-t border-[#1e1e1e] flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-md bg-[#181818] hover:bg-[#222222] border border-[#2a2a2a] text-white font-mono text-xs transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


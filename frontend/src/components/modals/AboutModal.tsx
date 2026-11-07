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
  // Close on Escape key
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs select-none animate-in fade-in duration-150"
    >
      <div className="w-full max-w-md rounded-clay-xl bg-clay-canvas border border-clay-hairline shadow-clay-elevated flex flex-col overflow-hidden text-clay-ink">
        {/* Header */}
        <div className="h-11 px-4 border-b border-clay-hairline flex items-center justify-between bg-white">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-clay-primary" />
            <h2 id="about-dialog-title" className="text-xs font-semibold text-clay-ink uppercase tracking-wider font-mono">
              About ShipDev
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="text-clay-muted hover:text-clay-ink p-1 rounded-clay-xs hover:bg-clay-surface-card transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 flex flex-col gap-3.5 text-xs font-sans">
          <div className="flex items-center gap-3 p-3 rounded-clay-lg bg-white border border-clay-hairline shadow-clay-soft">
            <div className="w-10 h-10 rounded-clay-lg bg-clay-peach/25 border border-clay-peach/40 flex items-center justify-center text-clay-primary">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <div className="text-sm font-semibold text-clay-ink font-mono">
                ShipDev IDE v0.2
              </div>
              <div className="text-[11px] text-clay-muted">
                Human-Supervised Multi-Agent Engineering IDE
              </div>
            </div>
          </div>

          <div className="text-clay-body leading-relaxed space-y-2">
            <p>
              ShipDev is an AI-native software engineering workbench designed around autonomous multi-agent bug triage, isolated sandbox reproduction, and rigorous verification.
            </p>
            <p className="text-clay-muted">
              Powered by Switch agent orchestration and an immutable Human Approval Gate, ShipDev ensures that no AI-generated code merges into production without authenticated execution evidence and explicit human sign-off.
            </p>
          </div>

          {/* Architecture Checklist */}
          <div className="p-3 rounded-clay-lg bg-clay-surface-card border border-clay-hairline flex flex-col gap-1.5 font-mono text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-clay-muted">Switch Controller:</span>
              <span className={switchConnected ? "text-clay-success font-semibold" : "text-clay-coral font-semibold"}>
                {switchConnected ? "Connected (:53640)" : "Connecting..."}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-clay-muted">Human Approval Gate:</span>
              <span className="text-clay-success font-semibold">Active (Fail-Closed)</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-clay-muted">Sandbox Isolation:</span>
              <span className="text-clay-success font-semibold">Subprocess Workspace</span>
            </div>
          </div>

          <div className="pt-2 border-t border-clay-hairline flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-clay-md bg-clay-primary hover:bg-clay-primary-active text-white font-mono text-xs transition-colors cursor-pointer shadow-clay-soft"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


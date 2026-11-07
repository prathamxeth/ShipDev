"use client";

import React, { useState, useEffect } from "react";
import {
  Bot,
  CheckCircle2,
  Info,
  ShieldCheck,
  X,
  ExternalLink,
  Copy,
  Check,
  Flame,
  Network,
  Cpu,
  Lock,
  GitBranch,
} from "lucide-react";

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
  const [activeTab, setActiveTab] = useState<"overview" | "architecture" | "agents" | "deployments">("overview");
  const [copiedLink, setCopiedLink] = useState(false);

  // Close on Escape key
  useEffect(() => {
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

  const copyRepoLink = () => {
    navigator.clipboard.writeText("https://github.com/prathamxeth/ShipDev");
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm select-none animate-in fade-in duration-150"
    >
      <div className="w-full max-w-xl rounded-clay-xl bg-white border border-clay-hairline shadow-clay-elevated flex flex-col overflow-hidden text-clay-ink max-h-[85vh]">
        {/* Header */}
        <div className="h-14 px-5 border-b border-clay-hairline flex items-center justify-between bg-clay-surface-soft shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-clay-lg bg-clay-primary/10 border border-clay-primary/30 flex items-center justify-center text-clay-primary shadow-clay-soft">
              <Bot className="w-5 h-5 text-clay-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-clay-ink font-mono tracking-tight">ShipDev IDE</span>
                <span className="px-1.5 py-0.5 rounded-clay-xs text-[9px] font-mono font-semibold bg-clay-surface-card text-clay-primary border border-clay-hairline">
                  v0.2.0-switch-hackathon
                </span>
              </div>
              <p className="text-[11px] text-clay-muted font-sans">
                Human-Supervised Multi-Agent Engineering IDE Powered by Switch
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="text-clay-muted hover:text-clay-ink p-1.5 rounded-clay-xs hover:bg-clay-surface-card transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="h-9 px-4 border-b border-clay-hairline flex items-center gap-2 bg-clay-canvas text-[11px] font-mono shrink-0">
          {(
            [
              { id: "overview", label: "Overview" },
              { id: "architecture", label: "Architecture & Graph" },
              { id: "agents", label: "Switch Agents" },
              { id: "deployments", label: "Cloud & APIs" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-2.5 py-1 rounded-clay-xs transition-colors cursor-pointer ${
                activeTab === tab.id
                  ? "bg-clay-surface-card font-semibold text-clay-ink border border-clay-hairline"
                  : "text-clay-muted hover:text-clay-ink"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs font-sans text-clay-ink">
          {activeTab === "overview" && (
            <div className="flex flex-col gap-3.5">
              {/* Mission Banner */}
              <div className="p-4 rounded-clay-lg bg-linear-to-r from-clay-peach/15 to-clay-surface-soft border border-clay-peach/30 flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold font-mono text-clay-ink uppercase tracking-wider flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-clay-primary" />
                    Built for WeMakeDevs Flip the Switch 2026
                  </span>
                  <div className="flex items-center gap-1.5 text-[10px] font-mono">
                    <span className="w-2 h-2 rounded-full bg-clay-success animate-pulse" />
                    <span className="text-clay-muted">Switch:</span>
                    <span className="text-clay-success font-semibold">Live (:53640)</span>
                  </div>
                </div>
                <p className="text-clay-body text-[11px] leading-relaxed">
                  Most developer AI tools run in isolated, blind terminal sessions. <strong>ShipDev flips the switch</strong> by organizing specialized autonomous agents into collaborative teammates connected via Switch incident rooms, bound by a strict cryptographic Human Approval Gate.
                </p>
              </div>

              {/* Core Feature Checklist */}
              <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                <div className="p-2.5 rounded-clay-md bg-clay-surface-card border border-clay-hairline flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-clay-success shrink-0" />
                  <span>Interactive Live Bug Graph</span>
                </div>
                <div className="p-2.5 rounded-clay-md bg-clay-surface-card border border-clay-hairline flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-clay-success shrink-0" />
                  <span>Dual Switch Agents (Triage + Verifier)</span>
                </div>
                <div className="p-2.5 rounded-clay-md bg-clay-surface-card border border-clay-hairline flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-clay-success shrink-0" />
                  <span>Isolated Subprocess Sandboxing</span>
                </div>
                <div className="p-2.5 rounded-clay-md bg-clay-surface-card border border-clay-hairline flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-clay-success shrink-0" />
                  <span>Fail-Closed Human Gate</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === "architecture" && (
            <div className="flex flex-col gap-3">
              <span className="text-[10px] font-mono uppercase font-semibold text-clay-muted">
                Multi-Agent State Lifecycle & Topological Graph
              </span>
              <div className="p-3 rounded-clay-lg bg-clay-canvas border border-clay-hairline font-mono text-[11px] leading-relaxed text-clay-body">
                <div className="text-clay-primary font-bold mb-1">Topological Hierarchy:</div>
                <div className="pl-2 space-y-1">
                  <div>📁 <strong>Layer 0:</strong> Root Project Workspace</div>
                  <div>📂 <strong>Layer 1:</strong> Project Directories (<code>src/</code>, <code>tests/</code>)</div>
                  <div>📄 <strong>Layer 2:</strong> Domain Code Files (<code>calculator.py</code>, <code>utils.py</code>)</div>
                  <div>⚡ <strong>Layer 3:</strong> Subfile AST Symbols (<code>divide()</code>, <code>evaluate()</code>)</div>
                  <div>🐛 <strong>Layer 4:</strong> Active Bug Tasks (<code>REPORTED</code> → <code>VERIFYING</code>)</div>
                  <div>🤖 <strong>Layer 5:</strong> Switch Agent Oracles (<code>shipdev-triager</code>, <code>verifier</code>)</div>
                </div>
              </div>

              <p className="text-[11px] text-clay-muted leading-relaxed">
                Click the <strong>Graph</strong> toggle in the Bug Tree sidebar or expand the full-screen canvas to visually inspect files, functions, and active defects with live topological relationships.
              </p>
            </div>
          )}

          {activeTab === "agents" && (
            <div className="flex flex-col gap-2.5">
              <div className="p-3 rounded-clay-lg bg-clay-surface-soft border border-clay-hairline flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-semibold text-clay-ink">shipdev-triager</span>
                  <span className="text-[10px] font-mono text-clay-lavender-ink bg-clay-lavender/25 px-1.5 py-0.5 rounded-clay-pill font-semibold">
                    UUID: bd717264
                  </span>
                </div>
                <p className="text-[11px] text-clay-body leading-relaxed">
                  Parses incoming incident reports, isolates affected source files, executes test reproductions in isolated scratch directories, and proposes candidate patches.
                </p>
              </div>

              <div className="p-3 rounded-clay-lg bg-clay-surface-soft border border-clay-hairline flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-semibold text-clay-ink">shipdev-verifier</span>
                  <span className="text-[10px] font-mono text-[#136149] bg-clay-mint/25 px-1.5 py-0.5 rounded-clay-pill font-semibold">
                    UUID: 7dc5d295
                  </span>
                </div>
                <p className="text-[11px] text-clay-body leading-relaxed">
                  Independent regression testing oracle. Never trusts the author agent; applies the unified diff in a clean sandbox, executes all test suites, and asserts zero regressions.
                </p>
              </div>
            </div>
          )}

          {activeTab === "deployments" && (
            <div className="flex flex-col gap-2.5 font-mono text-[11px]">
              <div className="p-3 rounded-clay-lg bg-clay-surface-soft border border-clay-hairline flex items-center justify-between">
                <div>
                  <div className="font-semibold text-clay-ink">Cloud Backend (Render)</div>
                  <div className="text-[10px] text-clay-muted">FastAPI + SQLite + State Machine</div>
                </div>
                <a
                  href="https://shipdev.onrender.com/docs"
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1 rounded-clay-sm bg-clay-ink text-white font-semibold text-[10px] flex items-center gap-1 hover:bg-neutral-800 transition-colors cursor-pointer"
                >
                  <span>API Docs</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div className="p-3 rounded-clay-lg bg-clay-surface-soft border border-clay-hairline flex items-center justify-between">
                <div>
                  <div className="font-semibold text-clay-ink">Switch Agent Bridge</div>
                  <div className="text-[10px] text-clay-muted">scripts/switch_bridge.py</div>
                </div>
                <span className="text-clay-success font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-clay-success" />
                  Connected
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="h-12 px-5 border-t border-clay-hairline flex items-center justify-between bg-clay-surface-soft shrink-0">
          <button
            onClick={copyRepoLink}
            className="flex items-center gap-1.5 text-[11px] font-mono text-clay-body hover:text-clay-ink px-2.5 py-1 rounded-clay-md hover:bg-clay-surface-card border border-clay-hairline transition-colors cursor-pointer"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-clay-success" /> : <Copy className="w-3.5 h-3.5 text-clay-muted" />}
            <span>{copiedLink ? "Link Copied!" : "Copy GitHub URL"}</span>
          </button>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-clay-md bg-clay-ink text-white font-mono text-xs font-semibold hover:bg-neutral-800 transition-colors cursor-pointer shadow-clay-soft"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

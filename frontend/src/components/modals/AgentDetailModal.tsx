"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Bot,
  ShieldCheck,
  CheckCircle2,
  Copy,
  Check,
  Terminal,
  ExternalLink,
  Cpu,
  Lock,
  Flame,
  Activity,
  FileCode,
  AlertTriangle,
} from "lucide-react";

export type AgentIdentifier =
  | "shipdev-triager"
  | "shipdev-verifier"
  | "shipdev-fixer"
  | "shipdev-researcher"
  | "shipdev-planner";

interface AgentDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentId: AgentIdentifier | null;
  switchConnected?: boolean;
}

const AGENT_CONFIGS: Record<
  AgentIdentifier,
  {
    name: string;
    title: string;
    uuid: string;
    role: string;
    color: string;
    badgeBg: string;
    badgeText: string;
    objective: string;
    instructions: string[];
    capabilities: string[];
    invariants: string[];
  }
> = {
  "shipdev-triager": {
    name: "shipdev-triager",
    title: "Incident Triager & Root Cause Diagnostician",
    uuid: "bd717264-f0ac-4651-a4da-3746ec71fa28",
    role: "Incident Analysis & Reproduction",
    color: "text-clay-lavender-ink",
    badgeBg: "bg-clay-lavender/25",
    badgeText: "text-clay-lavender-ink",
    objective:
      "Ingest reported defects, analyze stack traces, isolate target source files, and execute a sandboxed test reproduction to verify the failure before proposing a fix.",
    instructions: [
      "Read submitted bug description and stack trace from ShipDev task payload.",
      "Isolate defect location in repository source files (e.g., demo/buggy_app/calculator.py:divide).",
      "Clone repository into isolated workspace scratch directory.",
      "Execute reproduction pytest runner. Confirm authentic failure (exit code 1).",
      "Attach reproduction execution evidence to ShipDev Evidence API.",
      "Transition task status from REPORTED → TRIAGED → REPRODUCING → REPRODUCED.",
    ],
    capabilities: [
      "Subprocess sandbox runner (timeout-guarded)",
      "Source AST parsing & line-level defect mapping",
      "Automated pytest reproduction harness",
      "Cryptographic execution evidence signing",
    ],
    invariants: [
      "Never generate synthetic or simulated evidence.",
      "Cannot approve or complete tasks (human gate only).",
      "Must halt at AWAITING_HUMAN_APPROVAL.",
    ],
  },
  "shipdev-verifier": {
    name: "shipdev-verifier",
    title: "Independent Verification & Regression Oracle",
    uuid: "7dc5d295-a3c3-4168-a233-2dc9514b6ca9",
    role: "Independent Regression Testing",
    color: "text-[#136149]",
    badgeBg: "bg-clay-mint/25",
    badgeText: "text-[#136149]",
    objective:
      "Independently validate candidate patches without trusting the author agent. Executes the full regression test suite in a fresh isolated workspace and generates compliance tokens.",
    instructions: [
      "Receive candidate patch diff from FIX_PROPOSED state.",
      "Create clean isolated sandbox workspace cloned from base repository.",
      "Apply proposed patch diff using strict unidiff format.",
      "Execute complete test suite (unit tests, edge cases, integration tests).",
      "Verify zero regressions and clean exit code 0.",
      "Emit signed verification evidence record and transition task to AWAITING_HUMAN_APPROVAL.",
    ],
    capabilities: [
      "Multi-suite automated verification runner",
      "Clean-room patch application & conflict detection",
      "Test stdout/stderr capture & exit code assertion",
      "Evidence API HMAC token generator",
    ],
    invariants: [
      "Independent verification: never trusts triager's reported test results.",
      "Cannot self-approve or merge to production repository.",
      "Halts strictly before human supervisor approval.",
    ],
  },
  "shipdev-fixer": {
    name: "shipdev-fixer",
    title: "Patch Synthesis & Unified Diff Generator",
    uuid: "f1a23b45-67c8-90de-fa12-3456789abcde",
    role: "Candidate Patch Engineering",
    color: "text-clay-teal",
    badgeBg: "bg-clay-teal/15",
    badgeText: "text-clay-teal",
    objective:
      "Synthesize the minimal, idiomatic code patch to resolve the defect without breaking caller contracts, and format it as a standard unified Git diff.",
    instructions: [
      "Analyze reproduction failure logs and error assertions.",
      "Generate minimal code modification restricted to affected functions.",
      "Produce standard unified diff with line numbers and context.",
      "Handoff to independent verifier agent.",
    ],
    capabilities: [
      "Unified diff generation (difflib / git diff)",
      "AST contract verification & syntax validation",
      "Context-aware patch synthesis",
    ],
    invariants: [
      "Strict minimal blast radius: never touch unrelated files.",
      "No auto-commit permissions.",
    ],
  },
  "shipdev-researcher": {
    name: "shipdev-researcher",
    title: "Codebase & Dependency Researcher",
    uuid: "a9314de2-18bc-4672-91f8-0f01b7a2d338",
    role: "Context Analysis & Dependency Exploration",
    color: "text-clay-lavender-ink",
    badgeBg: "bg-clay-lavender/20",
    badgeText: "text-clay-lavender-ink",
    objective:
      "Explore codebase architecture, trace dependencies, and discover relevant context across repositories for complex tasks.",
    instructions: [
      "Scan codebase symbols, imports, and cross-file references.",
      "Analyze historical git blame logs and dependency versions.",
      "Provide summarized contextual evidence to fix and review agents.",
    ],
    capabilities: [
      "AST & symbol reference indexing",
      "Git commit & diff history inspection",
      "Dependency graph analysis",
    ],
    invariants: [
      "Strict read-only analysis: zero file mutation permitted.",
      "Fail-closed on unindexed external references.",
    ],
  },
  "shipdev-planner": {
    name: "shipdev-planner",
    title: "Task Workflow Planner",
    uuid: "f4281bc9-93e1-4512-8d77-c9927b841a02",
    role: "Task Decomposition & Invariant Planning",
    color: "text-clay-peach-ink",
    badgeBg: "bg-clay-peach/25",
    badgeText: "text-clay-peach-ink",
    objective:
      "Decompose complex user requests into verifiable sub-tasks and enforce sequential lifecycle state transitions.",
    instructions: [
      "Parse user task request and classify domain intent.",
      "Generate structured execution steps and assign specialist agents.",
      "Verify prerequisite stage evidence before advancing task state.",
    ],
    capabilities: [
      "DAG planning and capability mapping",
      "Lifecycle state machine coordination",
      "Human gate checkpoint scheduling",
    ],
    invariants: [
      "Never bypass required evidence checkpoints.",
      "Human gate approval mandatory for COMPLETED state.",
    ],
  },
};

export function AgentDetailModal({
  isOpen,
  onClose,
  agentId,
  switchConnected = true,
}: AgentDetailModalProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "instructions" | "safety">("overview");
  const [isCopied, setIsCopied] = useState(false);

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

  if (!isOpen || !agentId) return null;

  const agent = AGENT_CONFIGS[agentId] || AGENT_CONFIGS["shipdev-triager"];

  const copyUuid = () => {
    navigator.clipboard.writeText(agent.uuid);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="agent-detail-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm select-none animate-in fade-in duration-150"
    >
      <div className="w-full max-w-lg rounded-clay-xl bg-white border border-clay-hairline shadow-clay-elevated flex flex-col overflow-hidden text-clay-ink max-h-[85vh]">
        {/* MODAL HEADER */}
        <div className="h-14 px-4 border-b border-clay-hairline flex items-center justify-between bg-clay-surface-soft shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-9 h-9 rounded-clay-lg flex items-center justify-center ${agent.badgeBg} border border-clay-hairline shrink-0`}>
              <Bot className={`w-5 h-5 ${agent.color}`} />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <h2 id="agent-detail-title" className="text-xs font-bold font-mono text-clay-ink truncate">
                  {agent.name}
                </h2>
                <span className={`px-1.5 py-0.5 rounded-clay-xs text-[9px] font-mono font-semibold ${agent.badgeBg} ${agent.badgeText}`}>
                  {agent.role}
                </span>
              </div>
              <p className="text-[10px] text-clay-muted truncate">{agent.title}</p>
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

        {/* TABS NAVIGATION */}
        <div className="h-9 px-4 border-b border-clay-hairline flex items-center gap-2 bg-clay-canvas text-[11px] font-mono shrink-0">
          <button
            onClick={() => setActiveTab("overview")}
            className={`px-2.5 py-1 rounded-clay-xs transition-colors cursor-pointer ${
              activeTab === "overview"
                ? "bg-clay-surface-card font-semibold text-clay-ink border border-clay-hairline"
                : "text-clay-muted hover:text-clay-ink"
            }`}
          >
            Overview & Telemetry
          </button>
          <button
            onClick={() => setActiveTab("instructions")}
            className={`px-2.5 py-1 rounded-clay-xs transition-colors cursor-pointer ${
              activeTab === "instructions"
                ? "bg-clay-surface-card font-semibold text-clay-ink border border-clay-hairline"
                : "text-clay-muted hover:text-clay-ink"
            }`}
          >
            System Instructions
          </button>
          <button
            onClick={() => setActiveTab("safety")}
            className={`px-2.5 py-1 rounded-clay-xs transition-colors cursor-pointer ${
              activeTab === "safety"
                ? "bg-clay-surface-card font-semibold text-clay-ink border border-clay-hairline"
                : "text-clay-muted hover:text-clay-ink"
            }`}
          >
            Safety Boundary
          </button>
        </div>

        {/* MODAL BODY */}
        <div className="p-4 flex-1 overflow-y-auto flex flex-col gap-3.5 text-xs font-sans">
          {activeTab === "overview" && (
            <div className="flex flex-col gap-3">
              {/* Mission Statement */}
              <div className="p-3 rounded-clay-lg bg-clay-surface-soft border border-clay-hairline">
                <span className="text-[10px] font-mono uppercase font-semibold text-clay-muted block mb-1">
                  Primary Objective
                </span>
                <p className="text-clay-body leading-relaxed text-[11px]">{agent.objective}</p>
              </div>

              {/* Telemetry Grid */}
              <div className="p-3 rounded-clay-lg bg-white border border-clay-hairline shadow-clay-soft flex flex-col gap-2 font-mono text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-clay-muted">Switch Runtime:</span>
                  <span className="flex items-center gap-1.5 text-clay-success font-semibold">
                    <span className="w-2 h-2 rounded-full bg-clay-success animate-pulse" />
                    <span>Agent Controller (:53640)</span>
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-clay-muted">Incident Room ID:</span>
                  <span className="text-clay-ink text-[10px]">dbde0dcf-8adf-48f9-9d16</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-clay-muted">Agent UUID:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-clay-ink text-[10px]">{agent.uuid.slice(0, 16)}...</span>
                    <button
                      onClick={copyUuid}
                      className="p-1 rounded-clay-xs hover:bg-clay-surface-card text-clay-muted hover:text-clay-ink transition-colors cursor-pointer"
                      title="Copy UUID"
                    >
                      {isCopied ? <Check className="w-3 h-3 text-clay-success" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-clay-muted">Sandbox Isolation:</span>
                  <span className="text-clay-ink font-semibold">Subprocess Scratch Directory</span>
                </div>
              </div>

              {/* Core Capabilities */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-mono uppercase font-semibold text-clay-muted">
                  Authorized Capabilities
                </span>
                <div className="grid grid-cols-1 gap-1.5">
                  {agent.capabilities.map((cap, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 p-2 rounded-clay-md bg-clay-surface-card border border-clay-hairline font-mono text-[11px]"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-clay-success shrink-0" />
                      <span className="text-clay-body">{cap}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "instructions" && (
            <div className="flex flex-col gap-2.5">
              <span className="text-[10px] font-mono uppercase font-semibold text-clay-muted">
                Switch Agent Execution Protocol (switch/instructions/{agentId === "shipdev-verifier" ? "verifier.md" : "triager.md"})
              </span>
              <div className="flex flex-col gap-2">
                {agent.instructions.map((step, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-clay-lg bg-clay-surface-soft border border-clay-hairline flex items-start gap-2.5"
                  >
                    <span className="w-5 h-5 rounded-clay-sm bg-clay-surface-card border border-clay-hairline flex items-center justify-center font-mono text-[10px] font-bold text-clay-primary shrink-0">
                      {idx + 1}
                    </span>
                    <span className="text-[11px] text-clay-body font-mono leading-relaxed">{step}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "safety" && (
            <div className="flex flex-col gap-3">
              <div className="p-3 rounded-clay-lg bg-clay-peach/25 border border-clay-peach/50 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-clay-primary shrink-0 mt-0.5" />
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold font-mono text-clay-ink">
                    Human-in-the-Loop Governance Boundary
                  </span>
                  <p className="text-[11px] text-clay-body leading-relaxed">
                    By strict design, AI agents in ShipDev are mathematically incapable of completing code changes or merging pull requests. All candidate patches halt unconditionally at the Human Approval Gate.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-mono uppercase font-semibold text-clay-muted">
                  Enforced Invariants
                </span>
                <div className="flex flex-col gap-1.5">
                  {agent.invariants.map((inv, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 p-2 rounded-clay-md bg-white border border-clay-hairline font-mono text-[11px]"
                    >
                      <Lock className="w-3.5 h-3.5 text-clay-coral shrink-0" />
                      <span className="text-clay-body">{inv}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="h-12 px-4 border-t border-clay-hairline flex items-center justify-between bg-clay-surface-soft shrink-0">
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-clay-muted">
            <ShieldCheck className="w-3.5 h-3.5 text-clay-success" />
            <span>Cryptographically Verified Agent</span>
          </div>

          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-clay-sm bg-clay-ink text-white font-mono text-xs font-semibold hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}


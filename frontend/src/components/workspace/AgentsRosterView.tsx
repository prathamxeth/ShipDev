"use client";

import React, { useState } from "react";
import {
  Bot,
  ShieldCheck,
  Cpu,
  Terminal,
  CheckCircle2,
  FileCode,
  Wrench,
  Search,
  PenTool,
  Workflow,
  Sparkles,
} from "lucide-react";
import { AgentDetailModal, AgentIdentifier } from "@/components/modals/AgentDetailModal";

interface SpecialistAgent {
  id: AgentIdentifier;
  name: string;
  role: string;
  category: "triage" | "fix" | "verification" | "research" | "planning" | "writing";
  description: string;
  tools: string[];
  evidencePolicy: string;
  status: "Online" | "Standby";
  runtime: string;
}

interface AgentsRosterViewProps {
  activeWorkspaceType: "PERSONAL" | "TEAM";
}

export function AgentsRosterView({ activeWorkspaceType }: AgentsRosterViewProps) {
  const [selectedAgentModal, setSelectedAgentModal] = useState<AgentIdentifier | null>(null);

  const agents: SpecialistAgent[] = [
    {
      id: "shipdev-triager",
      name: "Diagnosis & Triage Assistant",
      role: "Defect Analysis & Code Localization",
      category: "triage",
      description: "Extracts stack traces, isolates affected source files, and pinpoints exact defect lines in the repository.",
      tools: ["code_search", "ast_parser", "symbol_resolver"],
      evidencePolicy: "Identifies file and line before reproduction is triggered",
      status: "Online",
      runtime: "Switch + Google Gemini Runtime",
    },
    {
      id: "shipdev-triager",
      name: "Automated Sandbox Tester",
      role: "Isolated Reproduction Runner",
      category: "triage",
      description: "Executes reproduction test commands in an isolated virtualenv sandbox without network or disk side-effects.",
      tools: ["pytest_runner", "sandbox_exec", "exit_code_capture"],
      evidencePolicy: "Mandatory reproduction confirmation (Exit Code != 0)",
      status: "Online",
      runtime: "Switch + Google Gemini Runtime",
    },
    {
      id: "shipdev-fixer",
      name: "Code Solution Fixer",
      role: "Targeted Minimal Patch Synthesis",
      category: "fix",
      description: "Generates targeted unified diff patches that repair defects without introducing regression or breaking changes.",
      tools: ["diff_generator", "patch_applier", "linter_validator"],
      evidencePolicy: "Unified diff format conforming to repository style",
      status: "Online",
      runtime: "Switch + Google Gemini Runtime",
    },
    {
      id: "shipdev-verifier",
      name: "Quality Reviewer",
      role: "Evidence Verification & Human Gate Guard",
      category: "verification",
      description: "Independently validates the patch against the test suite, enforcing the human gate review requirement.",
      tools: ["verification_runner", "diff_auditor", "evidence_signer"],
      evidencePolicy: "Exit Code 0 confirmation required for human gate transition",
      status: "Online",
      runtime: "Switch + Google Gemini Runtime",
    },
    {
      id: "shipdev-researcher",
      name: "Codebase Researcher",
      role: "Architecture & Dependency Explorer",
      category: "research",
      description: "Scans repository dependencies, imports, and documentation to build context for complex defects.",
      tools: ["dep_analyzer", "git_blame_inspector", "doc_search"],
      evidencePolicy: "Read-only non-mutating inspection",
      status: "Online",
      runtime: "Switch + Google Gemini Runtime",
    },
    {
      id: "shipdev-planner",
      name: "Task Workflow Planner",
      role: "Multi-Step Task Decomposition",
      category: "planning",
      description: "Decomposes multi-file features or complex bug reports into sequential, verifiable sub-tasks.",
      tools: ["dag_planner", "state_machine_tracker"],
      evidencePolicy: "Enforces transition order invariants",
      status: "Online",
      runtime: "Switch + Google Gemini Runtime",
    },
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-clay-canvas overflow-y-auto p-6 font-sans">
      <div className="max-w-4xl mx-auto w-full space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-clay-hairline pb-4">
          <div>
            <h1 className="text-xl font-bold text-clay-ink flex items-center gap-2">
              <Bot className="w-5 h-5 text-clay-primary" />
              <span>
                {activeWorkspaceType === "PERSONAL"
                  ? "Personal Assistant Specialists"
                  : "Organization Autonomous Team"}
              </span>
            </h1>
            <p className="text-xs text-clay-body mt-1">
              Autonomous engineering agents orchestrated via Switch runtime with strict human-in-the-loop oversight.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-clay-pill bg-clay-mint/20 text-[#136149] font-medium border border-clay-mint/40 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-clay-success animate-pulse" />
              <span>Switch Bridge Live</span>
            </span>
          </div>
        </div>

        {/* Agents Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {agents.map((agent, index) => (
            <div
              key={`${agent.id}-${index}`}
              onClick={() => setSelectedAgentModal(agent.id)}
              className="p-4 rounded-clay-lg bg-white border border-clay-hairline shadow-clay-soft hover:shadow-clay-card cursor-pointer transition-all flex flex-col justify-between gap-3 group"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-clay-md bg-clay-primary/10 border border-clay-primary/30 flex items-center justify-center text-clay-primary">
                      <Cpu className="w-4 h-4" />
                    </span>
                    <div>
                      <h3 className="font-bold text-xs text-clay-ink group-hover:text-clay-primary transition-colors">
                        {agent.name}
                      </h3>
                      <span className="text-[10px] text-clay-muted">{agent.role}</span>
                    </div>
                  </div>

                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-clay-pill bg-clay-mint/15 text-[#136149] font-medium border border-clay-mint/30">
                    {agent.status}
                  </span>
                </div>

                <p className="text-xs text-clay-body leading-relaxed mt-2">
                  {agent.description}
                </p>
              </div>

              <div className="pt-2.5 border-t border-clay-hairline flex flex-col gap-1.5 text-xs">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-clay-muted">Evidence Policy:</span>
                  <span className="font-semibold text-clay-ink">{agent.evidencePolicy}</span>
                </div>

                <div className="flex items-center justify-between text-[10px] pt-1">
                  <span className="text-clay-muted">Runtime:</span>
                  <span className="font-mono text-clay-primary">{agent.runtime}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Modal */}
        <AgentDetailModal
          isOpen={Boolean(selectedAgentModal)}
          onClose={() => setSelectedAgentModal(null)}
          agentId={selectedAgentModal}
          switchConnected={true}
        />
      </div>
    </div>
  );
}


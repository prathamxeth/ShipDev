"use client";

import React, { useState } from "react";
import {
  FolderGit2,
  GitBranch,
  GitCommit,
  CheckCircle2,
  Clock,
  Layers,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  Code2,
} from "lucide-react";

interface ProjectsViewProps {
  onOpenStudio: () => void;
  onSelectBranch?: (branch: string) => void;
}

export function ProjectsView({ onOpenStudio, onSelectBranch }: ProjectsViewProps) {
  const [selectedRepo, setSelectedRepo] = useState<string>("demo-calculator");

  const repos = [
    {
      id: "demo-calculator",
      name: "demo-calculator",
      desc: "Financial calculation and arithmetic utility services with Switch sandbox verification suite",
      defaultBranch: "main",
      branches: ["main", "feature/pratham-frontend", "feature/ayush-backend", "feature/sumit-switch"],
      status: "Synced with GitHub",
      activeTasks: 1,
      lastCommit: {
        hash: "b145d96",
        message: "feat: Strict Personal and Team workspace isolation with audit trail",
        time: "10 mins ago",
        author: "pratham",
      },
    },
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-clay-canvas overflow-y-auto p-6 font-sans">
      <div className="max-w-4xl mx-auto w-full space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-clay-hairline pb-4">
          <div>
            <h1 className="text-xl font-bold text-clay-ink flex items-center gap-2">
              <FolderGit2 className="w-5 h-5 text-clay-primary" />
              <span>Projects &amp; Repositories</span>
            </h1>
            <p className="text-xs text-clay-body mt-1">
              Organization code repositories connected to ShipDev autonomous engineering workflows.
            </p>
          </div>

          <button
            onClick={onOpenStudio}
            className="px-3 py-1.5 rounded-clay-md bg-clay-primary hover:bg-clay-primary-active text-white text-xs font-semibold cursor-pointer transition-colors shadow-clay-soft flex items-center gap-1.5"
          >
            <Layers className="w-4 h-4" />
            <span>Open Engineering Studio</span>
          </button>
        </div>

        {/* Repositories Grid */}
        <div className="space-y-4">
          {repos.map((repo) => (
            <div
              key={repo.id}
              className="p-5 rounded-clay-lg bg-white border border-clay-hairline shadow-clay-soft flex flex-col gap-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-clay-md bg-clay-primary/10 border border-clay-primary/30 flex items-center justify-center text-clay-primary">
                      <Code2 className="w-4 h-4" />
                    </span>
                    <h2 className="text-sm font-bold text-clay-ink">{repo.name}</h2>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-clay-pill bg-clay-mint/20 text-[#136149] font-medium border border-clay-mint/40">
                      {repo.status}
                    </span>
                  </div>
                  <p className="text-xs text-clay-body mt-2 max-w-xl leading-relaxed">
                    {repo.desc}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={onOpenStudio}
                    className="px-3 py-1.5 rounded-clay-md bg-clay-surface-soft hover:bg-clay-surface-card border border-clay-hairline text-xs font-medium text-clay-ink cursor-pointer transition-colors shadow-clay-soft flex items-center gap-1.5"
                  >
                    <span>Browse Files</span>
                    <ArrowRight className="w-3.5 h-3.5 text-clay-primary" />
                  </button>
                </div>
              </div>

              {/* Branches Section */}
              <div className="p-3.5 rounded-clay-md bg-clay-surface-soft border border-clay-hairline flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-clay-ink flex items-center gap-1.5">
                    <GitBranch className="w-3.5 h-3.5 text-clay-teal" />
                    <span>Synchronized Branches</span>
                  </span>
                  <span className="text-[10px] text-clay-muted font-mono">
                    Default: {repo.defaultBranch}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {repo.branches.map((b) => (
                    <button
                      key={b}
                      onClick={() => onSelectBranch && onSelectBranch(b)}
                      className={`px-2.5 py-1 rounded-clay-pill text-xs font-mono transition-colors flex items-center gap-1.5 cursor-pointer ${
                        b === "main" || b === "feature/pratham-frontend"
                          ? "bg-white text-clay-ink border border-clay-hairline shadow-xs font-semibold"
                          : "bg-clay-surface-card text-clay-muted hover:text-clay-ink border border-clay-hairline/60"
                      }`}
                    >
                      <GitBranch className="w-3 h-3 text-clay-primary" />
                      <span>{b}</span>
                      {b === "main" && (
                        <span className="text-[9px] px-1 rounded-clay-xs bg-clay-primary/10 text-clay-primary font-bold">
                          default
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Commit & Pipeline Verification Status */}
              <div className="flex items-center justify-between text-xs pt-1 border-t border-clay-hairline text-clay-muted">
                <div className="flex items-center gap-2 font-mono text-[11px]">
                  <GitCommit className="w-3.5 h-3.5 text-clay-primary" />
                  <span className="font-semibold text-clay-ink">{repo.lastCommit.hash}</span>
                  <span className="truncate max-w-md text-clay-body">
                    {repo.lastCommit.message}
                  </span>
                  <span>({repo.lastCommit.time})</span>
                </div>

                <div className="flex items-center gap-1.5 text-[#136149] font-medium text-[11px]">
                  <ShieldCheck className="w-3.5 h-3.5 text-clay-mint-ink" />
                  <span>Human Gate Supervised</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


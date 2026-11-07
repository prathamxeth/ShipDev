"use client";

import React, { useState, useMemo } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileCode,
  Folder,
  FolderOpen,
  Search,
  X,
  Plus,
  ShieldAlert,
  AlertCircle,
  Clock,
  Lock,
  CheckCircle2,
  Bug,
  RefreshCw,
  GitBranch,
  Bot,
  Check,
  Files,
  Maximize2,
  Network,
} from "lucide-react";
import { Task, TaskStatus } from "@/types";
import { resolveBugLocation, ResolvedBugLocation, WorkspaceFile } from "@/lib/workspaceFiles";
import { ActivityTab } from "@/components/layout/LeftActivityBar";
import { BugGraphCanvas } from "./BugGraphCanvas";

interface BugTreeProps {
  tasks: Task[];
  selectedTaskId: string | null;
  activeFileName: string;
  activeActivityTab: ActivityTab;
  workspaceFiles: Record<string, WorkspaceFile>;
  onSelectBug: (task: Task, fileName: string, lineNumber: number) => void;
  onSelectFile: (fileName: string) => void;
  onNavigateToLine: (fileName: string, lineNumber: number) => void;
  onCreateFile?: (fileName: string) => void;
  onSelectAgent?: (agentId: "shipdev-triager" | "shipdev-verifier") => void;
  isLoading: boolean;
  onNewBugClick: () => void;
  onRefreshClick?: () => void;
  onSwitchToGraphView?: () => void;
}

interface TreeNode {
  id: string;
  name: string;
  type: "folder" | "file";
  path: string;
  fileName?: string;
  children?: TreeNode[];
  bugs?: Array<{
    task: Task;
    location: ResolvedBugLocation;
  }>;
}

export function BugTree({
  tasks,
  selectedTaskId,
  activeFileName,
  activeActivityTab,
  workspaceFiles,
  onSelectBug,
  onSelectFile,
  onNavigateToLine,
  onCreateFile,
  onSelectAgent,
  isLoading,
  onNewBugClick,
  onRefreshClick,
  onSwitchToGraphView,
}: BugTreeProps) {
  const [viewMode, setViewMode] = useState<"tree" | "graph">("tree");
  const [isGraphEnlarged, setIsGraphEnlarged] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "active" | "awaiting" | "resolved">("all");
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    root: true,
    demo: true,
    buggy_app: true,
    tests: true,
    backend: false,
    scripts: false,
  });

  // Explorer New File state
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [newFileNameInput, setNewFileNameInput] = useState("");

  // Source Control commit message
  const [gitCommitMessage, setGitCommitMessage] = useState("");
  const [committedCount, setCommittedCount] = useState(0);

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [folderId]: !prev[folderId],
    }));
  };

  // Map each task to its target file and line
  const mappedTasks = useMemo(() => {
    return tasks.map((task) => ({
      task,
      location: resolveBugLocation(task),
    }));
  }, [tasks]);

  // Filter tasks by category and search query
  const filteredMappedTasks = useMemo(() => {
    return mappedTasks.filter(({ task, location }) => {
      if (filterMode === "awaiting" && task.status !== "AWAITING_HUMAN_APPROVAL") return false;
      if (
        filterMode === "active" &&
        ["APPROVED", "COMPLETED", "REJECTED", "FAILED"].includes(task.status)
      ) {
        return false;
      }
      if (
        filterMode === "resolved" &&
        !["APPROVED", "COMPLETED"].includes(task.status)
      ) {
        return false;
      }

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        task.title.toLowerCase().includes(q) ||
        task.id.toLowerCase().includes(q) ||
        location.fileName.toLowerCase().includes(q) ||
        location.symbolName.toLowerCase().includes(q) ||
        location.severity.toLowerCase().includes(q)
      );
    });
  }, [mappedTasks, filterMode, searchQuery]);

  // Build hierarchical folder/file tree with real attached bugs
  const tree: TreeNode = useMemo(() => {
    const bugsForFile = (fileName: string) => {
      return filteredMappedTasks.filter((m) => m.location.fileName === fileName);
    };

    return {
      id: "root",
      name: "ShipDev Workspace",
      type: "folder",
      path: "",
      children: [
        {
          id: "demo",
          name: "demo",
          type: "folder",
          path: "demo",
          children: [
            {
              id: "buggy_app",
              name: "buggy_app",
              type: "folder",
              path: "demo/buggy_app",
              children: [
                {
                  id: "calculator.py",
                  name: "calculator.py",
                  type: "file",
                  fileName: "calculator.py",
                  path: "demo/buggy_app/calculator.py",
                  bugs: bugsForFile("calculator.py"),
                },
              ],
            },
            {
              id: "tests",
              name: "tests",
              type: "folder",
              path: "demo/tests",
              children: [
                {
                  id: "test_calculator.py",
                  name: "test_calculator.py",
                  type: "file",
                  fileName: "test_calculator.py",
                  path: "demo/tests/test_calculator.py",
                  bugs: bugsForFile("test_calculator.py"),
                },
              ],
            },
          ],
        },
        {
          id: "backend",
          name: "backend",
          type: "folder",
          path: "backend",
          children: [
            {
              id: "app_core",
              name: "app/core",
              type: "folder",
              path: "backend/app/core",
              children: [
                {
                  id: "state_machine.py",
                  name: "state_machine.py",
                  type: "file",
                  fileName: "state_machine.py",
                  path: "backend/app/core/state_machine.py",
                  bugs: bugsForFile("state_machine.py"),
                },
              ],
            },
            {
              id: "app_api",
              name: "app/api",
              type: "folder",
              path: "backend/app/api",
              children: [
                {
                  id: "tasks.py",
                  name: "tasks.py",
                  type: "file",
                  fileName: "tasks.py",
                  path: "backend/app/api/v1/tasks.py",
                  bugs: bugsForFile("tasks.py"),
                },
              ],
            },
          ],
        },
        {
          id: "scripts",
          name: "scripts",
          type: "folder",
          path: "scripts",
          children: [
            {
              id: "switch_bridge.py",
              name: "switch_bridge.py",
              type: "file",
              fileName: "switch_bridge.py",
              path: "scripts/switch_bridge.py",
              bugs: bugsForFile("switch_bridge.py"),
            },
          ],
        },
      ],
    };
  }, [filteredMappedTasks]);

  // Recursively calculate bug count inside a node
  const countBugsInNode = (node: TreeNode): number => {
    let count = node.bugs ? node.bugs.length : 0;
    if (node.children) {
      for (const child of node.children) {
        count += countBugsInNode(child);
      }
    }
    return count;
  };

  const getStatusBadge = (status: TaskStatus) => {
    switch (status) {
      case "AWAITING_HUMAN_APPROVAL":
        return {
          label: "Awaiting Approval",
          classes: "bg-clay-peach/25 text-clay-peach-ink border-clay-peach/50 font-semibold",
          icon: <Lock className="w-2.5 h-2.5 text-clay-peach-ink" />,
        };
      case "REPRODUCING":
        return {
          label: "Reproducing",
          classes: "bg-clay-lavender/30 text-clay-lavender-ink border-clay-lavender/60 font-medium",
          icon: <RefreshCw className="w-2.5 h-2.5 text-clay-lavender-ink animate-spin" />,
        };
      case "REPRODUCED":
        return {
          label: "Reproduced",
          classes: "bg-clay-lavender/25 text-clay-lavender-ink border-clay-lavender/50 font-medium",
          icon: <Bug className="w-2.5 h-2.5 text-clay-lavender-ink" />,
        };
      case "FIX_PROPOSED":
        return {
          label: "Fix Proposed",
          classes: "bg-clay-teal/15 text-clay-teal border-clay-teal/30 font-medium",
          icon: <AlertCircle className="w-2.5 h-2.5 text-clay-teal" />,
        };
      case "VERIFYING":
        return {
          label: "Verifying",
          classes: "bg-clay-peach/25 text-clay-peach-ink border-clay-peach/40 font-medium",
          icon: <RefreshCw className="w-2.5 h-2.5 text-clay-peach-ink animate-spin" />,
        };
      case "APPROVED":
        return {
          label: "Approved",
          classes: "bg-clay-mint/25 text-clay-mint-ink border-clay-mint/50 font-semibold",
          icon: <CheckCircle2 className="w-2.5 h-2.5 text-clay-mint-ink" />,
        };
      case "COMPLETED":
        return {
          label: "Completed",
          classes: "bg-clay-mint/25 text-clay-mint-ink border-clay-mint/50 font-semibold",
          icon: <CheckCircle2 className="w-2.5 h-2.5 text-clay-mint-ink" />,
        };
      default:
        return {
          label: status,
          classes: "bg-clay-surface-card text-clay-muted border-clay-hairline font-medium",
          icon: <Clock className="w-2.5 h-2.5 text-clay-muted" />,
        };
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "Critical":
        return {
          dot: "bg-clay-pink",
          text: "text-clay-pink-ink font-semibold",
          bg: "bg-clay-pink/15 border-clay-pink/30",
        };
      case "High":
        return {
          dot: "bg-clay-coral",
          text: "text-clay-coral-ink font-semibold",
          bg: "bg-clay-coral/15 border-clay-coral/30",
        };
      case "Medium":
        return {
          dot: "bg-clay-ochre",
          text: "text-clay-ochre-ink font-semibold",
          bg: "bg-clay-ochre/25 border-clay-ochre/40",
        };
      default:
        return {
          dot: "bg-clay-mint",
          text: "text-clay-mint-ink font-semibold",
          bg: "bg-clay-mint/20 border-clay-mint/40",
        };
    }
  };

  // Search in Codebase Results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    const results: Array<{ file: string; line: number; text: string }> = [];

    Object.entries(workspaceFiles).forEach(([fileName, fileObj]) => {
      const lines = fileObj.code.split("\n");
      lines.forEach((lineText, idx) => {
        if (lineText.toLowerCase().includes(q)) {
          results.push({
            file: fileName,
            line: idx + 1,
            text: lineText.trim(),
          });
        }
      });
    });

    return results;
  }, [searchQuery, workspaceFiles]);

  const awaitingCount = tasks.filter((t) => t.status === "AWAITING_HUMAN_APPROVAL").length;

  return (
    <div className="flex flex-col h-full bg-clay-surface-soft border-r border-clay-hairline select-none text-xs text-clay-ink">
      {/* ========================================================================= */}
      {/* 1. BUG TREE VIEW */}
      {/* ========================================================================= */}
      {activeActivityTab === "bugtree" && (
        <>
          <div className="h-9 px-3 flex items-center justify-between border-b border-clay-hairline bg-clay-canvas">
            <div className="flex items-center gap-2">
              <Bug className="w-3.5 h-3.5 text-clay-primary" />
              <span className="font-semibold text-clay-ink tracking-wide uppercase text-[11px] font-sans">
                Active Issues
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-clay-pill bg-clay-surface-card text-clay-muted border border-clay-hairline">
                {tasks.length}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {/* View Switcher Pills */}
              <div className="flex items-center gap-0.5 bg-clay-surface-card p-0.5 rounded-clay-pill border border-clay-hairline">
                <button
                  onClick={() => setViewMode("tree")}
                  className={`px-2 py-0.5 rounded-clay-pill text-[10px] font-sans transition-colors cursor-pointer ${
                    viewMode === "tree"
                      ? "bg-white font-semibold text-clay-ink shadow-clay-soft"
                      : "text-clay-muted hover:text-clay-ink"
                  }`}
                >
                  Tree
                </button>
                <button
                  onClick={() => {
                    if (onSwitchToGraphView) {
                      onSwitchToGraphView();
                    } else {
                      setViewMode("graph");
                    }
                  }}
                  className={`px-2 py-0.5 rounded-clay-pill text-[10px] font-sans transition-colors cursor-pointer ${
                    viewMode === "graph"
                      ? "bg-white font-semibold text-clay-primary shadow-clay-soft"
                      : "text-clay-muted hover:text-clay-ink"
                  }`}
                >
                  Graph
                </button>
              </div>

              {/* Enlarge Graph View */}
              <button
                onClick={() => {
                  if (onSwitchToGraphView) {
                    onSwitchToGraphView();
                  } else {
                    setIsGraphEnlarged(true);
                  }
                }}
                title="View Full Architecture Map"
                className="p-1 rounded-clay-md text-clay-muted hover:text-clay-primary hover:bg-clay-surface-card transition-colors cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>

              {awaitingCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-clay-pill bg-clay-peach/25 border border-clay-peach/50 text-[#9a4b18] font-mono text-[9px] font-semibold flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5 text-[#9a4b18]" />
                  <span>{awaitingCount}</span>
                </span>
              )}

              <button
                onClick={onNewBugClick}
                title="Report Issue"
                className="p-1 rounded-clay-md text-clay-muted hover:text-clay-ink hover:bg-clay-surface-card transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* VIEW MODE: GRAPH VS TREE */}
          {viewMode === "graph" ? (
            <div className="flex-1 min-h-0 relative">
              <BugGraphCanvas
                tasks={tasks}
                selectedTaskId={selectedTaskId}
                activeFileName={activeFileName}
                workspaceFiles={workspaceFiles}
                onSelectBug={onSelectBug}
                onSelectFile={onSelectFile}
                onNavigateToLine={onNavigateToLine}
                onSelectAgent={onSelectAgent}
                compact={true}
                onToggleEnlarge={() => setIsGraphEnlarged(true)}
              />
            </div>
          ) : (
            <>
              {/* Search Input & Filter Chips */}
              <div className="p-2 border-b border-clay-hairline bg-clay-surface-soft">
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white rounded-clay-md border border-clay-hairline shadow-clay-soft transition-colors">
                  <Search className="w-3.5 h-3.5 text-clay-muted shrink-0" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search issues, files..."
                    aria-label="Filter issues and files"
                    style={{ outline: "none", boxShadow: "none" }}
                    className="w-full bg-transparent outline-none border-none ring-0 focus:outline-none focus:ring-0 text-[11px] text-clay-ink placeholder-clay-muted font-sans"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      aria-label="Clear filter query"
                      className="text-clay-muted hover:text-clay-ink cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5 mt-2 overflow-x-auto scrollbar-none" role="group" aria-label="Bug status filter">
                  {(
                    [
                      { id: "all", label: "All" },
                      { id: "active", label: "In Progress" },
                      { id: "awaiting", label: "Needs Review" },
                      { id: "resolved", label: "Resolved" },
                    ] as const
                  ).map((chip) => (
                    <button
                      key={chip.id}
                      onClick={() => setFilterMode(chip.id)}
                      aria-pressed={filterMode === chip.id}
                      className={`px-2.5 py-0.5 rounded-clay-pill text-[10px] font-sans transition-colors cursor-pointer whitespace-nowrap ${
                        filterMode === chip.id
                          ? "bg-clay-primary text-white font-medium shadow-clay-soft"
                          : "bg-clay-surface-card text-clay-muted hover:text-clay-ink hover:bg-clay-surface-strong border border-clay-hairline"
                      }`}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bug Tree Body */}
              <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 font-sans text-[11px]">
                {isLoading && (
                  <div className="p-4 text-center text-clay-muted font-sans text-xs flex items-center justify-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-clay-primary" />
                    <span>Loading issues...</span>
                  </div>
                )}
                {tree.children?.map((child) => renderTreeNode(child, 0))}
              </div>
            </>
          )}
        </>
      )}

      {/* ========================================================================= */}
      {/* 2. DEDICATED ARCHITECTURE MAP SIDEBAR NAVIGATOR */}
      {/* ========================================================================= */}
      {activeActivityTab === "graph" && (
        <div className="flex-1 min-h-0 relative flex flex-col h-full bg-clay-surface-soft">
          <div className="h-9 px-3 flex items-center justify-between border-b border-clay-hairline bg-clay-canvas">
            <div className="flex items-center gap-2">
              <Network className="w-3.5 h-3.5 text-clay-primary" />
              <span className="font-semibold text-clay-ink tracking-wide uppercase text-[11px] font-sans">
                Architecture Map
              </span>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-clay-pill bg-clay-mint/20 text-[#136149] font-medium border border-clay-mint/40">
              Active
            </span>
          </div>

          <div className="p-3 border-b border-clay-hairline bg-white">
            <p className="text-[11px] text-clay-body leading-relaxed font-sans">
              System architecture map is displayed in the main workspace. Select any file or defect below to inspect its code.
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1 font-sans text-xs">
            <div className="text-[10px] font-semibold text-clay-muted uppercase tracking-wider px-1 py-1">
              Codebase Files (4)
            </div>
            {Object.entries(workspaceFiles).map(([fileName, fileObj]) => (
              <div
                key={fileName}
                onClick={() => onSelectFile(fileName)}
                className={`flex items-center justify-between px-2.5 py-2 rounded-clay-md cursor-pointer transition-colors ${
                  activeFileName === fileName
                    ? "bg-white text-clay-ink border border-clay-hairline font-semibold shadow-clay-soft"
                    : "text-clay-body hover:bg-white hover:text-clay-ink"
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <FileCode className="w-3.5 h-3.5 text-clay-primary shrink-0" />
                  <span className="truncate">{fileName}</span>
                </div>
                <span className="text-[10px] text-clay-muted font-mono">
                  {fileObj.code.split("\n").length}L
                </span>
              </div>
            ))}

            <div className="text-[10px] font-semibold text-clay-muted uppercase tracking-wider px-1 pt-3 pb-1">
              Active Issues ({tasks.length})
            </div>
            {tasks.map((task) => (
              <div
                key={task.id}
                onClick={() => {
                  const loc = resolveBugLocation(task);
                  onSelectBug(task, loc.fileName, loc.lineNumber);
                }}
                className="p-2.5 rounded-clay-md bg-white hover:bg-clay-surface-card border border-clay-hairline cursor-pointer transition-colors shadow-clay-soft flex flex-col gap-1"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-clay-ink truncate">
                    {task.title}
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-clay-pill bg-clay-pink/20 text-clay-pink-ink font-semibold">
                    Issue
                  </span>
                </div>
                <span className="text-[10px] text-clay-muted">
                  Click to open code line
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. FILE EXPLORER VIEW */}
      {/* ========================================================================= */}
      {activeActivityTab === "explorer" && (
        <>
          <div className="h-9 px-3 flex items-center justify-between border-b border-clay-hairline bg-clay-canvas">
            <div className="flex items-center gap-2">
              <Files className="w-3.5 h-3.5 text-clay-primary" />
              <span className="font-semibold text-clay-ink tracking-wide uppercase text-[11px]">
                Explorer
              </span>
            </div>
            <button
              onClick={() => setIsCreatingFile(true)}
              title="Create New File"
              className="p-1 rounded-clay-md text-clay-muted hover:text-clay-ink hover:bg-clay-surface-card transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 font-mono text-xs">
            {isCreatingFile && (
              <div className="p-1.5 flex items-center gap-1.5 bg-white rounded-clay-md border border-clay-primary shadow-clay-soft mb-1">
                <FileCode className="w-3.5 h-3.5 text-clay-muted shrink-0" />
                <input
                  type="text"
                  value={newFileNameInput}
                  onChange={(e) => setNewFileNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newFileNameInput.trim()) {
                      if (onCreateFile) onCreateFile(newFileNameInput.trim());
                      setIsCreatingFile(false);
                      setNewFileNameInput("");
                    } else if (e.key === "Escape") {
                      setIsCreatingFile(false);
                      setNewFileNameInput("");
                    }
                  }}
                  placeholder="filename.py"
                  autoFocus
                  className="w-full bg-transparent outline-none text-xs text-clay-ink font-mono placeholder-clay-muted"
                />
                <button
                  onClick={() => {
                    if (newFileNameInput.trim() && onCreateFile) {
                      onCreateFile(newFileNameInput.trim());
                    }
                    setIsCreatingFile(false);
                    setNewFileNameInput("");
                  }}
                  className="p-0.5 text-clay-success hover:text-clay-success cursor-pointer"
                >
                  <Check className="w-3 h-3" />
                </button>
                <button
                  onClick={() => {
                    setIsCreatingFile(false);
                    setNewFileNameInput("");
                  }}
                  className="p-0.5 text-clay-muted hover:text-clay-ink cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {Object.entries(workspaceFiles).map(([fileName, fileObj]) => {
              const isCurrent = activeFileName === fileName;
              const isModified = fileObj.modified;
              const lineCount = fileObj.code.split("\n").length;

              return (
                <div
                  key={fileName}
                  onClick={() => onSelectFile(fileName)}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-clay-md cursor-pointer transition-colors ${
                    isCurrent
                      ? "bg-white text-clay-ink border border-clay-hairline font-medium shadow-clay-soft"
                      : "text-clay-body hover:bg-clay-surface-card hover:text-clay-ink"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <FileCode
                      className={`w-3.5 h-3.5 shrink-0 ${
                        isCurrent ? "text-clay-primary" : isModified ? "text-clay-ochre" : "text-clay-muted"
                      }`}
                    />
                    <span className="truncate">{fileName}</span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 font-mono text-[10px]">
                    <span className="text-clay-muted">{lineCount}L</span>
                    {isModified && (
                      <span className="text-[#946200] bg-clay-ochre/20 px-1.5 rounded-clay-sm border border-clay-ochre/30">
                        M
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* 3. CODEBASE SEARCH VIEW */}
      {/* ========================================================================= */}
      {activeActivityTab === "search" && (
        <>
          <div className="h-9 px-3 flex items-center justify-between border-b border-clay-hairline bg-clay-canvas">
            <div className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-clay-primary" />
              <span className="font-semibold text-clay-ink tracking-wide uppercase text-[11px]">
                Search Codebase
              </span>
            </div>
            <span className="text-[10px] font-mono text-clay-muted">
              {searchResults.length} matches
            </span>
          </div>

          <div className="p-2 border-b border-clay-hairline bg-clay-surface-soft">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white rounded-clay-md border border-clay-hairline focus-within:border-clay-primary shadow-clay-soft">
              <Search className="w-3.5 h-3.5 text-clay-muted shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search functions, tokens, lines..."
                autoFocus
                className="w-full bg-transparent outline-none text-xs text-clay-ink placeholder-clay-muted font-mono"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="text-clay-muted hover:text-clay-ink cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-1.5 space-y-1 font-mono text-[11px]">
            {searchResults.map((res, idx) => (
              <div
                key={idx}
                onClick={() => onNavigateToLine(res.file, res.line)}
                className="p-2 rounded-clay-md hover:bg-white border border-transparent hover:border-clay-hairline cursor-pointer transition-colors group shadow-clay-soft"
              >
                <div className="flex items-center justify-between text-clay-body group-hover:text-clay-primary">
                  <span className="font-semibold text-xs text-clay-ink">{res.file}</span>
                  <span className="text-[10px] text-clay-muted">Ln {res.line}</span>
                </div>
                <div className="text-clay-muted group-hover:text-clay-body truncate text-[11px] mt-0.5 font-mono">
                  {res.text}
                </div>
              </div>
            ))}
            {searchQuery && searchResults.length === 0 && (
              <div className="p-4 text-center text-xs text-clay-muted">
                No matching code found across workspace files.
              </div>
            )}
            {!searchQuery && (
              <div className="p-4 text-center text-clay-muted text-[11px]">
                Type a symbol name to search across the codebase.
              </div>
            )}
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* 4. SOURCE CONTROL VIEW */}
      {/* ========================================================================= */}
      {activeActivityTab === "git" && (
        <>
          <div className="h-9 px-3 flex items-center justify-between border-b border-clay-hairline bg-clay-canvas">
            <div className="flex items-center gap-2">
              <GitBranch className="w-3.5 h-3.5 text-clay-primary" />
              <span className="font-semibold text-clay-ink tracking-wide uppercase text-[11px]">
                Source Control
              </span>
            </div>
            <span className="text-[10px] font-mono text-clay-primary font-medium">
              main
            </span>
          </div>

          <div className="p-2 border-b border-clay-hairline space-y-2 bg-clay-surface-soft">
            <input
              type="text"
              value={gitCommitMessage}
              onChange={(e) => setGitCommitMessage(e.target.value)}
              placeholder="Commit message (⌘Enter)..."
              style={{ outline: "none", boxShadow: "none" }}
              className="w-full px-2.5 py-1.5 rounded-clay-md bg-white border border-clay-hairline text-xs font-mono text-clay-ink placeholder-clay-muted outline-none focus:outline-none focus:ring-0 shadow-clay-soft"
            />
            <button
              onClick={() => {
                if (gitCommitMessage.trim()) {
                  setCommittedCount((prev) => prev + 1);
                  setGitCommitMessage("");
                }
              }}
              disabled={!gitCommitMessage.trim()}
              className="w-full py-1.5 rounded-clay-md bg-clay-primary hover:bg-clay-primary-active text-white disabled:opacity-40 text-xs font-mono font-medium cursor-pointer transition-colors shadow-clay-soft"
            >
              Commit to branch ({committedCount})
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 font-mono text-xs">
            <div className="text-[10px] font-semibold text-clay-muted uppercase tracking-wider px-2 py-1">
              Modified Files (1)
            </div>
            <div
              onClick={() => onSelectFile("calculator.py")}
              className="flex items-center justify-between px-2.5 py-1.5 rounded-clay-md hover:bg-white border border-transparent hover:border-clay-hairline cursor-pointer transition-colors text-clay-ink shadow-clay-soft"
            >
              <div className="flex items-center gap-2 truncate">
                <FileCode className="w-3.5 h-3.5 text-clay-ochre shrink-0" />
                <span className="truncate">calculator.py</span>
              </div>
              <span className="text-[10px] text-[#946200] font-mono px-1.5 rounded-clay-sm bg-clay-ochre/20 border border-clay-ochre/30">
                M
              </span>
            </div>
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* 5. SWITCH AGENTS VIEW */}
      {/* ========================================================================= */}
      {activeActivityTab === "agents" && (
        <>
          <div className="h-9 px-3 flex items-center justify-between border-b border-clay-hairline bg-clay-canvas">
            <div className="flex items-center gap-2">
              <Bot className="w-3.5 h-3.5 text-clay-primary" />
              <span className="font-semibold text-clay-ink tracking-wide uppercase text-[11px]">
                Switch Agents
              </span>
            </div>
            <span className="text-[10px] font-mono text-clay-success font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-clay-success animate-pulse" />
              Online
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-2 font-mono text-xs">
            <div className="p-2.5 rounded-clay-lg bg-white border border-clay-hairline shadow-clay-soft flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-clay-ink font-semibold">shipdev-triager</span>
                <span className="text-[10px] text-clay-teal font-medium bg-clay-teal/10 px-1.5 py-0.5 rounded-clay-pill">
                  Triage
                </span>
              </div>
              <span className="text-[10px] text-clay-muted">UUID: bd717264-f0ac-4651</span>
            </div>

            <div className="p-2.5 rounded-clay-lg bg-white border border-clay-hairline shadow-clay-soft flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-clay-ink font-semibold">Reproduction Agent</span>
                <span className="text-[10px] text-clay-lavender font-medium bg-clay-lavender/25 px-1.5 py-0.5 rounded-clay-pill">
                  Sandbox
                </span>
              </div>
              <span className="text-[10px] text-clay-muted">pytest isolated runner</span>
            </div>

            <div className="p-2.5 rounded-clay-lg bg-white border border-clay-hairline shadow-clay-soft flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-clay-ink font-semibold">shipdev-verifier</span>
                <span className="text-[10px] text-[#136149] font-medium bg-clay-mint/25 px-1.5 py-0.5 rounded-clay-pill">
                  Verifier
                </span>
              </div>
              <span className="text-[10px] text-clay-muted">UUID: 7dc5d295-a3c3-4168</span>
            </div>
          </div>
        </>
      )}

      {/* Footer Status */}
      <div className="h-7 px-3 border-t border-clay-hairline bg-clay-canvas flex items-center justify-between text-[10px] font-mono text-clay-muted shrink-0">
        <span>Workspace Sync</span>
        <span className="text-clay-success font-semibold flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-clay-success" />
          Live
        </span>
      </div>

      {/* ENLARGED GRAPH MODAL */}
      {isGraphEnlarged && (
        <BugGraphCanvas
          tasks={tasks}
          selectedTaskId={selectedTaskId}
          activeFileName={activeFileName}
          workspaceFiles={workspaceFiles}
          onSelectBug={onSelectBug}
          onSelectFile={onSelectFile}
          onNavigateToLine={onNavigateToLine}
          onSelectAgent={onSelectAgent}
          isEnlarged={true}
          onToggleEnlarge={() => setIsGraphEnlarged(false)}
        />
      )}
    </div>
  );

  function renderTreeNode(node: TreeNode, depth: number) {
    const isFolder = node.type === "folder";
    const isExpanded = expandedFolders[node.id] ?? false;
    const bugCount = countBugsInNode(node);
    const isCurrentFile = !isFolder && node.fileName === activeFileName;

    return (
      <div key={node.id} className="flex flex-col">
        {/* Node Label Row */}
        <div
          role="button"
          tabIndex={0}
          aria-expanded={isFolder ? isExpanded : undefined}
          onClick={() => {
            if (isFolder) {
              toggleFolder(node.id);
            } else if (node.fileName) {
              onSelectFile(node.fileName);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (isFolder) {
                toggleFolder(node.id);
              } else if (node.fileName) {
                onSelectFile(node.fileName);
              }
            }
          }}
          style={{ paddingLeft: `${depth * 14 + 6}px` }}
          className={`group flex items-center justify-between py-1 px-2 rounded-clay-md cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-clay-primary ${
            isCurrentFile
              ? "bg-white text-clay-ink border border-clay-hairline font-medium shadow-clay-soft"
              : "text-clay-body hover:text-clay-ink hover:bg-clay-surface-card"
          }`}
        >
          <div className="flex items-center gap-1.5 truncate">
            {isFolder ? (
              <>
                <span className="text-clay-muted group-hover:text-clay-ink">
                  {isExpanded ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                </span>
                {isExpanded ? (
                  <FolderOpen className="w-3.5 h-3.5 text-clay-primary shrink-0" />
                ) : (
                  <Folder className="w-3.5 h-3.5 text-clay-muted shrink-0" />
                )}
                <span className="truncate text-clay-ink group-hover:text-clay-primary">
                  {node.name}
                </span>
              </>
            ) : (
              <>
                <FileCode
                  className={`w-3.5 h-3.5 shrink-0 ${
                    isCurrentFile ? "text-clay-primary" : "text-clay-muted"
                  }`}
                />
                <span className={`truncate ${isCurrentFile ? "text-clay-ink font-semibold" : "text-clay-body"}`}>
                  {node.name}
                </span>
              </>
            )}
          </div>

          {/* Bug Count on Folder/File */}
          {bugCount > 0 && (
            <span
              className="text-[10px] font-mono px-1.5 py-0.5 rounded-clay-pill border shrink-0 bg-clay-pink/15 text-clay-pink-ink border-clay-pink/30 font-semibold"
            >
              {bugCount} {bugCount === 1 ? "bug" : "bugs"}
            </span>
          )}
        </div>

        {/* Children Folders/Files */}
        {isFolder && isExpanded && node.children && (
          <div className="flex flex-col">
            {node.children.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}

        {/* Nested Bugs directly under the File */}
        {!isFolder && node.bugs && node.bugs.length > 0 && (
          <div className="flex flex-col mt-0.5 space-y-1">
            {node.bugs.map(({ task, location }) => {
              const isSelected = selectedTaskId === task.id;
              const sev = getSeverityBadge(location.severity);
              const statusPill = getStatusBadge(task.status);

              return (
                <div
                  key={task.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectBug(task, location.fileName, location.lineNumber);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      onSelectBug(task, location.fileName, location.lineNumber);
                    }
                  }}
                  style={{ paddingLeft: `${(depth + 1) * 14 + 10}px` }}
                  className={`group relative p-2 mr-1 rounded-clay-lg cursor-pointer border transition-all focus-visible:outline-2 focus-visible:outline-clay-primary ${
                    isSelected
                      ? "bg-white border-2 border-clay-primary shadow-clay-card text-clay-ink"
                      : "bg-white hover:bg-clay-surface-card border-clay-hairline text-clay-body shadow-clay-soft"
                  }`}
                >
                  {/* Top Line: Severity Dot & Line Number */}
                  <div className="flex items-center justify-between gap-1.5 mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${sev.dot} shrink-0`} />
                      <span className={`text-[10px] ${sev.text}`}>
                        {location.severity}
                      </span>
                      <span className="text-clay-hairline">•</span>
                      <span className="text-[10px] font-mono text-clay-muted bg-clay-surface-soft px-1 rounded-clay-xs border border-clay-hairline">
                        Ln {location.lineNumber}
                      </span>
                    </div>

                    {/* Status Pill */}
                    <div
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded-clay-pill text-[9px] border font-mono ${statusPill.classes}`}
                    >
                      {statusPill.icon}
                      <span>{statusPill.label}</span>
                    </div>
                  </div>

                  {/* Bug Title */}
                  <div className="text-[11px] font-sans font-semibold text-clay-ink group-hover:text-clay-primary leading-snug line-clamp-2">
                    {task.title}
                  </div>

                  {/* Symbol Target / Location */}
                  <div className="mt-1 flex items-center justify-between text-[10px] text-clay-muted font-sans">
                    <span className="truncate text-clay-muted">
                      {location.fileName} • Line {location.lineNumber}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }
}

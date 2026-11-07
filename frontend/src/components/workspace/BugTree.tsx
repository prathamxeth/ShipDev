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
} from "lucide-react";
import { Task, TaskStatus } from "@/types";
import { resolveBugLocation, ResolvedBugLocation, WorkspaceFile } from "@/lib/workspaceFiles";
import { ActivityTab } from "@/components/layout/LeftActivityBar";

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
  isLoading: boolean;
  onNewBugClick: () => void;
  onRefreshClick?: () => void;
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
  isLoading,
  onNewBugClick,
  onRefreshClick,
}: BugTreeProps) {
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
          classes: "bg-amber-950/70 text-amber-300 border-amber-600/60 font-semibold",
          icon: <Lock className="w-2.5 h-2.5 text-amber-400" />,
        };
      case "REPRODUCING":
        return {
          label: "Reproducing",
          classes: "bg-blue-950/70 text-blue-300 border-blue-600/60 animate-pulse",
          icon: <RefreshCw className="w-2.5 h-2.5 text-blue-400 animate-spin" />,
        };
      case "REPRODUCED":
        return {
          label: "Reproduced",
          classes: "bg-purple-950/70 text-purple-300 border-purple-600/60",
          icon: <Bug className="w-2.5 h-2.5 text-purple-400" />,
        };
      case "FIX_PROPOSED":
        return {
          label: "Fix Proposed",
          classes: "bg-cyan-950/70 text-cyan-300 border-cyan-600/60",
          icon: <AlertCircle className="w-2.5 h-2.5 text-cyan-400" />,
        };
      case "VERIFYING":
        return {
          label: "Verifying",
          classes: "bg-indigo-950/70 text-indigo-300 border-indigo-600/60 animate-pulse",
          icon: <RefreshCw className="w-2.5 h-2.5 text-indigo-400 animate-spin" />,
        };
      case "APPROVED":
        return {
          label: "Approved",
          classes: "bg-emerald-950/70 text-emerald-300 border-emerald-600/60",
          icon: <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />,
        };
      case "COMPLETED":
        return {
          label: "Completed",
          classes: "bg-emerald-950/70 text-emerald-400 border-emerald-700/60",
          icon: <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />,
        };
      default:
        return {
          label: status,
          classes: "bg-zinc-900 text-zinc-400 border-zinc-800",
          icon: <Clock className="w-2.5 h-2.5 text-zinc-500" />,
        };
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "Critical":
        return {
          dot: "bg-rose-500",
          text: "text-rose-400",
          bg: "bg-rose-950/60 border-rose-800/60",
        };
      case "High":
        return {
          dot: "bg-amber-500",
          text: "text-amber-400",
          bg: "bg-amber-950/60 border-amber-800/60",
        };
      case "Medium":
        return {
          dot: "bg-yellow-500",
          text: "text-yellow-400",
          bg: "bg-yellow-950/60 border-yellow-800/60",
        };
      default:
        return {
          dot: "bg-blue-500",
          text: "text-blue-400",
          bg: "bg-blue-950/60 border-blue-800/60",
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
    <div className="flex flex-col h-full bg-[#080808] border-r border-[#1e1e1e] select-none text-xs">
      {/* ========================================================================= */}
      {/* 1. BUG TREE VIEW */}
      {/* ========================================================================= */}
      {activeActivityTab === "bugtree" && (
        <>
          <div className="h-9 px-3 flex items-center justify-between border-b border-[#1e1e1e] bg-[#050505]">
            <div className="flex items-center gap-2">
              <Bug className="w-3.5 h-3.5 text-[#f54e00]" />
              <span className="font-semibold text-neutral-200 tracking-wide uppercase text-[11px]">
                Live Bug Tree
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-[#181818] text-neutral-400 border border-[#262626]">
                {tasks.length}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {awaitingCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-amber-950/70 border border-amber-500/50 text-amber-300 font-mono text-[10px] font-medium animate-pulse flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5 text-amber-400" />
                  <span>{awaitingCount} Gate</span>
                </span>
              )}

              <button
                onClick={onNewBugClick}
                title="Report New Bug"
                className="p-1 rounded text-neutral-400 hover:text-[#f54e00] hover:bg-[#181818] transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Search Input & Filter Chips */}
          <div className="p-2 border-b border-[#1e1e1e] bg-[#080808]">
            <div className="flex items-center gap-1.5 px-2 py-1.5 bg-[#121212] rounded-md border border-[#222222] focus-within:border-[#f54e00]/70 transition-colors">
              <Search className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter bugs, files, lines..."
                className="w-full bg-transparent outline-none text-[11px] text-white placeholder-neutral-500 font-mono"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="text-neutral-500 hover:text-white cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 mt-2 overflow-x-auto scrollbar-none">
              {(
                [
                  { id: "all", label: "All" },
                  { id: "active", label: "Active" },
                  { id: "awaiting", label: "Gate" },
                  { id: "resolved", label: "Resolved" },
                ] as const
              ).map((chip) => (
                <button
                  key={chip.id}
                  onClick={() => setFilterMode(chip.id)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors cursor-pointer whitespace-nowrap ${
                    filterMode === chip.id
                      ? "bg-[#f54e00]/20 text-[#f54e00] border border-[#f54e00]/50 font-medium"
                      : "bg-transparent text-neutral-400 hover:text-white border border-transparent hover:border-[#222222]"
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          {/* Bug Tree Body */}
          <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 font-mono text-[11px]">
            {isLoading && (
              <div className="p-4 text-center text-neutral-500 font-mono text-xs flex items-center justify-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#f54e00]" />
                <span>Loading bug tree...</span>
              </div>
            )}
            {tree.children?.map((child) => renderTreeNode(child, 0))}
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* 2. FILE EXPLORER VIEW */}
      {/* ========================================================================= */}
      {activeActivityTab === "explorer" && (
        <>
          <div className="h-9 px-3 flex items-center justify-between border-b border-[#1e1e1e] bg-[#050505]">
            <div className="flex items-center gap-2">
              <Files className="w-3.5 h-3.5 text-[#f54e00]" />
              <span className="font-semibold text-neutral-200 tracking-wide uppercase text-[11px]">
                Explorer
              </span>
            </div>
            <button
              onClick={() => setIsCreatingFile(true)}
              title="Create New File"
              className="p-1 rounded text-neutral-400 hover:text-[#f54e00] hover:bg-[#181818] transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 font-mono text-xs">
            {isCreatingFile && (
              <div className="p-1.5 flex items-center gap-1.5 bg-[#141414] rounded-md border border-[#f54e00]/60 mb-1">
                <FileCode className="w-3.5 h-3.5 text-neutral-300 shrink-0" />
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
                  className="w-full bg-transparent outline-none text-xs text-white font-mono placeholder-neutral-500"
                />
                <button
                  onClick={() => {
                    if (newFileNameInput.trim() && onCreateFile) {
                      onCreateFile(newFileNameInput.trim());
                    }
                    setIsCreatingFile(false);
                    setNewFileNameInput("");
                  }}
                  className="p-0.5 text-emerald-400 hover:text-emerald-300 cursor-pointer"
                >
                  <Check className="w-3 h-3" />
                </button>
                <button
                  onClick={() => {
                    setIsCreatingFile(false);
                    setNewFileNameInput("");
                  }}
                  className="p-0.5 text-neutral-500 hover:text-white cursor-pointer"
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
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-md cursor-pointer transition-colors ${
                    isCurrent
                      ? "bg-[#181818] text-white border border-[#2a2a2a] font-medium shadow-xs"
                      : "text-neutral-400 hover:bg-[#121212] hover:text-neutral-200"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <FileCode
                      className={`w-3.5 h-3.5 shrink-0 ${
                        isCurrent ? "text-white" : isModified ? "text-[#e5c07b]" : "text-neutral-500"
                      }`}
                    />
                    <span className="truncate">{fileName}</span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 font-mono text-[10px]">
                    <span className="text-neutral-500">{lineCount}L</span>
                    {isModified && (
                      <span className="text-[#e5c07b] bg-[#e5c07b]/10 px-1 rounded border border-[#e5c07b]/30">
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
          <div className="h-9 px-3 flex items-center justify-between border-b border-[#1e1e1e] bg-[#050505]">
            <div className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-[#f54e00]" />
              <span className="font-semibold text-neutral-200 tracking-wide uppercase text-[11px]">
                Search Codebase
              </span>
            </div>
            <span className="text-[10px] font-mono text-neutral-500">
              {searchResults.length} matches
            </span>
          </div>

          <div className="p-2 border-b border-[#1e1e1e] bg-[#080808]">
            <div className="flex items-center gap-1.5 px-2 py-1.5 bg-[#121212] rounded-md border border-[#222222] focus-within:border-[#f54e00]/70">
              <Search className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search functions, tokens, lines..."
                autoFocus
                className="w-full bg-transparent outline-none text-xs text-white placeholder-neutral-500 font-mono"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="text-neutral-500 hover:text-white cursor-pointer"
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
                className="p-2 rounded-md hover:bg-[#141414] border border-transparent hover:border-[#222222] cursor-pointer transition-colors group"
              >
                <div className="flex items-center justify-between text-neutral-400 group-hover:text-[#f54e00]">
                  <span className="font-semibold text-xs text-white">{res.file}</span>
                  <span className="text-[10px] text-neutral-500">Ln {res.line}</span>
                </div>
                <div className="text-neutral-300 truncate text-[11px] mt-0.5 font-mono">
                  {res.text}
                </div>
              </div>
            ))}
            {searchQuery && searchResults.length === 0 && (
              <div className="p-4 text-center text-xs text-neutral-500">
                No matching code found across workspace files.
              </div>
            )}
            {!searchQuery && (
              <div className="p-4 text-center text-neutral-500 text-[11px]">
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
          <div className="h-9 px-3 flex items-center justify-between border-b border-[#1e1e1e] bg-[#050505]">
            <div className="flex items-center gap-2">
              <GitBranch className="w-3.5 h-3.5 text-[#f54e00]" />
              <span className="font-semibold text-neutral-200 tracking-wide uppercase text-[11px]">
                Source Control
              </span>
            </div>
            <span className="text-[10px] font-mono text-[#f54e00]">
              feature/ayush-backend
            </span>
          </div>

          <div className="p-2 border-b border-[#1e1e1e] space-y-2">
            <input
              type="text"
              value={gitCommitMessage}
              onChange={(e) => setGitCommitMessage(e.target.value)}
              placeholder="Commit message (⌘Enter)..."
              className="w-full px-2.5 py-1.5 rounded-md bg-[#121212] border border-[#242424] text-xs font-mono text-white placeholder-neutral-500 outline-none focus:border-[#f54e00]"
            />
            <button
              onClick={() => {
                if (gitCommitMessage.trim()) {
                  setCommittedCount((prev) => prev + 1);
                  setGitCommitMessage("");
                }
              }}
              disabled={!gitCommitMessage.trim()}
              className="w-full py-1.5 rounded-md bg-transparent hover:bg-[#f54e00]/10 border border-[#f54e00]/80 text-[#f54e00] disabled:opacity-40 text-xs font-mono font-medium cursor-pointer transition-colors"
            >
              Commit to branch ({committedCount})
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 font-mono text-xs">
            <div className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider px-2 py-1">
              Modified Files (1)
            </div>
            <div
              onClick={() => onSelectFile("calculator.py")}
              className="flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-[#141414] cursor-pointer transition-colors text-neutral-300"
            >
              <div className="flex items-center gap-2 truncate">
                <FileCode className="w-3.5 h-3.5 text-[#e5c07b] shrink-0" />
                <span className="truncate">calculator.py</span>
              </div>
              <span className="text-[10px] text-[#e5c07b] font-mono px-1 rounded bg-[#e5c07b]/10">
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
          <div className="h-9 px-3 flex items-center justify-between border-b border-[#1e1e1e] bg-[#050505]">
            <div className="flex items-center gap-2">
              <Bot className="w-3.5 h-3.5 text-[#f54e00]" />
              <span className="font-semibold text-neutral-200 tracking-wide uppercase text-[11px]">
                Switch Agents
              </span>
            </div>
            <span className="text-[10px] font-mono text-emerald-400">Online</span>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-2 font-mono text-xs">
            <div className="p-2.5 rounded-lg bg-[#0e0e0e] border border-[#1e1e1e] flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-white font-medium">shipdev-triager</span>
                <span className="text-[10px] text-blue-400">Triage</span>
              </div>
              <span className="text-[10px] text-neutral-500">UUID: bd717264-f0ac-4651</span>
            </div>

            <div className="p-2.5 rounded-lg bg-[#0e0e0e] border border-[#1e1e1e] flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-white font-medium">Reproduction Agent</span>
                <span className="text-[10px] text-purple-400">Sandbox</span>
              </div>
              <span className="text-[10px] text-neutral-500">pytest isolated runner</span>
            </div>

            <div className="p-2.5 rounded-lg bg-[#0e0e0e] border border-[#1e1e1e] flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-white font-medium">shipdev-verifier</span>
                <span className="text-[10px] text-emerald-400">Verifier</span>
              </div>
              <span className="text-[10px] text-neutral-500">UUID: 7dc5d295-a3c3-4168</span>
            </div>
          </div>
        </>
      )}

      {/* Footer Status */}
      <div className="h-7 px-3 border-t border-[#1e1e1e] bg-[#050505] flex items-center justify-between text-[10px] font-mono text-neutral-500 shrink-0">
        <span>Workspace Sync</span>
        <span className="text-[#f54e00] font-medium">Live</span>
      </div>
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
          onClick={() => {
            if (isFolder) {
              toggleFolder(node.id);
            } else if (node.fileName) {
              onSelectFile(node.fileName);
            }
          }}
          style={{ paddingLeft: `${depth * 14 + 6}px` }}
          className={`group flex items-center justify-between py-1 px-2 rounded-md cursor-pointer transition-colors ${
            isCurrentFile
              ? "bg-[#181818] text-white border border-[#282828] font-medium"
              : "text-neutral-400 hover:text-neutral-200 hover:bg-[#121212]"
          }`}
        >
          <div className="flex items-center gap-1.5 truncate">
            {isFolder ? (
              <>
                <span className="text-neutral-500 group-hover:text-neutral-300">
                  {isExpanded ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                </span>
                {isExpanded ? (
                  <FolderOpen className="w-3.5 h-3.5 text-[#f54e00] shrink-0" />
                ) : (
                  <Folder className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                )}
                <span className="truncate text-neutral-300 group-hover:text-white">
                  {node.name}
                </span>
              </>
            ) : (
              <>
                <FileCode
                  className={`w-3.5 h-3.5 shrink-0 ${
                    isCurrentFile ? "text-white" : "text-neutral-500"
                  }`}
                />
                <span className={`truncate ${isCurrentFile ? "text-white" : "text-neutral-300"}`}>
                  {node.name}
                </span>
              </>
            )}
          </div>

          {/* Bug Count on Folder/File */}
          {bugCount > 0 && (
            <span
              className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full border shrink-0 ${
                bugCount > 0
                  ? "bg-rose-950/60 text-rose-300 border-rose-800/60"
                  : "bg-neutral-900 text-neutral-500 border-neutral-800"
              }`}
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
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectBug(task, location.fileName, location.lineNumber);
                  }}
                  style={{ paddingLeft: `${(depth + 1) * 14 + 10}px` }}
                  className={`group relative p-2 mr-1 rounded-lg cursor-pointer border transition-all ${
                    isSelected
                      ? "bg-[#161616] border-[#f54e00] shadow-[0_0_12px_rgba(245,78,0,0.15)] text-white"
                      : "bg-[#0b0b0b] hover:bg-[#121212] border-[#1e1e1e] hover:border-[#2a2a2a] text-neutral-300"
                  }`}
                >
                  {/* Top Line: Severity Dot & Line Number */}
                  <div className="flex items-center justify-between gap-1.5 mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${sev.dot} shrink-0`} />
                      <span className={`text-[10px] font-semibold uppercase ${sev.text}`}>
                        {location.severity}
                      </span>
                      <span className="text-neutral-600">•</span>
                      <span className="text-[10px] font-mono text-neutral-400 bg-[#161616] px-1 rounded border border-[#222222]">
                        Ln {location.lineNumber}
                      </span>
                    </div>

                    {/* Status Pill */}
                    <div
                      className={`flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] border font-mono ${statusPill.classes}`}
                    >
                      {statusPill.icon}
                      <span>{statusPill.label}</span>
                    </div>
                  </div>

                  {/* Bug Title */}
                  <div className="text-[11px] font-sans font-medium text-neutral-200 group-hover:text-white leading-snug line-clamp-2">
                    {task.title}
                  </div>

                  {/* Symbol Target */}
                  <div className="mt-1 flex items-center justify-between text-[10px] text-neutral-500 font-mono">
                    <span className="truncate text-neutral-400">
                      @{location.symbolName}()
                    </span>
                    <span className="text-[9px] text-neutral-600">
                      ID: {task.id.slice(-6)}
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

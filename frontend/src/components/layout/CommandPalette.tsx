"use client";

import React, { useEffect, useState, useRef } from "react";
import {
  AlertCircle,
  ArrowRight,
  Boxes,
  Check,
  CheckCircle2,
  Clock,
  Code2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Filter,
  Flame,
  GitBranch,
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Terminal,
  X,
} from "lucide-react";
import { Task } from "@/types";
import { StatusPill } from "@/components/ui/StatusPill";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: Task[];
  onSelectTask: (taskId: string) => void;
  onNewBugClick: () => void;
  onRefreshClick: () => void;
  onToggleSidebar: () => void;
  onToggleInspector: () => void;
  isSidebarOpen: boolean;
  isInspectorOpen: boolean;
  onFilterChange: (filter: "all" | "active" | "awaiting" | "closed") => void;
}

interface CommandAction {
  id: string;
  category: "Actions" | "Filters" | "View";
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
  perform: () => void;
}

export function CommandPalette({
  isOpen,
  onClose,
  tasks,
  onSelectTask,
  onNewBugClick,
  onRefreshClick,
  onToggleSidebar,
  onToggleInspector,
  isSidebarOpen,
  isInspectorOpen,
  onFilterChange,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when palette opens
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Command actions
  const actions: CommandAction[] = [
    {
      id: "action-new-bug",
      category: "Actions",
      label: "New Bug Report",
      icon: <Plus className="w-3.5 h-3.5 text-blue-400" />,
      shortcut: "N",
      perform: () => {
        onNewBugClick();
        onClose();
      },
    },
    {
      id: "action-refresh",
      category: "Actions",
      label: "Refresh Backend Data",
      icon: <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />,
      shortcut: "R",
      perform: () => {
        onRefreshClick();
        onClose();
      },
    },
    {
      id: "action-copy-branch",
      category: "Actions",
      label: "Copy Target Branch Name (feature/pratham-frontend)",
      icon: copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />,
      perform: () => {
        navigator.clipboard.writeText("feature/pratham-frontend");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
    },
    {
      id: "filter-awaiting",
      category: "Filters",
      label: "Filter: Awaiting Human Approval",
      icon: <Clock className="w-3.5 h-3.5 text-amber-400" />,
      perform: () => {
        onFilterChange("awaiting");
        onClose();
      },
    },
    {
      id: "filter-active",
      category: "Filters",
      label: "Filter: Active Tasks",
      icon: <Sparkles className="w-3.5 h-3.5 text-blue-400" />,
      perform: () => {
        onFilterChange("active");
        onClose();
      },
    },
    {
      id: "filter-all",
      category: "Filters",
      label: "Filter: All Tasks",
      icon: <Layers className="w-3.5 h-3.5 text-zinc-400" />,
      perform: () => {
        onFilterChange("all");
        onClose();
      },
    },
    {
      id: "view-sidebar",
      category: "View",
      label: isSidebarOpen ? "Collapse Left Task Queue Sidebar" : "Expand Left Task Queue Sidebar",
      icon: isSidebarOpen ? <PanelLeftClose className="w-3.5 h-3.5 text-zinc-400" /> : <PanelLeftOpen className="w-3.5 h-3.5 text-zinc-400" />,
      shortcut: "⌘B",
      perform: () => {
        onToggleSidebar();
        onClose();
      },
    },
    {
      id: "view-inspector",
      category: "View",
      label: isInspectorOpen ? "Collapse Right Contextual Inspector" : "Expand Right Contextual Inspector",
      icon: isInspectorOpen ? <PanelRightClose className="w-3.5 h-3.5 text-zinc-400" /> : <PanelRightOpen className="w-3.5 h-3.5 text-zinc-400" />,
      shortcut: "⌘I",
      perform: () => {
        onToggleInspector();
        onClose();
      },
    },
  ];

  // Filter actions and tasks based on search query
  const filteredActions = actions.filter((act) =>
    act.label.toLowerCase().includes(query.toLowerCase())
  );

  const filteredTasks = tasks.filter(
    (t) =>
      t.title.toLowerCase().includes(query.toLowerCase()) ||
      t.id.toLowerCase().includes(query.toLowerCase()) ||
      t.reported_by.toLowerCase().includes(query.toLowerCase())
  );

  const totalItems = filteredActions.length + filteredTasks.length;

  // Keyboard navigation inside palette
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (totalItems || 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + (totalItems || 1)) % (totalItems || 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex < filteredActions.length) {
        filteredActions[selectedIndex]?.perform();
      } else {
        const taskIdx = selectedIndex - filteredActions.length;
        const task = filteredTasks[taskIdx];
        if (task) {
          onSelectTask(task.id);
          onClose();
        }
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/80 backdrop-blur-sm select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-xl bg-oled-panel border border-oled-border shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search header */}
        <div className="h-12 px-3 border-b border-oled-border flex items-center gap-2.5 bg-oled-base">
          <Search className="w-4 h-4 text-zinc-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search commands, tasks, filters... (Esc to exit)"
            className="flex-1 bg-transparent text-xs text-slate-100 placeholder-zinc-500 focus:outline-none font-sans"
          />
          <kbd className="text-[10px] font-mono bg-zinc-900 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-800">
            ESC
          </kbd>
        </div>

        {/* Results Container */}
        <div className="max-h-80 overflow-y-auto p-1.5 flex flex-col gap-1 select-text">
          {totalItems === 0 && (
            <div className="p-6 text-center text-zinc-500 text-xs">
              No matching commands or engineering tasks found.
            </div>
          )}

          {/* Actions Section */}
          {filteredActions.length > 0 && (
            <div className="flex flex-col gap-0.5">
              <div className="px-2 py-1 text-[10px] font-semibold font-mono text-zinc-500 uppercase tracking-wider">
                Commands & Shortcuts
              </div>

              {filteredActions.map((action, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <button
                    key={action.id}
                    onClick={action.perform}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`w-full text-left px-2.5 py-1.5 rounded flex items-center justify-between text-xs transition-colors ${
                      isSelected
                        ? "bg-zinc-800 text-slate-100"
                        : "text-zinc-300 hover:bg-zinc-900"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {action.icon}
                      <span>{action.label}</span>
                    </div>
                    {action.shortcut && (
                      <kbd className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-900 text-zinc-400 border border-zinc-800">
                        {action.shortcut}
                      </kbd>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Tasks Section */}
          {filteredTasks.length > 0 && (
            <div className="flex flex-col gap-0.5 mt-2 pt-2 border-t border-oled-border">
              <div className="px-2 py-1 text-[10px] font-semibold font-mono text-zinc-500 uppercase tracking-wider">
                Engineering Tasks ({filteredTasks.length})
              </div>

              {filteredTasks.map((task, idx) => {
                const itemIndex = filteredActions.length + idx;
                const isSelected = itemIndex === selectedIndex;

                return (
                  <button
                    key={task.id}
                    onClick={() => {
                      onSelectTask(task.id);
                      onClose();
                    }}
                    onMouseEnter={() => setSelectedIndex(itemIndex)}
                    className={`w-full text-left px-2.5 py-2 rounded flex items-center justify-between text-xs transition-colors gap-3 ${
                      isSelected
                        ? "bg-zinc-800 text-slate-100"
                        : "text-zinc-300 hover:bg-zinc-900"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Code2 className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <span className="truncate">{task.title}</span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <StatusPill status={task.status} size="sm" />
                      <span className="font-mono text-[10px] text-zinc-500">
                        {task.id.slice(0, 8)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer shortcuts hint */}
        <div className="h-8 px-3 border-t border-oled-border bg-oled-base flex items-center justify-between text-[10px] font-mono text-zinc-500 select-none">
          <div className="flex items-center gap-3">
            <span>↑↓ to navigate</span>
            <span>↵ to select</span>
            <span>esc to close</span>
          </div>
          <span>ShipDev Command Palette</span>
        </div>
      </div>
    </div>
  );
}


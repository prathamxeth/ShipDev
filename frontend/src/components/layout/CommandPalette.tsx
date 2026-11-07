"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import {
  AlertCircle,
  Bug,
  Check,
  CheckCircle2,
  FileCode,
  GitBranch,
  Info,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Settings,
  SplitSquareVertical,
  X,
} from "lucide-react";
import { Task } from "@/types";
import { resolveBugLocation } from "@/lib/workspaceFiles";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: Task[];
  onSelectTask: (taskId: string) => void;
  onSelectFile: (fileName: string) => void;
  onNavigateToLine: (fileName: string, lineNumber: number) => void;
  onNewBugClick: () => void;
  onRefreshClick: () => void;
  onToggleDiffMode: () => void;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
  isDiffMode: boolean;
}

interface PaletteItem {
  id: string;
  category: "Files" | "Bugs" | "Actions" | "Preferences";
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  badge?: string;
  badgeColor?: string;
  shortcut?: string;
  perform: () => void;
}

export function CommandPalette({
  isOpen,
  onClose,
  tasks,
  onSelectTask,
  onSelectFile,
  onNavigateToLine,
  onNewBugClick,
  onRefreshClick,
  onToggleDiffMode,
  onOpenSettings,
  onOpenAbout,
  isDiffMode,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Master command dictionary
  const allItems: PaletteItem[] = useMemo(() => {
    const items: PaletteItem[] = [
      // 1. Files
      {
        id: "file-calc",
        category: "Files",
        title: "calculator.py",
        subtitle: "demo/buggy_app/calculator.py • calculate_discount()",
        icon: <FileCode className="w-4 h-4 text-[#f54e00]" />,
        badge: "Target",
        badgeColor: "bg-[#181818] text-[#f54e00] border-[#2c2c2c]",
        shortcut: "⌘1",
        perform: () => {
          onSelectFile("calculator.py");
          onClose();
        },
      },
      {
        id: "file-test-calc",
        category: "Files",
        title: "test_calculator.py",
        subtitle: "demo/tests/test_calculator.py • test_calculate_discount",
        icon: <FileCode className="w-4 h-4 text-rose-400" />,
        badge: "Test",
        badgeColor: "bg-rose-950/60 text-rose-300 border-rose-800/40",
        shortcut: "⌘2",
        perform: () => {
          onSelectFile("test_calculator.py");
          onClose();
        },
      },
      {
        id: "file-switch-bridge",
        category: "Files",
        title: "switch_bridge.py",
        subtitle: "scripts/switch_bridge.py • SwitchClient relay",
        icon: <FileCode className="w-4 h-4 text-purple-400" />,
        badge: "Bridge",
        shortcut: "⌘3",
        perform: () => {
          onSelectFile("switch_bridge.py");
          onClose();
        },
      },
      {
        id: "file-state-machine",
        category: "Files",
        title: "state_machine.py",
        subtitle: "backend/app/core/state_machine.py • Human Gate Rules",
        icon: <FileCode className="w-4 h-4 text-emerald-400" />,
        badge: "Security",
        shortcut: "⌘4",
        perform: () => {
          onSelectFile("state_machine.py");
          onClose();
        },
      },

      // 2. Actions
      {
        id: "action-diff",
        category: "Actions",
        title: isDiffMode ? "Exit Diff View" : "Toggle Diff View",
        subtitle: "Compare original source vs proposed Switch fix",
        icon: <SplitSquareVertical className="w-4 h-4 text-[#f54e00]" />,
        shortcut: "⌘D",
        perform: () => {
          onToggleDiffMode();
          onClose();
        },
      },
      {
        id: "action-new-bug",
        category: "Actions",
        title: "Report New Bug",
        subtitle: "Submit bug report to Switch triage pipeline",
        icon: <Plus className="w-4 h-4 text-emerald-400" />,
        shortcut: "⌘N",
        perform: () => {
          onNewBugClick();
          onClose();
        },
      },
      {
        id: "action-refresh",
        category: "Actions",
        title: "Refresh Tasks & Evidence",
        subtitle: "Poll latest state transitions from FastAPI backend",
        icon: <RefreshCw className="w-4 h-4 text-blue-400" />,
        shortcut: "⌘R",
        perform: () => {
          onRefreshClick();
          onClose();
        },
      },

      // 3. Preferences
      {
        id: "pref-settings",
        category: "Preferences",
        title: "Open Settings",
        subtitle: "Configure Switch Controller, room ID and timeouts",
        icon: <Settings className="w-4 h-4 text-neutral-400" />,
        shortcut: "⌘,",
        perform: () => {
          onOpenSettings();
          onClose();
        },
      },
      {
        id: "pref-about",
        category: "Preferences",
        title: "About ShipDev",
        subtitle: "Architecture, Switch runtime, and gate verification",
        icon: <Info className="w-4 h-4 text-[#f54e00]" />,
        perform: () => {
          onOpenAbout();
          onClose();
        },
      },
    ];

    // 4. Dynamic Bugs from tasks
    tasks.forEach((t) => {
      const loc = resolveBugLocation(t);
      items.push({
        id: `bug-${t.id}`,
        category: "Bugs",
        title: t.title,
        subtitle: `${loc.fileName}:${loc.lineNumber} • Status: ${t.status}`,
        icon: <Bug className="w-4 h-4 text-rose-400" />,
        badge: loc.severity,
        badgeColor:
          loc.severity === "Critical"
            ? "bg-rose-950/70 text-rose-300 border-rose-800"
            : "bg-amber-950/70 text-amber-300 border-amber-800",
        perform: () => {
          onSelectTask(t.id);
          onNavigateToLine(loc.fileName, loc.lineNumber);
          onClose();
        },
      });
    });

    return items;
  }, [
    tasks,
    isDiffMode,
    onSelectFile,
    onToggleDiffMode,
    onNewBugClick,
    onRefreshClick,
    onOpenSettings,
    onOpenAbout,
    onSelectTask,
    onNavigateToLine,
    onClose,
  ]);

  // Filter items
  const filteredItems = useMemo(() => {
    if (!query.trim()) return allItems;
    const q = query.toLowerCase();
    return allItems.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        (item.subtitle && item.subtitle.toLowerCase().includes(q)) ||
        item.category.toLowerCase().includes(q)
    );
  }, [allItems, query]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev < filteredItems.length - 1 ? prev + 1 : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filteredItems.length - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          filteredItems[selectedIndex].perform();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, filteredItems, selectedIndex, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 p-4 bg-black/40 backdrop-blur-xs select-none animate-in fade-in duration-100">
      <div className="w-full max-w-xl rounded-clay-xl bg-clay-canvas border border-clay-hairline shadow-clay-elevated flex flex-col overflow-hidden text-xs font-mono text-clay-ink">
        {/* Search Input Bar */}
        <div className="h-12 px-4 border-b border-clay-hairline flex items-center gap-3 bg-white">
          <Search className="w-4 h-4 text-clay-primary shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Type a file name, bug description, or command..."
            className="w-full bg-transparent outline-none text-clay-ink placeholder-clay-muted text-xs font-mono"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="text-clay-muted hover:text-clay-ink p-1 rounded-clay-xs cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <kbd className="px-1.5 py-0.5 rounded-clay-xs bg-clay-surface-card border border-clay-hairline text-[10px] text-clay-muted">
            Esc
          </kbd>
        </div>

        {/* Results List */}
        <div ref={listRef} className="max-h-80 overflow-y-auto p-2 space-y-0.5 bg-clay-canvas">
          {filteredItems.length === 0 ? (
            <div className="p-6 text-center text-clay-muted text-xs">
              No matching files, bugs, or actions found for &quot;{query}&quot;
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;

              return (
                <div
                  key={item.id}
                  onClick={() => item.perform()}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between p-2 rounded-clay-md cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-white border border-clay-hairline text-clay-ink shadow-clay-soft"
                      : "text-clay-body hover:bg-clay-surface-card border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <span className="shrink-0">{item.icon}</span>
                    <div className="flex flex-col truncate">
                      <div className="flex items-center gap-2 truncate">
                        <span className="font-semibold text-clay-ink truncate">
                          {item.title}
                        </span>
                        {item.badge && (
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded-clay-pill border font-mono ${
                              item.badgeColor || "bg-clay-surface-card text-clay-muted border-clay-hairline"
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </div>
                      {item.subtitle && (
                        <span className="text-[10px] text-clay-muted truncate font-sans">
                          {item.subtitle}
                        </span>
                      )}
                    </div>
                  </div>

                  {item.shortcut && (
                    <span className="text-[10px] text-clay-muted font-mono px-1.5 py-0.2 rounded-clay-xs bg-clay-surface-soft border border-clay-hairline shrink-0 ml-2">
                      {item.shortcut}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="h-7 px-3 border-t border-clay-hairline bg-clay-surface-soft flex items-center justify-between text-[10px] text-clay-muted">
          <div className="flex items-center gap-2">
            <span>↑↓ Navigate</span>
            <span>•</span>
            <span>↵ Select</span>
            <span>•</span>
            <span>Esc Close</span>
          </div>
          <span className="text-clay-primary font-semibold">ShipDev Palette</span>
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import {
  Check,
  GitBranch,
  Info,
  Plus,
  RefreshCw,
  Search,
  Settings,
  SplitSquareVertical,
} from "lucide-react";
import { checkBackendHealth } from "@/lib/api";
import { BackendHealth } from "@/types";

interface TopNavigationProps {
  onNewBugClick: () => void;
  onRefreshClick: () => void;
  onOpenCommandPalette: () => void;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
  isRefreshing?: boolean;
  isDiffMode: boolean;
  onToggleDiffMode: (diffState?: boolean) => void;
  sseStatus?: "connecting" | "connected" | "disconnected" | null;
}

export function TopNavigation({
  onNewBugClick,
  onRefreshClick,
  onOpenCommandPalette,
  onOpenSettings,
  onOpenAbout,
  isRefreshing = false,
  isDiffMode,
  onToggleDiffMode,
  sseStatus = null,
}: TopNavigationProps) {
  const [health, setHealth] = useState<{ ok: boolean; data?: BackendHealth; error?: string } | null>(null);
  const [copiedBranch, setCopiedBranch] = useState(false);

  const performHealthCheck = async () => {
    const result = await checkBackendHealth();
    setHealth(result);
  };

  useEffect(() => {
    performHealthCheck();
    const interval = setInterval(performHealthCheck, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleCopyBranch = () => {
    navigator.clipboard.writeText("feature/ayush-backend");
    setCopiedBranch(true);
    setTimeout(() => setCopiedBranch(false), 2000);
  };

  return (
    <header className="h-12 border-b border-clay-hairline bg-clay-canvas flex items-center justify-between px-3.5 shrink-0 select-none text-xs font-sans z-30 shadow-xs">
      {/* Left: Branding, Workspace & Git Branch */}
      <div className="flex items-center gap-3 min-w-0">
        {/* ShipDev Wordmark */}
        <div className="flex items-center gap-2 pr-3 border-r border-clay-hairline">
          <div className="w-6 h-6 rounded-clay-md bg-clay-primary flex items-center justify-center text-white shadow-clay-soft">
            <span className="w-2.5 h-2.5 rounded-full bg-clay-pink" />
          </div>
          <span className="font-semibold text-clay-ink tracking-tight text-[13px]">
            ShipDev
          </span>
          <span className="text-[10px] text-clay-muted bg-clay-surface-card border border-clay-hairline px-1.5 py-0.5 rounded-clay-pill font-mono hidden sm:inline">
            IDE
          </span>
        </div>

        {/* Current Project / Repo */}
        <div className="flex items-center gap-1.5 text-clay-muted truncate">
          <span className="text-clay-body-strong font-medium">demo-calculator</span>
          <span className="text-clay-hairline">/</span>
          <span className="text-clay-muted truncate hidden md:inline">ShipDev</span>
        </div>

        {/* Git Branch & Change Status */}
        <div className="flex items-center gap-2 pl-2 border-l border-clay-hairline text-[11px]">
          <button
            onClick={handleCopyBranch}
            title="Click to copy branch name"
            aria-label="Copy branch name feature/ayush-backend"
            className="flex items-center gap-1 text-clay-body hover:text-clay-ink px-2 py-0.5 rounded-clay-md hover:bg-clay-surface-soft transition-colors cursor-pointer font-mono"
          >
            <GitBranch className="w-3.5 h-3.5 text-clay-teal" />
            <span className="truncate max-w-28">feature/ayush-backend</span>
            {copiedBranch && <Check className="w-3 h-3 text-clay-success" />}
          </button>
          <span className="text-[10px] text-clay-ink bg-clay-surface-card px-1.5 py-0.5 rounded-clay-pill border border-clay-hairline font-mono font-medium">
            1 modified
          </span>
        </div>
      </div>

      {/* Center: Command Palette Trigger (Cmd+K) */}
      <div className="flex-1 max-w-md mx-4 hidden md:flex items-center justify-center">
        <button
          onClick={onOpenCommandPalette}
          aria-label="Open command palette (Command + K)"
          className="w-full flex items-center justify-between px-3 py-1.5 rounded-clay-md bg-clay-surface-soft hover:bg-clay-surface-card border border-clay-hairline text-clay-muted hover:text-clay-ink transition-colors cursor-pointer text-xs"
        >
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-clay-muted" />
            <span>Search files, bugs, or commands...</span>
          </div>
          <kbd className="px-1.5 py-0.5 rounded-clay-xs bg-clay-surface-card border border-clay-hairline text-[10px] text-clay-body font-mono">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right: Switch Status, Actions & Preferences */}
      <div className="flex items-center gap-2">
        {/* Switch Agent Connection Pill */}
        <div
          title="Switch Agent Controller (:53640) & Room: #shipdev-command-center"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-clay-pill bg-clay-surface-soft border border-clay-hairline text-[11px] font-mono shadow-xs"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-clay-success" />
          <span className="text-clay-muted hidden lg:inline">Switch:</span>
          <span className="text-clay-ink font-semibold">Live</span>
        </div>

        {/* Backend Health indicator */}
        <div
          title={health?.ok ? "FastAPI backend healthy" : "FastAPI backend check"}
          className="flex items-center gap-1 text-[11px] text-clay-muted font-mono"
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              health?.ok ? "bg-clay-success" : "bg-clay-warning"
            }`}
          />
          <span className="hidden xl:inline text-clay-muted">API</span>
        </div>

        {/* Diff View Toggle Button */}
        <button
          onClick={() => onToggleDiffMode(!isDiffMode)}
          aria-label={isDiffMode ? "Exit side-by-side diff mode" : "Enter side-by-side diff mode"}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-clay-md text-xs font-medium border transition-colors cursor-pointer ${
            isDiffMode
              ? "bg-clay-peach/30 border-clay-peach text-clay-ink shadow-xs"
              : "bg-clay-surface-soft hover:bg-clay-surface-card border-clay-hairline text-clay-body hover:text-clay-ink"
          }`}
        >
          <SplitSquareVertical className="w-3.5 h-3.5 text-clay-teal" />
          <span className="hidden sm:inline">{isDiffMode ? "Exit Diff" : "Diff View"}</span>
        </button>

        {/* Refresh Button */}
        <button
          onClick={onRefreshClick}
          title="Refresh task queue and evidence"
          aria-label="Refresh task queue and evidence"
          className="h-8 w-8 flex items-center justify-center text-clay-muted hover:text-clay-ink rounded-clay-md hover:bg-clay-surface-soft border border-transparent hover:border-clay-hairline transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-clay-teal" : ""}`} />
        </button>

        {/* New Bug Button */}
        <button
          onClick={onNewBugClick}
          aria-label="Report new issue to AI engineering pipeline"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-clay-md bg-clay-primary hover:bg-clay-primary-active text-white text-xs font-semibold transition-colors cursor-pointer shadow-clay-soft"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Report Issue</span>
        </button>

        {/* About Button */}
        <button
          onClick={onOpenAbout}
          title="About ShipDev"
          aria-label="About ShipDev"
          className="h-8 w-8 flex items-center justify-center text-clay-muted hover:text-clay-ink rounded-clay-md hover:bg-clay-surface-soft border border-transparent hover:border-clay-hairline transition-colors cursor-pointer"
        >
          <Info className="w-4 h-4 text-clay-teal" />
        </button>

        {/* Settings Button */}
        <button
          onClick={onOpenSettings}
          title="Settings (⌘,)"
          aria-label="Settings (Command + comma)"
          className="h-8 w-8 flex items-center justify-center text-clay-muted hover:text-clay-ink rounded-clay-md hover:bg-clay-surface-soft border border-transparent hover:border-clay-hairline transition-colors cursor-pointer"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}

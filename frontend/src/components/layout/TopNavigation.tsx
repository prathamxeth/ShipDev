"use client";

import React, { useEffect, useState } from "react";
import {
  Boxes,
  Check,
  CheckCircle2,
  Copy,
  GitBranch,
  Info,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  SplitSquareVertical,
  XCircle,
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
    <header className="h-10 border-b border-[#1e1e1e] bg-[#050505] flex items-center justify-between px-3 shrink-0 select-none text-xs font-mono z-30">
      {/* Left: Branding, Workspace & Git Branch */}
      <div className="flex items-center gap-3 min-w-0">
        {/* ShipDev Wordmark */}
        <div className="flex items-center gap-2 pr-3 border-r border-[#1e1e1e]">
          <div className="w-5 h-5 rounded-md bg-[#f54e00]/20 border border-[#f54e00]/60 flex items-center justify-center">
            <span className="w-2 h-2 rounded-full bg-[#f54e00]" />
          </div>
          <span className="font-semibold text-white tracking-wider text-xs">
            ShipDev
          </span>
          <span className="text-[10px] text-neutral-500 font-sans hidden sm:inline">
            IDE
          </span>
        </div>

        {/* Current Project / Repo */}
        <div className="flex items-center gap-1.5 text-neutral-400 truncate">
          <span className="text-white font-medium">demo-calculator</span>
          <span className="text-neutral-600">/</span>
          <span className="text-neutral-400 truncate hidden md:inline">ShipDev</span>
        </div>

        {/* Git Branch & Change Status */}
        <div className="flex items-center gap-2 pl-2 border-l border-[#1e1e1e] text-[11px]">
          <button
            onClick={handleCopyBranch}
            title="Click to copy branch name"
            className="flex items-center gap-1 text-neutral-400 hover:text-white transition-colors cursor-pointer"
          >
            <GitBranch className="w-3.5 h-3.5 text-[#f54e00]" />
            <span className="truncate max-w-28">feature/ayush-backend</span>
            {copiedBranch && <Check className="w-3 h-3 text-emerald-400" />}
          </button>
          <span className="text-[10px] text-[#e5c07b] bg-[#e5c07b]/10 px-1 rounded border border-[#e5c07b]/30">
            1 mod
          </span>
        </div>
      </div>

      {/* Center: Command Palette Trigger (Cmd+K) */}
      <div className="flex-1 max-w-md mx-4 hidden md:flex items-center justify-center">
        <button
          onClick={onOpenCommandPalette}
          className="w-full flex items-center justify-between px-3 py-1 rounded-lg bg-[#0e0e0e] hover:bg-[#141414] border border-[#222222] hover:border-[#333333] text-neutral-400 hover:text-neutral-200 transition-colors cursor-pointer text-[11px]"
        >
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-neutral-500" />
            <span>Search files, bugs, or commands...</span>
          </div>
          <kbd className="px-1.5 py-0.2 rounded bg-[#1c1c1c] border border-[#2c2c2c] text-[10px] text-neutral-400 font-mono">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right: Switch Status, Actions & Preferences */}
      <div className="flex items-center gap-2">
        {/* Switch Agent Connection Pill */}
        <div
          title="Switch Agent Controller (:53640) & Room: #shipdev-command-center"
          className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#0e0e0e] border border-[#222222] text-[11px]"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#22c55e]" />
          <span className="text-neutral-400 hidden lg:inline">Switch:</span>
          <span className="text-emerald-400 font-medium">Live</span>
        </div>

        {/* Backend Health indicator */}
        <div
          title={health?.ok ? "FastAPI backend healthy" : "FastAPI backend check"}
          className="flex items-center gap-1 text-[11px] text-neutral-400"
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              health?.ok ? "bg-emerald-400" : "bg-amber-400"
            }`}
          />
          <span className="hidden xl:inline text-neutral-500">API</span>
        </div>

        {/* Diff View Toggle Button */}
        <button
          onClick={() => onToggleDiffMode(!isDiffMode)}
          className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] border transition-colors cursor-pointer ${
            isDiffMode
              ? "bg-[#f54e00]/20 border-[#f54e00] text-[#f54e00] font-semibold"
              : "bg-transparent border-[#262626] hover:border-[#383838] text-neutral-300 hover:text-white"
          }`}
        >
          <SplitSquareVertical className="w-3 h-3" />
          <span className="hidden sm:inline">{isDiffMode ? "Exit Diff" : "Diff View"}</span>
        </button>

        {/* Refresh Button */}
        <button
          onClick={onRefreshClick}
          title="Refresh task queue and evidence"
          className="p-1.5 text-neutral-400 hover:text-white rounded hover:bg-[#181818] border border-transparent hover:border-[#262626] transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-[#f54e00]" : ""}`} />
        </button>

        {/* New Bug Button */}
        <button
          onClick={onNewBugClick}
          className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#f54e00] hover:bg-[#ff6a26] text-white text-[11px] font-medium transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Report Issue</span>
        </button>

        {/* About Button */}
        <button
          onClick={onOpenAbout}
          title="About ShipDev"
          className="p-1.5 text-neutral-400 hover:text-white rounded hover:bg-[#181818] border border-transparent hover:border-[#262626] transition-colors cursor-pointer"
        >
          <Info className="w-3.5 h-3.5 text-[#f54e00]" />
        </button>

        {/* Settings Button */}
        <button
          onClick={onOpenSettings}
          title="Settings (⌘,)"
          className="p-1.5 text-neutral-400 hover:text-white rounded hover:bg-[#181818] border border-transparent hover:border-[#262626] transition-colors cursor-pointer"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
}

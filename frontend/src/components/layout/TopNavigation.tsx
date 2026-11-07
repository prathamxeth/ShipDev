"use client";

import React, { useEffect, useState } from "react";
import {
  Boxes,
  Check,
  CheckCircle2,
  Copy,
  GitBranch,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { checkBackendHealth } from "@/lib/api";
import { BackendHealth } from "@/types";

interface TopNavigationProps {
  onNewBugClick: () => void;
  onRefreshClick: () => void;
  onOpenCommandPalette: () => void;
  isRefreshing?: boolean;
  isSidebarOpen: boolean;
  isInspectorOpen: boolean;
  onToggleSidebar: () => void;
  onToggleInspector: () => void;
  sseStatus?: "connecting" | "connected" | "disconnected" | null;
}

export function TopNavigation({
  onNewBugClick,
  onRefreshClick,
  onOpenCommandPalette,
  isRefreshing = false,
  isSidebarOpen,
  isInspectorOpen,
  onToggleSidebar,
  onToggleInspector,
  sseStatus = null,
}: TopNavigationProps) {
  const [health, setHealth] = useState<{ ok: boolean; data?: BackendHealth; error?: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [copiedBranch, setCopiedBranch] = useState(false);

  const performHealthCheck = async () => {
    setChecking(true);
    const result = await checkBackendHealth();
    setHealth(result);
    setChecking(false);
  };

  useEffect(() => {
    performHealthCheck();
    const interval = setInterval(performHealthCheck, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleCopyBranch = () => {
    navigator.clipboard.writeText("feature/pratham-frontend");
    setCopiedBranch(true);
    setTimeout(() => setCopiedBranch(false), 2000);
  };

  return (
    <header className="h-12 border-b border-oled-border bg-oled-panel flex items-center justify-between px-3 shrink-0 select-none">
      {/* Left: Branding, Toggle & Breadcrumbs */}
      <div className="flex items-center gap-2.5">
        {/* Toggle Left Sidebar */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSidebar}
          title={isSidebarOpen ? "Collapse Sidebar (⌘B)" : "Expand Sidebar (⌘B)"}
          className="text-zinc-400 hover:text-zinc-200"
        >
          {isSidebarOpen ? (
            <PanelLeftClose className="w-4 h-4" />
          ) : (
            <PanelLeftOpen className="w-4 h-4" />
          )}
        </Button>

        {/* Branding */}
        <div className="flex items-center gap-2 pr-3 border-r border-oled-border">
          <div className="w-6 h-6 rounded bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-sm">
            <Boxes className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-xs font-semibold tracking-wider text-slate-100 uppercase">
            ShipDev
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 bg-zinc-900 text-zinc-400 rounded border border-zinc-800">
            IDE v0.2
          </span>
        </div>

        {/* Repository & Branch status */}
        <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-400">
          <span className="text-zinc-500">workspace</span>
          <span className="text-zinc-300 font-mono text-[11px]">shipdev-core</span>
          <span className="text-zinc-600">/</span>
          <button
            type="button"
            onClick={handleCopyBranch}
            title="Click to copy branch name"
            className="flex items-center gap-1 font-mono text-[11px] text-blue-400 hover:text-blue-300 bg-blue-950/40 hover:bg-blue-950/60 px-2 py-0.5 rounded border border-blue-900/40 transition-colors"
          >
            <GitBranch className="w-3 h-3 text-blue-400" />
            <span>feature/pratham-frontend</span>
            {copiedBranch ? (
              <Check className="w-2.5 h-2.5 text-emerald-400 ml-0.5" />
            ) : (
              <Copy className="w-2.5 h-2.5 text-blue-400/60 ml-0.5" />
            )}
          </button>
        </div>
      </div>

      {/* Center: Command Search Shortcut */}
      <div className="hidden md:flex items-center">
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="flex items-center gap-2 px-3 py-1 bg-oled-base hover:bg-oled-hover text-zinc-400 hover:text-zinc-200 text-xs rounded border border-oled-border transition-colors w-64 justify-between group"
        >
          <span className="flex items-center gap-2">
            <Search className="w-3 h-3 text-zinc-500 group-hover:text-zinc-400" />
            <span>Search tasks, commands...</span>
          </span>
          <kbd className="text-[10px] font-mono bg-zinc-900 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-800 group-hover:border-zinc-700">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right: Backend Health Beacon, Refresh, Actions & Inspector Toggle */}
      <div className="flex items-center gap-2">
        {/* Real Backend Connection Beacon */}
        <button
          onClick={performHealthCheck}
          title={
            health?.ok
              ? `FastAPI Online (${health.data?.environment || "development"})`
              : `FastAPI Offline: ${health?.error}`
          }
          className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] border transition-colors ${
            health === null
              ? "bg-zinc-900/60 text-zinc-400 border-zinc-800"
              : health.ok
              ? "bg-emerald-950/30 text-emerald-400 border-emerald-900/40 hover:bg-emerald-950/50"
              : "bg-rose-950/30 text-rose-400 border-rose-900/40 hover:bg-rose-950/50"
          }`}
        >
          {checking ? (
            <RefreshCw className="w-3 h-3 animate-spin text-zinc-400" />
          ) : health?.ok ? (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
          ) : (
            <XCircle className="w-3 h-3 text-rose-400" />
          )}
          <span className="font-mono hidden lg:inline">
            {health === null ? "Connecting..." : health.ok ? "API :8000" : "API Offline"}
          </span>
        </button>

        {/* Real-time SSE Stream indicator */}
        {sseStatus && (
          <div
            className={`hidden md:flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono border transition-colors ${
              sseStatus === "connected"
                ? "bg-blue-950/40 text-blue-300 border-blue-900/60"
                : sseStatus === "connecting"
                ? "bg-amber-950/40 text-amber-300 border-amber-900/60"
                : "bg-zinc-900/60 text-zinc-500 border-zinc-800"
            }`}
            title={`Real-time SSE event stream is ${sseStatus}`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                sseStatus === "connected"
                  ? "bg-blue-400 animate-pulse"
                  : sseStatus === "connecting"
                  ? "bg-amber-400 animate-ping"
                  : "bg-zinc-600"
              }`}
            />
            <span>
              {sseStatus === "connected"
                ? "Live Stream"
                : sseStatus === "connecting"
                ? "Stream Syncing"
                : "Stream Offline"}
            </span>
          </div>
        )}

        {/* Refresh button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onRefreshClick}
          disabled={isRefreshing}
          title="Refresh task data"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${
              isRefreshing ? "animate-spin text-blue-400" : "text-zinc-400"
            }`}
          />
        </Button>

        {/* New Bug Report */}
        <Button variant="primary" size="sm" onClick={onNewBugClick} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">New Bug Report</span>
        </Button>

        {/* Toggle Right Contextual Inspector */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleInspector}
          title={isInspectorOpen ? "Collapse Inspector (⌘I)" : "Expand Inspector (⌘I)"}
          className="text-zinc-400 hover:text-zinc-200"
        >
          {isInspectorOpen ? (
            <PanelRightClose className="w-4 h-4" />
          ) : (
            <PanelRightOpen className="w-4 h-4" />
          )}
        </Button>

        {/* User profile */}
        <div className="flex items-center gap-1.5 pl-2 border-l border-oled-border text-xs text-zinc-300">
          <div className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center font-mono text-[10px] text-zinc-300 font-medium">
            P
          </div>
          <span className="hidden xl:inline text-zinc-300 text-[11px] font-medium">
            pratham
          </span>
        </div>
      </div>
    </header>
  );
}

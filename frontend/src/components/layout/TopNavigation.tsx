"use client";

import React, { useEffect, useState } from "react";
import {
  Lock,
  RefreshCw,
  Users,
} from "lucide-react";
import { checkBackendHealth } from "@/lib/api";
import { BackendHealth } from "@/types";

interface TopNavigationProps {
  onRefreshClick: () => void;
  isRefreshing?: boolean;
  activeWorkspaceType?: "PERSONAL" | "TEAM";
  onWorkspaceChange?: (type: "PERSONAL" | "TEAM") => void;
}

export function TopNavigation({
  onRefreshClick,
  isRefreshing = false,
  activeWorkspaceType = "PERSONAL",
  onWorkspaceChange,
}: TopNavigationProps) {
  const [health, setHealth] = useState<{ ok: boolean; data?: BackendHealth; error?: string } | null>(null);

  const performHealthCheck = async () => {
    const result = await checkBackendHealth();
    setHealth(result);
  };

  useEffect(() => {
    performHealthCheck();
    const interval = setInterval(performHealthCheck, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="h-12 border-b border-clay-hairline bg-clay-canvas flex items-center justify-between px-4 shrink-0 select-none text-xs font-sans z-30 shadow-xs">
      {/* Left: Branding & Workspace Isolation Switcher */}
      <div className="flex items-center gap-3 min-w-0">
        {/* ShipDev Wordmark */}
        <div className="flex items-center gap-2 pr-3 border-r border-clay-hairline">
          <div className="w-6 h-6 rounded-clay-md bg-clay-primary flex items-center justify-center text-white shadow-clay-soft">
            <span className="w-2.5 h-2.5 rounded-full bg-clay-pink" />
          </div>
          <span className="font-semibold text-clay-ink tracking-tight text-[13px]">
            ShipDev
          </span>
        </div>

        {/* Workspace Switcher: PERSONAL | TEAM */}
        {onWorkspaceChange && (
          <div className="flex items-center p-0.5 rounded-clay-pill bg-clay-surface-soft border border-clay-hairline shadow-xs">
            <button
              onClick={() => onWorkspaceChange("PERSONAL")}
              title="Personal Workspace (Discord & Telegram bot integration, private memory)"
              className={`flex items-center gap-1.5 px-3 py-1 rounded-clay-pill text-[11px] font-medium transition-all cursor-pointer ${
                activeWorkspaceType === "PERSONAL"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-300 font-semibold shadow-xs"
                  : "text-clay-muted hover:text-clay-ink"
              }`}
            >
              <Lock className="w-3 h-3 text-emerald-600" />
              <span>Personal Workspace</span>
            </button>
            <button
              onClick={() => onWorkspaceChange("TEAM")}
              title="Team Workspace (Slack & MS Teams integration, collaborative review gate)"
              className={`flex items-center gap-1.5 px-3 py-1 rounded-clay-pill text-[11px] font-medium transition-all cursor-pointer ${
                activeWorkspaceType === "TEAM"
                  ? "bg-indigo-50 text-indigo-800 border border-indigo-300 font-semibold shadow-xs"
                  : "text-clay-muted hover:text-clay-ink"
              }`}
            >
              <Users className="w-3 h-3 text-indigo-600" />
              <span>Team Workspace</span>
            </button>
          </div>
        )}
      </div>

      {/* Right: Live Connection Badges & Refresh */}
      <div className="flex items-center gap-2.5">
        {/* Live Backend Connection Status */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-clay-pill bg-clay-surface-soft border border-clay-hairline text-[11px] shadow-xs">
          <span className={`w-1.5 h-1.5 rounded-full ${health?.ok ? "bg-clay-success" : "bg-clay-coral animate-pulse"}`} />
          <span className="text-clay-muted hidden sm:inline">Backend:</span>
          <span className="text-clay-ink font-medium">{health?.ok ? "Connected" : "Reconnecting"}</span>
        </div>

        {/* AI Engine Status */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-clay-pill bg-clay-surface-soft border border-clay-hairline text-[11px] shadow-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-clay-success" />
          <span className="text-clay-muted hidden sm:inline">AI Engine:</span>
          <span className="text-clay-ink font-semibold">Live</span>
        </div>

        {/* Refresh Button */}
        <button
          onClick={onRefreshClick}
          title="Refresh task queue and platform status"
          aria-label="Refresh task queue and platform status"
          className="h-8 px-2.5 flex items-center gap-1.5 text-clay-body hover:text-clay-ink rounded-clay-md bg-clay-surface-soft hover:bg-clay-surface-card border border-clay-hairline transition-colors cursor-pointer text-xs font-medium"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-clay-teal" : ""}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>
    </header>
  );
}

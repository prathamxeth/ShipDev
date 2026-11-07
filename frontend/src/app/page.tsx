"use client";

import React, { useEffect, useState, useCallback } from "react";
import { TopNavigation } from "@/components/layout/TopNavigation";
import { LeftActivityBar, ActivityTab } from "@/components/layout/LeftActivityBar";
import { PersonalAssistantView } from "@/components/workspace/PersonalAssistantView";
import { ReviewsApprovalView } from "@/components/workspace/ReviewsApprovalView";
import { PlatformsManagementPanel } from "@/components/workspace/PlatformsManagementPanel";
import { AboutModal } from "@/components/modals/AboutModal";
import {
  getTasks,
  setActiveWorkspaceId,
} from "@/lib/api";
import { Task } from "@/types";
import { CheckCircle2 } from "lucide-react";

export default function ShipDevIDE() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeWorkspaceType, setActiveWorkspaceType] = useState<"PERSONAL" | "TEAM">("PERSONAL");
  const [activeActivityTab, setActiveActivityTab] = useState<ActivityTab>("assistant");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isAboutOpen, setIsAboutOpen] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3200);
  }, []);

  const loadTasks = useCallback(async (silent = false) => {
    try {
      const data = await getTasks();
      setTasks(data);
    } catch {
      // Offline fallback
    }
  }, []);

  useEffect(() => {
    loadTasks();
    const interval = setInterval(() => loadTasks(true), 15000);
    return () => clearInterval(interval);
  }, [loadTasks]);

  const handleWorkspaceChange = useCallback((newType: "PERSONAL" | "TEAM") => {
    setActiveWorkspaceType(newType);
    const targetWsId = newType === "TEAM" ? "ws_team_default" : "ws_personal_default";
    setActiveWorkspaceId(targetWsId);

    setTasks([]);
    setActiveActivityTab("assistant");
    loadTasks(true);

    showToast(`Switched to ${newType === "PERSONAL" ? "🔒 Personal Workspace" : "👥 Team Workspace"}`);
  }, [loadTasks, showToast]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadTasks(true);
    setIsRefreshing(false);
    showToast("✓ Synced tasks and platform integrations from backend");
  };

  const awaitingReviewsCount = tasks.filter((t) => t.status === "AWAITING_HUMAN_APPROVAL").length;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-clay-canvas text-clay-ink font-sans select-none">
      {/* Top Bar Navigation */}
      <TopNavigation
        onRefreshClick={handleRefresh}
        isRefreshing={isRefreshing}
        activeWorkspaceType={activeWorkspaceType}
        onWorkspaceChange={handleWorkspaceChange}
      />

      {/* Main Workspace Shell */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* Left Activity Bar (48px) */}
        <LeftActivityBar
          activeTab={activeActivityTab}
          onSelectTab={(tab) => setActiveActivityTab(tab)}
          onOpenSettings={() => setIsAboutOpen(true)}
          onOpenAbout={() => setIsAboutOpen(true)}
          bugCount={awaitingReviewsCount}
          activeWorkspaceType={activeWorkspaceType}
        />

        {/* 1. PERSONAL / TEAM AI ASSISTANT VIEW */}
        {activeActivityTab === "assistant" && (
          <div className="flex-1 min-w-0 h-full overflow-hidden flex flex-col">
            <PersonalAssistantView
              activeWorkspaceType={activeWorkspaceType}
              onTaskCreated={() => loadTasks(true)}
            />
          </div>
        )}

        {/* 2. TEAM REVIEWS & HUMAN GATE CONSOLE */}
        {activeActivityTab === "reviews" && (
          <div className="flex-1 min-w-0 h-full overflow-hidden flex flex-col">
            <ReviewsApprovalView
              tasks={tasks}
              onRefresh={handleRefresh}
            />
          </div>
        )}

        {/* 3. CONNECTED PLATFORMS PANEL (Slack, Teams, Discord, Telegram) */}
        {activeActivityTab === "platforms" && (
          <div className="flex-1 min-w-0 h-full overflow-hidden flex flex-col bg-clay-canvas">
            <PlatformsManagementPanel
              activeWorkspaceType={activeWorkspaceType}
            />
          </div>
        )}
      </div>

      {/* Modals */}
      <AboutModal
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
        switchConnected={true}
      />

      {/* Global Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-clay-md bg-clay-primary text-white text-xs font-medium shadow-clay-elevated flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-white" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}

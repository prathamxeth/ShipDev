"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { TopNavigation } from "@/components/layout/TopNavigation";
import { LeftActivityBar, ActivityTab } from "@/components/layout/LeftActivityBar";
import { PersonalAssistantView } from "@/components/workspace/PersonalAssistantView";
import { ReviewsApprovalView } from "@/components/workspace/ReviewsApprovalView";
import { PlatformsManagementPanel } from "@/components/workspace/PlatformsManagementPanel";
import { BugGraphCanvas } from "@/components/workspace/BugGraphCanvas";
import { CodeEditor } from "@/components/workspace/CodeEditor";
import { AgentsRosterView } from "@/components/workspace/AgentsRosterView";
import { AboutModal } from "@/components/modals/AboutModal";
import { AgentDetailModal, AgentIdentifier } from "@/components/modals/AgentDetailModal";
import { INITIAL_WORKSPACE_FILES, WorkspaceFile } from "@/lib/workspaceFiles";
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
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedAgentModal, setSelectedAgentModal] = useState<AgentIdentifier | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isAboutOpen, setIsAboutOpen] = useState(false);

  // Code Viewer & Architecture Map states
  const [workspaceFiles, setWorkspaceFiles] = useState<Record<string, WorkspaceFile>>(INITIAL_WORKSPACE_FILES);
  const [openTabs, setOpenTabs] = useState<string[]>(["calculator.py", "test_calculator.py"]);
  const [activeFileName, setActiveFileName] = useState<string>("calculator.py");
  const [targetHighlightLine, setTargetHighlightLine] = useState<number | null>(null);
  const [isDiffMode, setIsDiffMode] = useState(false);
  const [cursorPosition, setCursorPosition] = useState<{ lineNumber: number; column: number }>({ lineNumber: 1, column: 1 });
  const [isGraphMaximized, setIsGraphMaximized] = useState(false);

  const handleSelectFile = useCallback((fileName: string) => {
    setActiveFileName(fileName);
    setOpenTabs((prev) => (prev.includes(fileName) ? prev : [...prev, fileName]));
    setTargetHighlightLine(null);
  }, []);

  const handleCloseTab = useCallback((fileName: string) => {
    setOpenTabs((prev) => {
      const remaining = prev.filter((f) => f !== fileName);
      if (activeFileName === fileName && remaining.length > 0) {
        setActiveFileName(remaining[remaining.length - 1]);
      }
      return remaining.length > 0 ? remaining : [fileName];
    });
  }, [activeFileName]);

  const handleCodeChange = useCallback((newCode: string) => {
    setWorkspaceFiles((prev) => {
      const target = prev[activeFileName];
      if (!target) return prev;
      return {
        ...prev,
        [activeFileName]: {
          ...target,
          code: newCode,
          modified: true,
        },
      };
    });
  }, [activeFileName]);

  const currentBugAnnotation = useMemo(() => {
    const file = workspaceFiles[activeFileName];
    if (file?.bugLine && file?.bugDescription) {
      return {
        lineNumber: file.bugLine,
        description: file.bugDescription,
        severity: "critical",
      };
    }
    return null;
  }, [workspaceFiles, activeFileName]);

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

        {/* 4. SYSTEM ARCHITECTURE GRAPH & CODE VIEWER VIEW */}
        {activeActivityTab === "graph" && (
          <div className="flex-1 min-h-0 relative flex flex-row h-full bg-clay-canvas overflow-hidden">
            {/* Architecture Graph Canvas */}
            <div
              className={`h-full relative flex flex-col bg-clay-canvas overflow-hidden transition-all duration-200 ${
                isGraphMaximized ? "w-full" : "w-1/2 min-w-[340px] border-r border-clay-hairline"
              }`}
            >
              <BugGraphCanvas
                tasks={tasks}
                selectedTaskId={selectedTaskId}
                activeFileName={activeFileName}
                workspaceFiles={workspaceFiles}
                onSelectBug={(task, fileName, lineNumber) => {
                  setSelectedTaskId(task.id);
                  if (fileName) {
                    handleSelectFile(fileName);
                    if (lineNumber) setTargetHighlightLine(lineNumber);
                  }
                }}
                onSelectFile={(fileName) => {
                  handleSelectFile(fileName);
                  setIsGraphMaximized(false);
                }}
                onNavigateToLine={(fileName, lineNumber) => {
                  handleSelectFile(fileName);
                  setTargetHighlightLine(lineNumber);
                  setIsGraphMaximized(false);
                }}
                onSelectAgent={(agentId) => setSelectedAgentModal(agentId)}
                compact={!isGraphMaximized}
                isEnlarged={isGraphMaximized}
                onToggleEnlarge={() => setIsGraphMaximized((prev) => !prev)}
                onReturnToCode={() => setIsGraphMaximized(false)}
              />
            </div>

            {/* Code Viewer Panel */}
            {!isGraphMaximized && (
              <div className="flex-1 min-w-0 h-full flex flex-col bg-white overflow-hidden">
                <CodeEditor
                  workspaceFiles={workspaceFiles}
                  openTabs={openTabs}
                  activeFileName={activeFileName}
                  onSelectTab={handleSelectFile}
                  onCloseTab={handleCloseTab}
                  onCodeChange={handleCodeChange}
                  isDiffMode={isDiffMode}
                  onToggleDiffMode={() => setIsDiffMode((prev) => !prev)}
                  originalCodeForDiff={workspaceFiles[activeFileName]?.code || ""}
                  modifiedCodeForDiff={workspaceFiles[activeFileName]?.code || ""}
                  onAcceptDiff={() => showToast("✓ Code changes accepted")}
                  onRejectDiff={() => showToast("Diff rejected")}
                  targetHighlightLine={targetHighlightLine}
                  bugAnnotation={currentBugAnnotation}
                  cursorPosition={cursorPosition}
                  onCursorPositionChange={setCursorPosition}
                  onSaveFile={() => showToast("✓ File saved")}
                  onOpenSystemMap={() => setIsGraphMaximized(true)}
                />
              </div>
            )}
          </div>
        )}

        {/* 5. SWITCH AI AGENTS OVERVIEW VIEW */}
        {activeActivityTab === "agents" && (
          <div className="flex-1 min-w-0 h-full overflow-hidden flex flex-col">
            <AgentsRosterView activeWorkspaceType={activeWorkspaceType} />
          </div>
        )}
      </div>

      {/* Modals */}
      <AboutModal
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
        switchConnected={true}
      />

      <AgentDetailModal
        isOpen={Boolean(selectedAgentModal)}
        onClose={() => setSelectedAgentModal(null)}
        agentId={selectedAgentModal}
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

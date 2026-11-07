"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { TopNavigation } from "@/components/layout/TopNavigation";
import { LeftActivityBar, ActivityTab } from "@/components/layout/LeftActivityBar";
import { BugTree } from "@/components/workspace/BugTree";
import { CodeEditor } from "@/components/workspace/CodeEditor";
import { SwitchAgentWorkspace } from "@/components/workspace/SwitchAgentWorkspace";
import { BottomWorkspacePanel } from "@/components/workspace/BottomWorkspacePanel";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { NewBugModal } from "@/components/modals/NewBugModal";
import { SettingsModal } from "@/components/modals/SettingsModal";
import { AboutModal } from "@/components/modals/AboutModal";
import { AgentDetailModal, AgentIdentifier } from "@/components/modals/AgentDetailModal";
import {
  getTasks,
  getTaskById,
  getTaskEvidence,
  getTaskHistory,
  getTaskApprovals,
} from "@/lib/api";
import { subscribeToTaskEvents } from "@/lib/sse";
import {
  ApprovalRecord,
  Evidence,
  SSEConnectionStatus,
  Task,
  TaskTransitionEvent,
  TransitionHistory,
} from "@/types";
import {
  INITIAL_WORKSPACE_FILES,
  WorkspaceFile,
  resolveBugLocation,
  getPatchedCode,
} from "@/lib/workspaceFiles";
import { CheckCircle2 } from "lucide-react";

export default function ShipDevIDE() {
  // Backend & Real Task State
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [evidenceList, setEvidenceList] = useState<Evidence[]>([]);
  const [history, setHistory] = useState<TransitionHistory[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRecord[]>([]);
  const [sseStatus, setSseStatus] = useState<SSEConnectionStatus | null>(null);

  // Loading & Diagnostics
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Navigation & Panel Layout
  const [activeActivityTab, setActiveActivityTab] = useState<ActivityTab>("bugtree");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [bottomDockHeight, setBottomDockHeight] = useState(200);
  const [isBottomDockCollapsed, setIsBottomDockCollapsed] = useState(false);

  // Workspace Files & Editor Tabs State
  const [workspaceFiles, setWorkspaceFiles] = useState<Record<string, WorkspaceFile>>(
    INITIAL_WORKSPACE_FILES
  );
  const [openTabs, setOpenTabs] = useState<string[]>([
    "calculator.py",
    "test_calculator.py",
    "switch_bridge.py",
  ]);
  const [activeFileName, setActiveFileName] = useState<string>("calculator.py");
  const [targetHighlightLine, setTargetHighlightLine] = useState<number | null>(22);
  const [cursorPosition, setCursorPosition] = useState<{ lineNumber: number; column: number }>({
    lineNumber: 22,
    column: 1,
  });

  // Diff Comparison State
  const [isDiffMode, setIsDiffMode] = useState<boolean>(false);

  // Modals
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isNewBugModalOpen, setIsNewBugModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [selectedAgentModal, setSelectedAgentModal] = useState<AgentIdentifier | null>(null);

  // Show Toast Helper
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  // Save Current File
  const handleSaveFile = useCallback(() => {
    if (!activeFileName || !workspaceFiles[activeFileName]) return;
    setWorkspaceFiles((prev) => ({
      ...prev,
      [activeFileName]: {
        ...prev[activeFileName],
        modified: false,
      },
    }));
    showToast(`✓ Saved ${activeFileName} to workspace`);
  }, [activeFileName, workspaceFiles, showToast]);

  // Get Latest Unified Patch Diff
  const latestPatchDiff = useMemo(() => {
    const patchEv = [...evidenceList]
      .reverse()
      .find((e) => e.patch_diff && e.patch_diff.trim().length > 0);
    return patchEv?.patch_diff || null;
  }, [evidenceList]);

  // Original vs Proposed Code for Monaco Diff Editor
  const activeOriginalCode = workspaceFiles[activeFileName]?.code || "";
  const activePatchedCode = useMemo(() => {
    return getPatchedCode(activeFileName, activeOriginalCode, latestPatchDiff);
  }, [activeFileName, activeOriginalCode, latestPatchDiff]);

  // Accept and apply diff changes
  const handleAcceptDiff = useCallback(() => {
    if (!activeFileName || !workspaceFiles[activeFileName]) return;
    setWorkspaceFiles((prev) => ({
      ...prev,
      [activeFileName]: {
        ...prev[activeFileName],
        code: activePatchedCode,
        modified: true,
      },
    }));
    setIsDiffMode(false);
    showToast(`✓ Accepted & applied fix to ${activeFileName}!`);
  }, [activeFileName, activePatchedCode, workspaceFiles, showToast]);

  // Reject diff changes
  const handleRejectDiff = useCallback(() => {
    setIsDiffMode(false);
    showToast(`✓ Diff rejected: preserved current baseline`);
  }, [showToast]);

  // Keyboard Shortcuts (⌘K palette, ⌘, settings, ⌘S save, ⌘Y accept diff, ⌘N reject diff, Esc)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      } else if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setIsSettingsOpen(true);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSaveFile();
      } else if (isDiffMode && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleAcceptDiff();
      } else if (isDiffMode && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        handleRejectDiff();
      } else if (isDiffMode && e.key === "Escape") {
        e.preventDefault();
        setIsDiffMode(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDiffMode, handleSaveFile, handleAcceptDiff, handleRejectDiff]);

  // Load Task Queue from Backend
  const loadTasks = useCallback(async (quiet = false) => {
    if (!quiet) setIsLoadingTasks(true);
    try {
      const fetchedTasks = await getTasks();
      setTasks(fetchedTasks);

      if (fetchedTasks.length > 0) {
        setSelectedTaskId((prev) =>
          prev && fetchedTasks.some((t) => t.id === prev) ? prev : fetchedTasks[0].id
        );
      } else {
        setSelectedTaskId(null);
        setSelectedTask(null);
      }
    } catch {
      setTasks([]);
    } finally {
      if (!quiet) setIsLoadingTasks(false);
    }
  }, []);

  // Load Task Details (Evidence, Transition History, Approvals)
  const loadTaskDetails = useCallback(async (taskId: string) => {
    setIsLoadingDetails(true);
    try {
      const [taskData, evidenceData, historyData, approvalsData] = await Promise.all([
        getTaskById(taskId).catch(() => null),
        getTaskEvidence(taskId).catch(() => []),
        getTaskHistory(taskId).catch(() => []),
        getTaskApprovals(taskId).catch(() => []),
      ]);

      setSelectedTask(taskData);
      setEvidenceList(evidenceData);
      setHistory(historyData);
      setApprovals(approvalsData);

      // Auto-focus the affected file in the editor
      if (taskData) {
        const loc = resolveBugLocation(taskData);
        if (loc.fileName && workspaceFiles[loc.fileName]) {
          setActiveFileName(loc.fileName);
          setTargetHighlightLine(loc.lineNumber);
          if (!openTabs.includes(loc.fileName)) {
            setOpenTabs((prev) => [...prev, loc.fileName]);
          }
        }
      }
    } catch {
      // Handled in individual promises
    } finally {
      setIsLoadingDetails(false);
    }
  }, [workspaceFiles, openTabs]);

  // Initial load
  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // When selectedTaskId changes, reload details
  useEffect(() => {
    if (selectedTaskId) {
      loadTaskDetails(selectedTaskId);
    } else {
      setSelectedTask(null);
      setEvidenceList([]);
      setHistory([]);
      setApprovals([]);
    }
  }, [selectedTaskId, loadTaskDetails]);

  // Real-time SSE subscription for selected task
  useEffect(() => {
    if (!selectedTaskId) {
      setSseStatus(null);
      return;
    }

    const unsubscribe = subscribeToTaskEvents(
      selectedTaskId,
      {
        onStatusChange: (status) => setSseStatus(status),
        onTransition: (event: TaskTransitionEvent) => {
          // 1. Update active task
          setSelectedTask((prev) => {
            if (!prev || prev.id !== event.task_id) return prev;
            return {
              ...prev,
              status: event.to_status,
              updated_at: event.timestamp,
            };
          });

          // 2. Update task in tasks queue
          setTasks((prev) =>
            prev.map((t) =>
              t.id === event.task_id
                ? { ...t, status: event.to_status, updated_at: event.timestamp }
                : t
            )
          );

          // 3. Append to history
          setHistory((prev) => {
            if (prev.some((h) => h.id === event.event_id)) return prev;
            const newHistoryItem: TransitionHistory = {
              id: event.event_id,
              task_id: event.task_id,
              from_status: event.from_status,
              to_status: event.to_status,
              actor_type: event.actor_type,
              actor_id: event.actor_id,
              reason: event.reason || null,
              evidence_id: event.evidence_id || null,
              created_at: event.timestamp,
            };
            return [...prev, newHistoryItem];
          });

          // 4. Re-fetch evidence & approvals
          getTaskEvidence(event.task_id)
            .then((evList) => setEvidenceList(evList))
            .catch(() => {});
          getTaskApprovals(event.task_id)
            .then((apprList) => setApprovals(apprList))
            .catch(() => {});
        },
      },
      true
    );

    return () => {
      unsubscribe();
    };
  }, [selectedTaskId]);

  // Refresh Handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadTasks(true);
    if (selectedTaskId) {
      await loadTaskDetails(selectedTaskId);
    }
    setIsRefreshing(false);
    showToast("✓ Synced tasks and evidence from backend");
  };

  // Select Bug in Tree
  const handleSelectBug = (task: Task, fileName: string, lineNumber: number) => {
    setSelectedTaskId(task.id);
    if (workspaceFiles[fileName]) {
      setActiveFileName(fileName);
      setTargetHighlightLine(lineNumber);
      if (!openTabs.includes(fileName)) {
        setOpenTabs((prev) => [...prev, fileName]);
      }
    }
  };

  // Select File in Explorer or Tabs
  const handleSelectFile = useCallback((fileName: string) => {
    if (!workspaceFiles[fileName]) return;
    setActiveFileName(fileName);
    setOpenTabs((prev) => (prev.includes(fileName) ? prev : [...prev, fileName]));
    setIsDiffMode(false);
  }, [workspaceFiles]);

  // Create New File
  const handleCreateFile = useCallback((newFileName: string) => {
    const isPy = newFileName.endsWith(".py");
    const defaultCode = isPy
      ? `# Module: ${newFileName}\n\ndef main():\n    pass\n`
      : `// Module: ${newFileName}\n\nexport function run(): void {\n  console.log("${newFileName} active");\n}\n`;

    setWorkspaceFiles((prev) => ({
      ...prev,
      [newFileName]: {
        name: newFileName,
        path: `src/${newFileName}`,
        language: isPy ? "python" : "typescript",
        code: defaultCode,
        modified: true,
      },
    }));

    setOpenTabs((prev) => (prev.includes(newFileName) ? prev : [...prev, newFileName]));
    setActiveFileName(newFileName);
    showToast(`✓ Created ${newFileName}`);
  }, [showToast]);

  // Navigate directly to file and line
  const handleNavigateToLine = useCallback((fileName: string, lineNumber: number) => {
    handleSelectFile(fileName);
    setTargetHighlightLine(lineNumber);
  }, [handleSelectFile]);

  // Close Tab
  const handleCloseTab = (tabToClose: string) => {
    const remaining = openTabs.filter((t) => t !== tabToClose);
    setOpenTabs(remaining);
    if (activeFileName === tabToClose) {
      if (remaining.length > 0) {
        setActiveFileName(remaining[remaining.length - 1]);
      } else {
        setActiveFileName("");
      }
    }
  };

  // Code Change in Editor
  const handleCodeChange = (newCode: string) => {
    if (!activeFileName || !workspaceFiles[activeFileName]) return;
    setWorkspaceFiles((prev) => ({
      ...prev,
      [activeFileName]: {
        ...prev[activeFileName],
        code: newCode,
        modified: true,
      },
    }));
  };


  // Active File Bug Annotation
  const currentBugAnnotation = useMemo(() => {
    if (!selectedTask) return null;
    const loc = resolveBugLocation(selectedTask);
    if (loc.fileName === activeFileName) {
      return {
        lineNumber: loc.lineNumber,
        description: loc.defectSummary,
        severity: loc.severity,
      };
    }
    return null;
  }, [selectedTask, activeFileName]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-clay-canvas text-clay-ink font-sans select-none">
      {/* Top Bar Navigation */}
      <TopNavigation
        onNewBugClick={() => setIsNewBugModalOpen(true)}
        onRefreshClick={handleRefresh}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenAbout={() => setIsAboutOpen(true)}
        onOpenAgentDetail={(id) => setSelectedAgentModal(id)}
        isRefreshing={isRefreshing}
        isDiffMode={isDiffMode}
        onToggleDiffMode={() => setIsDiffMode((prev) => !prev)}
        sseStatus={sseStatus}
      />

      {/* Main IDE Workspace Shell */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* Left Activity Bar (48px) */}
        <LeftActivityBar
          activeTab={activeActivityTab}
          onSelectTab={(tab) => {
            if (activeActivityTab === tab && isSidebarOpen) {
              setIsSidebarOpen(false);
            } else {
              setActiveActivityTab(tab);
              setIsSidebarOpen(true);
            }
          }}
          isSidebarOpen={isSidebarOpen}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenAbout={() => setIsAboutOpen(true)}
          bugCount={tasks.length}
        />

        {/* Left Sidebar: Live Bug Tree / Explorer / Search / Git / Agents */}
        {isSidebarOpen && (
          <div className="w-64 lg:w-72 shrink-0 h-full border-r border-clay-hairline">
            <BugTree
              tasks={tasks}
              selectedTaskId={selectedTaskId}
              activeFileName={activeFileName}
              activeActivityTab={activeActivityTab}
              workspaceFiles={workspaceFiles}
              onSelectBug={handleSelectBug}
              onSelectFile={handleSelectFile}
              onNavigateToLine={handleNavigateToLine}
              onCreateFile={handleCreateFile}
              onSelectAgent={(id) => setSelectedAgentModal(id)}
              isLoading={isLoadingTasks}
              onNewBugClick={() => setIsNewBugModalOpen(true)}
              onRefreshClick={handleRefresh}
            />
          </div>
        )}

        {/* Center: Monaco Code Editor & Resizable Bottom Dock */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          {/* Monaco Code Editor */}
          <div className="flex-1 min-h-0 relative">
            <CodeEditor
              workspaceFiles={workspaceFiles}
              openTabs={openTabs}
              activeFileName={activeFileName}
              onSelectTab={handleSelectFile}
              onCloseTab={handleCloseTab}
              onCodeChange={handleCodeChange}
              isDiffMode={isDiffMode}
              onToggleDiffMode={() => setIsDiffMode((prev) => !prev)}
              originalCodeForDiff={activeOriginalCode}
              modifiedCodeForDiff={activePatchedCode}
              onAcceptDiff={handleAcceptDiff}
              onRejectDiff={handleRejectDiff}
              targetHighlightLine={targetHighlightLine}
              bugAnnotation={currentBugAnnotation}
              cursorPosition={cursorPosition}
              onCursorPositionChange={setCursorPosition}
              onSaveFile={handleSaveFile}
            />
          </div>

          {/* Resizable Bottom Dock */}
          <BottomWorkspacePanel
            task={selectedTask}
            evidenceList={evidenceList}
            history={history}
            patchDiff={latestPatchDiff}
            onNavigateToLine={handleNavigateToLine}
            height={bottomDockHeight}
            onHeightChange={setBottomDockHeight}
            isCollapsed={isBottomDockCollapsed}
            onToggleCollapse={() => setIsBottomDockCollapsed((prev) => !prev)}
          />
        </div>

        {/* Right: AI Engineering Team (Switch Agent Workspace) */}
        <SwitchAgentWorkspace
          task={selectedTask}
          evidenceList={evidenceList}
          approvals={approvals}
          isLoading={isLoadingDetails}
          onTaskUpdated={(updatedTask) => {
            setSelectedTask(updatedTask);
            setTasks((prev) => prev.map((t) => (t.id === updatedTask.id ? updatedTask : t)));
            loadTaskDetails(updatedTask.id);
          }}
          onToggleDiffMode={() => setIsDiffMode(true)}
        />
      </div>

      {/* Cursor / Clay IDE Status Bar */}
      <div className="h-6 bg-clay-surface-soft border-t border-clay-hairline px-3 flex items-center justify-between text-[11px] font-mono text-clay-muted shrink-0 select-none z-30">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-1.5 text-clay-ink">
            <span className="w-1.5 h-1.5 rounded-full bg-clay-primary" />
            <span className="font-semibold text-clay-ink">ShipDev</span>
          </div>
          <span className="text-clay-hairline">•</span>
          <div className="flex items-center gap-1 text-clay-success font-medium">
            <CheckCircle2 className="w-3 h-3 text-clay-success" />
            <span>0 syntax errors</span>
          </div>
          <span className="text-clay-hairline">•</span>
          <span className="text-clay-muted">
            {tasks.length} {tasks.length === 1 ? "bug tracked" : "bugs tracked"}
          </span>
        </div>

        <div className="flex items-center gap-3 text-clay-muted">
          <span className="text-clay-muted uppercase text-[10px] px-1.5 py-0.5 rounded-clay-xs bg-clay-surface-card border border-clay-hairline font-medium">
            {workspaceFiles[activeFileName]?.language || "python"}
          </span>
          <span className="text-clay-body">
            Ln {cursorPosition.lineNumber}, Col {cursorPosition.column}
          </span>
          <span className="text-clay-primary font-semibold hidden md:inline">
            Switch Supervised
          </span>
        </div>
      </div>

      {/* Modals & Dialogs */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        tasks={tasks}
        onSelectTask={(id) => setSelectedTaskId(id)}
        onSelectFile={handleSelectFile}
        onNavigateToLine={handleNavigateToLine}
        onNewBugClick={() => setIsNewBugModalOpen(true)}
        onRefreshClick={handleRefresh}
        onToggleDiffMode={() => setIsDiffMode((prev) => !prev)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenAbout={() => setIsAboutOpen(true)}
        isDiffMode={isDiffMode}
      />

      <NewBugModal
        isOpen={isNewBugModalOpen}
        onClose={() => setIsNewBugModalOpen(false)}
        onTaskCreated={(newTask) => {
          setTasks((prev) => [newTask, ...prev]);
          setSelectedTaskId(newTask.id);
          showToast(`✓ Bug report submitted: ${newTask.title}`);
        }}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSettingsSaved={() => showToast("✓ Settings updated")}
      />

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
        <div className="fixed bottom-9 left-1/2 -translate-x-1/2 z-50 px-3.5 py-1.5 rounded-clay-md bg-clay-primary text-white text-xs font-mono shadow-clay-elevated flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-white" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}

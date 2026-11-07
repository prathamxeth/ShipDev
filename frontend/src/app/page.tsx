"use client";

import React, { useEffect, useState, useCallback } from "react";
import { TopNavigation } from "@/components/layout/TopNavigation";
import { LeftSidebar } from "@/components/layout/LeftSidebar";
import { CentralWorkspace } from "@/components/workspace/CentralWorkspace";
import { RightInspector } from "@/components/layout/RightInspector";
import { NewBugModal } from "@/components/modals/NewBugModal";
import { CommandPalette } from "@/components/layout/CommandPalette";
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

export default function ShipDevIDE() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [evidenceList, setEvidenceList] = useState<Evidence[]>([]);
  const [history, setHistory] = useState<TransitionHistory[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRecord[]>([]);
  const [sseStatus, setSseStatus] = useState<SSEConnectionStatus | null>(null);

  const [isLoadingTasks, setIsLoadingTasks] = useState(true);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNewBugModalOpen, setIsNewBugModalOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);

  // Global keyboard shortcuts (Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Fetch task queue from backend
  const loadTasks = useCallback(async (quiet = false) => {
    if (!quiet) setIsLoadingTasks(true);
    setError(null);
    try {
      const fetchedTasks = await getTasks();
      setTasks(fetchedTasks);

      // Auto-select first task if none selected or if selected task disappeared
      if (fetchedTasks.length > 0) {
        setSelectedTaskId((prev) => (prev && fetchedTasks.some((t) => t.id === prev) ? prev : fetchedTasks[0].id));
      } else {
        setSelectedTaskId(null);
        setSelectedTask(null);
      }
    } catch (err: any) {
      setError(err.message || "Failed to connect to backend");
      setTasks([]);
    } finally {
      if (!quiet) setIsLoadingTasks(false);
    }
  }, []);

  // Fetch details for currently selected task
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
    } catch {
      // Handled inside individual promises
    } finally {
      setIsLoadingDetails(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // When selectedTaskId changes, load its child data
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
          // 1. Update selected task status
          setSelectedTask((prev) => {
            if (!prev || prev.id !== event.task_id) return prev;
            return {
              ...prev,
              status: event.to_status,
              updated_at: event.timestamp,
            };
          });

          // 2. Update task in sidebar queue
          setTasks((prev) =>
            prev.map((t) =>
              t.id === event.task_id
                ? { ...t, status: event.to_status, updated_at: event.timestamp }
                : t
            )
          );

          // 3. Append to history without duplicate event_ids
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

          // 4. Re-fetch evidence & approvals if new evidence or state change occurs
          getTaskEvidence(event.task_id)
            .then((evList) => setEvidenceList(evList))
            .catch(() => {});
          getTaskApprovals(event.task_id)
            .then((apprList) => setApprovals(apprList))
            .catch(() => {});
        },
      },
      true // replay_all to ensure chronological continuity
    );

    return () => {
      unsubscribe();
    };
  }, [selectedTaskId]);

  // Refresh handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadTasks(true);
    if (selectedTaskId) {
      await loadTaskDetails(selectedTaskId);
    }
    setIsRefreshing(false);
  };

  // When a new bug is created via modal
  const handleTaskCreated = (newTask: Task) => {
    setTasks((prev) => [newTask, ...prev]);
    setSelectedTaskId(newTask.id);
  };

  // When a task is approved, rejected, or completed via the Human Gate
  const handleTaskUpdated = (updatedTask: Task) => {
    setSelectedTask(updatedTask);
    setTasks((prev) => prev.map((t) => (t.id === updatedTask.id ? updatedTask : t)));
    // Re-fetch history and approval records for the task
    loadTaskDetails(updatedTask.id);
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-oled-black">
      {/* Top Nav */}
      <TopNavigation
        onNewBugClick={() => setIsNewBugModalOpen(true)}
        onRefreshClick={handleRefresh}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        isRefreshing={isRefreshing}
        isSidebarOpen={isSidebarOpen}
        isInspectorOpen={isInspectorOpen}
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        onToggleInspector={() => setIsInspectorOpen((prev) => !prev)}
        sseStatus={sseStatus}
      />

      {/* Main 3-Pane Engineering Layout */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left: Task Queue Sidebar */}
        {isSidebarOpen && (
          <LeftSidebar
            tasks={tasks}
            selectedTaskId={selectedTaskId}
            onSelectTask={(id) => setSelectedTaskId(id)}
            isLoading={isLoadingTasks}
            error={error}
            onRetry={() => loadTasks(false)}
          />
        )}

        {/* Center: IDE Workspace */}
        <CentralWorkspace
          task={selectedTask}
          evidenceList={evidenceList}
          history={history}
          isLoading={isLoadingDetails}
        />

        {/* Right: Contextual Inspector & Verification Checklist */}
        {isInspectorOpen && (
          <div className="hidden lg:block">
            <RightInspector
              task={selectedTask}
              evidenceList={evidenceList}
              approvals={approvals}
              isLoading={isLoadingDetails}
              onTaskUpdated={handleTaskUpdated}
            />
          </div>
        )}
      </div>

      {/* Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        tasks={tasks}
        onSelectTask={(id) => setSelectedTaskId(id)}
        onNewBugClick={() => setIsNewBugModalOpen(true)}
        onRefreshClick={handleRefresh}
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        onToggleInspector={() => setIsInspectorOpen((prev) => !prev)}
        isSidebarOpen={isSidebarOpen}
        isInspectorOpen={isInspectorOpen}
        onFilterChange={() => {}}
      />

      {/* New Bug Report Modal */}
      <NewBugModal
        isOpen={isNewBugModalOpen}
        onClose={() => setIsNewBugModalOpen(false)}
        onTaskCreated={handleTaskCreated}
      />
    </div>
  );
}

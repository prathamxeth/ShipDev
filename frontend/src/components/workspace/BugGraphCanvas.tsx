"use client";

import React, { useState, useRef, useMemo, useCallback, useEffect } from "react";
import {
  Folder,
  FolderOpen,
  FileCode,
  Bug,
  Bot,
  Search,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  Minimize2,
  X,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { Task, TaskStatus } from "@/types";
import { WorkspaceFile, resolveBugLocation } from "@/lib/workspaceFiles";

export type GraphNodeType = "folder" | "file" | "function" | "bug" | "agent";

export interface GraphNode {
  id: string;
  label: string;
  type: GraphNodeType;
  sublabel?: string;
  path?: string;
  fileName?: string;
  lineNumber?: number;
  task?: Task;
  status?: TaskStatus | string;
  severity?: string;
  x: number;
  y: number;
  level: number;
  collapsed?: boolean;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  animated?: boolean;
  color?: string;
}

interface BugGraphCanvasProps {
  tasks: Task[];
  selectedTaskId: string | null;
  activeFileName: string;
  workspaceFiles: Record<string, WorkspaceFile>;
  onSelectBug: (task: Task, fileName: string, lineNumber: number) => void;
  onSelectFile: (fileName: string) => void;
  onNavigateToLine: (fileName: string, lineNumber: number) => void;
  onSelectAgent?: (agentId: "shipdev-triager" | "shipdev-verifier") => void;
  isEnlarged?: boolean;
  onToggleEnlarge?: () => void;
  compact?: boolean;
  onReturnToCode?: () => void;
}

export function BugGraphCanvas({
  tasks,
  selectedTaskId,
  activeFileName,
  workspaceFiles,
  onSelectBug,
  onSelectFile,
  onNavigateToLine,
  onSelectAgent,
  isEnlarged = false,
  onToggleEnlarge,
  compact = false,
  onReturnToCode,
}: BugGraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Transform / Pan / Zoom state
  const [zoom, setZoom] = useState(compact ? 0.72 : 0.88);
  const [pan, setPan] = useState({ x: compact ? 25 : 50, y: 25 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Filter & Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | GraphNodeType>("all");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Collapsed folders state
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});

  const toggleFolderCollapse = (folderId: string) => {
    setCollapsedFolders((prev) => ({
      ...prev,
      [folderId]: !prev[folderId],
    }));
  };

  // Build Topological Graph Hierarchy
  const { nodes, edges } = useMemo(() => {
    const rawNodes: GraphNode[] = [];
    const rawEdges: GraphEdge[] = [];

    // LEVEL 0: Root Repository Workspace
    rawNodes.push({
      id: "folder_root",
      label: "ShipDev App",
      sublabel: "Project Root",
      type: "folder",
      path: "/",
      x: 320,
      y: 16,
      level: 0,
      collapsed: Boolean(collapsedFolders["folder_root"]),
    });

    // LEVEL 1: Subdirectories - ALL ON THE SAME LEVEL (y: 95)
    const folders = [
      {
        id: "folder_demo",
        label: "Calculator App",
        path: "demo",
        parentId: "folder_root",
        x: 80,
        y: 95,
      },
      {
        id: "folder_buggy",
        label: "App Code",
        path: "demo/buggy_app",
        parentId: "folder_demo",
        x: 240,
        y: 95,
      },
      {
        id: "folder_tests",
        label: "Test Suite",
        path: "demo/tests",
        parentId: "folder_demo",
        x: 400,
        y: 95,
      },
      {
        id: "folder_scripts",
        label: "Bridge Scripts",
        path: "scripts",
        parentId: "folder_root",
        x: 560,
        y: 95,
      },
    ];

    folders.forEach((f) => {
      rawNodes.push({
        id: f.id,
        label: f.label,
        sublabel: f.path,
        type: "folder",
        path: f.path,
        x: f.x,
        y: f.y,
        level: 1,
        collapsed: Boolean(collapsedFolders[f.id]),
      });
      rawEdges.push({
        id: `e_${f.parentId}_${f.id}`,
        source: f.parentId,
        target: f.id,
        label: "contains",
      });
    });

    // LEVEL 2: Domain Files - ALL ON THE SAME LEVEL (y: 180)
    const files = [
      {
        id: "file_calculator",
        label: "calculator.py",
        path: "demo/buggy_app/calculator.py",
        fileName: "calculator.py",
        folderId: "folder_buggy",
        x: 80,
        y: 180,
      },
      {
        id: "file_utils",
        label: "utils.py",
        path: "demo/buggy_app/utils.py",
        fileName: "utils.py",
        folderId: "folder_buggy",
        x: 240,
        y: 180,
      },
      {
        id: "file_test_calc",
        label: "test_calculator.py",
        path: "demo/tests/test_calculator.py",
        fileName: "test_calculator.py",
        folderId: "folder_tests",
        x: 400,
        y: 180,
      },
      {
        id: "file_bridge",
        label: "switch_bridge.py",
        path: "scripts/switch_bridge.py",
        fileName: "switch_bridge.py",
        folderId: "folder_scripts",
        x: 560,
        y: 180,
      },
    ];

    files.forEach((file) => {
      rawNodes.push({
        id: file.id,
        label: file.label,
        sublabel: file.fileName,
        type: "file",
        fileName: file.fileName,
        path: file.path,
        x: file.x,
        y: file.y,
        level: 2,
      });
      rawEdges.push({
        id: `e_${file.folderId}_${file.id}`,
        source: file.folderId,
        target: file.id,
        label: "defines",
      });
    });

    // LEVEL 3: Subfile Functions & AST Symbols - ALL ON THE SAME LEVEL (y: 265)
    const functions = [
      {
        id: "fn_divide",
        label: "discount_calc()",
        sublabel: "Line 22",
        fileName: "calculator.py",
        lineNumber: 22,
        fileId: "file_calculator",
        x: 30,
        y: 265,
      },
      {
        id: "fn_add",
        label: "add_numbers()",
        sublabel: "Line 6",
        fileName: "calculator.py",
        lineNumber: 6,
        fileId: "file_calculator",
        x: 165,
        y: 265,
      },
      {
        id: "fn_eval",
        label: "eval_expr()",
        sublabel: "Line 38",
        fileName: "calculator.py",
        lineNumber: 38,
        fileId: "file_calculator",
        x: 300,
        y: 265,
      },
      {
        id: "fn_test_div",
        label: "test_discount()",
        sublabel: "Line 14",
        fileName: "test_calculator.py",
        lineNumber: 14,
        fileId: "file_test_calc",
        x: 435,
        y: 265,
      },
      {
        id: "fn_claim",
        label: "relay_worker()",
        sublabel: "Line 108",
        fileName: "switch_bridge.py",
        lineNumber: 108,
        fileId: "file_bridge",
        x: 570,
        y: 265,
      },
    ];

    functions.forEach((fn) => {
      rawNodes.push({
        id: fn.id,
        label: fn.label,
        sublabel: fn.sublabel,
        type: "function",
        fileName: fn.fileName,
        lineNumber: fn.lineNumber,
        x: fn.x,
        y: fn.y,
        level: 3,
      });
      rawEdges.push({
        id: `e_${fn.fileId}_${fn.id}`,
        source: fn.fileId,
        target: fn.id,
        label: "exports",
      });
    });

    // Inter-function edge: test validates function
    rawEdges.push({
      id: "e_test_validates_divide",
      source: "fn_test_div",
      target: "fn_divide",
      label: "tests",
      animated: true,
      color: "#f54e00",
    });

    // LEVEL 4: Active Bug Tasks & Smart Assistants - ALL ON THE EXACT SAME LEVEL (y: 350)
    tasks.forEach((task, index) => {
      const loc = resolveBugLocation(task);
      const bugNodeId = `bug_${task.id}`;
      const xOffset = 30 + index * 155;
      const isResolved = task.status === "COMPLETED" || task.status === "APPROVED";
      const isAwaiting = task.status === "AWAITING_HUMAN_APPROVAL";

      rawNodes.push({
        id: bugNodeId,
        label: isResolved
          ? "✓ Resolved Issue"
          : isAwaiting
          ? "Needs Review"
          : "Active Issue",
        sublabel: isResolved
          ? "Verified in Prod"
          : isAwaiting
          ? "Solution Ready"
          : task.status === "REPRODUCED"
          ? "Confirmed (Exit 1)"
          : "Investigating",
        type: "bug",
        task,
        status: task.status,
        severity: loc.severity,
        fileName: loc.fileName,
        lineNumber: loc.lineNumber,
        x: xOffset,
        y: 350,
        level: 4,
      });

      // Connect bug to target function or file
      const targetNodeId = loc.fileName === "calculator.py" ? "fn_divide" : "file_calculator";
      rawEdges.push({
        id: `e_${bugNodeId}_${targetNodeId}`,
        source: bugNodeId,
        target: targetNodeId,
        label: isResolved ? "fixed" : "affects",
        color: isResolved
          ? "#10b981"
          : isAwaiting
          ? "#f54e00"
          : task.id === selectedTaskId
          ? "#ef4444"
          : "#f87171",
        animated: !isResolved,
      });
    });

    // Smart Assistants - ON THE EXACT SAME LEVEL (y: 350)
    const assistantStartX = 30 + Math.max(tasks.length, 1) * 155;
    rawNodes.push({
      id: "agent_triager",
      label: "Diagnosis Assistant",
      sublabel: "Pinpoints defect",
      type: "agent",
      x: assistantStartX,
      y: 350,
      level: 4,
    });

    rawNodes.push({
      id: "agent_verifier",
      label: "Quality Reviewer",
      sublabel: "Validates fix",
      type: "agent",
      x: assistantStartX + 155,
      y: 350,
      level: 4,
    });

    // Connect agents to active bugs
    if (tasks.length > 0) {
      const primaryBugId = `bug_${tasks[0].id}`;
      const isFirstResolved = tasks[0].status === "COMPLETED" || tasks[0].status === "APPROVED";
      rawEdges.push({
        id: `e_agent_triager_${primaryBugId}`,
        source: "agent_triager",
        target: primaryBugId,
        label: isFirstResolved ? "diagnosed" : "triages",
        animated: !isFirstResolved,
        color: isFirstResolved ? "#10b981" : "#f54e00",
      });
      rawEdges.push({
        id: `e_agent_verifier_${primaryBugId}`,
        source: "agent_verifier",
        target: primaryBugId,
        label: isFirstResolved ? "verified" : "verifies",
        animated: !isFirstResolved,
        color: "#10b981",
      });
    }

    return { nodes: rawNodes, edges: rawEdges };
  }, [tasks, selectedTaskId, collapsedFolders]);

  // Node Map for fast edge and lookup resolution
  const nodeMap = useMemo(() => {
    const map = new Map<string, GraphNode>();
    nodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [nodes]);

  // Filtering nodes by query & category chip
  const filteredNodes = useMemo(() => {
    return nodes.filter((n) => {
      // Category filter
      if (activeFilter !== "all" && n.type !== activeFilter) {
        return false;
      }
      // Search query filter
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        n.label.toLowerCase().includes(q) ||
        (n.sublabel && n.sublabel.toLowerCase().includes(q)) ||
        (n.fileName && n.fileName.toLowerCase().includes(q)) ||
        (n.type.toLowerCase().includes(q))
      );
    });
  }, [nodes, activeFilter, searchQuery]);

  const filteredNodeIds = useMemo(() => {
    return new Set(filteredNodes.map((n) => n.id));
  }, [filteredNodes]);

  // Interactive Pan Handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".graph-node-interactive")) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    setZoom((prevZoom) => {
      const nextZoom = prevZoom * zoomFactor;
      return Math.min(Math.max(nextZoom, 0.35), 2.2);
    });
  }, []);

  // Dynamic Auto-Fit to View: Ensures 100% of nodes fit without cut-offs
  const fitToView = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    if (clientWidth <= 0 || clientHeight <= 0) return;

    // Available canvas area (subtracting the header toolbar ~76px)
    const availableHeight = clientHeight - 82;
    const availableWidth = clientWidth - 36;

    const visibleNodes = nodes.filter((n) => filteredNodeIds.has(n.id));
    if (visibleNodes.length === 0) return;

    const minX = Math.min(...visibleNodes.map((n) => n.x));
    const maxX = Math.max(...visibleNodes.map((n) => n.x + 156));
    const minY = Math.min(...visibleNodes.map((n) => n.y));
    const maxY = Math.max(...visibleNodes.map((n) => n.y + 46));

    const graphWidth = maxX - minX;
    const graphHeight = maxY - minY;

    const scaleX = availableWidth / (graphWidth + 40);
    const scaleY = availableHeight / (graphHeight + 40);
    const targetZoom = Math.min(Math.max(Math.min(scaleX, scaleY), 0.52), 1.0);

    const targetPanX = (clientWidth - graphWidth * targetZoom) / 2 - minX * targetZoom;
    const targetPanY = 32 - minY * targetZoom;

    setZoom(targetZoom);
    setPan({ x: targetPanX, y: targetPanY });
  }, [nodes, filteredNodeIds]);

  // Fit to view on mount, window resize, and filter change
  useEffect(() => {
    fitToView();
    const handleResize = () => {
      fitToView();
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [fitToView]);

  const resetView = () => {
    fitToView();
  };

  // Node Click Handlers
  const handleNodeClick = (node: GraphNode) => {
    setSelectedNodeId(node.id);

    if (node.type === "folder") {
      toggleFolderCollapse(node.id);
    } else if (node.type === "file" && node.fileName) {
      onSelectFile(node.fileName);
      if (onReturnToCode) onReturnToCode();
    } else if (node.type === "function" && node.fileName && node.lineNumber) {
      onNavigateToLine(node.fileName, node.lineNumber);
      if (onReturnToCode) onReturnToCode();
    } else if (node.type === "bug" && node.task) {
      const loc = resolveBugLocation(node.task);
      onSelectBug(node.task, loc.fileName, loc.lineNumber);
      if (onReturnToCode) onReturnToCode();
    } else if (node.type === "agent" && onSelectAgent) {
      if (node.id === "agent_triager") {
        onSelectAgent("shipdev-triager");
      } else if (node.id === "agent_verifier") {
        onSelectAgent("shipdev-verifier");
      }
    }
  };

  // Palette styling based on node type
  const getNodeColor = (node: GraphNode) => {
    const isSelected =
      selectedNodeId === node.id ||
      (node.type === "bug" && node.task?.id === selectedTaskId);

    switch (node.type) {
      case "folder":
        return {
          bg: "bg-clay-ochre/15 hover:bg-clay-ochre/25",
          border: isSelected ? "border-clay-ochre ring-2 ring-clay-ochre/30" : "border-clay-ochre/30",
          iconColor: "text-clay-ochre-ink",
          glow: isSelected ? "shadow-clay-card" : "",
        };
      case "file":
        return {
          bg: "bg-clay-teal/10 hover:bg-clay-teal/20",
          border: isSelected ? "border-clay-teal ring-2 ring-clay-teal/30" : "border-clay-teal/30",
          iconColor: "text-clay-teal",
          glow: isSelected ? "shadow-clay-card" : "",
        };
      case "function":
        return {
          bg: "bg-clay-lavender/20 hover:bg-clay-lavender/30",
          border: isSelected ? "border-clay-lavender-ink ring-2 ring-clay-lavender/40" : "border-clay-lavender/40",
          iconColor: "text-clay-lavender-ink",
          glow: isSelected ? "shadow-clay-card" : "",
        };
      case "bug": {
        const isResolved = node.status === "COMPLETED" || node.status === "APPROVED";
        const isAwaiting = node.status === "AWAITING_HUMAN_APPROVAL";
        if (isResolved) {
          return {
            bg: "bg-clay-mint/25 hover:bg-clay-mint/35",
            border: isSelected ? "border-[#136149] ring-2 ring-clay-mint" : "border-clay-mint/60",
            iconColor: "text-[#136149]",
            glow: isSelected ? "shadow-clay-card" : "",
          };
        }
        if (isAwaiting) {
          return {
            bg: "bg-clay-peach/25 hover:bg-clay-peach/35",
            border: isSelected ? "border-clay-peach-ink ring-2 ring-clay-peach" : "border-clay-peach/60",
            iconColor: "text-clay-peach-ink",
            glow: isSelected ? "shadow-clay-card" : "",
          };
        }
        return {
          bg: "bg-clay-pink/20 hover:bg-clay-pink/30",
          border: isSelected ? "border-clay-pink-ink ring-2 ring-clay-pink/40" : "border-clay-pink/40",
          iconColor: "text-clay-pink-ink",
          glow: isSelected ? "shadow-clay-card" : "",
        };
      }
      case "agent":
      default:
        return {
          bg: "bg-clay-mint/20 hover:bg-clay-mint/30",
          border: isSelected ? "border-[#136149] ring-2 ring-clay-mint/40" : "border-clay-mint/40",
          iconColor: "text-[#136149]",
          glow: isSelected ? "shadow-clay-card" : "",
        };
    }
  };

  const selectedNode = selectedNodeId ? nodeMap.get(selectedNodeId) : null;

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full flex flex-col bg-clay-canvas select-none overflow-hidden ${
        isEnlarged ? "fixed inset-0 z-50 p-4 bg-black/60 backdrop-blur-sm" : ""
      }`}
    >
      {/* Container Card when Enlarged */}
      <div
        className={`relative w-full h-full flex flex-col rounded-clay-lg overflow-hidden border border-clay-hairline bg-clay-surface-soft ${
          isEnlarged ? "shadow-2xl bg-white" : ""
        }`}
      >
        {/* GRAPH HEADER TOOLBAR - 2 NON-WRAPPING CLEAN TIERS */}
        <div className="border-b border-clay-hairline bg-white flex flex-col shrink-0 z-10 shadow-xs">
          {/* Tier 1: Title, Node Counter & Pan/Zoom Controls */}
          <div className="h-9 px-3 flex items-center justify-between border-b border-clay-hairline/60">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-clay-primary animate-pulse shrink-0" />
              <span className="font-semibold text-clay-ink text-xs font-sans truncate">
                System Architecture Map
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-clay-pill bg-clay-surface-card border border-clay-hairline text-clay-muted shrink-0">
                {filteredNodes.length} nodes • {edges.length} links
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-clay-muted shrink-0">
              {onReturnToCode && (
                <button
                  onClick={onReturnToCode}
                  className="flex items-center gap-1.5 px-2.5 py-1 mr-1 rounded-clay-md bg-clay-surface-soft hover:bg-clay-surface-card border border-clay-hairline text-clay-ink text-xs font-medium cursor-pointer transition-colors shadow-clay-soft"
                >
                  <FileCode className="w-3.5 h-3.5 text-clay-primary" />
                  <span>Return to Code Editor ({activeFileName || "calculator.py"})</span>
                </button>
              )}

              <button
                onClick={() => setZoom((z) => Math.min(2.2, z * 1.15))}
                className="p-1 rounded-clay-xs hover:bg-clay-surface-card hover:text-clay-ink transition-colors cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setZoom((z) => Math.max(0.35, z * 0.85))}
                className="p-1 rounded-clay-xs hover:bg-clay-surface-card hover:text-clay-ink transition-colors cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={resetView}
                className="flex items-center gap-1 px-2 py-0.5 rounded-clay-xs hover:bg-clay-surface-card hover:text-clay-ink transition-colors cursor-pointer text-[10px] font-sans font-medium border border-clay-hairline"
                title="Fit to Screen"
              >
                <RotateCw className="w-3 h-3 text-clay-primary" />
                <span>Fit Screen</span>
              </button>
              {onToggleEnlarge && (
                <button
                  onClick={onToggleEnlarge}
                  className="p-1 rounded-clay-xs hover:bg-clay-surface-card hover:text-clay-primary transition-colors cursor-pointer ml-1"
                  title={isEnlarged ? "Close Fullscreen" : "Enlarge Graph"}
                >
                  {isEnlarged ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
          </div>

          {/* Tier 2: Search Input & Category Filter Chips */}
          <div className="h-9 px-3 flex items-center justify-between gap-2 overflow-x-auto scrollbar-none bg-clay-canvas/60">
            {/* Search Input */}
            <div className="relative w-44 shrink-0">
              <Search className="w-3 h-3 text-clay-muted absolute left-2 top-2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search map..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ outline: "none", boxShadow: "none" }}
                className="w-full h-7 pl-6 pr-2 rounded-clay-md bg-white border border-clay-hairline text-[11px] text-clay-ink placeholder:text-clay-muted outline-none focus:outline-none focus:ring-0 shadow-xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-1.5 top-1.5 text-clay-muted hover:text-clay-ink"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1 shrink-0 overflow-x-auto scrollbar-none">
              {(
                [
                  { id: "all", label: "All" },
                  { id: "folder", label: "Folders" },
                  { id: "file", label: "Files" },
                  { id: "function", label: "Logic" },
                  { id: "bug", label: "Issues" },
                  { id: "agent", label: "Assistants" },
                ] as const
              ).map((chip) => (
                <button
                  key={chip.id}
                  onClick={() => setActiveFilter(chip.id)}
                  className={`px-2 py-0.5 rounded-clay-pill text-[10px] font-sans transition-colors cursor-pointer whitespace-nowrap ${
                    activeFilter === chip.id
                      ? "bg-clay-primary text-white font-semibold shadow-xs"
                      : "bg-white hover:bg-clay-surface-strong text-clay-muted border border-clay-hairline"
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* INTERACTIVE SVG CANVAS */}
        <div
          className="relative flex-1 w-full h-full overflow-hidden cursor-grab active:cursor-grabbing bg-[#fcfcfd]"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
        >
          {/* Subtle Grid Dot Pattern Background */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-40">
            <defs>
              <pattern id="clay-graph-dots" width="24" height="24" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1" fill="#cbd5e1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#clay-graph-dots)" />
          </svg>

          {/* Transformed Graph Group */}
          <div
            className="absolute origin-top-left transition-transform duration-75 ease-out"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            }}
          >
            {/* SVG Connecting Edges */}
            <svg
              className="absolute overflow-visible pointer-events-none"
              style={{ width: 1400, height: 1000 }}
            >
              <defs>
                <marker
                  id="edge-arrow"
                  viewBox="0 0 10 10"
                  refX="10"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
                </marker>
                <marker
                  id="edge-arrow-red"
                  viewBox="0 0 10 10"
                  refX="10"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4444" />
                </marker>
                <marker
                  id="edge-arrow-green"
                  viewBox="0 0 10 10"
                  refX="10"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#10b981" />
                </marker>
              </defs>

              {edges.map((edge) => {
                const source = nodeMap.get(edge.source);
                const target = nodeMap.get(edge.target);
                if (!source || !target) return null;
                if (!filteredNodeIds.has(source.id) || !filteredNodeIds.has(target.id)) return null;

                // Bezier Curve connecting nodes cleanly
                const dx = target.x - source.x;
                const dy = target.y - source.y;
                const isSameLevel = Math.abs(dy) < 15;

                let pathData: string;
                if (isSameLevel) {
                  // Both on same horizontal row: loop neatly underneath
                  pathData = `M ${source.x + 78} ${source.y + 46} C ${source.x + 78} ${source.y + 70}, ${target.x + 78} ${target.y + 70}, ${target.x + 78} ${target.y + 46}`;
                } else if (dy < -15) {
                  // Source is below target: connect top of source to bottom of target
                  const midY = (source.y + target.y + 46) / 2;
                  pathData = `M ${source.x + 78} ${source.y} C ${source.x + 78} ${midY}, ${target.x + 78} ${midY}, ${target.x + 78} ${target.y + 46}`;
                } else {
                  // Source is above target: connect bottom of source to top of target
                  const midY = (source.y + 46 + target.y) / 2;
                  pathData = `M ${source.x + 78} ${source.y + 46} C ${source.x + 78} ${midY}, ${target.x + 78} ${midY}, ${target.x + 78} ${target.y}`;
                }

                const isRed = edge.color?.includes("ef4444") || edge.color?.includes("f87171");
                const isGreen = edge.color?.includes("10b981");

                return (
                  <g key={edge.id} className="transition-opacity duration-200">
                    <path
                      d={pathData}
                      fill="none"
                      stroke={edge.color || "#cbd5e1"}
                      strokeWidth={edge.animated ? 2 : 1.5}
                      strokeDasharray={edge.animated ? "4 4" : "none"}
                      className={edge.animated ? "animate-pulse" : ""}
                      markerEnd={isRed ? "url(#edge-arrow-red)" : isGreen ? "url(#edge-arrow-green)" : "url(#edge-arrow)"}
                    />
                    {edge.label && (
                      <text
                        x={(source.x + target.x) / 2 + 78}
                        y={isSameLevel ? source.y + 68 : (source.y + target.y + 46) / 2}
                        fill="#64748b"
                        fontSize="9"
                        fontFamily="monospace"
                        textAnchor="middle"
                        className="bg-white px-1"
                      >
                        {edge.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* DOM NODES - UNIFORM WIDTH, HEIGHT, AND 4-DIRECTION PADDING */}
            {filteredNodes.map((node) => {
              const colors = getNodeColor(node);
              const isHovered = hoveredNodeId === node.id;
              const isSelected =
                selectedNodeId === node.id ||
                (node.type === "bug" && node.task?.id === selectedTaskId);

              const NodeIcon =
                node.type === "folder"
                  ? node.collapsed
                    ? Folder
                    : FolderOpen
                  : node.type === "file"
                  ? FileCode
                  : node.type === "function"
                  ? Sparkles
                  : node.type === "bug"
                  ? Bug
                  : Bot;

              return (
                <div
                  key={node.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNodeClick(node);
                  }}
                  onMouseEnter={() => setHoveredNodeId(node.id)}
                  onMouseLeave={() => setHoveredNodeId(null)}
                  className={`graph-node-interactive absolute rounded-clay-lg border p-2 flex items-center gap-2 cursor-pointer transition-all duration-150 ${
                    colors.bg
                  } ${colors.border} ${colors.glow} ${
                    isSelected ? "ring-2 ring-clay-primary scale-105 z-20 shadow-clay-card" : "hover:scale-102 z-10"
                  }`}
                  style={{
                    left: `${node.x}px`,
                    top: `${node.y}px`,
                    width: "156px",
                    height: "46px",
                  }}
                >
                  <div className={`w-7 h-7 rounded-clay-md bg-white flex items-center justify-center shrink-0 shadow-xs ${colors.iconColor}`}>
                    <NodeIcon className="w-3.5 h-3.5" />
                  </div>

                  <div className="flex flex-col min-w-0 flex-1 justify-center">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] font-sans font-semibold text-clay-ink truncate">
                        {node.label}
                      </span>
                      {node.type === "folder" && (
                        <span className="text-[9px] text-clay-muted font-mono shrink-0">
                          {node.collapsed ? "+" : "−"}
                        </span>
                      )}
                    </div>
                    {node.sublabel && (
                      <span className="text-[9px] text-clay-muted truncate">
                        {node.sublabel}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* FLOATING INSPECTOR CARD (Bottom-Left) */}
          {selectedNode && (
            <div className="absolute bottom-3 left-3 w-72 rounded-clay-lg bg-white/95 backdrop-blur-md border border-clay-hairline shadow-clay-elevated p-3 z-30 flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
              <div className="flex items-center justify-between border-b border-clay-hairline pb-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded-clay-xs bg-clay-surface-card border border-clay-hairline font-semibold text-clay-primary">
                    {selectedNode.type}
                  </span>
                  <span className="text-xs font-sans font-bold text-clay-ink truncate">
                    {selectedNode.label}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedNodeId(null)}
                  className="p-1 rounded-clay-xs hover:bg-clay-surface-card text-clay-muted hover:text-clay-ink cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="text-[11px] text-clay-body flex flex-col gap-1 font-sans">
                {selectedNode.path && (
                  <div className="flex items-center justify-between">
                    <span className="text-clay-muted">Path:</span>
                    <span className="truncate max-w-40 text-clay-ink font-mono text-[10px]">{selectedNode.path}</span>
                  </div>
                )}
                {selectedNode.fileName && (
                  <div className="flex items-center justify-between">
                    <span className="text-clay-muted">File:</span>
                    <span className="text-clay-ink font-mono text-[10px]">{selectedNode.fileName}</span>
                  </div>
                )}
                {selectedNode.lineNumber && (
                  <div className="flex items-center justify-between">
                    <span className="text-clay-muted">Line:</span>
                    <span className="text-clay-primary font-bold">{selectedNode.lineNumber}</span>
                  </div>
                )}
                {selectedNode.status && (
                  <div className="flex items-center justify-between">
                    <span className="text-clay-muted">Status:</span>
                    <span className="text-clay-ink font-medium">{selectedNode.status}</span>
                  </div>
                )}
              </div>

              {/* Action Button inside Inspector */}
              <div className="pt-2 border-t border-clay-hairline flex items-center justify-end">
                {selectedNode.type === "file" && selectedNode.fileName && (
                  <button
                    onClick={() => onSelectFile(selectedNode.fileName!)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-clay-md bg-clay-primary text-white text-[11px] font-medium hover:bg-clay-primary-active transition-colors cursor-pointer"
                  >
                    <span>Open File</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
                {selectedNode.type === "function" && selectedNode.fileName && selectedNode.lineNumber && (
                  <button
                    onClick={() => onNavigateToLine(selectedNode.fileName!, selectedNode.lineNumber!)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-clay-md bg-clay-primary text-white text-[11px] font-medium hover:bg-clay-primary-active transition-colors cursor-pointer"
                  >
                    <span>Jump to Line {selectedNode.lineNumber}</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                )}
                {selectedNode.type === "bug" && selectedNode.task && (
                  <button
                    onClick={() => {
                      const loc = resolveBugLocation(selectedNode.task!);
                      onSelectBug(selectedNode.task!, loc.fileName, loc.lineNumber);
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-clay-md bg-clay-pink text-white text-[11px] font-medium hover:bg-clay-pink-ink transition-colors cursor-pointer"
                  >
                    <span>Inspect Bug</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                )}
                {selectedNode.type === "agent" && onSelectAgent && (
                  <button
                    onClick={() => {
                      if (selectedNode.id === "agent_triager") onSelectAgent("shipdev-triager");
                      if (selectedNode.id === "agent_verifier") onSelectAgent("shipdev-verifier");
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-clay-md bg-[#136149] text-white text-[11px] font-medium hover:bg-[#0f4e3b] transition-colors cursor-pointer"
                  >
                    <span>Inspect Assistant</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

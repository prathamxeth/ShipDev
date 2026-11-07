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
  Clock,
  Sparkles,
  GitBranch,
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
}: BugGraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Transform / Pan / Zoom state
  const [zoom, setZoom] = useState(compact ? 0.75 : 0.95);
  const [pan, setPan] = useState({ x: compact ? 30 : 60, y: compact ? 40 : 50 });
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
      label: "ShipDev",
      sublabel: "workspace root",
      type: "folder",
      path: "/",
      x: 380,
      y: 60,
      level: 0,
      collapsed: Boolean(collapsedFolders["folder_root"]),
    });

    // LEVEL 1: Subdirectories
    const folders = [
      { id: "folder_demo", label: "demo", path: "demo", parentId: "folder_root", x: 180, y: 170 },
      { id: "folder_buggy", label: "buggy_app", path: "demo/buggy_app", parentId: "folder_demo", x: 180, y: 280 },
      { id: "folder_tests", label: "tests", path: "demo/tests", parentId: "folder_demo", x: 420, y: 280 },
      { id: "folder_scripts", label: "scripts", path: "scripts", parentId: "folder_root", x: 640, y: 170 },
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

    // LEVEL 2: Domain Files
    const files = [
      { id: "file_calculator", label: "calculator.py", path: "demo/buggy_app/calculator.py", fileName: "calculator.py", folderId: "folder_buggy", x: 100, y: 400 },
      { id: "file_utils", label: "utils.py", path: "demo/buggy_app/utils.py", fileName: "utils.py", folderId: "folder_buggy", x: 260, y: 400 },
      { id: "file_test_calc", label: "test_calculator.py", path: "demo/tests/test_calculator.py", fileName: "test_calculator.py", folderId: "folder_tests", x: 440, y: 400 },
      { id: "file_bridge", label: "switch_bridge.py", path: "scripts/switch_bridge.py", fileName: "switch_bridge.py", folderId: "folder_scripts", x: 640, y: 400 },
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

    // LEVEL 3: Subfile Functions & AST Symbols
    const functions = [
      { id: "fn_divide", label: "divide(a, b)", sublabel: "Line 22", fileName: "calculator.py", lineNumber: 22, fileId: "file_calculator", x: 60, y: 530 },
      { id: "fn_add", label: "add(a, b)", sublabel: "Line 6", fileName: "calculator.py", lineNumber: 6, fileId: "file_calculator", x: 160, y: 530 },
      { id: "fn_eval", label: "evaluate(expr)", sublabel: "Line 38", fileName: "calculator.py", lineNumber: 38, fileId: "file_calculator", x: 240, y: 530 },
      { id: "fn_safe_eval", label: "safe_eval(expr)", sublabel: "Line 5", fileName: "utils.py", lineNumber: 5, fileId: "file_utils", x: 340, y: 530 },
      { id: "fn_test_div", label: "test_divide_zero()", sublabel: "Line 14", fileName: "test_calculator.py", lineNumber: 14, fileId: "file_test_calc", x: 440, y: 530 },
      { id: "fn_claim", label: "claim_task()", sublabel: "Line 108", fileName: "switch_bridge.py", lineNumber: 108, fileId: "file_bridge", x: 620, y: 530 },
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

    // LEVEL 4: Active Bug Tasks
    tasks.forEach((task, index) => {
      const loc = resolveBugLocation(task);
      const bugNodeId = `bug_${task.id}`;
      const xOffset = 60 + index * 140;

      rawNodes.push({
        id: bugNodeId,
        label: task.title,
        sublabel: `Status: ${task.status}`,
        type: "bug",
        task,
        status: task.status,
        severity: task.severity,
        fileName: loc.fileName,
        lineNumber: loc.lineNumber,
        x: xOffset,
        y: 670,
        level: 4,
      });

      // Connect bug to target function or file
      const targetNodeId = loc.fileName === "calculator.py" ? "fn_divide" : "file_calculator";
      rawEdges.push({
        id: `e_${bugNodeId}_${targetNodeId}`,
        source: bugNodeId,
        target: targetNodeId,
        label: "affects",
        color: task.id === selectedTaskId ? "#ef4444" : "#f87171",
        animated: true,
      });
    });

    // LEVEL 5: Switch Agents Orchestrators
    rawNodes.push({
      id: "agent_triager",
      label: "shipdev-triager",
      sublabel: "Root Cause Diagnostician",
      type: "agent",
      x: 320,
      y: 790,
      level: 5,
    });

    rawNodes.push({
      id: "agent_verifier",
      label: "shipdev-verifier",
      sublabel: "Independent Validation Oracle",
      type: "agent",
      x: 540,
      y: 790,
      level: 5,
    });

    // Connect agents to active bugs
    if (tasks.length > 0) {
      const primaryBugId = `bug_${tasks[0].id}`;
      rawEdges.push({
        id: `e_agent_triager_${primaryBugId}`,
        source: "agent_triager",
        target: primaryBugId,
        label: "triages",
        animated: true,
        color: "#f54e00",
      });
      rawEdges.push({
        id: `e_agent_verifier_${primaryBugId}`,
        source: "agent_verifier",
        target: primaryBugId,
        label: "verifies",
        animated: true,
        color: "#10b981",
      });
    }

    return { nodes: rawNodes, edges: rawEdges };
  }, [tasks, selectedTaskId, collapsedFolders]);

  // Node Map for edge path coordinate lookups
  const nodeMap = useMemo(() => {
    const map = new Map<string, GraphNode>();
    nodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [nodes]);

  // Filtering & Search
  const filteredNodes = useMemo(() => {
    return nodes.filter((node) => {
      if (activeFilter !== "all" && node.type !== activeFilter) return false;
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase();
        return (
          node.label.toLowerCase().includes(q) ||
          (node.sublabel && node.sublabel.toLowerCase().includes(q)) ||
          (node.fileName && node.fileName.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [nodes, activeFilter, searchQuery]);

  const filteredNodeIds = useMemo(() => new Set(filteredNodes.map((n) => n.id)), [filteredNodes]);

  // Mouse pan & drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".graph-node-interactive")) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    setZoom((prev) => Math.min(2.2, Math.max(0.35, prev * zoomFactor)));
  };

  const resetView = () => {
    setZoom(compact ? 0.75 : 0.95);
    setPan({ x: compact ? 30 : 60, y: compact ? 40 : 50 });
  };

  // Node Click Dispatcher
  const handleNodeClick = (node: GraphNode) => {
    setSelectedNodeId(node.id);

    if (node.type === "bug" && node.task) {
      onSelectBug(node.task, node.fileName || "calculator.py", node.lineNumber || 22);
    } else if (node.type === "file" && node.fileName) {
      onSelectFile(node.fileName);
    } else if (node.type === "function" && node.fileName && node.lineNumber) {
      onSelectFile(node.fileName);
      onNavigateToLine(node.fileName, node.lineNumber);
    } else if (node.type === "folder") {
      toggleFolderCollapse(node.id);
    } else if (node.type === "agent" && onSelectAgent) {
      if (node.id === "agent_triager") onSelectAgent("shipdev-triager");
      if (node.id === "agent_verifier") onSelectAgent("shipdev-verifier");
    }
  };

  // Colors per Clay Design System + Nexus IDE Reference
  const getNodeColor = (node: GraphNode) => {
    const isSelected =
      selectedNodeId === node.id ||
      (node.type === "bug" && node.task?.id === selectedTaskId) ||
      (node.type === "file" && node.fileName === activeFileName);

    switch (node.type) {
      case "folder":
        return {
          bg: isSelected ? "bg-clay-surface-strong" : "bg-white",
          border: isSelected ? "border-clay-ink" : "border-clay-hairline",
          text: "text-clay-ink",
          iconColor: "text-amber-500",
          glow: isSelected ? "shadow-[0_0_12px_rgba(245,78,0,0.2)]" : "",
        };
      case "file":
        return {
          bg: isSelected ? "bg-clay-lavender/25" : "bg-white",
          border: isSelected ? "border-clay-primary" : "border-clay-hairline",
          text: "text-clay-ink",
          iconColor: "text-blue-500",
          glow: isSelected ? "shadow-[0_0_12px_rgba(245,78,0,0.3)]" : "",
        };
      case "function":
        return {
          bg: isSelected ? "bg-clay-peach/30" : "bg-white",
          border: isSelected ? "border-clay-peach-ink" : "border-clay-hairline",
          text: "text-clay-ink",
          iconColor: "text-clay-primary",
          glow: isSelected ? "shadow-[0_0_10px_rgba(245,78,0,0.25)]" : "",
        };
      case "bug":
        const isAwaiting = node.status === "AWAITING_HUMAN_APPROVAL";
        return {
          bg: isSelected ? "bg-red-500/15" : isAwaiting ? "bg-amber-500/15" : "bg-white",
          border: isSelected ? "border-red-500" : isAwaiting ? "border-amber-500" : "border-red-400",
          text: "text-clay-ink",
          iconColor: isAwaiting ? "text-amber-500" : "text-red-500",
          glow: isSelected ? "shadow-[0_0_14px_rgba(239,68,68,0.35)]" : "",
        };
      case "agent":
        return {
          bg: isSelected ? "bg-clay-mint/30" : "bg-white",
          border: isSelected ? "border-[#136149]" : "border-clay-mint/60",
          text: "text-[#136149]",
          iconColor: "text-[#136149]",
          glow: isSelected ? "shadow-[0_0_12px_rgba(19,97,73,0.3)]" : "",
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
      <div className={`relative w-full h-full flex flex-col rounded-clay-lg overflow-hidden border border-clay-hairline bg-clay-surface-soft ${
        isEnlarged ? "shadow-2xl bg-white" : ""
      }`}>
        {/* GRAPH HEADER TOOLBAR */}
        <div className="h-10 px-3 border-b border-clay-hairline bg-white flex items-center justify-between shrink-0 z-10 gap-2">
          {/* Title & Stats */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-clay-ink">
              <span className="w-2 h-2 rounded-full bg-clay-primary animate-pulse" />
              <span>Live Bug Graph</span>
            </div>
            <span className="text-clay-muted text-[10px] hidden sm:inline">
              ({filteredNodes.length} nodes, {edges.length} edges)
            </span>
          </div>

          {/* Search Input */}
          <div className="relative flex-1 max-w-44">
            <Search className="w-3 h-3 text-clay-muted absolute left-2 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search graph..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-7 pl-6 pr-2 rounded-clay-xs bg-clay-surface-soft border border-clay-hairline text-[11px] text-clay-ink placeholder:text-clay-muted focus:outline-none focus:ring-1 focus:ring-clay-primary"
            />
          </div>

          {/* Filter Pills */}
          <div className="hidden md:flex items-center gap-1">
            {(["all", "folder", "file", "function", "bug", "agent"] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`px-2 py-0.5 rounded-clay-pill text-[10px] font-mono transition-colors cursor-pointer ${
                  activeFilter === filter
                    ? "bg-clay-ink text-white font-semibold"
                    : "bg-clay-surface-card hover:bg-clay-surface-strong text-clay-muted border border-clay-hairline"
                }`}
              >
                {filter}
              </button>
            ))}
          </div>

          {/* Pan & Zoom Controls */}
          <div className="flex items-center gap-1 text-clay-muted">
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
              className="p-1 rounded-clay-xs hover:bg-clay-surface-card hover:text-clay-ink transition-colors cursor-pointer"
              title="Reset View"
            >
              <RotateCw className="w-3.5 h-3.5" />
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
              style={{ width: 1200, height: 1100 }}
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

                // Bezier Curve connecting nodes
                const dx = target.x - source.x;
                const dy = target.y - source.y;
                const midY = source.y + dy * 0.5;

                const pathData = `M ${source.x + 60} ${source.y + 24} C ${source.x + 60} ${midY}, ${target.x + 60} ${midY}, ${target.x + 60} ${target.y}`;
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
                        x={(source.x + target.x) / 2 + 60}
                        y={midY}
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

            {/* DOM Nodes */}
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
                    isSelected ? "ring-2 ring-clay-primary scale-105 z-20" : "hover:scale-102 z-10"
                  }`}
                  style={{
                    left: `${node.x}px`,
                    top: `${node.y}px`,
                    width: node.type === "bug" ? "170px" : "150px",
                  }}
                >
                  <div className={`p-1 rounded-clay-xs bg-clay-surface-card shrink-0 ${colors.iconColor}`}>
                    <NodeIcon className="w-4 h-4" />
                  </div>

                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] font-mono font-semibold text-clay-ink truncate">
                        {node.label}
                      </span>
                      {node.type === "folder" && (
                        <span className="text-[9px] text-clay-muted font-mono">
                          {node.collapsed ? "+" : "−"}
                        </span>
                      )}
                    </div>
                    {node.sublabel && (
                      <span className="text-[9px] font-mono text-clay-muted truncate">
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
                  <span className="text-xs font-mono font-bold text-clay-ink truncate">
                    {selectedNode.label}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedNodeId(null)}
                  className="p-1 rounded-clay-xs hover:bg-clay-surface-card text-clay-muted hover:text-clay-ink"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="text-[11px] font-mono text-clay-body flex flex-col gap-1">
                {selectedNode.path && (
                  <div className="flex items-center justify-between">
                    <span className="text-clay-muted">Path:</span>
                    <span className="truncate max-w-40 text-clay-ink">{selectedNode.path}</span>
                  </div>
                )}
                {selectedNode.fileName && (
                  <div className="flex items-center justify-between">
                    <span className="text-clay-muted">File:</span>
                    <span className="text-clay-ink">{selectedNode.fileName}</span>
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
                    <span className="font-semibold text-clay-ink">{selectedNode.status}</span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-2 border-t border-clay-hairline flex items-center justify-end gap-2">
                {selectedNode.fileName && (
                  <button
                    onClick={() => {
                      onSelectFile(selectedNode.fileName!);
                      if (selectedNode.lineNumber) {
                        onNavigateToLine(selectedNode.fileName!, selectedNode.lineNumber);
                      }
                    }}
                    className="px-2.5 py-1 rounded-clay-sm bg-clay-ink text-white font-mono text-[10px] font-semibold hover:bg-neutral-800 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <span>Open in Editor</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
                {selectedNode.type === "agent" && onSelectAgent && (
                  <button
                    onClick={() => {
                      if (selectedNode.id === "agent_triager") onSelectAgent("shipdev-triager");
                      if (selectedNode.id === "agent_verifier") onSelectAgent("shipdev-verifier");
                    }}
                    className="px-2.5 py-1 rounded-clay-sm bg-[#136149] text-white font-mono text-[10px] font-semibold hover:bg-[#0f4d3a] transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <span>Inspect Agent Profile</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Canvas Bottom Legend */}
          <div className="absolute bottom-3 right-3 px-2 py-1 rounded-clay-sm bg-white/90 backdrop-blur-xs border border-clay-hairline text-[10px] font-mono text-clay-muted flex items-center gap-3 shadow-clay-soft pointer-events-none">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500" /> Folder
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500" /> File
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-clay-primary" /> Function
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500" /> Bug
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#136149]" /> Agent
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

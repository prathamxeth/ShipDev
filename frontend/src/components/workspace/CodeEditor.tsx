"use client";

import React, { useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  Check,
  Copy,
  FileCode,
  Plus,
  SplitSquareVertical,
  X,
  AlertTriangle,
  Bug,
} from "lucide-react";
import { WorkspaceFile } from "@/lib/workspaceFiles";

// Dynamically import Monaco Editor and DiffEditor to avoid SSR issues
const Editor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#000000] text-xs font-mono text-neutral-500">
      Loading Monaco Editor...
    </div>
  ),
});

const DiffEditor = dynamic(
  () => import("@monaco-editor/react").then((mod) => mod.DiffEditor),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-[#000000] text-xs font-mono text-neutral-500">
        Loading Side-by-Side Diff...
      </div>
    ),
  }
);

export interface MonacoEditorInstance {
  revealLineInCenter: (line: number) => void;
  setPosition: (pos: { lineNumber: number; column: number }) => void;
  focus?: () => void;
  deltaDecorations?: (oldDecorations: string[], newDecorations: any[]) => string[];
  addCommand?: (keybinding: number, handler: () => void) => void;
}

interface CodeEditorProps {
  workspaceFiles: Record<string, WorkspaceFile>;
  openTabs: string[];
  activeFileName: string;
  onSelectTab: (fileName: string) => void;
  onCloseTab: (fileName: string) => void;
  onCodeChange: (newCode: string) => void;
  isDiffMode: boolean;
  onToggleDiffMode: (diffState?: boolean) => void;
  originalCodeForDiff: string;
  modifiedCodeForDiff: string;
  onAcceptDiff: () => void;
  onRejectDiff: () => void;
  targetHighlightLine?: number | null;
  bugAnnotation?: {
    lineNumber: number;
    description: string;
    severity: string;
  } | null;
  cursorPosition: { lineNumber: number; column: number };
  onCursorPositionChange: (pos: { lineNumber: number; column: number }) => void;
  onSaveFile?: () => void;
}

export function CodeEditor({
  workspaceFiles,
  openTabs,
  activeFileName,
  onSelectTab,
  onCloseTab,
  onCodeChange,
  isDiffMode,
  onToggleDiffMode,
  originalCodeForDiff,
  modifiedCodeForDiff,
  onAcceptDiff,
  onRejectDiff,
  targetHighlightLine,
  bugAnnotation,
  cursorPosition,
  onCursorPositionChange,
  onSaveFile,
}: CodeEditorProps) {
  const editorRef = useRef<MonacoEditorInstance | null>(null);
  const monacoRef = useRef<any>(null);
  const decorationsRef = useRef<string[]>([]);

  const activeFile = workspaceFiles[activeFileName] || {
    name: activeFileName || "untitled",
    path: `src/${activeFileName || "untitled"}`,
    language: "python",
    code: "",
  };

  // When targetHighlightLine changes, scroll editor and add line highlight decoration
  useEffect(() => {
    if (!editorRef.current || !targetHighlightLine) return;

    editorRef.current.revealLineInCenter(targetHighlightLine);
    editorRef.current.setPosition({ lineNumber: targetHighlightLine, column: 1 });
    if (editorRef.current.focus) editorRef.current.focus();

    if (monacoRef.current && editorRef.current.deltaDecorations) {
      const monaco = monacoRef.current;
      decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, [
        {
          range: new monaco.Range(targetHighlightLine, 1, targetHighlightLine, 1),
          options: {
            isWholeLine: true,
            className: "bg-rose-950/40 border-l-2 border-rose-500",
            glyphMarginClassName: "bug-glyph-marker",
            overviewRuler: {
              color: "#f43f5e",
              position: monaco.editor.OverviewRulerLane.Right,
            },
          },
        },
      ]);
    }
  }, [targetHighlightLine, activeFileName]);

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-[#000000]">
      {/* TABS BAR MATCHING NEXUS IDE */}
      <div className="h-9 px-2 bg-[#080808] border-b border-[#1e1e1e] flex items-center justify-between overflow-x-auto select-none shrink-0 scrollbar-none">
        <div className="flex items-center gap-1 min-w-0">
          {openTabs.map((tab) => {
            const isActive = activeFileName === tab;
            const fileObj = workspaceFiles[tab];
            const isFileModified = fileObj?.modified;
            const hasBug = Boolean(fileObj?.bugLine);

            return (
              <div
                key={tab}
                onClick={() => onSelectTab(tab)}
                className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-t-md text-xs font-mono border-t border-x cursor-pointer transition-colors shrink-0 max-w-48 ${
                  isActive
                    ? "bg-[#000000] border-[#262626] text-white font-medium shadow-xs"
                    : isFileModified
                    ? "bg-[#080808] border-transparent text-[#e5c07b] hover:text-[#f3d38c]"
                    : "bg-[#080808] border-transparent text-neutral-400 hover:text-neutral-200"
                }`}
              >
                <FileCode
                  className={`w-3 h-3 shrink-0 ${
                    isActive
                      ? "text-white"
                      : isFileModified
                      ? "text-[#e5c07b]"
                      : "text-neutral-500"
                  }`}
                />
                <span className="truncate">{tab}</span>

                {hasBug && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"
                    title="Bug detected in this file"
                  />
                )}

                {isFileModified && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-[#e5c07b] shrink-0"
                    title="Modified file"
                  />
                )}

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab);
                  }}
                  className="p-0.5 rounded hover:bg-[#1f1f1f] text-neutral-500 hover:text-white shrink-0 ml-1.5 opacity-60 group-hover:opacity-100 transition-opacity"
                  title="Close Tab"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            );
          })}
          {/* Plus button to open more workspace files */}
          <button
            onClick={() => {
              const allFiles = Object.keys(workspaceFiles);
              const unopened = allFiles.find((f) => !openTabs.includes(f));
              if (unopened) {
                onSelectTab(unopened);
              } else if (allFiles.length > 0) {
                onSelectTab(allFiles[0]);
              }
            }}
            title="Open file in tab"
            className="p-1 rounded hover:bg-[#1a1a1a] text-neutral-500 hover:text-neutral-200 border border-transparent hover:border-[#262626] transition-colors cursor-pointer shrink-0 ml-1"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>

        {/* Tab Right Controls: Diff Toggle */}
        <div className="flex items-center gap-1.5 shrink-0 pl-2">
          <button
            onClick={() => onToggleDiffMode(!isDiffMode)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-mono border transition-colors cursor-pointer ${
              isDiffMode
                ? "bg-[#f54e00]/20 border-[#f54e00] text-[#f54e00] font-semibold"
                : "bg-transparent border-[#262626] hover:border-[#383838] text-neutral-400 hover:text-white"
            }`}
          >
            <SplitSquareVertical className="w-3 h-3" />
            <span>{isDiffMode ? "Exit Diff" : "Diff View"}</span>
          </button>
        </div>
      </div>

      {/* INLINE BUG NOTIFICATION BANNER (IF BUG ANNOTATED ON ACTIVE FILE) */}
      {bugAnnotation && !isDiffMode && (
        <div className="h-7 px-3 bg-rose-950/30 border-b border-rose-900/40 flex items-center justify-between text-[11px] font-mono text-rose-300 shrink-0">
          <div className="flex items-center gap-2 truncate">
            <Bug className="w-3 h-3 text-rose-400 shrink-0" />
            <span className="font-semibold text-rose-200">
              Line {bugAnnotation.lineNumber}:
            </span>
            <span className="truncate text-rose-300">
              {bugAnnotation.description}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] font-semibold uppercase px-1.5 py-0.2 rounded bg-rose-900/60 text-rose-200 border border-rose-700/60">
              {bugAnnotation.severity}
            </span>
            <button
              onClick={() => onToggleDiffMode(true)}
              className="text-[10px] text-white underline hover:text-[#f54e00] cursor-pointer"
            >
              Preview Fix Diff ➔
            </button>
          </div>
        </div>
      )}

      {/* MONACO CODE EDITOR OR SPLIT DIFF EDITOR */}
      <div className="flex-1 min-h-0 relative">
        {isDiffMode ? (
          <div className="w-full h-full flex flex-col">
            {/* Diff Toolbar */}
            <div className="h-8 px-3 bg-[#0a0a0a] border-b border-[#202020] flex items-center justify-between text-[11px] font-mono text-neutral-300 shrink-0">
              <div className="flex items-center gap-2 truncate">
                <span className="text-[#f54e00] font-semibold">Diff View:</span>
                <span className="text-neutral-400 truncate">
                  Original Baseline (Left) vs Proposed Fix (Right)
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={onAcceptDiff}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-500/80 text-emerald-400 cursor-pointer text-[11px] font-mono font-medium transition-colors"
                >
                  <Check className="w-3 h-3" />
                  <span>Accept Fix (⌘Y)</span>
                </button>
                <button
                  onClick={onRejectDiff}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-rose-950/60 hover:bg-rose-900/60 border border-rose-500/80 text-rose-400 cursor-pointer text-[11px] font-mono transition-colors"
                  title="Reject fix and return task for agent re-attempt"
                >
                  <X className="w-3 h-3" />
                  <span>Reject (⌘N)</span>
                </button>
                <button
                  onClick={() => onToggleDiffMode(false)}
                  className="px-2.5 py-1 rounded bg-transparent hover:bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#383838] text-neutral-400 hover:text-white cursor-pointer text-[11px] font-mono transition-colors"
                >
                  Exit Diff (Esc)
                </button>
              </div>
            </div>

            {/* Monaco Diff Editor */}
            <div className="flex-1 min-h-0">
              <DiffEditor
                height="100%"
                original={originalCodeForDiff}
                modified={modifiedCodeForDiff}
                language={activeFile.language}
                theme="nexus-dark-clean"
                options={{
                  readOnly: true,
                  minimap: { enabled: true },
                  fontSize: 12,
                  fontFamily: "var(--font-geist-mono), monospace",
                  automaticLayout: true,
                  cursorBlinking: "smooth",
                  cursorStyle: "line",
                  scrollBeyondLastLine: false,
                }}
              />
            </div>
          </div>
        ) : (
          <Editor
            height="100%"
            language={activeFile.language}
            theme="nexus-dark-clean"
            value={activeFile.code}
            onChange={(val) => onCodeChange(val || "")}
            onMount={(editor, monaco) => {
              editorRef.current = editor as unknown as MonacoEditorInstance;
              monacoRef.current = monaco;

              // Define custom clean OLED Monaco theme matching Nexus IDE
              monaco.editor.defineTheme("nexus-dark-clean", {
                base: "vs-dark",
                inherit: true,
                rules: [
                  { token: "comment", foreground: "666666", fontStyle: "italic" },
                  { token: "keyword", foreground: "f54e00" },
                  { token: "string", foreground: "9fc9a2" },
                  { token: "number", foreground: "dfa88f" },
                  { token: "type", foreground: "9fbbe0" },
                  { token: "function", foreground: "f8fafc" },
                ],
                colors: {
                  "editor.background": "#000000",
                  "editorCursor.foreground": "#888888",
                  "editor.lineHighlightBackground": "#0c0c0c",
                  "editorLineNumber.foreground": "#444444",
                  "editorLineNumber.activeForeground": "#f54e00",
                  "editor.selectionBackground": "#222222",
                  "editorGutter.background": "#000000",
                  "minimap.background": "#000000",
                },
              });
              monaco.editor.setTheme("nexus-dark-clean");

              // Bind Save shortcut
              if (onSaveFile) {
                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
                  onSaveFile();
                });
              }

              // Listen to cursor position changes
              editor.onDidChangeCursorPosition((e: any) => {
                onCursorPositionChange({
                  lineNumber: e.position.lineNumber,
                  column: e.position.column,
                });
              });

              // Initial line reveal if requested
              if (targetHighlightLine) {
                editor.revealLineInCenter(targetHighlightLine);
                editor.setPosition({ lineNumber: targetHighlightLine, column: 1 });
              }
            }}
            options={{
              minimap: { enabled: true },
              fontSize: 12,
              fontFamily: "var(--font-geist-mono), monospace",
              lineNumbers: "on",
              scrollBeyondLastLine: false,
              automaticLayout: true,
              renderLineHighlight: "all",
              cursorBlinking: "smooth",
              cursorStyle: "line",
              cursorWidth: 2,
              padding: { top: 8, bottom: 8 },
              glyphMargin: true,
            }}
          />
        )}
      </div>
    </div>
  );
}


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
    <div className="w-full h-full flex items-center justify-center bg-white text-xs font-mono text-clay-muted">
      Loading Monaco Editor...
    </div>
  ),
});

const DiffEditor = dynamic(
  () => import("@monaco-editor/react").then((mod) => mod.DiffEditor),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-white text-xs font-mono text-clay-muted">
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
            className: "bg-clay-pink/15 border-l-4 border-clay-pink",
            glyphMarginClassName: "bug-glyph-marker",
            overviewRuler: {
              color: "#ff4d8b",
              position: monaco.editor.OverviewRulerLane.Right,
            },
          },
        },
      ]);
    }
  }, [targetHighlightLine, activeFileName]);

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-white">
      {/* TABS BAR MATCHING CLAY DESIGN SYSTEM */}
      <div className="h-9 px-2 bg-clay-surface-soft border-b border-clay-hairline flex items-center justify-between overflow-x-auto select-none shrink-0 scrollbar-none">
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
                className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-t-clay-md text-xs font-mono border-t border-x cursor-pointer transition-colors shrink-0 max-w-48 ${
                  isActive
                    ? "bg-white border-t-2 border-t-clay-primary border-x-clay-hairline text-clay-ink font-semibold shadow-clay-soft"
                    : isFileModified
                    ? "bg-clay-surface-card border-transparent text-[#946200] hover:text-clay-ink"
                    : "bg-clay-surface-card border-transparent text-clay-muted hover:text-clay-ink"
                }`}
              >
                <FileCode
                  className={`w-3 h-3 shrink-0 ${
                    isActive
                      ? "text-clay-primary"
                      : isFileModified
                      ? "text-clay-ochre"
                      : "text-clay-muted"
                  }`}
                />
                <span className="truncate">{tab}</span>

                {hasBug && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-clay-pink shrink-0"
                    title="Bug detected in this file"
                  />
                )}

                {isFileModified && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-clay-ochre shrink-0"
                    title="Modified file"
                  />
                )}

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab);
                  }}
                  className="p-0.5 rounded-clay-xs hover:bg-clay-surface-strong text-clay-muted hover:text-clay-ink shrink-0 ml-1.5 opacity-60 group-hover:opacity-100 transition-opacity"
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
            className="p-1 rounded-clay-md hover:bg-clay-surface-strong text-clay-muted hover:text-clay-ink border border-clay-hairline transition-colors cursor-pointer shrink-0 ml-1"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>

        {/* Tab Right Controls: Diff Toggle */}
        <div className="flex items-center gap-1.5 shrink-0 pl-2">
          <button
            onClick={() => onToggleDiffMode(!isDiffMode)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-clay-md text-[11px] font-mono border transition-colors cursor-pointer ${
              isDiffMode
                ? "bg-clay-primary text-white border-clay-primary font-semibold shadow-clay-soft"
                : "bg-white border-clay-hairline hover:bg-clay-surface-card text-clay-body hover:text-clay-ink shadow-clay-soft"
            }`}
          >
            <SplitSquareVertical className="w-3 h-3" />
            <span>{isDiffMode ? "Exit Diff" : "Diff View"}</span>
          </button>
        </div>
      </div>

      {/* INLINE BUG NOTIFICATION BANNER (IF BUG ANNOTATED ON ACTIVE FILE) */}
      {bugAnnotation && !isDiffMode && (
        <div className="h-7 px-3 bg-clay-peach/25 border-b border-clay-peach/40 flex items-center justify-between text-[11px] font-mono text-clay-ink shrink-0">
          <div className="flex items-center gap-2 truncate">
            <Bug className="w-3 h-3 text-clay-pink shrink-0" />
            <span className="font-semibold text-clay-ink">
              Line {bugAnnotation.lineNumber}:
            </span>
            <span className="truncate text-clay-body">
              {bugAnnotation.description}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-clay-pill bg-clay-pink/20 text-clay-pink-ink border border-clay-pink/40">
              {bugAnnotation.severity}
            </span>
            <button
              onClick={() => onToggleDiffMode(true)}
              className="text-[10px] text-clay-primary font-semibold underline hover:text-clay-primary-active cursor-pointer"
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
            <div className="h-8 px-3 bg-clay-surface-soft border-b border-clay-hairline flex items-center justify-between text-[11px] font-mono text-clay-ink shrink-0">
              <div className="flex items-center gap-2 truncate">
                <span className="text-clay-primary font-semibold">Diff View:</span>
                <span className="text-clay-muted truncate">
                  Original Baseline (Left) vs Proposed Fix (Right)
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={onAcceptDiff}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-clay-md bg-clay-mint/25 hover:bg-clay-mint/40 border border-clay-mint/60 text-[#136149] cursor-pointer text-[11px] font-mono font-semibold transition-colors shadow-clay-soft"
                >
                  <Check className="w-3 h-3" />
                  <span>Accept Fix (⌘Y)</span>
                </button>
                <button
                  onClick={onRejectDiff}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-clay-md bg-clay-coral/15 hover:bg-clay-coral/25 border border-clay-coral/50 text-clay-coral cursor-pointer text-[11px] font-mono font-semibold transition-colors shadow-clay-soft"
                  title="Reject fix and return task for agent re-attempt"
                >
                  <X className="w-3 h-3" />
                  <span>Reject (⌘N)</span>
                </button>
                <button
                  onClick={() => onToggleDiffMode(false)}
                  className="px-2.5 py-1 rounded-clay-md bg-white hover:bg-clay-surface-card border border-clay-hairline text-clay-body hover:text-clay-ink cursor-pointer text-[11px] font-mono transition-colors shadow-clay-soft"
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
                theme="clay-studio-light"
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
            theme="clay-studio-light"
            value={activeFile.code}
            onChange={(val) => onCodeChange(val || "")}
            onMount={(editor, monaco) => {
              editorRef.current = editor as unknown as MonacoEditorInstance;
              monacoRef.current = monaco;

              // Define custom clean Clay Studio Light Monaco theme
              monaco.editor.defineTheme("clay-studio-light", {
                base: "vs",
                inherit: true,
                rules: [
                  { token: "comment", foreground: "7a7a7a", fontStyle: "italic" },
                  { token: "keyword", foreground: "ff4d8b", fontStyle: "bold" },
                  { token: "string", foreground: "136149" },
                  { token: "number", foreground: "ff6b5a" },
                  { token: "type", foreground: "7c5cb7" },
                  { token: "function", foreground: "1a3a3a", fontStyle: "bold" },
                ],
                colors: {
                  "editor.background": "#ffffff",
                  "editorCursor.foreground": "#0a0a0a",
                  "editor.lineHighlightBackground": "#faf5e8",
                  "editorLineNumber.foreground": "#8a8a8a",
                  "editorLineNumber.activeForeground": "#0a0a0a",
                  "editor.selectionBackground": "#b8a4ed44",
                  "editorGutter.background": "#ffffff",
                  "minimap.background": "#ffffff",
                },
              });
              monaco.editor.setTheme("clay-studio-light");

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


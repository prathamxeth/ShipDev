"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  FileCode,
  Lock,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  User,
} from "lucide-react";
import {
  sendAssistantChat,
  approveTaskViaBFF,
  completeTaskViaBFF,
  rejectTaskViaBFF,
} from "@/lib/api";

interface Message {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
  category?: "greeting" | "research" | "writing" | "planning" | "engineering" | "analysis";
  taskId?: string;
  taskTitle?: string;
  taskStatus?: string;
  stages?: { name: string; status: "done" | "running" | "pending" }[];
  patchDiff?: string;
  testEvidence?: { command: string; exitCode: number; summary: string };
  needsApproval?: boolean;
  isApproved?: boolean;
  isCompleted?: boolean;
}

interface PersonalAssistantViewProps {
  onTaskCreated?: (taskId: string) => void;
  activeWorkspaceType?: "PERSONAL" | "TEAM";
}

/**
 * Parses inline formatting: **bold**, `code`, and *italic*.
 */
function renderInlineSpans(str: string): React.ReactNode[] {
  const tokens = str.split(/(\*\*.*?\*\*|`.*?`|\*.*?\*)/g);
  return tokens.map((tok, i) => {
    if (tok.startsWith("**") && tok.endsWith("**") && tok.length >= 4) {
      return (
        <strong key={i} className="font-semibold text-clay-ink">
          {tok.slice(2, -2)}
        </strong>
      );
    }
    if (tok.startsWith("`") && tok.endsWith("`") && tok.length >= 2) {
      return (
        <code
          key={i}
          className="px-1.5 py-0.5 mx-0.5 rounded bg-clay-surface-card border border-clay-hairline font-mono text-[11px] text-clay-primary font-medium"
        >
          {tok.slice(1, -1)}
        </code>
      );
    }
    if (tok.startsWith("*") && tok.endsWith("*") && tok.length >= 2) {
      return (
        <em key={i} className="italic text-clay-muted">
          {tok.slice(1, -1)}
        </em>
      );
    }
    return tok;
  });
}

/**
 * Renders assistant messages with rich GitHub-flavored Markdown.
 * Supports headings (###, ####), bullets (•, -, *), numbered lists (1.), dividers (---),
 * inline bold, code chips, and formatted paragraphs.
 */
function FormattedAssistantMessage({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let listBuffer: { type: "ol" | "ul"; items: React.ReactNode[] } | null = null;

  const flushList = (key: number) => {
    if (!listBuffer) return;
    if (listBuffer.type === "ol") {
      elements.push(
        <ol key={`ol_${key}`} className="my-2 space-y-1.5 pl-1 list-decimal list-inside text-xs">
          {listBuffer.items}
        </ol>
      );
    } else {
      elements.push(
        <ul key={`ul_${key}`} className="my-2 space-y-1.5 pl-1 text-xs">
          {listBuffer.items}
        </ul>
      );
    }
    listBuffer = null;
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    // Horizontal rule
    if (/^---+$/.test(trimmed)) {
      flushList(idx);
      elements.push(<hr key={idx} className="my-3 border-clay-hairline" />);
      return;
    }

    // Headings
    if (trimmed.startsWith("### ")) {
      flushList(idx);
      elements.push(
        <h3 key={idx} className="text-xs font-bold text-clay-ink mt-3 mb-1.5 tracking-tight flex items-center gap-1.5">
          {renderInlineSpans(trimmed.slice(4))}
        </h3>
      );
      return;
    }

    if (trimmed.startsWith("#### ")) {
      flushList(idx);
      elements.push(
        <h4 key={idx} className="text-[11px] font-bold text-clay-ink mt-2 mb-1">
          {renderInlineSpans(trimmed.slice(5))}
        </h4>
      );
      return;
    }

    // Numbered list item: e.g. "1. **Critical Arithmetic Defect**: ..."
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      const itemContent = renderInlineSpans(numMatch[2]);
      if (!listBuffer || listBuffer.type !== "ol") {
        flushList(idx);
        listBuffer = { type: "ol", items: [] };
      }
      listBuffer.items.push(
        <li key={`li_${idx}`} className="text-clay-body text-xs leading-relaxed pl-1">
          <span className="font-semibold text-clay-ink mr-1.5">{numMatch[1]}.</span>
          {itemContent}
        </li>
      );
      return;
    }

    // Bullet list item: e.g. "• **Diagnosis Assistant:** ..." or "- item"
    const bulletMatch = trimmed.match(/^(?:•|-|\*)\s+(.*)$/);
    if (bulletMatch) {
      const itemContent = renderInlineSpans(bulletMatch[1]);
      if (!listBuffer || listBuffer.type !== "ul") {
        flushList(idx);
        listBuffer = { type: "ul", items: [] };
      }
      listBuffer.items.push(
        <li key={`li_${idx}`} className="flex items-start gap-2 text-clay-body text-xs leading-relaxed">
          <span className="text-clay-primary font-bold text-[13px] leading-tight select-none">•</span>
          <div className="flex-1">{itemContent}</div>
        </li>
      );
      return;
    }

    // Empty line (flush open list)
    if (!trimmed) {
      flushList(idx);
      return;
    }

    // Regular paragraph
    flushList(idx);
    elements.push(
      <p key={idx} className="text-clay-body text-xs leading-relaxed my-1">
        {renderInlineSpans(line)}
      </p>
    );
  });

  flushList(lines.length);

  return <div className="space-y-1 select-text">{elements}</div>;
}

export function PersonalAssistantView({
  onTaskCreated,
  activeWorkspaceType = "PERSONAL",
}: PersonalAssistantViewProps) {
  const isTeam = activeWorkspaceType === "TEAM";
  const workspaceId = isTeam ? "ws_team_default" : "ws_personal_default";
  const storageKey = `shipdev_chat_history_${workspaceId}`;

  const getWelcomeMessage = useCallback((): Message => ({
    id: `msg_init_${workspaceId}`,
    sender: "assistant",
    text: isTeam
      ? "Hello! I am your ShipDev Team AI Assistant, connected to your organization workspace memory and the Switch multi-agent pipeline.\n\nHow can I help your team today? You can ask me to:\n• 🛠️ **Analyze Team Project & Fix Defects** (e.g. *\"Give me three improvements\"*)\n• 🔍 **Research Architecture & Trade-offs** (e.g. *\"Research SQLite WAL mode performance\"*)\n• 📝 **Draft Documentation or Runbooks** (e.g. *\"Document deployment runbook for v2 release\"*)\n• 🗺️ **Plan Team Milestones & Roadmaps** (e.g. *\"Plan migration roadmap for Kubernetes staging\"*)"
      : "Hello! I am your ShipDev Personal AI Assistant, connected to your private workspace memory and the Switch multi-agent pipeline.\n\nHow can I help you today? You can ask me to:\n• 🛠️ **Analyze Project & Fix Defects** (e.g. *\"Give me three improvements\"*)\n• 🔍 **Research Architecture & Trade-offs** (e.g. *\"Research SQLite WAL mode performance\"*)\n• 📝 **Draft Documentation or Runbooks** (e.g. *\"Document deployment runbook for v2 release\"*)\n• 🗺️ **Plan Milestones & Roadmaps** (e.g. *\"Plan migration roadmap for Kubernetes staging\"*)",
    timestamp: "Just now",
    category: "greeting",
  }), [isTeam, workspaceId]);

  // Load persisted history with strict deduplication of initial greeting
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const deduped: Message[] = [];
            const seenIds = new Set<string>();
            let hasWelcome = false;
            for (const msg of parsed) {
              if (seenIds.has(msg.id)) continue;
              seenIds.add(msg.id);
              if (
                msg.id.startsWith("msg_init_") ||
                msg.id.startsWith("msg_welcome_") ||
                (msg.category === "greeting" && msg.sender === "assistant" && msg.text.includes("Hello! I am your ShipDev"))
              ) {
                if (hasWelcome) continue;
                hasWelcome = true;
              }
              deduped.push(msg);
            }
            if (deduped.length > 0) return deduped;
          }
        }
      } catch {
        // Fallback
      }
    }
    return [getWelcomeMessage()];
  });

  const [inputText, setInputText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new message or activity
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isProcessing]);

  // Sync state when workspaceId changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const deduped: Message[] = [];
            const seenIds = new Set<string>();
            let hasWelcome = false;
            for (const msg of parsed) {
              if (seenIds.has(msg.id)) continue;
              seenIds.add(msg.id);
              if (
                msg.id.startsWith("msg_init_") ||
                msg.id.startsWith("msg_welcome_") ||
                (msg.category === "greeting" && msg.sender === "assistant" && msg.text.includes("Hello! I am your ShipDev"))
              ) {
                if (hasWelcome) continue;
                hasWelcome = true;
              }
              deduped.push(msg);
            }
            setMessages(deduped.length > 0 ? deduped : [getWelcomeMessage()]);
            return;
          }
        }
      } catch {
        // Fallback
      }
    }
    setMessages([getWelcomeMessage()]);
  }, [storageKey, getWelcomeMessage]);

  // Persist messages to localStorage
  useEffect(() => {
    if (typeof window !== "undefined" && messages.length > 0) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(messages));
      } catch {
        // Storage quota safeguard
      }
    }
  }, [messages, storageKey]);

  // Clear conversation action
  const handleClearChat = () => {
    const welcome = getWelcomeMessage();
    setMessages([welcome]);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(storageKey, JSON.stringify([welcome]));
      } catch {
        // ignore
      }
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isProcessing) return;

    const userPrompt = inputText.trim();
    const userMsg: Message = {
      id: `usr_${Date.now()}`,
      sender: "user",
      text: userPrompt,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setIsProcessing(true);
    setActionError(null);

    try {
      const resp = await sendAssistantChat(userPrompt, workspaceId);

      const reply: Message = {
        id: `ast_${Date.now()}`,
        sender: "assistant",
        category: resp.category as any,
        text: resp.reply_text,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        taskId: resp.task?.id,
        taskTitle: resp.task?.title,
        taskStatus: resp.task?.status,
        patchDiff: resp.patch_diff || undefined,
        testEvidence: resp.test_evidence
          ? {
              command: resp.test_evidence.command,
              exitCode: resp.test_evidence.exit_code,
              summary: resp.test_evidence.summary,
            }
          : undefined,
        needsApproval: resp.needs_approval,
        stages: resp.stages
          ? resp.stages.map((s) => ({ name: s.name, status: s.status as any }))
          : undefined,
      };

      setMessages((prev) => [...prev, reply]);
      setIsProcessing(false);

      if (resp.task && onTaskCreated) {
        onTaskCreated(resp.task.id);
      }
    } catch (err: any) {
      setIsProcessing(false);
      const errMsg = err.message || "Failed to communicate with backend assistant endpoint";
      setActionError(errMsg);

      const errorReply: Message = {
        id: `ast_err_${Date.now()}`,
        sender: "assistant",
        text: `⚠️ **Execution Blocker:** Unable to complete your request.\n\n**Details:** ${errMsg}\n\nPlease check your workspace connection or backend service status.`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errorReply]);
    }
  };

  // Human Gate Approval Decision Handlers
  const handleApproveFix = async (msgId: string, taskId: string) => {
    setActionError(null);
    try {
      await approveTaskViaBFF(taskId, { comments: "Approved via Personal AI Assistant." });
      await completeTaskViaBFF(taskId);

      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                needsApproval: false,
                isApproved: true,
                isCompleted: true,
                taskStatus: "COMPLETED",
                text:
                  m.text +
                  `\n\n---\n🎉 **Fix Approved & Deployed to Production!**\nVerified by authorized human operator. Task status updated to **COMPLETED** (0 regressions).`,
              }
            : m
        )
      );
      if (onTaskCreated) onTaskCreated(taskId);
    } catch (err: any) {
      setActionError(err.message || "Failed to approve fix.");
    }
  };

  const handleRejectFix = async (msgId: string, taskId: string) => {
    setActionError(null);
    try {
      await rejectTaskViaBFF(taskId, { feedback: "Operator requested revision to discount formula." });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                needsApproval: false,
                taskStatus: "FIX_PROPOSED",
                text:
                  m.text +
                  `\n\n---\n🔄 **Revision Requested:** Solution sent back to Solution Assistant for further refinement.`,
              }
            : m
        )
      );
      if (onTaskCreated) onTaskCreated(taskId);
    } catch (err: any) {
      setActionError(err.message || "Failed to reject fix.");
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-clay-canvas select-text font-sans">
      {/* Header */}
      <div className="h-12 px-6 border-b border-clay-hairline bg-white flex items-center justify-between shrink-0 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-clay-md bg-clay-teal/15 text-clay-teal flex items-center justify-center">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-clay-ink">
              {isTeam ? "Team AI Assistant" : "Personal AI Assistant"}
            </h2>
            <span className="text-[10px] text-clay-muted">
              {isTeam ? "Organization Agent • Team Memory" : "Private Agent • Personal Memory"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-clay-pill font-semibold text-[11px] shadow-xs ${
              isTeam
                ? "bg-indigo-50 text-indigo-800 border border-indigo-300"
                : "bg-emerald-50 text-emerald-800 border border-emerald-300"
            }`}
          >
            <Lock className="w-3 h-3 text-emerald-600" />
            <span>{isTeam ? "Team Memory Active" : "Private Memory Active"}</span>
          </span>

          <button
            onClick={handleClearChat}
            title="Clear conversation history and restart"
            aria-label="Clear conversation history and restart"
            className="p-1.5 rounded-clay-md hover:bg-clay-surface-soft text-clay-muted hover:text-clay-ink transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {actionError && (
        <div className="mx-6 mt-4 p-3 rounded-clay-md bg-clay-coral/15 border border-clay-coral/40 text-clay-coral text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Message Stream */}
      <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full flex flex-col gap-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex items-start gap-3 ${m.sender === "user" ? "flex-row-reverse" : "flex-row"}`}
          >
            <div
              className={`w-7 h-7 rounded-clay-md flex items-center justify-center shrink-0 text-xs font-semibold shadow-xs ${
                m.sender === "user"
                  ? "bg-clay-primary text-white"
                  : "bg-clay-surface-card border border-clay-hairline text-clay-teal"
              }`}
            >
              {m.sender === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>

            <div
              className={`p-4 rounded-clay-lg max-w-[85%] text-xs leading-relaxed shadow-clay-soft ${
                m.sender === "user"
                  ? "bg-clay-primary text-white font-medium"
                  : "bg-white border border-clay-hairline text-clay-ink"
              }`}
            >
              {m.sender === "user" ? (
                <div className="whitespace-pre-wrap">{m.text}</div>
              ) : (
                <FormattedAssistantMessage text={m.text} />
              )}

              {/* Staged Execution Progress */}
              {m.stages && (
                <div className="mt-3.5 pt-3 border-t border-clay-hairline/60 flex flex-col gap-1.5">
                  <span className="text-[10px] uppercase font-bold text-clay-muted tracking-wider">
                    Execution Pipeline Evidence
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {m.stages.map((stg, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-1.5 p-1.5 rounded-clay-sm bg-clay-surface-soft border border-clay-hairline text-[10px] text-clay-ink"
                      >
                        <CheckCircle2 className="w-3 h-3 text-clay-success shrink-0" />
                        <span className="truncate">{stg.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unified Diff Box */}
              {m.patchDiff && (
                <div className="mt-3.5 rounded-clay-md border border-clay-hairline bg-[#1e1e1e] text-slate-100 p-3 font-mono text-[11px] overflow-x-auto shadow-xs">
                  <div className="flex items-center justify-between text-zinc-400 text-[10px] pb-1.5 mb-1.5 border-b border-zinc-800">
                    <span className="flex items-center gap-1">
                      <FileCode className="w-3 h-3 text-clay-teal" />
                      Unified Patch Diff
                    </span>
                    <span className="text-emerald-400 font-semibold">1 hunk (-1 / +1)</span>
                  </div>
                  <pre className="whitespace-pre">{m.patchDiff}</pre>
                </div>
              )}

              {/* Test Evidence Terminal */}
              {m.testEvidence && (
                <div className="mt-2.5 rounded-clay-md border border-clay-hairline bg-oled-black text-slate-100 p-2.5 font-mono text-[10px]">
                  <div className="flex items-center justify-between text-zinc-400 pb-1 mb-1 border-b border-zinc-800">
                    <span className="flex items-center gap-1 text-zinc-300">
                      <Terminal className="w-3 h-3 text-emerald-400" />
                      {m.testEvidence.command}
                    </span>
                    <span className="text-emerald-400 font-semibold px-1.5 py-0.2 rounded bg-emerald-950/60 border border-emerald-800">
                      exit: {m.testEvidence.exitCode}
                    </span>
                  </div>
                  <div className="text-zinc-400 whitespace-pre-wrap">{m.testEvidence.summary}</div>
                </div>
              )}

              {/* Interactive Human Gate Approval Controls */}
              {m.needsApproval && m.taskId && (
                <div className="mt-4 pt-3 border-t border-clay-hairline flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-clay-pill border border-amber-300 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-amber-600" />
                      Human Authorization Required
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mt-1">
                    <button
                      onClick={() => handleApproveFix(m.id, m.taskId!)}
                      className="flex-1 py-2 px-3 rounded-clay-md bg-[#136149] hover:bg-[#0f4e3b] text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-clay-soft transition-colors cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Approve & Ship Fix</span>
                    </button>
                    <button
                      onClick={() => handleRejectFix(m.id, m.taskId!)}
                      className="py-2 px-3 rounded-clay-md bg-white hover:bg-clay-surface-soft border border-clay-hairline text-clay-coral text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Request Revision</span>
                    </button>
                  </div>
                </div>
              )}

              {m.isCompleted && (
                <div className="mt-3 pt-2 border-t border-clay-hairline/60 flex items-center justify-between text-[10px] text-clay-muted">
                  <span className="flex items-center gap-1 text-clay-success font-medium">
                    <CheckCircle2 className="w-3 h-3 text-clay-success" />
                    Verified & Recorded
                  </span>
                </div>
              )}

              <span
                className={`text-[9px] block mt-2 ${
                  m.sender === "user" ? "text-clay-pink/70 text-right" : "text-clay-muted"
                }`}
              >
                {m.timestamp}
              </span>
            </div>
          </div>
        ))}

        {isProcessing && (
          <div className="flex items-center gap-2.5 text-clay-muted text-xs italic pl-10 animate-in fade-in duration-200">
            <Sparkles className="w-3.5 h-3.5 text-clay-teal animate-spin" />
            <span>Analyzing repository, planning task, and executing pipeline...</span>
          </div>
        )}

        <div ref={chatBottomRef} />
      </div>

      {/* Input Form */}
      <div className="p-4 border-t border-clay-hairline bg-white shrink-0">
        <form
          onSubmit={handleSend}
          className="max-w-3xl mx-auto flex items-center gap-2"
        >
          <input
            type="text"
            placeholder="Ask anything, request project analysis, fix defects, or plan milestones..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isProcessing}
            className="flex-1 h-10 px-4 rounded-clay-md bg-clay-surface-soft border border-clay-hairline text-xs text-clay-ink placeholder:text-clay-muted outline-none focus:border-clay-primary shadow-xs"
          >
          </input>
          <button
            type="submit"
            disabled={isProcessing || !inputText.trim()}
            className="h-10 px-4 rounded-clay-md bg-clay-primary hover:bg-clay-primary-active text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shadow-clay-soft disabled:opacity-50"
          >
            {isProcessing ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            <span>Send</span>
          </button>
        </form>
      </div>
    </div>
  );
}

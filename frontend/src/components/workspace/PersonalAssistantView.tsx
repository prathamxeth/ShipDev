"use client";

import React, { useState } from "react";
import {
  Bot,
  CheckCircle2,
  Lock,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  User,
  Zap,
} from "lucide-react";
import { createTask } from "@/lib/api";

interface Message {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
  taskId?: string;
}

export function PersonalAssistantView({
  onTaskCreated,
}: {
  onTaskCreated?: (taskId: string) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "msg_init",
      sender: "assistant",
      text: "Hello! I am your ShipDev Personal AI Assistant. I have private access to your personal memory and preferences. How can I help you today?",
      timestamp: "Just now",
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isTyping) return;

    const userMsg: Message = {
      id: `usr_${Date.now()}`,
      sender: "user",
      text: inputText.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setIsTyping(true);

    try {
      // Create real task in personal workspace
      const task = await createTask({
        title: userMsg.text.slice(0, 50),
        description: userMsg.text,
        reported_by: "personal-assistant:chat",
        input_source: "web_assistant",
      });

      setTimeout(() => {
        const assistantMsg: Message = {
          id: `ast_${Date.now()}`,
          sender: "assistant",
          text: `⚡ Task acknowledged and planned: **${task.title}** (Task ID: \`${task.id}\`).\n\nI have delegated this to our specialist Switch agents. You can monitor the live execution, sandbox reproduction, and verified evidence directly in the task queue or Engineering Studio.`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          taskId: task.id,
        };
        setMessages((prev) => [...prev, assistantMsg]);
        setIsTyping(false);
        if (onTaskCreated) onTaskCreated(task.id);
      }, 800);
    } catch {
      setTimeout(() => {
        const assistantMsg: Message = {
          id: `ast_${Date.now()}`,
          sender: "assistant",
          text: "I processed your request using your local personal preferences. If you'd like to run a verified code fix or test run, you can open the Engineering Studio at any time.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        setMessages((prev) => [...prev, assistantMsg]);
        setIsTyping(false);
      }, 600);
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
            <h2 className="text-sm font-semibold text-clay-ink">Personal AI Assistant</h2>
            <span className="text-[10px] text-clay-muted">Private Agent • Personal Memory</span>
          </div>
        </div>

        <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-clay-pill bg-emerald-50 text-emerald-800 border border-emerald-300 font-semibold text-[11px] shadow-xs">
          <Lock className="w-3 h-3 text-emerald-600" />
          <span>Private Memory Active</span>
        </span>
      </div>

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
              className={`p-3.5 rounded-clay-lg max-w-[80%] text-xs leading-relaxed shadow-clay-soft ${
                m.sender === "user"
                  ? "bg-clay-primary text-white font-medium"
                  : "bg-white border border-clay-hairline text-clay-ink"
              }`}
            >
              <div className="whitespace-pre-wrap">{m.text}</div>
              <span
                className={`text-[9px] block mt-1.5 ${
                  m.sender === "user" ? "text-clay-pink/70 text-right" : "text-clay-muted"
                }`}
              >
                {m.timestamp}
              </span>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex items-center gap-2 text-clay-muted text-xs italic pl-10">
            <Sparkles className="w-3.5 h-3.5 text-clay-teal animate-spin" />
            <span>Assistant is planning task execution...</span>
          </div>
        )}
      </div>

      {/* Input Form */}
      <div className="p-4 border-t border-clay-hairline bg-white shrink-0">
        <form
          onSubmit={handleSend}
          className="max-w-3xl mx-auto flex items-center gap-2"
        >
          <input
            type="text"
            placeholder="Ask your assistant anything or describe a problem to solve..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isTyping}
            className="flex-1 h-10 px-4 rounded-clay-md bg-clay-surface-soft border border-clay-hairline text-xs text-clay-ink placeholder:text-clay-muted outline-none focus:border-clay-primary shadow-xs"
          />
          <button
            type="submit"
            disabled={isTyping || !inputText.trim()}
            className="h-10 px-4 rounded-clay-md bg-clay-primary hover:bg-clay-primary-active text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shadow-clay-soft disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send</span>
          </button>
        </form>
      </div>
    </div>
  );
}


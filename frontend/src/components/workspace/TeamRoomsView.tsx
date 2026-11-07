"use client";

import React, { useState } from "react";
import {
  Hash,
  Send,
  MessageSquare,
  Sparkles,
  Bot,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Shield,
  Layers,
} from "lucide-react";
import { Task } from "@/types";

interface RoomMessage {
  id: string;
  sender: string;
  senderRole: string;
  content: string;
  timestamp: string;
  platform: "slack" | "teams" | "web";
  relatedTaskId?: string;
}

interface TeamRoomsViewProps {
  tasks: Task[];
  onSelectTask: (taskId: string) => void;
  onOpenStudio: () => void;
}

export function TeamRoomsView({
  tasks,
  onSelectTask,
  onOpenStudio,
}: TeamRoomsViewProps) {
  const [activeRoom, setActiveRoom] = useState<string>("engineering-review");
  const [inputMessage, setInputMessage] = useState("");
  const [messages, setMessages] = useState<Record<string, RoomMessage[]>>({
    "engineering-review": [
      {
        id: "msg-1",
        sender: "Sarah Lin",
        senderRole: "Senior Backend Lead",
        content: "Switch triage completed for discount calculation defect in demo/buggy_app/calculator.py. Verifier ran pytest in isolated sandbox.",
        timestamp: "10:14 AM",
        platform: "slack",
        relatedTaskId: tasks[0]?.id || "task-101",
      },
      {
        id: "msg-2",
        sender: "ShipDev Bot",
        senderRole: "Autonomous Teammate",
        content: "Verification test exited with code 0. Patch diff is generated and awaiting supervisory approval. Review required before deployment.",
        timestamp: "10:15 AM",
        platform: "teams",
        relatedTaskId: tasks[0]?.id || "task-101",
      },
      {
        id: "msg-3",
        sender: "Marcus Vance",
        senderRole: "Release Manager",
        content: "Checked diff against main branch. Looks targeted and clean. Human gate approval requested.",
        timestamp: "10:18 AM",
        platform: "web",
      },
    ],
    general: [
      {
        id: "msg-4",
        sender: "Ayush",
        senderRole: "Full Stack Engineer",
        content: "Welcome to the ShipDev Team Workspace. All Slack and MS Teams webhook integrations are monitored here.",
        timestamp: "Yesterday",
        platform: "slack",
      },
      {
        id: "msg-5",
        sender: "ShipDev Bot",
        senderRole: "Autonomous Teammate",
        content: "Connected adapters: Slack Bot Gateway (@ShipDev) & Microsoft Teams Bot. Ready to triage incoming issues.",
        timestamp: "Yesterday",
        platform: "teams",
      },
    ],
    incidents: [
      {
        id: "msg-6",
        sender: "ShipDev Sentinel",
        senderRole: "Incident Monitor",
        content: "Zero active production alerts detected. 1 defect flagged in demo-calculator test suite.",
        timestamp: "09:00 AM",
        platform: "web",
        relatedTaskId: tasks[0]?.id,
      },
    ],
  });

  const rooms = [
    { id: "engineering-review", name: "engineering-review", desc: "Automated PRs & Human Gate reviews", unread: 2 },
    { id: "general", name: "general", desc: "Team announcements & status updates", unread: 0 },
    { id: "incidents", name: "incidents", desc: "Production defect alerts & escalations", unread: 1 },
  ];

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    const newMsg: RoomMessage = {
      id: `msg-${Date.now()}`,
      sender: "You",
      senderRole: "Team Member",
      content: inputMessage.trim(),
      timestamp: "Just now",
      platform: "web",
    };

    setMessages((prev) => ({
      ...prev,
      [activeRoom]: [...(prev[activeRoom] || []), newMsg],
    }));
    setInputMessage("");
  };

  return (
    <div className="flex-1 flex h-full bg-clay-canvas overflow-hidden">
      {/* Rooms Sidebar */}
      <div className="w-64 border-r border-clay-hairline bg-clay-surface-soft flex flex-col shrink-0">
        <div className="p-3 border-b border-clay-hairline flex items-center justify-between bg-white">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-clay-primary" />
            <h2 className="text-xs font-semibold text-clay-ink uppercase tracking-wider font-sans">
              Team Rooms
            </h2>
          </div>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-clay-pill bg-clay-mint/20 text-[#136149] font-medium border border-clay-mint/40">
            Synced
          </span>
        </div>

        <div className="p-2 space-y-1 overflow-y-auto flex-1 font-sans">
          <div className="text-[10px] uppercase font-bold text-clay-muted px-2 py-1 tracking-wider">
            Connected Channels
          </div>
          {rooms.map((room) => {
            const isActive = activeRoom === room.id;
            return (
              <button
                key={room.id}
                onClick={() => setActiveRoom(room.id)}
                className={`w-full text-left p-2.5 rounded-clay-md cursor-pointer transition-colors flex items-center justify-between ${
                  isActive
                    ? "bg-white text-clay-ink font-semibold shadow-clay-soft border border-clay-hairline"
                    : "text-clay-body hover:bg-white hover:text-clay-ink"
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <Hash className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-clay-primary" : "text-clay-muted"}`} />
                  <div className="truncate">
                    <span className="text-xs block truncate">{room.name}</span>
                    <span className="text-[10px] text-clay-muted block truncate font-normal">
                      {room.desc}
                    </span>
                  </div>
                </div>
                {room.unread > 0 && !isActive && (
                  <span className="px-1.5 py-0.2 rounded-clay-pill bg-clay-primary text-white text-[9px] font-mono shrink-0">
                    {room.unread}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Integration Status Footer */}
        <div className="p-3 border-t border-clay-hairline bg-white flex flex-col gap-1.5 text-[11px] font-sans">
          <span className="text-[10px] font-semibold text-clay-muted uppercase tracking-wider">
            Synced Gateways
          </span>
          <div className="flex items-center justify-between text-clay-body">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#4A154B]" />
              <span>Slack (#team-shipdev)</span>
            </span>
            <span className="text-[10px] text-[#136149] font-medium">Live</span>
          </div>
          <div className="flex items-center justify-between text-clay-body">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#5B5FC7]" />
              <span>MS Teams (General)</span>
            </span>
            <span className="text-[10px] text-[#136149] font-medium">Live</span>
          </div>
        </div>
      </div>

      {/* Main Room Chat View */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Room Header */}
        <div className="h-12 border-b border-clay-hairline bg-white px-4 flex items-center justify-between shrink-0 shadow-xs">
          <div className="flex items-center gap-2 min-w-0">
            <Hash className="w-4 h-4 text-clay-primary shrink-0" />
            <h3 className="font-semibold text-xs text-clay-ink truncate">
              {activeRoom}
            </h3>
            <span className="text-clay-hairline">•</span>
            <span className="text-[11px] text-clay-muted truncate">
              {rooms.find((r) => r.id === activeRoom)?.desc}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onOpenStudio}
              className="px-2.5 py-1 rounded-clay-md bg-clay-surface-soft hover:bg-clay-surface-card border border-clay-hairline text-xs text-clay-ink font-medium cursor-pointer transition-colors shadow-clay-soft flex items-center gap-1.5"
            >
              <Layers className="w-3.5 h-3.5 text-clay-primary" />
              <span>Open Engineering Studio</span>
            </button>
          </div>
        </div>

        {/* Message Thread */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 font-sans">
          {(messages[activeRoom] || []).map((msg) => {
            const isBot = msg.sender.toLowerCase().includes("bot") || msg.sender.toLowerCase().includes("sentinel");
            return (
              <div
                key={msg.id}
                className={`p-3.5 rounded-clay-lg border transition-all ${
                  isBot
                    ? "bg-linear-to-r from-clay-lavender/15 to-white border-clay-lavender/40 shadow-clay-soft"
                    : "bg-white border-clay-hairline shadow-clay-soft"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    {isBot ? (
                      <span className="w-5 h-5 rounded-clay-xs bg-clay-primary/10 border border-clay-primary/30 flex items-center justify-center text-clay-primary">
                        <Bot className="w-3 h-3" />
                      </span>
                    ) : (
                      <span className="w-5 h-5 rounded-clay-xs bg-clay-surface-card border border-clay-hairline flex items-center justify-center text-clay-ink font-semibold text-[10px]">
                        {msg.sender.charAt(0)}
                      </span>
                    )}
                    <span className="font-semibold text-xs text-clay-ink">
                      {msg.sender}
                    </span>
                    <span className="text-[10px] text-clay-muted">
                      • {msg.senderRole}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] text-clay-muted">
                    <span className="capitalize font-mono">via {msg.platform}</span>
                    <span>{msg.timestamp}</span>
                  </div>
                </div>

                <p className="text-xs text-clay-body leading-relaxed pl-7">
                  {msg.content}
                </p>

                {msg.relatedTaskId && (
                  <div className="mt-2.5 ml-7 pt-2 border-t border-clay-hairline flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-clay-peach-ink font-medium">
                      <Sparkles className="w-3 h-3 text-clay-peach" />
                      <span>Linked Task: {msg.relatedTaskId}</span>
                    </div>
                    <button
                      onClick={() => onSelectTask(msg.relatedTaskId!)}
                      className="text-[11px] text-clay-primary hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <span>Review in Studio</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Message Input Box */}
        <form
          onSubmit={handleSendMessage}
          className="p-3 border-t border-clay-hairline bg-white flex items-center gap-2 shrink-0"
        >
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder={`Message #${activeRoom} (synced to Slack & MS Teams)...`}
            style={{ outline: "none", boxShadow: "none" }}
            className="flex-1 h-9 px-3 rounded-clay-md bg-clay-surface-soft border border-clay-hairline text-xs text-clay-ink placeholder:text-clay-muted outline-none focus:outline-none focus:ring-0 shadow-xs"
          />
          <button
            type="submit"
            disabled={!inputMessage.trim()}
            className="h-9 px-4 rounded-clay-md bg-clay-primary hover:bg-clay-primary-active text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shadow-clay-soft disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send</span>
          </button>
        </form>
      </div>
    </div>
  );
}


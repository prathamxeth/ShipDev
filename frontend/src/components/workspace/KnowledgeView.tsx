"use client";

import React, { useState } from "react";
import {
  BookOpen,
  Lock,
  Users,
  Share2,
  Plus,
  CheckCircle2,
  AlertCircle,
  FileText,
  Tag,
  Search,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import { previewShareResource, executeShareResource } from "@/lib/api";

interface KnowledgeItem {
  id: string;
  title: string;
  category: string;
  content: string;
  workspaceType: "PERSONAL" | "TEAM";
  updatedAt: string;
}

interface KnowledgeViewProps {
  activeWorkspaceType: "PERSONAL" | "TEAM";
}

export function KnowledgeView({ activeWorkspaceType }: KnowledgeViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [selectedItemToShare, setSelectedItemToShare] = useState<KnowledgeItem | null>(null);
  const [shareReason, setShareReason] = useState("");
  const [isSharing, setIsSharing] = useState(false);
  const [shareSuccess, setShareSuccess] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);

  // Initial knowledge items scoped by workspace
  const [knowledgeList, setKnowledgeList] = useState<KnowledgeItem[]>([
    {
      id: "kn-1",
      title: "My Personal Python Sandbox Preferences",
      category: "Personal Config",
      content: "Always run pytest with --tb=short and ignore deprecation warnings during fast reproduction runs.",
      workspaceType: "PERSONAL",
      updatedAt: "Today, 11:20 AM",
    },
    {
      id: "kn-2",
      title: "Discord Bot Automation Notes",
      category: "Integration",
      content: "When tagging @ShipDev in #personal-bugs, provide reproduction steps in backticks for auto-extraction.",
      workspaceType: "PERSONAL",
      updatedAt: "Yesterday",
    },
    {
      id: "kn-3",
      title: "Organization PR Review Standards",
      category: "Guidelines",
      content: "All code changes must have an attached reproduction exit-code evidence and clean verification test passing before human approval.",
      workspaceType: "TEAM",
      updatedAt: "2 days ago",
    },
    {
      id: "kn-4",
      title: "Switch Bridge Sandbox Isolation Policy",
      category: "Architecture",
      content: "Subprocess execution runs inside isolated virtualenv with strict time limits (30s) and non-root execution.",
      workspaceType: "TEAM",
      updatedAt: "3 days ago",
    },
    {
      id: "kn-5",
      title: "Slack & MS Teams Webhook Formatting",
      category: "Platform Standards",
      content: "Outbound responses must include task ID, stage status, and a direct link to the human review gate.",
      workspaceType: "TEAM",
      updatedAt: "May 2026",
    },
  ]);

  const displayedItems = knowledgeList.filter(
    (item) =>
      item.workspaceType === activeWorkspaceType &&
      (searchQuery.trim() === "" ||
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleOpenShare = (item: KnowledgeItem) => {
    setSelectedItemToShare(item);
    setShareReason(`Sharing ${item.title} to team engineering knowledge`);
    setShareError(null);
    setShareSuccess(null);
    setIsShareModalOpen(true);
  };

  const handleConfirmShare = async () => {
    if (!selectedItemToShare) return;
    setIsSharing(true);
    setShareError(null);
    setShareSuccess(null);

    try {
      // 1. Preview boundary check via BFF
      await previewShareResource(selectedItemToShare.id, "ws_team_default", "kn_resource");

      // 2. Execute boundary transfer
      await executeShareResource(
        selectedItemToShare.id,
        "ws_team_default",
        shareReason.trim() || "Explicit team share",
        "kn_resource"
      );

      // Add cloned item to team workspace list
      const teamClone: KnowledgeItem = {
        ...selectedItemToShare,
        id: `kn-${Date.now()}`,
        workspaceType: "TEAM",
        updatedAt: "Just now",
      };
      setKnowledgeList((prev) => [...prev, teamClone]);

      setShareSuccess(`✓ Successfully transferred "${selectedItemToShare.title}" to Team Workspace.`);
      setTimeout(() => {
        setIsShareModalOpen(false);
        setSelectedItemToShare(null);
      }, 1500);
    } catch (err: any) {
      setShareError(err.message || "Transfer prevented by security boundary check.");
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-clay-canvas overflow-y-auto p-6 font-sans">
      <div className="max-w-4xl mx-auto w-full space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-clay-hairline pb-4">
          <div>
            <h1 className="text-xl font-bold text-clay-ink flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-clay-primary" />
              <span>
                {activeWorkspaceType === "PERSONAL"
                  ? "Personal Memory & Knowledge"
                  : "Organization Knowledge & Guidelines"}
              </span>
            </h1>
            <p className="text-xs text-clay-body mt-1">
              {activeWorkspaceType === "PERSONAL"
                ? "Private memory context, personal notes, and preferences never exposed to team workspaces."
                : "Organization-wide standards, PR guidelines, and architecture docs shared with all team members."}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-2.5 py-1 rounded-clay-pill text-xs font-semibold flex items-center gap-1.5 border ${
                activeWorkspaceType === "PERSONAL"
                  ? "bg-clay-teal/10 text-clay-teal border-clay-teal/30"
                  : "bg-clay-lavender/20 text-clay-lavender-ink border-clay-lavender/40"
              }`}
            >
              {activeWorkspaceType === "PERSONAL" ? (
                <>
                  <Lock className="w-3 h-3" />
                  <span>Private Boundary Enforced</span>
                </>
              ) : (
                <>
                  <Users className="w-3 h-3" />
                  <span>Team Scoped</span>
                </>
              )}
            </span>
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-clay-muted absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search knowledge documents, guidelines, snippets..."
              style={{ outline: "none", boxShadow: "none" }}
              className="w-full h-9 pl-9 pr-3 rounded-clay-md bg-white border border-clay-hairline text-xs text-clay-ink placeholder:text-clay-muted outline-none focus:outline-none focus:ring-0 shadow-xs"
            />
          </div>
        </div>

        {/* Document Cards */}
        {displayedItems.length === 0 ? (
          <div className="p-8 text-center rounded-clay-lg bg-white border border-clay-hairline text-clay-muted text-xs">
            No knowledge entries found for this query in {activeWorkspaceType} workspace.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {displayedItems.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-clay-lg bg-white border border-clay-hairline shadow-clay-soft flex flex-col justify-between gap-3 hover:shadow-clay-card transition-shadow"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-clay-pill bg-clay-surface-soft border border-clay-hairline text-clay-muted font-medium">
                      {item.category}
                    </span>
                    <span className="text-[10px] text-clay-muted">{item.updatedAt}</span>
                  </div>

                  <h3 className="font-bold text-xs text-clay-ink mb-1.5">{item.title}</h3>
                  <p className="text-xs text-clay-body leading-relaxed">{item.content}</p>
                </div>

                <div className="pt-2.5 border-t border-clay-hairline flex items-center justify-between text-xs">
                  <span className="text-[10px] text-clay-muted flex items-center gap-1">
                    {item.workspaceType === "PERSONAL" ? (
                      <>
                        <Lock className="w-2.5 h-2.5 text-clay-teal" />
                        <span>Private</span>
                      </>
                    ) : (
                      <>
                        <Users className="w-2.5 h-2.5 text-clay-lavender" />
                        <span>Team Visible</span>
                      </>
                    )}
                  </span>

                  {item.workspaceType === "PERSONAL" && (
                    <button
                      onClick={() => handleOpenShare(item)}
                      className="px-2 py-1 rounded-clay-md bg-clay-surface-soft hover:bg-clay-surface-card border border-clay-hairline text-clay-ink text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors shadow-clay-soft"
                    >
                      <Share2 className="w-3 h-3 text-clay-primary" />
                      <span>Share to Team</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Explicit Cross-Workspace Sharing Modal */}
        {isShareModalOpen && selectedItemToShare && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-clay-xl border border-clay-hairline shadow-2xl max-w-md w-full p-5 space-y-4 font-sans animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center gap-2.5 border-b border-clay-hairline pb-3">
                <div className="w-8 h-8 rounded-clay-md bg-clay-peach/25 border border-clay-peach/50 flex items-center justify-center text-clay-peach-ink">
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-clay-ink">Confirm Cross-Workspace Transfer</h3>
                  <p className="text-[11px] text-clay-muted">Strict boundary isolation check</p>
                </div>
              </div>

              <div className="p-3 rounded-clay-md bg-clay-surface-soft border border-clay-hairline text-xs space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-clay-muted">Source:</span>
                  <span className="font-semibold text-clay-ink">🔒 Personal Workspace</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-clay-muted">Destination:</span>
                  <span className="font-semibold text-clay-ink">👥 Team Workspace</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-clay-muted">Document:</span>
                  <span className="font-mono text-clay-primary truncate max-w-[200px]">{selectedItemToShare.title}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-clay-ink mb-1">
                  Transfer Justification (Audit Logged):
                </label>
                <input
                  type="text"
                  value={shareReason}
                  onChange={(e) => setShareReason(e.target.value)}
                  placeholder="Reason for making this document visible to the team..."
                  style={{ outline: "none", boxShadow: "none" }}
                  className="w-full h-8 px-2.5 rounded-clay-md bg-clay-surface-soft border border-clay-hairline text-xs text-clay-ink outline-none focus:outline-none focus:ring-0 shadow-xs"
                />
              </div>

              {shareSuccess && (
                <div className="p-2.5 rounded-clay-md bg-clay-mint/20 border border-clay-mint/40 text-[#136149] text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{shareSuccess}</span>
                </div>
              )}

              {shareError && (
                <div className="p-2.5 rounded-clay-md bg-clay-coral/15 border border-clay-coral/40 text-clay-coral text-xs flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{shareError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-clay-hairline">
                <button
                  onClick={() => setIsShareModalOpen(false)}
                  disabled={isSharing}
                  className="px-3 py-1.5 rounded-clay-md border border-clay-hairline bg-white hover:bg-clay-surface-soft text-xs text-clay-ink cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmShare}
                  disabled={isSharing}
                  className="px-3.5 py-1.5 rounded-clay-md bg-clay-primary hover:bg-clay-primary-active text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-clay-soft disabled:opacity-50"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>{isSharing ? "Transferring..." : "Authorize Transfer"}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


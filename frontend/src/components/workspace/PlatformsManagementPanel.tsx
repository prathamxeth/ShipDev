"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Share2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Shield,
  UserCheck,
  Plus,
  ExternalLink,
  MessageSquare,
  Bot,
  Radio,
  Clock,
  Terminal,
} from "lucide-react";
import {
  PlatformHealthItem,
  PlatformMapping,
  PlatformType,
  ReviewerRole,
} from "@/types";
import {
  getPlatformHealth,
  getPlatformMappings,
  getPlatformRoles,
  assignPlatformRole,
} from "@/lib/api";

interface PlatformsManagementPanelProps {
  onSelectTask?: (taskId: string) => void;
  activeWorkspaceType?: "PERSONAL" | "TEAM";
}

export function PlatformsManagementPanel({
  onSelectTask,
  activeWorkspaceType = "PERSONAL",
}: PlatformsManagementPanelProps) {
  const [healthList, setHealthList] = useState<PlatformHealthItem[]>([]);
  const [mappings, setMappings] = useState<PlatformMapping[]>([]);
  const [roles, setRoles] = useState<ReviewerRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New role form state
  const [newPlatform, setNewPlatform] = useState<PlatformType>(
    activeWorkspaceType === "PERSONAL" ? "discord" : "slack"
  );
  const [newUserId, setNewUserId] = useState("");
  const [newRole, setNewRole] = useState("lead");
  const [newUserHandle, setNewUserHandle] = useState("");
  const [isSubmittingRole, setIsSubmittingRole] = useState(false);
  const [roleSuccess, setRoleSuccess] = useState<string | null>(null);

  const allowedPlatforms: PlatformType[] =
    activeWorkspaceType === "PERSONAL"
      ? ["discord", "telegram"]
      : ["slack", "teams"];

  useEffect(() => {
    setNewPlatform(activeWorkspaceType === "PERSONAL" ? "discord" : "slack");
  }, [activeWorkspaceType]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [hRes, mRes, rRes] = await Promise.all([
        getPlatformHealth().catch(() => ({ platforms: [] })),
        getPlatformMappings().catch(() => []),
        getPlatformRoles().catch(() => []),
      ]);
      setHealthList(hRes.platforms || []);
      setMappings(mRes || []);
      setRoles(rRes || []);
    } catch (err: any) {
      setError(err.message || "Failed to load platform data");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserId.trim()) return;
    setIsSubmittingRole(true);
    setRoleSuccess(null);
    setError(null);
    try {
      await assignPlatformRole({
        platform: newPlatform,
        user_id: newUserId.trim(),
        role: newRole.trim(),
        user_handle: newUserHandle.trim() || undefined,
      });
      setRoleSuccess(`✓ Assigned ${newRole} to ${newUserId}`);
      setNewUserId("");
      setNewUserHandle("");
      loadData();
    } catch (err: any) {
      setError(err.message || "Failed to assign role");
    } finally {
      setIsSubmittingRole(false);
    }
  };

  const getPlatformIcon = (plat: PlatformType) => {
    switch (plat) {
      case "slack":
        return "💬";
      case "teams":
        return "👥";
      case "discord":
        return "🎮";
      case "telegram":
        return "✈️";
      default:
        return "🌐";
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-clay-canvas overflow-y-auto select-text font-sans">
      {/* Header */}
      <div className="h-12 px-6 border-b border-clay-hairline bg-white flex items-center justify-between shrink-0 shadow-xs">
        <div className="flex items-center gap-2.5">
          <Share2 className="w-4 h-4 text-clay-primary" />
          <h2 className="text-sm font-semibold text-clay-ink font-sans">
            Universal Platform Gateways
          </h2>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-clay-pill bg-clay-surface-card border border-clay-hairline text-clay-muted">
            Phase 2
          </span>
        </div>

        <button
          onClick={loadData}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1 rounded-clay-md bg-clay-surface-soft hover:bg-clay-surface-card border border-clay-hairline text-xs text-clay-ink font-medium cursor-pointer transition-colors shadow-clay-soft disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-clay-primary" : "text-clay-muted"}`} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="p-6 max-w-5xl mx-auto w-full flex flex-col gap-6">
        {/* SECTION 1: Connected Platforms Status */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-clay-muted font-sans">
              Connected Adapters & Diagnostics
            </h3>
            <span className="text-[11px] text-clay-body">4 Supported Platforms</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {[
              {
                id: "slack" as PlatformType,
                name: "Slack",
                scope: "Business & Enterprise",
                eventTypes: "app_mention, message.channels, block_actions",
              },
              {
                id: "teams" as PlatformType,
                name: "Microsoft Teams",
                scope: "Enterprise Collaboration",
                eventTypes: "message, Adaptive Cards Action.Submit",
              },
              {
                id: "discord" as PlatformType,
                name: "Discord",
                scope: "Developer & Community",
                eventTypes: "APPLICATION_COMMAND, MESSAGE_COMPONENT",
              },
              {
                id: "telegram" as PlatformType,
                name: "Telegram",
                scope: "Direct & Group Messaging",
                eventTypes: "message, callback_query inline keyboard",
              },
            ]
              .filter((p) => allowedPlatforms.includes(p.id))
              .map((p) => {
              const health = healthList.find((h) => h.platform === p.id);
              const isConfigured = health ? health.configured : false;

              return (
                <div
                  key={p.id}
                  className="p-4 rounded-clay-lg bg-white border border-clay-hairline shadow-clay-soft flex flex-col justify-between gap-3 hover:shadow-clay-card transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">{getPlatformIcon(p.id)}</span>
                      <div>
                        <h4 className="text-xs font-bold text-clay-ink">{p.name}</h4>
                        <span className="text-[10px] text-clay-muted">{p.scope}</span>
                      </div>
                    </div>

                    <span
                      className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-clay-pill font-medium border ${
                        isConfigured
                          ? "bg-clay-mint/20 text-[#136149] border-clay-mint/40"
                          : "bg-clay-surface-card text-clay-muted border-clay-hairline"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isConfigured ? "bg-[#10b981]" : "bg-clay-hairline"
                        }`}
                      />
                      {isConfigured ? "Active" : "Awaiting Credentials"}
                    </span>
                  </div>

                  <div className="p-2 rounded-clay-md bg-clay-surface-soft border border-clay-hairline/60 flex flex-col gap-1 text-[10px] font-mono">
                    <div className="text-clay-muted truncate">
                      <span className="text-clay-ink font-sans font-medium">Endpoint: </span>
                      {health?.webhook_endpoint || `/api/v1/platforms/${p.id}/webhook`}
                    </div>
                    <div className="text-clay-muted truncate">
                      <span className="text-clay-ink font-sans font-medium">Events: </span>
                      {p.eventTypes}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* SECTION 2: Authorized Reviewers & Server-Side RBAC */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-clay-primary" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-clay-muted font-sans">
                Designated Human Reviewers (Server-Side RBAC)
              </h3>
            </div>
            <span className="text-[11px] text-clay-muted">
              {roles.length} {roles.length === 1 ? "role assigned" : "roles assigned"}
            </span>
          </div>

          <div className="p-4 rounded-clay-lg bg-white border border-clay-hairline shadow-clay-soft flex flex-col gap-4">
            {/* Role List */}
            {roles.length === 0 ? (
              <p className="text-xs text-clay-muted italic">
                No external chat reviewers assigned yet. Any reviewer role granted below will have authority to approve and ship solutions from chat platforms.
              </p>
            ) : (
              <div className="divide-y divide-clay-hairline">
                {roles
                  .filter((r) => allowedPlatforms.includes(r.platform))
                  .map((r) => (
                  <div key={r.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5">
                      <span>{getPlatformIcon(r.platform)}</span>
                      <div>
                        <span className="font-semibold text-clay-ink font-mono text-[11px]">
                          {r.user_handle ? `@${r.user_handle}` : r.user_id}
                        </span>
                        <span className="text-[10px] text-clay-muted ml-2 font-mono">
                          ({r.platform})
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-clay-pill bg-clay-teal/15 text-clay-teal font-semibold">
                        {r.role}
                      </span>
                      <span className="text-[10px] text-clay-muted">
                        Assigned by {r.assigned_by}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Quick Add Form */}
            <form onSubmit={handleAddRole} className="pt-3 border-t border-clay-hairline flex flex-wrap items-center gap-2">
              <select
                value={newPlatform}
                onChange={(e) => setNewPlatform(e.target.value as PlatformType)}
                className="h-8 px-2.5 rounded-clay-md bg-clay-surface-soft border border-clay-hairline text-xs text-clay-ink font-medium outline-none shadow-xs"
              >
                {allowedPlatforms.map((plat) => (
                  <option key={plat} value={plat}>
                    {plat === "slack" ? "Slack" : plat === "teams" ? "MS Teams" : plat === "discord" ? "Discord" : "Telegram"}
                  </option>
                ))}
              </select>

              <input
                type="text"
                placeholder="User ID (e.g. U12345)"
                value={newUserId}
                onChange={(e) => setNewUserId(e.target.value)}
                className="h-8 px-3 rounded-clay-md bg-clay-surface-soft border border-clay-hairline text-xs text-clay-ink font-mono outline-none shadow-xs flex-1 min-w-[140px]"
              />

              <input
                type="text"
                placeholder="Handle (e.g. pratham)"
                value={newUserHandle}
                onChange={(e) => setNewUserHandle(e.target.value)}
                className="h-8 px-3 rounded-clay-md bg-clay-surface-soft border border-clay-hairline text-xs text-clay-ink font-mono outline-none shadow-xs w-32"
              />

              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="h-8 px-2.5 rounded-clay-md bg-clay-surface-soft border border-clay-hairline text-xs text-clay-ink font-medium outline-none shadow-xs"
              >
                <option value="lead">Engineering Lead</option>
                <option value="operator">Operator</option>
                <option value="reviewer">Reviewer</option>
                <option value="admin">Admin</option>
              </select>

              <button
                type="submit"
                disabled={isSubmittingRole || !newUserId.trim()}
                className="h-8 px-3.5 rounded-clay-md bg-clay-primary hover:bg-clay-primary-active text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shadow-clay-soft disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Assign Role</span>
              </button>
            </form>

            {roleSuccess && (
              <span className="text-[11px] text-[#136149] font-medium">{roleSuccess}</span>
            )}
          </div>
        </section>

        {/* SECTION 3: Conversation-to-Task Correlation History */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-3.5 h-3.5 text-clay-primary" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-clay-muted font-sans">
                Conversation-Linked Task History
              </h3>
            </div>
            <span className="text-[11px] text-clay-muted">
              {mappings.length} {mappings.length === 1 ? "task correlated" : "tasks correlated"}
            </span>
          </div>

          <div className="p-4 rounded-clay-lg bg-white border border-clay-hairline shadow-clay-soft flex flex-col gap-2">
            {mappings.length === 0 ? (
              <p className="text-xs text-clay-muted italic py-2">
                No tasks originated from chat platforms yet. Mention `@ShipDev` in any connected channel to trigger real task planning and Switch agent execution.
              </p>
            ) : (
              <div className="divide-y divide-clay-hairline">
                {mappings
                  .filter((m) => allowedPlatforms.includes(m.platform))
                  .map((m) => (
                  <div
                    key={m.id}
                    onClick={() => onSelectTask && onSelectTask(m.task_id)}
                    className="py-3 flex items-center justify-between text-xs hover:bg-clay-surface-soft px-2 rounded-clay-md cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{getPlatformIcon(m.platform)}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-clay-ink font-mono text-xs">
                            {m.task_id}
                          </span>
                          {m.intent_category && (
                            <span className="text-[9px] uppercase font-mono px-1.5 py-0.2 rounded-clay-pill bg-clay-lavender/25 text-clay-lavender-ink font-semibold">
                              {m.intent_category}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-clay-muted flex items-center gap-2 mt-0.5">
                          <span>User: {m.user_display_name || m.user_id}</span>
                          <span>•</span>
                          <span>Channel: {m.conversation_id}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-clay-pill bg-clay-surface-card border border-clay-hairline text-clay-ink">
                        {m.status}
                      </span>
                      <span className="text-clay-primary text-xs font-medium">Inspect ↗</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}


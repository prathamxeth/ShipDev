"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  MessageSquare,
  Bot,
  ArrowRight,
  ShieldAlert,
  ShieldCheck,
  Send,
  X,
  Sparkles,
  Lock,
  Users,
  Key,
  Check,
  Copy,
} from "lucide-react";
import { PlatformConnectionInfo, PlatformType, PlatformMapping, ConnectedAccount, PlatformPairInfo } from "@/types";
import {
  getPlatformConnections,
  connectPlatform,
  disconnectPlatform,
  getPlatformMappings,
  getConnectedAccounts,
  initiateOAuthFlow,
  getPlatformPairInfo,
  disconnectConnectedAccount,
  authorizeAccountOperator,
} from "@/lib/api";

interface PlatformsManagementPanelProps {
  onSelectTask?: (taskId: string) => void;
  activeWorkspaceType?: "PERSONAL" | "TEAM";
}

export function PlatformsManagementPanel({
  onSelectTask,
  activeWorkspaceType = "PERSONAL",
}: PlatformsManagementPanelProps) {
  const [connections, setConnections] = useState<PlatformConnectionInfo[]>([]);
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([]);
  const [mappings, setMappings] = useState<PlatformMapping[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Connection Dialog State
  const [connectingPlatform, setConnectingPlatform] = useState<PlatformType | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<string>("");
  const [operatorUserId, setOperatorUserId] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Disconnect Confirmation State
  const [disconnectingPlatform, setDisconnectingPlatform] = useState<PlatformType | null>(null);

  // Instant Platform Bot Pairing Modal State (Telegram, Teams, Discord, Slack)
  const [pairingModal, setPairingModal] = useState<PlatformPairInfo | null>(null);
  const [copiedPairCommand, setCopiedPairCommand] = useState(false);
  const [pairSuccess, setPairSuccess] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setActionError(null);
    try {
      const [connList, mapList, accountsList] = await Promise.all([
        getPlatformConnections().catch(() => []),
        getPlatformMappings().catch(() => []),
        getConnectedAccounts().catch(() => []),
      ]);
      setConnections(connList);
      setMappings(mapList || []);
      setConnectedAccounts(accountsList || []);
    } catch (err: any) {
      setActionError(err.message || "Failed to load connection status");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData, activeWorkspaceType]);

  // Poll connection status while pairing modal is open
  useEffect(() => {
    if (!pairingModal) return;
    const targetPlat = pairingModal.platform;
    const interval = setInterval(async () => {
      try {
        const [connList, accountsList] = await Promise.all([
          getPlatformConnections().catch(() => []),
          getConnectedAccounts().catch(() => []),
        ]);
        const platConn = connList.find((c) => c.platform === targetPlat && c.connected);
        const platAcc = accountsList.find((a) => a.platform === targetPlat);
        if (platConn || platAcc) {
          setConnections(connList);
          setConnectedAccounts(accountsList);
          setPairSuccess(true);
          setTimeout(() => {
            setPairingModal(null);
            setPairSuccess(false);
            setActionSuccess(`✓ Successfully paired with ${pairingModal.bot_username} as Workspace Operator!`);
          }, 1500);
        }
      } catch (_) {}
    }, 2000);
    return () => clearInterval(interval);
  }, [pairingModal]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const connected = params.get("connected");
      if (connected) {
        setActionSuccess(`✓ Successfully connected ${connected === "teams" ? "Microsoft Teams" : "Telegram"} via official OAuth/OIDC!`);
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
  }, []);

  // Handle Initiating Connect Flow
  const handleStartConnect = (platform: PlatformType) => {
    setActionError(null);
    setActionSuccess(null);
    setConnectingPlatform(platform);
    setOperatorUserId("");
    if (platform === "discord") setSelectedTarget("Personal Community Server");
    else if (platform === "telegram") setSelectedTarget("Private Chat");
    else if (platform === "slack") setSelectedTarget("Engineering Workspace");
    else if (platform === "teams") setSelectedTarget("Engineering Team");
  };

  // Complete Connection
  const handleConfirmConnect = async () => {
    if (!connectingPlatform) return;
    setIsProcessing(true);
    setActionError(null);

    try {
      await connectPlatform(connectingPlatform, {
        account_name: connectingPlatform === "discord"
          ? "@Developer#1024"
          : connectingPlatform === "telegram"
          ? (connections.find((c) => c.platform === "telegram")?.account_name || undefined)
          : connectingPlatform === "slack"
          ? "Workspace Bot (@ShipDev)"
          : "Teams Teammate",
        target_name: selectedTarget,
        operator_user_id: operatorUserId.trim() || undefined,
      });

      setActionSuccess(`✓ Successfully connected ${getPlatformDisplayName(connectingPlatform)}! You can now mention ShipDev in conversations.`);
      setConnectingPlatform(null);
      await loadData();
    } catch (err: any) {
      setActionError(err.message || "Unable to complete connection. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Disconnect
  const handleConfirmDisconnect = async () => {
    if (!disconnectingPlatform) return;
    setIsProcessing(true);
    setActionError(null);

    try {
      await disconnectPlatform(disconnectingPlatform);
      setActionSuccess(`✓ Disconnected ${getPlatformDisplayName(disconnectingPlatform)}.`);
      setDisconnectingPlatform(null);
      await loadData();
    } catch (err: any) {
      setActionError(err.message || "Failed to disconnect platform.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Universal Instant Platform Bot Pairing (Telegram, Teams, Discord, Slack)
  const handleConnectPlatform = async (platform: PlatformType) => {
    setIsProcessing(true);
    setActionError(null);
    try {
      const info = await getPlatformPairInfo(platform);
      // Auto-copy pre-filled /pair command to clipboard
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(info.pairing_command);
        } catch (_) {}
      }
      // Open bot chat directly
      if (typeof window !== "undefined" && info.deep_link) {
        window.open(info.deep_link, "_blank");
      }
      setPairingModal(info);
      setCopiedPairCommand(true);
      setTimeout(() => setCopiedPairCommand(false), 3000);
    } catch (err: any) {
      setActionError(err.message || `Failed to retrieve instant pairing details for ${platform}. Please check backend connectivity.`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Launch Provider OAuth 2.0 / OIDC Flow (Teams)
  const handleLaunchOAuth = async (platform: "telegram" | "teams") => {
    setIsProcessing(true);
    setActionError(null);
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
      const redirectUri = `${origin}/auth/callback/${platform}`;
      const res = await initiateOAuthFlow(platform, redirectUri);
      if (res?.authorization_url) {
        window.location.href = res.authorization_url;
      }
    } catch (err: any) {
      setActionError(err.message || `Failed to initiate ${platform} authorization`);
      setIsProcessing(false);
    }
  };

  // Disconnect Connected Account
  const handleDisconnectAccount = async (platform: string) => {
    setIsProcessing(true);
    setActionError(null);
    try {
      await disconnectConnectedAccount(platform);
      setActionSuccess(`✓ Disconnected and revoked ${platform.toUpperCase()} account.`);
      await loadData();
    } catch (err: any) {
      setActionError(err.message || "Failed to disconnect account.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Explicitly designate connected account as workspace operator (Owner Only)
  const handleAuthorizeOperator = async (platform: string) => {
    setIsProcessing(true);
    setActionError(null);
    try {
      await authorizeAccountOperator(platform);
      setActionSuccess(`✓ Successfully authorized ${platform.toUpperCase()} account as a workspace operator.`);
      await loadData();
    } catch (err: any) {
      setActionError(err.message || "Failed to authorize reviewer.");
    } finally {
      setIsProcessing(false);
    }
  };

  const getPlatformDisplayName = (plat: PlatformType): string => {
    switch (plat) {
      case "discord":
        return "Discord";
      case "telegram":
        return "Telegram";
      case "slack":
        return "Slack";
      case "teams":
        return "Microsoft Teams";
      default:
        return plat;
    }
  };

  const getPlatformIcon = (plat: PlatformType) => {
    switch (plat) {
      case "slack":
        return (
          <span className="w-10 h-10 rounded-clay-md bg-[#4A154B]/10 border border-[#4A154B]/25 flex items-center justify-center text-xl shrink-0">
            💬
          </span>
        );
      case "teams":
        return (
          <span className="w-10 h-10 rounded-clay-md bg-[#5B5FC7]/10 border border-[#5B5FC7]/25 flex items-center justify-center text-xl shrink-0">
            👥
          </span>
        );
      case "discord":
        return (
          <span className="w-10 h-10 rounded-clay-md bg-[#5865F2]/10 border border-[#5865F2]/25 flex items-center justify-center text-xl shrink-0">
            🎮
          </span>
        );
      case "telegram":
        return (
          <span className="w-10 h-10 rounded-clay-md bg-[#229ED9]/10 border border-[#229ED9]/25 flex items-center justify-center text-xl shrink-0">
            ✈️
          </span>
        );
    }
  };

  // Strict Workspace Separation:
  // Personal Workspace shows ONLY Discord & Telegram.
  // Team Workspace shows ONLY Slack & Microsoft Teams.
  const platformsOrder: PlatformType[] =
    activeWorkspaceType === "PERSONAL"
      ? ["discord", "telegram"]
      : ["slack", "teams"];

  const filteredMappings = mappings.filter((m) =>
    activeWorkspaceType === "PERSONAL"
      ? m.platform === "discord" || m.platform === "telegram"
      : m.platform === "slack" || m.platform === "teams"
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-clay-canvas overflow-y-auto font-sans">
      {/* Top Header */}
      <div className="p-6 border-b border-clay-hairline bg-white shrink-0">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-clay-ink">Connected Apps</h1>
              <span
                className={`px-2 py-0.5 rounded-clay-pill text-[10px] font-semibold border flex items-center gap-1 ${
                  activeWorkspaceType === "PERSONAL"
                    ? "bg-clay-teal/10 text-clay-teal border-clay-teal/30"
                    : "bg-clay-lavender/25 text-clay-lavender-ink border-clay-lavender/40"
                }`}
              >
                {activeWorkspaceType === "PERSONAL" ? (
                  <>
                    <Lock className="w-2.5 h-2.5" />
                    <span>Personal Workspace</span>
                  </>
                ) : (
                  <>
                    <Users className="w-2.5 h-2.5" />
                    <span>Team Workspace</span>
                  </>
                )}
              </span>
            </div>
            <p className="text-xs text-clay-body mt-1">
              Connect your communication apps so you can ask ShipDev questions, report bugs, and approve fixes right from your chat.
            </p>
          </div>

          <button
            onClick={() => loadData()}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-clay-md border border-clay-hairline hover:bg-clay-surface-soft text-clay-ink text-xs font-medium cursor-pointer transition-colors shadow-clay-soft"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="p-6 max-w-4xl mx-auto w-full flex flex-col gap-6">
        {/* Alerts / Feedback Banners */}
        {actionSuccess && (
          <div className="p-3.5 rounded-clay-lg bg-clay-mint/20 border border-clay-mint/50 text-[#136149] text-xs flex items-center justify-between shadow-clay-soft animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-clay-success shrink-0" />
              <span>{actionSuccess}</span>
            </div>
            <button
              onClick={() => setActionSuccess(null)}
              className="text-clay-muted hover:text-clay-ink text-xs cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {actionError && (
          <div className="p-3.5 rounded-clay-lg bg-clay-coral/15 border border-clay-coral/40 text-clay-coral text-xs flex items-center justify-between shadow-clay-soft animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-clay-coral shrink-0" />
              <span>{actionError}</span>
            </div>
            <button
              onClick={() => setActionError(null)}
              className="text-clay-muted hover:text-clay-ink text-xs cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 4 Effortless Platform Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {platformsOrder.map((plat) => {
            const conn = connections.find((c) => c.platform === plat);
            const connectedAccount = connectedAccounts.find(
              (a) => a.platform === plat && a.status === "active"
            );
            const isConnected = !!connectedAccount || (conn ? conn.connected : false);

            return (
              <div
                key={plat}
                className={`p-5 rounded-clay-xl bg-white border transition-all flex flex-col justify-between gap-4 shadow-clay-soft hover:shadow-clay-card ${
                  isConnected
                    ? "border-clay-mint/60 ring-1 ring-clay-mint/30"
                    : "border-clay-hairline"
                }`}
              >
                <div>
                  {/* Card Header: Icon, Name & Status Badge */}
                  <div className="flex items-start justify-between gap-3 mb-2.5">
                    <div className="flex items-center gap-3">
                      {getPlatformIcon(plat)}
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm text-clay-ink">
                            {conn?.name || getPlatformDisplayName(plat)}
                          </h3>
                        </div>
                        {connectedAccount ? (
                          <span className="text-[11px] text-clay-muted font-medium block">
                            {connectedAccount.external_username
                              ? `@${connectedAccount.external_username}`
                              : connectedAccount.external_display_name || connectedAccount.external_user_id}
                            {connectedAccount.tenant_id ? ` • Tenant: ${connectedAccount.tenant_id.slice(0, 8)}...` : ""}
                          </span>
                        ) : isConnected && conn?.account_name ? (
                          <span className="text-[11px] text-clay-muted font-medium block">
                            {conn.account_name} {conn.target_name ? `• ${conn.target_name}` : ""}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <span
                      className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-clay-pill font-medium border shrink-0 ${
                        connectedAccount
                          ? "bg-clay-mint/25 text-[#136149] border-clay-mint/50 font-semibold"
                          : isConnected
                          ? "bg-clay-mint/25 text-[#136149] border-clay-mint/50 font-semibold"
                          : conn?.status_label === "Awaiting Platform Credentials"
                          ? "bg-amber-50 text-amber-800 border-amber-200"
                          : "bg-clay-surface-soft text-clay-muted border-clay-hairline"
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          connectedAccount || isConnected
                            ? "bg-clay-success"
                            : conn?.status_label === "Awaiting Platform Credentials"
                            ? "bg-amber-400"
                            : "bg-slate-300"
                        }`}
                      />
                      <span>
                        {connectedAccount
                          ? "Connected (OAuth)"
                          : conn?.status_label || (isConnected ? "Connected" : "Not connected")}
                      </span>
                    </span>
                  </div>

                  {/* One short sentence describing what connecting enables */}
                  <p className="text-xs text-clay-body leading-relaxed mt-1">
                    {connectedAccount
                      ? `Connected to your ${getPlatformDisplayName(plat)} account. Direct messages and mentions automatically route to your workspace.`
                      : conn?.short_description ||
                        (plat === "discord"
                          ? "Chat with ShipDev directly or mention it in your Discord channels to resolve code issues."
                          : plat === "telegram"
                          ? "Connect directly to @Shipdev_bot for instant bug diagnosis and fix verification on the go."
                          : plat === "slack"
                          ? "Mention @ShipDev in channels to collaborate with your team and review pull requests."
                          : "Connect your Microsoft Teams account with Entra ID to automate issue triage.")}
                  </p>

                  {/* If connected via OAuth, show Capabilities & Separate Reviewer Permission Layer */}
                  {connectedAccount && (
                    <div className="mt-3 space-y-2">
                      {/* Scopes badge */}
                      {connectedAccount.granted_scopes && connectedAccount.granted_scopes.length > 0 && (
                        <div className="flex items-center gap-1.5 text-[10px] text-clay-muted font-mono flex-wrap">
                          <span className="font-sans font-semibold text-clay-body">Scopes:</span>
                          {connectedAccount.granted_scopes.map((s) => (
                            <span key={s} className="px-1.5 py-0.5 rounded-clay-sm bg-clay-surface-soft border border-clay-hairline">
                              {s}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Explicit Reviewer Role Layer (Invariant: OAuth connect does NOT auto-grant operator) */}
                      {connectedAccount.reviewer_role_authorized ? (
                        <div className="p-2 rounded-clay-md bg-clay-mint/20 border border-clay-mint/50 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-clay-success shrink-0" />
                            <div>
                              <span className="font-semibold text-clay-ink block text-[11px]">Authorized Reviewer</span>
                              <span className="text-[10px] text-clay-body">Allowed to Approve &amp; Ship production fixes</span>
                            </div>
                          </div>
                          <span className="text-[10px] font-mono text-clay-success font-semibold px-2 py-0.5 rounded-clay-pill bg-clay-mint/30">
                            Active
                          </span>
                        </div>
                      ) : (
                        <div className="p-2 rounded-clay-md bg-amber-50/70 border border-amber-200/80 flex items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2">
                            <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                            <div>
                              <span className="font-semibold text-amber-900 block text-[11px]">Standard Chat Member</span>
                              <span className="text-[10px] text-amber-700">Approval decisions gated (requires operator role)</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAuthorizeOperator(plat)}
                            disabled={isProcessing}
                            className="px-2.5 py-1 rounded-clay-md bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-semibold cursor-pointer shrink-0 transition-colors shadow-xs"
                          >
                            Authorize Reviewer
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Friendly Admin Guidance Note (Only if required by enterprise Teams) */}
                  {!isConnected && conn?.admin_approval_required && (
                    <div className="mt-3 p-2.5 rounded-clay-md bg-amber-50/70 border border-amber-200/80 text-amber-900 text-[11px] flex items-start gap-2 leading-relaxed">
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                      <span>
                        Note: Microsoft Teams may require approval from your organization administrator to add new apps.
                      </span>
                    </div>
                  )}
                </div>

                {/* Primary & Secondary Actions */}
                <div className="pt-3 border-t border-clay-hairline flex items-center justify-between">
                  {connectedAccount ? (
                    <>
                      <a
                        href={conn?.chat_url || conn?.connect_url || (plat === "telegram" ? "https://t.me/Shipdev_bot" : "https://teams.microsoft.com")}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3.5 py-1.5 rounded-clay-md bg-clay-surface-soft hover:bg-clay-surface-card border border-clay-hairline text-clay-ink text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shadow-clay-soft"
                      >
                        <span>Start using in {getPlatformDisplayName(plat)}</span>
                        <ExternalLink className="w-3 h-3 text-clay-primary" />
                      </a>

                      <button
                        onClick={() => handleDisconnectAccount(plat)}
                        disabled={isProcessing}
                        className="text-xs text-clay-muted hover:text-clay-coral font-medium cursor-pointer transition-colors px-2 py-1"
                      >
                        Disconnect &amp; Revoke
                      </button>
                    </>
                  ) : isConnected ? (
                    <>
                      <a
                        href={conn?.chat_url || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3.5 py-1.5 rounded-clay-md bg-clay-surface-soft hover:bg-clay-surface-card border border-clay-hairline text-clay-ink text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shadow-clay-soft"
                      >
                        <span>Start using in {getPlatformDisplayName(plat)}</span>
                        <ExternalLink className="w-3 h-3 text-clay-primary" />
                      </a>

                      <button
                        onClick={() => setDisconnectingPlatform(plat)}
                        className="text-xs text-clay-muted hover:text-clay-coral font-medium cursor-pointer transition-colors px-2 py-1"
                      >
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <>
                      {plat === "telegram" ? (
                        <>
                          <button
                            onClick={() => handleConnectPlatform("telegram")}
                            disabled={isProcessing}
                            className="px-4 py-2 rounded-clay-md bg-[#229ED9] hover:bg-[#1E8BC3] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shadow-clay-soft"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Connect Telegram (1-Click Bot)</span>
                          </button>
                          <a
                            href={conn?.connect_url || "https://t.me/Shipdev_bot"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-clay-muted hover:text-clay-ink font-medium cursor-pointer flex items-center gap-1"
                          >
                            <span>{conn?.account_name ? `Open ${conn.account_name} ↗` : "Open @Shipdev_bot ↗"}</span>
                          </a>
                        </>
                      ) : plat === "teams" ? (
                        <>
                          <button
                            onClick={() => handleConnectPlatform("teams")}
                            disabled={isProcessing}
                            className="px-4 py-2 rounded-clay-md bg-[#5B5FC7] hover:bg-[#4E52B2] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shadow-clay-soft"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Connect Teams (1-Click Bot)</span>
                          </button>
                          <a
                            href={conn?.chat_url || "https://teams.microsoft.com"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-clay-muted hover:text-clay-ink font-medium cursor-pointer flex items-center gap-1"
                          >
                            <span>Open in Teams ↗</span>
                          </a>
                        </>
                      ) : plat === "discord" ? (
                        <>
                          <button
                            onClick={() => handleConnectPlatform("discord")}
                            disabled={isProcessing}
                            className="px-4 py-2 rounded-clay-md bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shadow-clay-soft"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Connect Discord (1-Click Bot)</span>
                          </button>
                          <a
                            href={conn?.connect_url || "https://discord.com"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-clay-muted hover:text-clay-ink font-medium cursor-pointer flex items-center gap-1"
                          >
                            <span>Invite bot ↗</span>
                          </a>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleConnectPlatform("slack")}
                            disabled={isProcessing}
                            className="px-4 py-2 rounded-clay-md bg-[#4A154B] hover:bg-[#3D113E] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shadow-clay-soft"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Connect Slack (1-Click Bot)</span>
                          </button>
                          <a
                            href={conn?.chat_url || "https://slack.com"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-clay-muted hover:text-clay-ink font-medium cursor-pointer flex items-center gap-1"
                          >
                            <span>Open in Slack ↗</span>
                          </a>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Recent Platform Tasks & Activity */}
        <div className="p-5 rounded-clay-xl bg-white border border-clay-hairline shadow-clay-soft flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-clay-primary" />
              <h3 className="font-bold text-xs text-clay-ink uppercase tracking-wider">
                Recent Tasks Started from Chat
              </h3>
            </div>
            <span className="text-[11px] text-clay-muted font-mono">
              {filteredMappings.length} conversation {filteredMappings.length === 1 ? "thread" : "threads"}
            </span>
          </div>

          {filteredMappings.length === 0 ? (
            <p className="text-xs text-clay-muted italic py-3 text-center">
              No chat tasks received yet. Connect an app above and mention @ShipDev in a message to get started!
            </p>
          ) : (
            <div className="divide-y divide-clay-hairline">
              {filteredMappings.slice(0, 4).map((m) => (
                <div
                  key={m.id}
                  onClick={() => onSelectTask && onSelectTask(m.task_id)}
                  className="py-2.5 flex items-center justify-between text-xs hover:bg-clay-surface-soft px-2 rounded-clay-md cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm">
                      {m.platform === "slack"
                        ? "💬"
                        : m.platform === "teams"
                        ? "👥"
                        : m.platform === "discord"
                        ? "🎮"
                        : "✈️"}
                    </span>
                    <div>
                      <span className="font-semibold text-clay-ink block">
                        Task #{m.task_id}
                      </span>
                      <span className="text-[10px] text-clay-muted">
                        Started by {m.user_display_name || m.user_id} via {m.platform}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-clay-pill bg-clay-surface-card border border-clay-hairline text-[10px] font-mono text-clay-body">
                      {m.status}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-clay-muted" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 1-Click Connect Approval Dialog */}
        {connectingPlatform && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-clay-xl border border-clay-hairline shadow-2xl max-w-md w-full p-6 space-y-4 font-sans animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-clay-hairline pb-3">
                <div className="flex items-center gap-3">
                  {getPlatformIcon(connectingPlatform)}
                  <div>
                    <h3 className="font-bold text-sm text-clay-ink">
                      Connect {getPlatformDisplayName(connectingPlatform)}
                    </h3>
                    <p className="text-[11px] text-clay-muted">Official integration flow</p>
                  </div>
                </div>
                <button
                  onClick={() => setConnectingPlatform(null)}
                  className="text-clay-muted hover:text-clay-ink p-1 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs text-clay-body">
                <p>
                  Connecting ShipDev allows you to mention <span className="font-semibold text-clay-ink">@ShipDev</span> in your chats to analyze code, run sandbox tests, and approve solutions.
                </p>

                {connectingPlatform === "discord" && (
                  <div className="p-3 rounded-clay-md bg-clay-surface-soft border border-clay-hairline flex flex-col gap-1.5">
                    <span className="font-semibold text-clay-ink text-[11px]">Choose server:</span>
                    <input
                      type="text"
                      value={selectedTarget}
                      onChange={(e) => setSelectedTarget(e.target.value)}
                      placeholder="e.g. My Personal Discord Server"
                      style={{ outline: "none", boxShadow: "none" }}
                      className="w-full h-8 px-2.5 rounded-clay-md bg-white border border-clay-hairline text-xs text-clay-ink outline-none focus:outline-none focus:ring-0 shadow-xs"
                    />
                  </div>
                )}

                {connectingPlatform === "slack" && (
                  <div className="p-3 rounded-clay-md bg-clay-surface-soft border border-clay-hairline flex flex-col gap-1.5">
                    <span className="font-semibold text-clay-ink text-[11px]">Slack Workspace:</span>
                    <input
                      type="text"
                      value={selectedTarget}
                      onChange={(e) => setSelectedTarget(e.target.value)}
                      placeholder="e.g. Engineering Team"
                      style={{ outline: "none", boxShadow: "none" }}
                      className="w-full h-8 px-2.5 rounded-clay-md bg-white border border-clay-hairline text-xs text-clay-ink outline-none focus:outline-none focus:ring-0 shadow-xs"
                    />
                  </div>
                )}

                {connectingPlatform === "telegram" && (
                  <div className="p-3.5 rounded-clay-md bg-[#229ED9]/5 border border-[#229ED9]/25 flex flex-col gap-2.5 text-[11px]">
                    <div className="flex items-center gap-1.5 font-semibold text-clay-ink">
                      <Sparkles className="w-3.5 h-3.5 text-[#229ED9]" />
                      <span>Instant Bot Pairing (@Shipdev_bot):</span>
                    </div>
                    <p className="text-clay-muted leading-relaxed">
                      Pair directly by sending this command to <strong>@Shipdev_bot</strong> in Telegram:
                    </p>
                    <div className="p-2 rounded bg-clay-surface-soft border border-clay-hairline font-mono text-[10px] select-all break-all text-clay-ink flex items-center justify-between">
                      <code>/pair &lt;YOUR_APPROVAL_KEY&gt;</code>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setConnectingPlatform(null);
                        handleConnectPlatform("telegram");
                      }}
                      className="mt-1 px-3 py-1.5 rounded-clay-md bg-[#229ED9] hover:bg-[#1E8BC3] text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-clay-soft"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Launch Instant Bot Pairing</span>
                    </button>
                  </div>
                )}

                {connectingPlatform === "teams" && (
                  <>
                    <div className="p-3 rounded-clay-md bg-clay-surface-soft border border-clay-hairline flex flex-col gap-1.5">
                      <span className="font-semibold text-clay-ink text-[11px]">Microsoft Teams Team:</span>
                      <input
                        type="text"
                        value={selectedTarget}
                        onChange={(e) => setSelectedTarget(e.target.value)}
                        placeholder="e.g. Engineering"
                        style={{ outline: "none", boxShadow: "none" }}
                        className="w-full h-8 px-2.5 rounded-clay-md bg-white border border-clay-hairline text-xs text-clay-ink outline-none focus:outline-none focus:ring-0 shadow-xs"
                      />
                    </div>
                    <div className="p-3 rounded-clay-md bg-clay-surface-soft border border-clay-hairline flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-clay-ink text-[11px]">Designated Operator ID (optional):</span>
                        <span className="text-[10px] text-clay-muted">Reviewer Role</span>
                      </div>
                      <input
                        type="text"
                        value={operatorUserId}
                        onChange={(e) => setOperatorUserId(e.target.value)}
                        placeholder="e.g. 29:1234567890abcdef or aadObjectId"
                        style={{ outline: "none", boxShadow: "none" }}
                        className="w-full h-8 px-2.5 rounded-clay-md bg-white border border-clay-hairline text-xs text-clay-ink outline-none focus:outline-none focus:ring-0 shadow-xs"
                      />
                      <p className="text-[10px] text-clay-muted mt-0.5">
                        Authorizes this Teams account to click &quot;Approve &amp; Ship&quot; on Adaptive Cards. You can also pair dynamically by sending <code>/pair &lt;secret&gt;</code> in chat.
                      </p>
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-clay-hairline">
                <button
                  type="button"
                  onClick={() => setConnectingPlatform(null)}
                  disabled={isProcessing}
                  className="px-3 py-1.5 rounded-clay-md border border-clay-hairline bg-white hover:bg-clay-surface-soft text-xs text-clay-ink cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmConnect}
                  disabled={isProcessing}
                  className="px-4 py-1.5 rounded-clay-md bg-clay-primary hover:bg-clay-primary-active text-white text-xs font-semibold cursor-pointer shadow-clay-soft flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isProcessing ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  <span>{isProcessing ? "Connecting..." : "Authorize & Connect"}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Disconnect Confirmation Dialog */}
        {disconnectingPlatform && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-clay-xl border border-clay-hairline shadow-2xl max-w-sm w-full p-5 space-y-4 font-sans animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center gap-2 text-clay-coral">
                <AlertCircle className="w-5 h-5" />
                <h3 className="font-bold text-sm text-clay-ink">
                  Disconnect {getPlatformDisplayName(disconnectingPlatform)}?
                </h3>
              </div>

              <p className="text-xs text-clay-body leading-relaxed">
                ShipDev will stop listening for mentions and task commands from this platform until you reconnect it.
              </p>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-clay-hairline">
                <button
                  onClick={() => setDisconnectingPlatform(null)}
                  disabled={isProcessing}
                  className="px-3 py-1.5 rounded-clay-md border border-clay-hairline bg-white text-xs text-clay-ink cursor-pointer"
                >
                  Keep Connected
                </button>
                <button
                  onClick={handleConfirmDisconnect}
                  disabled={isProcessing}
                  className="px-3.5 py-1.5 rounded-clay-md bg-clay-coral hover:bg-clay-coral/90 text-white text-xs font-semibold cursor-pointer shadow-clay-soft disabled:opacity-50"
                >
                  {isProcessing ? "Disconnecting..." : "Disconnect"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Instant Platform Bot Pairing Modal (Telegram, Teams, Discord, Slack) */}
        {pairingModal && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-clay-xl border border-clay-hairline shadow-clay-card max-w-md w-full p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-clay-hairline pb-3">
                <div className="flex items-center gap-2.5">
                  {getPlatformIcon(pairingModal.platform)}
                  <div>
                    <h3 className="text-sm font-bold text-clay-ink">
                      Instant {getPlatformDisplayName(pairingModal.platform)} Pairing
                    </h3>
                    <p className="text-[11px] text-clay-muted">
                      Connecting to {pairingModal.bot_username}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setPairingModal(null)}
                  className="p-1 rounded-clay-md hover:bg-clay-surface-soft text-clay-muted hover:text-clay-ink cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {pairSuccess ? (
                <div className="py-4 text-center space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-clay-success mx-auto animate-bounce" />
                  <h4 className="text-sm font-bold text-clay-ink">Successfully Paired &amp; Authorized!</h4>
                  <p className="text-xs text-clay-muted">
                    Your {getPlatformDisplayName(pairingModal.platform)} account is now an authorized workspace operator.
                  </p>
                </div>
              ) : (
                <div className="space-y-3.5 text-xs text-clay-body">
                  <div className="p-3 rounded-clay-md bg-clay-surface-soft border border-clay-hairline space-y-1.5">
                    <span className="font-semibold text-clay-ink flex items-center gap-1.5 text-[11px]">
                      <Sparkles className="w-3.5 h-3.5 text-clay-primary" />
                      {pairingModal.platform === "telegram"
                        ? "Telegram Bot Opened Automatically"
                        : `${getPlatformDisplayName(pairingModal.platform)} App Opened`}
                    </span>
                    <p className="text-[11px] text-clay-muted leading-relaxed">
                      {pairingModal.platform === "telegram"
                        ? "In Telegram, tap START to pair instantly, or send this pre-filled command:"
                        : `In ${getPlatformDisplayName(pairingModal.platform)}, send this pre-filled command in any chat or channel with @ShipDev:`}
                    </p>
                  </div>

                  {/* Pre-filled Command Box */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-clay-ink">Pairing Command:</span>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(pairingModal.pairing_command);
                            setCopiedPairCommand(true);
                            setTimeout(() => setCopiedPairCommand(false), 2000);
                          } catch (_) {}
                        }}
                        className="text-[10px] text-clay-primary hover:text-clay-primary-active font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        {copiedPairCommand ? (
                          <>
                            <Check className="w-3 h-3 text-clay-success" />
                            <span className="text-clay-success">Copied to Clipboard!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy Command</span>
                          </>
                        )}
                      </button>
                    </div>
                    <div className="p-2.5 rounded-clay-md bg-clay-surface-soft border border-clay-hairline font-mono text-[11px] text-clay-ink select-all break-all flex items-center justify-between gap-2">
                      <code>{pairingModal.pairing_command}</code>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(pairingModal.pairing_command);
                            setCopiedPairCommand(true);
                            setTimeout(() => setCopiedPairCommand(false), 2000);
                          } catch (_) {}
                        }}
                        className="p-1 rounded hover:bg-clay-surface-card text-clay-muted hover:text-clay-ink cursor-pointer shrink-0"
                      >
                        {copiedPairCommand ? <Check className="w-3.5 h-3.5 text-clay-success" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Live Status Indicator */}
                  <div className="p-2.5 rounded-clay-md bg-clay-surface-soft border border-clay-hairline flex items-center gap-2.5">
                    <RefreshCw className="w-3.5 h-3.5 text-clay-primary animate-spin shrink-0" />
                    <span className="text-[11px] text-clay-muted">
                      Waiting for {getPlatformDisplayName(pairingModal.platform)} message... (Auto-pairs when you send the command)
                    </span>
                  </div>

                  <div className="pt-2 flex items-center justify-between gap-2">
                    {pairingModal.deep_link ? (
                      <a
                        href={pairingModal.deep_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-clay-primary hover:underline font-medium flex items-center gap-1"
                      >
                        <span>Open in {getPlatformDisplayName(pairingModal.platform)} ↗</span>
                      </a>
                    ) : (
                      <div />
                    )}
                    <button
                      type="button"
                      onClick={() => setPairingModal(null)}
                      className="px-3 py-1.5 rounded-clay-md border border-clay-hairline bg-white hover:bg-clay-surface-soft text-xs text-clay-ink cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

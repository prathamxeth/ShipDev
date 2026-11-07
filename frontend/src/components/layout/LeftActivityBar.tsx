"use client";

import React from "react";
import {
  Bot,
  Settings,
  Info,
  Share2,
  ShieldCheck,
} from "lucide-react";

export type ActivityTab =
  | "assistant"
  | "reviews"
  | "platforms"
  | "bugtree"
  | "graph"
  | "explorer"
  | "search"
  | "git"
  | "agents"
  | "home"
  | "rooms"
  | "projects"
  | "members"
  | "studio";

interface LeftActivityBarProps {
  activeTab: ActivityTab;
  onSelectTab: (tab: ActivityTab) => void;
  isSidebarOpen?: boolean;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
  bugCount?: number;
  activeWorkspaceType?: "PERSONAL" | "TEAM";
}

export function LeftActivityBar({
  activeTab,
  onSelectTab,
  onOpenSettings,
  onOpenAbout,
  bugCount = 0,
  activeWorkspaceType = "PERSONAL",
}: LeftActivityBarProps) {
  const personalTabs: Array<{
    id: ActivityTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    { id: "assistant", label: "Personal AI Assistant", icon: Bot },
    { id: "platforms", label: "Connected Apps (Discord & Telegram)", icon: Share2 },
  ];

  const teamTabs: Array<{
    id: ActivityTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    { id: "assistant", label: "Team AI Assistant", icon: Bot },
    { id: "reviews", label: "Reviews & Approvals", icon: ShieldCheck, badge: bugCount },
    { id: "platforms", label: "Connected Apps (Slack & MS Teams)", icon: Share2 },
  ];

  const tabs = activeWorkspaceType === "PERSONAL" ? personalTabs : teamTabs;

  return (
    <aside
      role="navigation"
      aria-label="Activity Bar"
      className="w-12 border-r border-clay-hairline bg-clay-surface-soft flex flex-col items-center py-2.5 gap-2.5 shrink-0 select-none z-20"
    >
      {/* Primary Navigation Icons */}
      <div className="flex flex-col items-center gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              title={tab.label}
              aria-label={tab.label}
              aria-pressed={isActive}
              className={`relative h-9 w-9 flex items-center justify-center rounded-clay-md transition-colors cursor-pointer group ${
                isActive
                  ? "text-white bg-clay-primary shadow-clay-soft"
                  : "text-clay-muted hover:text-clay-ink hover:bg-clay-surface-card"
              }`}
            >
              <Icon className="w-4 h-4" />
              {Boolean(tab.badge && tab.badge > 0) && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-clay-pink ring-2 ring-clay-surface-soft" />
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom Preferences Icons */}
      <div className="mt-auto flex flex-col items-center gap-1.5">
        <button
          onClick={onOpenAbout}
          title="About ShipDev"
          aria-label="About ShipDev"
          className="h-8 w-8 flex items-center justify-center text-clay-muted hover:text-clay-ink hover:bg-clay-surface-card rounded-clay-md transition-colors cursor-pointer"
        >
          <Info className="w-4 h-4" />
        </button>

        <button
          onClick={onOpenSettings}
          title="Settings (⌘,)"
          aria-label="Settings (Command + comma)"
          className="h-8 w-8 flex items-center justify-center text-clay-muted hover:text-clay-ink hover:bg-clay-surface-card rounded-clay-md transition-colors cursor-pointer"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
}


"use client";

import React from "react";
import {
  Files,
  Bug,
  GitBranch,
  Bot,
  Search,
  Settings,
  Info,
} from "lucide-react";

export type ActivityTab = "explorer" | "bugtree" | "git" | "agents" | "search";

interface LeftActivityBarProps {
  activeTab: ActivityTab;
  onSelectTab: (tab: ActivityTab) => void;
  isSidebarOpen: boolean;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
  bugCount?: number;
}

export function LeftActivityBar({
  activeTab,
  onSelectTab,
  isSidebarOpen,
  onOpenSettings,
  onOpenAbout,
  bugCount = 0,
}: LeftActivityBarProps) {
  const tabs: Array<{
    id: ActivityTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    { id: "bugtree", label: "Live Bug Tree", icon: Bug, badge: bugCount },
    { id: "explorer", label: "File Explorer", icon: Files },
    { id: "search", label: "Search Codebase", icon: Search },
    { id: "git", label: "Source Control", icon: GitBranch },
    { id: "agents", label: "Switch Agents", icon: Bot },
  ];

  return (
    <aside className="w-11 border-r border-[#1e1e1e] bg-[#050505] flex flex-col items-center py-2.5 gap-2.5 shrink-0 select-none z-20">
      {/* Primary Navigation Icons */}
      <div className="flex flex-col items-center gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id && isSidebarOpen;

          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              title={tab.label}
              className={`relative p-2 rounded-lg transition-colors cursor-pointer group ${
                isActive
                  ? "text-[#f54e00] bg-[#1a1a1a]"
                  : "text-neutral-500 hover:text-neutral-200 hover:bg-[#121212]"
              }`}
            >
              <Icon className="w-4 h-4" />
              {Boolean(tab.badge && tab.badge > 0) && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500" />
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
          className="p-2 text-neutral-500 hover:text-[#f54e00] hover:bg-[#1a1a1a] rounded-lg transition-colors cursor-pointer"
        >
          <Info className="w-4 h-4" />
        </button>

        <button
          onClick={onOpenSettings}
          title="Settings (⌘,)"
          className="p-2 text-neutral-500 hover:text-[#f54e00] hover:bg-[#1a1a1a] rounded-lg transition-colors cursor-pointer"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
}


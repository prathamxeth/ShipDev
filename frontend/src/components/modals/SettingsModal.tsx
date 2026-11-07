"use client";

import React, { useState } from "react";
import { Check, Settings, X, ShieldAlert, Cpu } from "lucide-react";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsSaved?: () => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  onSettingsSaved,
}: SettingsModalProps) {
  const [controllerUrl, setControllerUrl] = useState("http://127.0.0.1:53640");
  const [roomId, setRoomId] = useState("dbde0dcf-8adf-48f9-9d16-de8eaff77d92");
  const [sandboxTimeout, setSandboxTimeout] = useState("30");
  const [autoOpenDiff, setAutoOpenDiff] = useState(true);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSettingsSaved) onSettingsSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs select-none animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-clay-xl bg-clay-canvas border border-clay-hairline shadow-clay-elevated flex flex-col overflow-hidden text-clay-ink">
        {/* Header */}
        <div className="h-11 px-4 border-b border-clay-hairline flex items-center justify-between bg-white">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-clay-primary" />
            <h2 className="text-xs font-semibold text-clay-ink uppercase tracking-wider font-mono">
              ShipDev Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-clay-muted hover:text-clay-ink p-1 rounded-clay-xs hover:bg-clay-surface-card transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSave} className="p-4 flex flex-col gap-4 text-xs font-mono">
          <div className="flex flex-col gap-1.5">
            <label className="text-clay-muted text-[11px]">
              Switch Agent Controller Endpoint
            </label>
            <input
              type="text"
              value={controllerUrl}
              onChange={(e) => setControllerUrl(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-clay-md bg-white border border-clay-hairline text-clay-ink focus:border-clay-primary outline-none text-xs shadow-clay-soft"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-clay-muted text-[11px]">
              Switch Incident Room UUID
            </label>
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-clay-md bg-white border border-clay-hairline text-clay-ink focus:border-clay-primary outline-none text-xs shadow-clay-soft"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-clay-muted text-[11px]">
              Sandbox Subprocess Timeout (seconds)
            </label>
            <input
              type="number"
              value={sandboxTimeout}
              onChange={(e) => setSandboxTimeout(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-clay-md bg-white border border-clay-hairline text-clay-ink focus:border-clay-primary outline-none text-xs shadow-clay-soft"
            />
          </div>

          <div className="p-3 rounded-clay-lg bg-clay-surface-card border border-clay-hairline flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-clay-ink font-semibold">Auto-open Diff Preview</span>
              <span className="text-[10px] text-clay-muted font-sans">
                Automatically opens split diff view when fix is proposed
              </span>
            </div>
            <input
              type="checkbox"
              checked={autoOpenDiff}
              onChange={(e) => setAutoOpenDiff(e.target.checked)}
              className="rounded accent-clay-primary cursor-pointer w-4 h-4"
            />
          </div>

          <div className="pt-2 border-t border-clay-hairline flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-clay-md border border-clay-hairline bg-white hover:bg-clay-surface-card text-clay-muted hover:text-clay-ink transition-colors cursor-pointer shadow-clay-soft"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-clay-md bg-clay-primary hover:bg-clay-primary-active text-white font-medium transition-colors cursor-pointer flex items-center gap-1.5 shadow-clay-soft"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Save Settings</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


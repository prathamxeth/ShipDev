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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-xl bg-[#0c0c0c] border border-[#262626] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="h-11 px-4 border-b border-[#1e1e1e] flex items-center justify-between bg-[#080808]">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-[#f54e00]" />
            <h2 className="text-xs font-semibold text-white uppercase tracking-wider font-mono">
              ShipDev Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-white p-1 rounded hover:bg-[#1a1a1a] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSave} className="p-4 flex flex-col gap-4 text-xs font-mono">
          <div className="flex flex-col gap-1.5">
            <label className="text-neutral-400 text-[11px]">
              Switch Agent Controller Endpoint
            </label>
            <input
              type="text"
              value={controllerUrl}
              onChange={(e) => setControllerUrl(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-[#141414] border border-[#262626] text-white focus:border-[#f54e00] outline-none text-xs"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-neutral-400 text-[11px]">
              Switch Incident Room UUID
            </label>
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-[#141414] border border-[#262626] text-white focus:border-[#f54e00] outline-none text-xs"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-neutral-400 text-[11px]">
              Sandbox Subprocess Timeout (seconds)
            </label>
            <input
              type="number"
              value={sandboxTimeout}
              onChange={(e) => setSandboxTimeout(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-[#141414] border border-[#262626] text-white focus:border-[#f54e00] outline-none text-xs"
            />
          </div>

          <div className="p-3 rounded-lg bg-[#121212] border border-[#202020] flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-white font-medium">Auto-open Diff Preview</span>
              <span className="text-[10px] text-neutral-500 font-sans">
                Automatically opens split diff view when fix is proposed
              </span>
            </div>
            <input
              type="checkbox"
              checked={autoOpenDiff}
              onChange={(e) => setAutoOpenDiff(e.target.checked)}
              className="rounded accent-[#f54e00] cursor-pointer"
            />
          </div>

          <div className="pt-2 border-t border-[#1e1e1e] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md border border-[#262626] text-neutral-400 hover:text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-md bg-[#f54e00] hover:bg-[#ff6a26] text-white font-medium transition-colors cursor-pointer flex items-center gap-1.5"
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


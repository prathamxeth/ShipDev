import React from "react";
import { TaskStatus } from "@/types";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Code2,
  FileSearch,
  Flame,
  HelpCircle,
  Play,
  RotateCcw,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

interface StatusPillProps {
  status: TaskStatus;
  size?: "sm" | "md";
}

interface StatusConfig {
  label: string;
  className: string;
  icon: React.ReactNode;
  pulse?: boolean;
}

export const STATUS_CONFIGS: Record<TaskStatus, StatusConfig> = {
  REPORTED: {
    label: "Reported",
    className: "bg-zinc-900 text-zinc-400 border-zinc-800",
    icon: <AlertCircle className="w-3 h-3" />,
  },
  TRIAGED: {
    label: "Triaged",
    className: "bg-indigo-950/60 text-indigo-300 border-indigo-800/60",
    icon: <FileSearch className="w-3 h-3" />,
  },
  REPRODUCING: {
    label: "Reproducing",
    className: "bg-sky-950/60 text-sky-300 border-sky-800/60",
    icon: <Play className="w-3 h-3" />,
    pulse: true,
  },
  REPRODUCED: {
    label: "Reproduced",
    className: "bg-amber-950/60 text-amber-300 border-amber-800/60",
    icon: <Flame className="w-3 h-3" />,
  },
  FIX_PROPOSED: {
    label: "Fix Proposed",
    className: "bg-violet-950/60 text-violet-300 border-violet-800/60",
    icon: <Code2 className="w-3 h-3" />,
  },
  VERIFYING: {
    label: "Verifying",
    className: "bg-cyan-950/60 text-cyan-300 border-cyan-800/60",
    icon: <Sparkles className="w-3 h-3" />,
    pulse: true,
  },
  AWAITING_HUMAN_APPROVAL: {
    label: "Awaiting Approval",
    className: "bg-amber-500/15 text-amber-400 border-amber-500/40 ring-1 ring-amber-500/20",
    icon: <Clock className="w-3 h-3 text-amber-400" />,
  },
  APPROVED: {
    label: "Approved",
    className: "bg-emerald-950/60 text-emerald-300 border-emerald-800/60",
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  COMPLETED: {
    label: "Completed",
    className: "bg-emerald-900/40 text-emerald-400 border-emerald-700/50",
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  TRIAGE_FAILED: {
    label: "Triage Failed",
    className: "bg-rose-950/60 text-rose-300 border-rose-800/60",
    icon: <ShieldAlert className="w-3 h-3" />,
  },
  REPRODUCTION_FAILED: {
    label: "Repro Failed",
    className: "bg-rose-950/60 text-rose-300 border-rose-800/60",
    icon: <ShieldAlert className="w-3 h-3" />,
  },
  VERIFICATION_FAILED: {
    label: "Verification Failed",
    className: "bg-rose-950/60 text-rose-300 border-rose-800/60",
    icon: <ShieldAlert className="w-3 h-3" />,
  },
  REJECTED: {
    label: "Rejected by Human",
    className: "bg-orange-950/60 text-orange-300 border-orange-800/60",
    icon: <RotateCcw className="w-3 h-3" />,
  },
  FAILED: {
    label: "Aborted / Failed",
    className: "bg-red-950/70 text-red-300 border-red-800/70",
    icon: <HelpCircle className="w-3 h-3" />,
  },
};

export function StatusPill({ status, size = "sm" }: StatusPillProps) {
  const config = STATUS_CONFIGS[status] || {
    label: status,
    className: "bg-zinc-900 text-zinc-400 border-zinc-800",
    icon: <AlertCircle className="w-3 h-3" />,
  };

  const isSmall = size === "sm";

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border transition-colors ${
        config.className
      } ${isSmall ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"}`}
    >
      {config.pulse && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-current" />
        </span>
      )}
      {!config.pulse && config.icon}
      <span className="tracking-tight">{config.label}</span>
    </span>
  );
}


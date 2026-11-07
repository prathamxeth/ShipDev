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
    className: "bg-clay-surface-card text-clay-muted border-clay-hairline",
    icon: <AlertCircle className="w-3 h-3" />,
  },
  TRIAGED: {
    label: "Triaged",
    className: "bg-clay-teal/15 text-clay-teal border-clay-teal/30",
    icon: <FileSearch className="w-3 h-3" />,
  },
  REPRODUCING: {
    label: "Reproducing",
    className: "bg-clay-lavender/30 text-[#5a38a8] border-clay-lavender/60",
    icon: <Play className="w-3 h-3" />,
    pulse: true,
  },
  REPRODUCED: {
    label: "Reproduced",
    className: "bg-clay-peach/25 text-[#9a4b18] border-clay-peach/50",
    icon: <Flame className="w-3 h-3" />,
  },
  FIX_PROPOSED: {
    label: "Fix Proposed",
    className: "bg-clay-teal/15 text-clay-teal border-clay-teal/30",
    icon: <Code2 className="w-3 h-3" />,
  },
  VERIFYING: {
    label: "Verifying",
    className: "bg-clay-peach/25 text-[#9a4b18] border-clay-peach/40",
    icon: <Sparkles className="w-3 h-3" />,
    pulse: true,
  },
  AWAITING_HUMAN_APPROVAL: {
    label: "Awaiting Approval",
    className: "bg-clay-peach/30 text-[#9a4b18] border-clay-peach/60 ring-1 ring-clay-peach/40 font-semibold",
    icon: <Clock className="w-3 h-3 text-[#9a4b18]" />,
  },
  APPROVED: {
    label: "Approved",
    className: "bg-clay-mint/25 text-[#136149] border-clay-mint/50 font-semibold",
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  COMPLETED: {
    label: "Completed",
    className: "bg-clay-mint/25 text-[#136149] border-clay-mint/50 font-semibold",
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  TRIAGE_FAILED: {
    label: "Triage Failed",
    className: "bg-clay-coral/20 text-clay-coral border-clay-coral/40 font-semibold",
    icon: <ShieldAlert className="w-3 h-3" />,
  },
  REPRODUCTION_FAILED: {
    label: "Repro Failed",
    className: "bg-clay-coral/20 text-clay-coral border-clay-coral/40 font-semibold",
    icon: <ShieldAlert className="w-3 h-3" />,
  },
  VERIFICATION_FAILED: {
    label: "Verification Failed",
    className: "bg-clay-coral/20 text-clay-coral border-clay-coral/40 font-semibold",
    icon: <ShieldAlert className="w-3 h-3" />,
  },
  REJECTED: {
    label: "Rejected by Human",
    className: "bg-clay-coral/20 text-clay-coral border-clay-coral/40 font-semibold",
    icon: <RotateCcw className="w-3 h-3" />,
  },
  FAILED: {
    label: "Aborted / Failed",
    className: "bg-clay-pink/20 text-clay-pink border-clay-pink/40 font-semibold",
    icon: <HelpCircle className="w-3 h-3" />,
  },
};

export function StatusPill({ status, size = "sm" }: StatusPillProps) {
  const config = STATUS_CONFIGS[status] || {
    label: status,
    className: "bg-clay-surface-card text-clay-muted border-clay-hairline",
    icon: <AlertCircle className="w-3 h-3" />,
  };

  const isSmall = size === "sm";

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-clay-pill border transition-colors ${
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


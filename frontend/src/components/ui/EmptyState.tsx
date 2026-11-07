import React from "react";
import { FileCode2 } from "lucide-react";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({
  icon = <FileCode2 className="w-8 h-8 text-zinc-600" />,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center p-8 border border-dashed border-zinc-800/80 rounded-lg bg-oled-panel/50 my-auto">
      <div className="p-3 bg-zinc-900/60 rounded-full border border-zinc-800 mb-3">
        {icon}
      </div>
      <h3 className="text-sm font-medium text-slate-200 mb-1">{title}</h3>
      <p className="text-xs text-zinc-400 max-w-sm mb-4 leading-relaxed">{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
}

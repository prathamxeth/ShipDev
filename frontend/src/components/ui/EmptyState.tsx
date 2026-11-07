import React from "react";
import { FileCode2 } from "lucide-react";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({
  icon = <FileCode2 className="w-8 h-8 text-clay-muted" />,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center p-8 border border-dashed border-clay-hairline rounded-clay-lg bg-clay-surface-soft my-auto">
      <div className="p-3 bg-white rounded-clay-pill border border-clay-hairline mb-3 shadow-clay-soft">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-clay-ink mb-1">{title}</h3>
      <p className="text-xs text-clay-muted max-w-sm mb-4 leading-relaxed">{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
}

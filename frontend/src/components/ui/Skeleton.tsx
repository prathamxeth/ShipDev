import React from "react";

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-clay-surface-card rounded-clay-md border border-clay-hairline ${className}`}
    />
  );
}


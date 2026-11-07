import React from "react";

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-zinc-900/80 rounded border border-zinc-800/40 ${className}`}
    />
  );
}


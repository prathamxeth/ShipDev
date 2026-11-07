import React from "react";
import { Loader2 } from "lucide-react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "success";
  size?: "xs" | "sm" | "md" | "icon";
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className = "",
      variant = "secondary",
      size = "sm",
      isLoading = false,
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-medium rounded-md transition-all duration-150 select-none focus:outline-none focus:ring-1 focus:ring-slate-400 disabled:opacity-40 disabled:cursor-not-allowed";

    const variantStyles = {
      primary:
        "bg-blue-600 text-white hover:bg-blue-500 active:bg-blue-700 border border-blue-500/40 shadow-sm",
      secondary:
        "bg-oled-elevated hover:bg-oled-hover text-slate-200 border border-oled-border active:bg-zinc-800",
      outline:
        "bg-transparent hover:bg-zinc-900/60 text-slate-300 border border-oled-border hover:border-zinc-700",
      ghost:
        "bg-transparent hover:bg-zinc-900/60 text-slate-400 hover:text-slate-200 border-transparent",
      danger:
        "bg-rose-950/60 text-rose-300 hover:bg-rose-900/80 active:bg-rose-900 border border-rose-800/80",
      success:
        "bg-emerald-950/60 text-emerald-300 hover:bg-emerald-900/80 active:bg-emerald-900 border border-emerald-800/80",
    }[variant];

    const sizeStyles = {
      xs: "text-[11px] px-2 py-1 gap-1",
      sm: "text-xs px-2.5 py-1.5 gap-1.5",
      md: "text-sm px-3.5 py-2 gap-2",
      icon: "p-1.5 h-7 w-7",
    }[size];

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`${baseStyles} ${variantStyles} ${sizeStyles} ${className}`}
        {...props}
      >
        {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";


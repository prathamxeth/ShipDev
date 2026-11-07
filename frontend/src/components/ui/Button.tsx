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
      "inline-flex items-center justify-center font-medium rounded-clay-md transition-all duration-150 select-none focus:outline-none focus:ring-2 focus:ring-clay-primary/20 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer";

    const variantStyles = {
      primary:
        "bg-clay-primary text-white hover:bg-clay-primary-active active:bg-clay-primary border border-transparent shadow-clay-soft",
      secondary:
        "bg-clay-surface-card hover:bg-clay-surface-strong text-clay-ink border border-clay-hairline shadow-clay-soft",
      outline:
        "bg-white hover:bg-clay-surface-card text-clay-body hover:text-clay-ink border border-clay-hairline shadow-clay-soft",
      ghost:
        "bg-transparent hover:bg-clay-surface-card text-clay-muted hover:text-clay-ink border-transparent",
      danger:
        "bg-clay-coral/15 text-clay-coral hover:bg-clay-coral/25 active:bg-clay-coral/30 border border-clay-coral/40 font-semibold",
      success:
        "bg-clay-mint/25 text-[#136149] hover:bg-clay-mint/40 active:bg-clay-mint/50 border border-clay-mint/60 font-semibold",
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


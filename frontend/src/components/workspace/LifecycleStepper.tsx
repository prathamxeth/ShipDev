import React from "react";
import { TaskStatus } from "@/types";
import { Check, Clock, AlertTriangle, ArrowRight } from "lucide-react";

interface LifecycleStepperProps {
  currentStatus: TaskStatus;
}

const PRIMARY_STEPS: { status: TaskStatus; label: string }[] = [
  { status: "REPORTED", label: "Reported" },
  { status: "TRIAGED", label: "Triaged" },
  { status: "REPRODUCING", label: "Repro" },
  { status: "REPRODUCED", label: "Reproduced" },
  { status: "FIX_PROPOSED", label: "Fix Proposed" },
  { status: "VERIFYING", label: "Verifying" },
  { status: "AWAITING_HUMAN_APPROVAL", label: "Human Gate" },
  { status: "APPROVED", label: "Approved" },
  { status: "COMPLETED", label: "Complete" },
];

export function LifecycleStepper({ currentStatus }: LifecycleStepperProps) {
  // Determine index in forward pipeline
  const currentStepIndex = PRIMARY_STEPS.findIndex((s) => s.status === currentStatus);
  const isFailureOrRejection = [
    "TRIAGE_FAILED",
    "REPRODUCTION_FAILED",
    "VERIFICATION_FAILED",
    "REJECTED",
    "FAILED",
  ].includes(currentStatus);

  return (
    <div className="w-full bg-oled-panel border-b border-oled-border px-4 py-2.5 overflow-x-auto select-none">
      <div className="flex items-center min-w-[700px] justify-between">
        {PRIMARY_STEPS.map((step, index) => {
          const isPassed = currentStepIndex > index;
          const isCurrent = currentStepIndex === index;
          const isPending = currentStepIndex < index && !isCurrent;

          return (
            <React.Fragment key={step.status}>
              <div className="flex items-center gap-1.5 shrink-0">
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center font-mono text-[10px] transition-colors border ${
                    isCurrent
                      ? "bg-blue-600 border-blue-400 text-white shadow-sm ring-2 ring-blue-500/30"
                      : isPassed
                      ? "bg-emerald-950/80 border-emerald-700/60 text-emerald-400"
                      : "bg-zinc-900 border-zinc-800 text-zinc-500"
                  }`}
                >
                  {isPassed ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : isCurrent ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>

                <span
                  className={`text-[11px] font-medium whitespace-nowrap ${
                    isCurrent
                      ? "text-blue-300 font-semibold"
                      : isPassed
                      ? "text-slate-300"
                      : "text-zinc-500"
                  }`}
                >
                  {step.label}
                </span>
              </div>

              {index < PRIMARY_STEPS.length - 1 && (
                <div
                  className={`flex-1 h-[1px] mx-2 transition-colors ${
                    isPassed ? "bg-emerald-800/60" : "bg-zinc-800"
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}

        {/* Failure Flag indicator if applicable */}
        {isFailureOrRejection && (
          <div className="flex items-center gap-1.5 pl-3 border-l border-zinc-800 text-[11px] text-rose-400 font-medium shrink-0">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>State: {currentStatus}</span>
          </div>
        )}
      </div>
    </div>
  );
}


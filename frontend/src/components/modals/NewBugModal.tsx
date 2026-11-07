"use client";

import React, { useState } from "react";
import { AlertCircle, Bug, Check, Mic, Plus, X } from "lucide-react";
import { createTask } from "@/lib/api";
import { Task } from "@/types";

interface NewBugModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTaskCreated: (task: Task) => void;
}

export function NewBugModal({ isOpen, onClose, onTaskCreated }: NewBugModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reportedBy, setReportedBy] = useState("local-operator");
  const [inputSource, setInputSource] = useState<"text" | "wispr_flow">("text");
  const [branchName, setBranchName] = useState("feature/ayush-backend");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError("Please provide both a title and description for the defect report.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const newTask = await createTask({
        title: title.trim(),
        description: description.trim(),
        reported_by: reportedBy.trim(),
        input_source: inputSource,
        branch_name: branchName.trim() || undefined,
      });

      onTaskCreated(newTask);
      onClose();
      setTitle("");
      setDescription("");
    } catch (err: any) {
      setError(err.message || "Failed to submit defect report to backend.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs select-none animate-in fade-in duration-100">
      <div className="w-full max-w-lg rounded-clay-xl bg-clay-canvas border border-clay-hairline shadow-clay-elevated flex flex-col overflow-hidden text-xs font-mono text-clay-ink">
        {/* Modal Header */}
        <div className="h-11 px-4 border-b border-clay-hairline flex items-center justify-between bg-white">
          <div className="flex items-center gap-2">
            <Bug className="w-4 h-4 text-clay-primary" />
            <h2 className="text-xs font-semibold text-clay-ink uppercase tracking-wider font-mono">
              Report Issue to AI Pipeline
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-clay-muted hover:text-clay-ink p-1 rounded-clay-xs hover:bg-clay-surface-card transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-3.5">
          {error && (
            <div className="p-2.5 rounded-clay-md bg-clay-coral/15 border border-clay-coral/40 flex items-start gap-2 text-xs text-clay-coral">
              <AlertCircle className="w-4 h-4 text-clay-coral shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Input Method Selector */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-clay-body font-medium">Input Method</span>
            <div className="flex items-center gap-1 p-0.5 bg-clay-surface-card border border-clay-hairline rounded-clay-pill">
              <button
                type="button"
                onClick={() => setInputSource("text")}
                className={`px-2.5 py-1 rounded-clay-pill text-[11px] font-medium transition-colors cursor-pointer ${
                  inputSource === "text"
                    ? "bg-clay-primary text-white shadow-clay-soft"
                    : "text-clay-muted hover:text-clay-ink"
                }`}
              >
                Standard Text
              </button>
              <button
                type="button"
                onClick={() => setInputSource("wispr_flow")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-clay-pill text-[11px] font-medium transition-colors cursor-pointer ${
                  inputSource === "wispr_flow"
                    ? "bg-clay-lavender text-clay-ink font-semibold shadow-clay-soft"
                    : "text-clay-muted hover:text-clay-ink"
                }`}
              >
                <Mic className="w-3 h-3 text-clay-ink" />
                <span>Wispr Flow Voice</span>
              </button>
            </div>
          </div>

          {/* Title input */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-clay-ink">
              Defect Title <span className="text-clay-coral">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Defect in calculate_discount adds markup instead of reduction"
              className="bg-white border border-clay-hairline text-xs text-clay-ink placeholder-clay-muted rounded-clay-md px-3 py-2 focus:outline-none focus:border-clay-primary shadow-clay-soft transition-colors"
            />
          </div>

          {/* Description input */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-clay-ink">
              {inputSource === "wispr_flow" ? "Voice Transcription" : "Defect Description"}{" "}
              <span className="text-clay-coral">*</span>
            </label>
            <textarea
              required
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                inputSource === "wispr_flow"
                  ? "Transcribed voice recording: 'calculate_discount(100, 20) returned 120.0 instead of 80.0...'"
                  : "Detail the observed bug behavior, failed assertions, or reproduction steps..."
              }
              className="bg-white border border-clay-hairline text-xs text-clay-ink placeholder-clay-muted rounded-clay-md p-3 focus:outline-none focus:border-clay-primary shadow-clay-soft transition-colors resize-none font-mono"
            />
          </div>

          {/* Reporter & Branch info */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="flex flex-col gap-1">
              <label className="text-clay-muted text-[11px]">Reporter</label>
              <input
                type="text"
                value={reportedBy}
                onChange={(e) => setReportedBy(e.target.value)}
                className="bg-white border border-clay-hairline text-xs text-clay-ink rounded-clay-md px-2.5 py-1.5 focus:outline-none focus:border-clay-primary shadow-clay-soft"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-clay-muted text-[11px]">Target Branch</label>
              <input
                type="text"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                className="bg-white border border-clay-hairline text-xs text-clay-primary font-mono rounded-clay-md px-2.5 py-1.5 focus:outline-none focus:border-clay-primary shadow-clay-soft"
              />
            </div>
          </div>

          {/* Modal Actions */}
          <div className="pt-3 border-t border-clay-hairline flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 py-1.5 rounded-clay-md border border-clay-hairline bg-white hover:bg-clay-surface-card text-clay-muted hover:text-clay-ink transition-colors cursor-pointer shadow-clay-soft"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 rounded-clay-md bg-clay-primary hover:bg-clay-primary-active text-white font-medium transition-colors cursor-pointer flex items-center gap-1.5 shadow-clay-soft"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isSubmitting ? "Submitting..." : "Submit to Pipeline"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

"use client";

import React, { useState } from "react";
import { AlertCircle, FileText, Mic, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
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
  const [reportedBy, setReportedBy] = useState("pratham");
  const [inputSource, setInputSource] = useState<"text" | "wispr_flow">("text");
  const [branchName, setBranchName] = useState("feature/pratham-frontend");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError("Please provide both a title and description for the bug report.");
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
      // Reset form
      setTitle("");
      setDescription("");
    } catch (err: any) {
      setError(
        err.message ||
          "Failed to submit bug report. Ensure backend is running at http://localhost:8000."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none">
      <div className="w-full max-w-lg rounded-lg bg-oled-panel border border-oled-border shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="p-4 border-b border-oled-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <FileText className="w-3.5 h-3.5" />
            </div>
            <h2 className="text-sm font-semibold text-slate-100">
              Submit Bug Report to AI Pipeline
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 p-1 rounded hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-3.5">
          {error && (
            <div className="p-2.5 rounded bg-rose-950/40 border border-rose-900/60 flex items-start gap-2 text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Input Source Selector (Text vs Wispr Flow) */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-400 font-medium">Input Method</span>
            <div className="flex items-center gap-1 p-0.5 bg-oled-base border border-oled-border rounded">
              <button
                type="button"
                onClick={() => setInputSource("text")}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                  inputSource === "text"
                    ? "bg-zinc-800 text-slate-100"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Standard Text
              </button>
              <button
                type="button"
                onClick={() => setInputSource("wispr_flow")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                  inputSource === "wispr_flow"
                    ? "bg-purple-950/70 text-purple-200 border border-purple-800/60"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Mic className="w-3 h-3 text-purple-400" />
                <span>Wispr Flow Voice</span>
              </button>
            </div>
          </div>

          {/* Title input */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-zinc-300">
              Bug Title <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Authentication token expired on page refresh"
              className="bg-oled-base border border-oled-border text-xs text-slate-100 placeholder-zinc-500 rounded px-3 py-2 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Description input */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-zinc-300">
              {inputSource === "wispr_flow" ? "Voice Transcription" : "Bug Description"}{" "}
              <span className="text-rose-400">*</span>
            </label>
            <textarea
              required
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                inputSource === "wispr_flow"
                  ? "Transcribed voice recording: 'When the user navigates after 15 minutes, the JWT payload returns 401 instead of triggering a refresh cycle...'"
                  : "Describe observed behavior, reproduction steps, or paste error stack traces..."
              }
              className="bg-oled-base border border-oled-border text-xs text-slate-100 placeholder-zinc-500 rounded p-3 focus:outline-none focus:border-blue-500 transition-colors resize-none font-mono"
            />
          </div>

          {/* Reporter & Branch info */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="flex flex-col gap-1">
              <label className="text-zinc-400">Reporter</label>
              <input
                type="text"
                value={reportedBy}
                onChange={(e) => setReportedBy(e.target.value)}
                className="bg-oled-base border border-oled-border text-xs text-zinc-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-zinc-700"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-zinc-400">Target Branch</label>
              <input
                type="text"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                className="bg-oled-base border border-oled-border text-xs text-blue-300 font-mono rounded px-2.5 py-1.5 focus:outline-none focus:border-zinc-700"
              />
            </div>
          </div>

          {/* Modal Actions */}
          <div className="pt-3 border-t border-oled-border flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isSubmitting}
            >
              Submit Task to Switch
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}


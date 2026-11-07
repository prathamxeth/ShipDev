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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none animate-in fade-in duration-100">
      <div className="w-full max-w-lg rounded-xl bg-[#0c0c0c] border border-[#262626] shadow-2xl flex flex-col overflow-hidden text-xs font-mono">
        {/* Modal Header */}
        <div className="h-11 px-4 border-b border-[#1e1e1e] flex items-center justify-between bg-[#080808]">
          <div className="flex items-center gap-2">
            <Bug className="w-4 h-4 text-[#f54e00]" />
            <h2 className="text-xs font-semibold text-white uppercase tracking-wider font-mono">
              Report Issue to AI Pipeline
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-white p-1 rounded hover:bg-[#1a1a1a] transition-colors cursor-pointer"
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

          {/* Input Method Selector */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-400 font-medium">Input Method</span>
            <div className="flex items-center gap-1 p-0.5 bg-[#141414] border border-[#222222] rounded-lg">
              <button
                type="button"
                onClick={() => setInputSource("text")}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                  inputSource === "text"
                    ? "bg-[#1f1f1f] text-white border border-[#333333]"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                Standard Text
              </button>
              <button
                type="button"
                onClick={() => setInputSource("wispr_flow")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                  inputSource === "wispr_flow"
                    ? "bg-purple-950/70 text-purple-200 border border-purple-800/60"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                <Mic className="w-3 h-3 text-purple-400" />
                <span>Wispr Flow Voice</span>
              </button>
            </div>
          </div>

          {/* Title input */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-neutral-300">
              Defect Title <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Defect in calculate_discount adds markup instead of reduction"
              className="bg-[#121212] border border-[#262626] text-xs text-white placeholder-neutral-500 rounded-lg px-3 py-2 focus:outline-none focus:border-[#f54e00] transition-colors"
            />
          </div>

          {/* Description input */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-neutral-300">
              {inputSource === "wispr_flow" ? "Voice Transcription" : "Defect Description"}{" "}
              <span className="text-rose-400">*</span>
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
              className="bg-[#121212] border border-[#262626] text-xs text-white placeholder-neutral-500 rounded-lg p-3 focus:outline-none focus:border-[#f54e00] transition-colors resize-none font-mono"
            />
          </div>

          {/* Reporter & Branch info */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="flex flex-col gap-1">
              <label className="text-neutral-400 text-[11px]">Reporter</label>
              <input
                type="text"
                value={reportedBy}
                onChange={(e) => setReportedBy(e.target.value)}
                className="bg-[#121212] border border-[#262626] text-xs text-neutral-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#f54e00]"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-neutral-400 text-[11px]">Target Branch</label>
              <input
                type="text"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                className="bg-[#121212] border border-[#262626] text-xs text-[#e5c07b] font-mono rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#f54e00]"
              />
            </div>
          </div>

          {/* Modal Actions */}
          <div className="pt-3 border-t border-[#1e1e1e] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 py-1.5 rounded-lg border border-[#262626] text-neutral-400 hover:text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 rounded-lg bg-[#f54e00] hover:bg-[#ff6a26] text-white font-medium transition-colors cursor-pointer flex items-center gap-1.5"
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

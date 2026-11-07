"use client";

import React, { useState } from "react";
import {
  Users,
  Shield,
  UserPlus,
  CheckCircle2,
  Lock,
  Crown,
  Key,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";

interface Member {
  id: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "lead" | "operator" | "member";
  avatar: string;
  joinedAt: string;
  isCurrentUser?: boolean;
}

export function MembersRolesView() {
  const [members, setMembers] = useState<Member[]>([
    {
      id: "mem-1",
      name: "Pratham",
      email: "pratham@shipdev.io",
      role: "owner",
      avatar: "P",
      joinedAt: "Founding Member",
      isCurrentUser: true,
    },
    {
      id: "mem-2",
      name: "Ayush",
      email: "ayush@shipdev.io",
      role: "admin",
      avatar: "A",
      joinedAt: "May 2026",
    },
    {
      id: "mem-3",
      name: "Sumit",
      email: "sumit@shipdev.io",
      role: "lead",
      avatar: "S",
      joinedAt: "May 2026",
    },
    {
      id: "mem-4",
      name: "Local Operator",
      email: "operator@internal",
      role: "operator",
      avatar: "O",
      joinedAt: "Automated Host",
    },
  ]);

  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Member["role"]>("member");
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  const roleDefinitions = [
    { role: "owner", title: "Owner", desc: "Full organization authority, workspace deletion, billing & audit oversight." },
    { role: "admin", title: "Admin", desc: "Member management, platform webhook configuration, repository connections." },
    { role: "lead", title: "Engineering Lead", desc: "Human gate review & approval, branch merge, and release sign-off." },
    { role: "operator", title: "Operator", desc: "Execution supervision, test evidence inspection, and sandbox execution." },
    { role: "member", title: "Member", desc: "Task creation, conversation participation, and code inspection." },
  ];

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    const newMember: Member = {
      id: `mem-${Date.now()}`,
      name: inviteEmail.split("@")[0],
      email: inviteEmail.trim(),
      role: inviteRole,
      avatar: inviteEmail.charAt(0).toUpperCase(),
      joinedAt: "Just now",
    };

    setMembers((prev) => [...prev, newMember]);
    setInviteSuccess(`Invitation sent to ${inviteEmail}`);
    setInviteEmail("");
    setTimeout(() => {
      setInviteSuccess(null);
      setIsInviteOpen(false);
    }, 1500);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-clay-canvas overflow-y-auto p-6 font-sans">
      <div className="max-w-4xl mx-auto w-full space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-clay-hairline pb-4">
          <div>
            <h1 className="text-xl font-bold text-clay-ink flex items-center gap-2">
              <Users className="w-5 h-5 text-clay-primary" />
              <span>Members &amp; Permissions</span>
            </h1>
            <p className="text-xs text-clay-body mt-1">
              Role-Based Access Control (RBAC) enforced on human approvals, workspace isolation, and platform commands.
            </p>
          </div>

          <button
            onClick={() => setIsInviteOpen(true)}
            className="px-3.5 py-1.5 rounded-clay-md bg-clay-primary hover:bg-clay-primary-active text-white text-xs font-semibold cursor-pointer transition-colors shadow-clay-soft flex items-center gap-1.5"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Invite Member</span>
          </button>
        </div>

        {/* Members List */}
        <div className="p-4 rounded-clay-lg bg-white border border-clay-hairline shadow-clay-soft flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-clay-ink uppercase tracking-wider">
              Active Organization Members ({members.length})
            </span>
          </div>

          <div className="divide-y divide-clay-hairline">
            {members.map((member) => (
              <div
                key={member.id}
                className="py-3 flex items-center justify-between text-xs hover:bg-clay-surface-soft px-2 rounded-clay-md transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-clay-md bg-clay-surface-card border border-clay-hairline flex items-center justify-center font-bold text-clay-ink text-xs shadow-xs">
                    {member.avatar}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-clay-ink">{member.name}</span>
                      {member.isCurrentUser && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded-clay-pill bg-clay-primary/10 text-clay-primary font-bold">
                          You
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-clay-muted">{member.email}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`px-2.5 py-0.5 rounded-clay-pill font-mono text-[10px] capitalize font-semibold border ${
                      member.role === "owner"
                        ? "bg-clay-peach/25 text-clay-peach-ink border-clay-peach/50"
                        : member.role === "admin"
                        ? "bg-clay-lavender/25 text-clay-lavender-ink border-clay-lavender/40"
                        : member.role === "lead"
                        ? "bg-clay-mint/25 text-[#136149] border-clay-mint/40"
                        : "bg-clay-surface-soft text-clay-body border-clay-hairline"
                    }`}
                  >
                    {member.role}
                  </span>
                  <span className="text-[10px] text-clay-muted">{member.joinedAt}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Roles & Permissions Reference */}
        <div className="p-4 rounded-clay-lg bg-white border border-clay-hairline shadow-clay-soft flex flex-col gap-3">
          <div className="flex items-center gap-2 px-1">
            <ShieldCheck className="w-4 h-4 text-clay-primary" />
            <h2 className="text-xs font-bold text-clay-ink uppercase tracking-wider">
              Role Authority Matrix
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {roleDefinitions.map((rd) => (
              <div
                key={rd.role}
                className="p-3 rounded-clay-md bg-clay-surface-soft border border-clay-hairline flex flex-col gap-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-clay-ink">{rd.title}</span>
                  <span className="text-[9px] font-mono uppercase text-clay-muted">{rd.role}</span>
                </div>
                <p className="text-[11px] text-clay-body leading-relaxed">{rd.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Invite Member Modal */}
        {isInviteOpen && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-clay-xl border border-clay-hairline shadow-2xl max-w-md w-full p-5 space-y-4 font-sans animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-clay-hairline pb-3">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-clay-primary" />
                  <h3 className="font-bold text-sm text-clay-ink">Invite Team Member</h3>
                </div>
                <button
                  onClick={() => setIsInviteOpen(false)}
                  className="text-clay-muted hover:text-clay-ink text-xs cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleInvite} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-clay-ink mb-1">
                    Work Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="teammate@company.com"
                    style={{ outline: "none", boxShadow: "none" }}
                    className="w-full h-8 px-2.5 rounded-clay-md bg-clay-surface-soft border border-clay-hairline text-xs text-clay-ink outline-none focus:outline-none focus:ring-0 shadow-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-clay-ink mb-1">
                    Assigned Workspace Role
                  </label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as any)}
                    className="w-full h-8 px-2.5 rounded-clay-md bg-clay-surface-soft border border-clay-hairline text-xs text-clay-ink outline-none"
                  >
                    <option value="member">Member (Create tasks &amp; view discussions)</option>
                    <option value="operator">Operator (Supervise sandbox test runs)</option>
                    <option value="lead">Engineering Lead (Approve &amp; merge PRs)</option>
                    <option value="admin">Admin (Manage settings &amp; webhooks)</option>
                  </select>
                </div>

                {inviteSuccess && (
                  <div className="p-2 rounded-clay-md bg-clay-mint/20 border border-clay-mint/40 text-[#136149] text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>{inviteSuccess}</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-clay-hairline">
                  <button
                    type="button"
                    onClick={() => setIsInviteOpen(false)}
                    className="px-3 py-1.5 rounded-clay-md border border-clay-hairline bg-white hover:bg-clay-surface-soft text-xs text-clay-ink cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 rounded-clay-md bg-clay-primary hover:bg-clay-primary-active text-white text-xs font-semibold cursor-pointer shadow-clay-soft"
                  >
                    Send Invitation
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


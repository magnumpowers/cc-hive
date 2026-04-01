"use client";

import type { Project } from "@/lib/claude";

function timeAgo(dateStr: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function activityLevel(dateStr: string): number {
  const hours =
    (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60);
  if (hours < 1) return 3;
  if (hours < 24) return 2;
  if (hours < 72) return 1;
  return 0;
}

function cellColor(project: Project): string {
  if (project.isActive) return "bg-green-500/20 border-green-500/40";
  const level = activityLevel(project.lastActivity);
  if (level === 3) return "bg-amber-500/15 border-amber-500/30";
  if (level === 2) return "bg-blue-500/10 border-blue-500/25";
  if (level === 1) return "bg-slate-500/8 border-slate-500/20";
  return "bg-[#12121a] border-[#2a2a3a]";
}

function formatSize(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

export default function HexCell({
  project,
  size,
  onClick,
}: {
  project: Project;
  size: number;
  onClick: () => void;
}) {
  const level = activityLevel(project.lastActivity);
  const isSmall = size < 140;
  const isTiny = size < 110;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={`${project.displayName} — ${formatSize(project.linesOfCode)} lines of code`}
      className={`hex-cell relative border-2 flex flex-col items-center justify-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:ring-offset-0 ${cellColor(project)} ${project.isActive ? "active" : ""} ${level >= 2 ? "breathing" : ""}`}
      style={{ width: size, height: size * 1.1 }}
    >
      {project.isActive && (
        <div className="absolute" style={{ top: size * 0.12, right: size * 0.18 }}>
          <div className="activity-dot" />
        </div>
      )}

      <span
        className="font-semibold text-center px-2 leading-tight"
        style={{
          fontSize: Math.max(10, Math.min(15, size * 0.1)),
          maxWidth: size * 0.75,
        }}
      >
        {project.displayName}
      </span>

      <span
        className="text-amber-400/70 font-mono mt-0.5"
        style={{ fontSize: Math.max(8, size * 0.07) }}
      >
        {formatSize(project.linesOfCode)} lines
      </span>

      {!isTiny && project.deliverable?.url && (
        <span
          className="text-green-400/70 mt-0.5 flex items-center gap-0.5"
          style={{ fontSize: Math.max(7, size * 0.05) }}
        >
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400/70" />
          live
        </span>
      )}

      {!isSmall && (
        <span className="text-[#6b6b80] mt-1" style={{ fontSize: Math.max(8, size * 0.055) }}>
          {timeAgo(project.lastActivity)}
        </span>
      )}
    </button>
  );
}

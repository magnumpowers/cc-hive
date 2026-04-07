"use client";

import type { Project } from "@/lib/claude";

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
  if (level === 2) return "bg-amber-500/8 border-amber-500/15";
  if (level === 1) return "bg-slate-500/5 border-slate-500/15";
  return "bg-[#12121a] border-[#1e1e2e]";
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
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={project.displayName}
      className={`hex-cell relative border flex flex-col items-center justify-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:ring-offset-0 ${cellColor(project)} ${project.isActive ? "active" : activityLevel(project.lastActivity) >= 2 ? "recent" : ""}`}
      style={{ width: size, height: size * 1.1 }}
    >
      <span
        className="font-semibold text-center px-3 leading-tight"
        style={{
          fontSize: Math.max(10, Math.min(15, size * 0.1)),
          maxWidth: size * 0.8,
        }}
      >
        {project.displayName}
      </span>

      {project.isActive && (
        <span
          className="text-green-400/80 uppercase tracking-wider mt-1"
          style={{ fontSize: Math.max(7, size * 0.055) }}
        >
          Active
        </span>
      )}
    </button>
  );
}

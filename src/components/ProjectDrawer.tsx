"use client";

import { useEffect, useState } from "react";
import type { Project } from "@/lib/claude";

function formatLoc(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

const EDITORS = [
  { key: "code", label: "VS Code" },
  { key: "cursor", label: "Cursor" },
];

export default function ProjectDrawer({
  project,
  onClose,
  onDeleted,
}: {
  project: Project;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const [deleteConfirm, setDeleteConfirm] = useState<null | "choosing" | "confirm-trash" | "confirm-delete">(null);
  const [deleting, setDeleting] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameTo, setRenameTo] = useState(project.displayName);
  const [serving, setServing] = useState(false);
  const [serveInfo, setServeInfo] = useState<{ running: boolean; port?: number; url?: string } | null>(null);

  // Check if local server is already running
  useEffect(() => {
    if (project.deliverable.devScript) {
      fetch(`/api/projects/serve?path=${encodeURIComponent(project.path)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.running) {
            setServeInfo({ running: true, port: data.port, url: `http://localhost:${data.port}` });
          }
        })
        .catch(() => {});
    }
  }, [project.path, project.deliverable.devScript]);

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (deleteConfirm) {
          setDeleteConfirm(null);
        } else if (renaming) {
          setRenaming(false);
          setRenameTo(project.displayName);
        } else {
          onClose();
        }
      }
    }
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose, deleteConfirm, renaming, project.displayName]);

  async function renameProject(displayName: string) {
    await fetch("/api/projects/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: project.path, displayName }),
    });
    setRenaming(false);
    onDeleted?.();
  }

  async function focusSession() {
    if (!project.activePid) return;
    setLaunching(true);
    try {
      const res = await fetch("/api/projects/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "focus", pid: project.activePid }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error("Focus failed:", data.error);
      }
    } finally {
      setLaunching(false);
    }
  }

  async function launchProject(commandKey: string) {
    setLaunching(true);
    try {
      const res = await fetch("/api/projects/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: project.path, command: commandKey }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error("Launch failed:", data.error);
      }
    } finally {
      setLaunching(false);
    }
  }

  async function deleteProject(mode: "trash" | "delete") {
    setDeleting(true);
    try {
      const res = await fetch("/api/projects/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: project.path, mode }),
      });
      if (res.ok) {
        onDeleted?.();
        onClose();
      }
    } finally {
      setDeleting(false);
      setDeleteConfirm(null);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />

      <div
        className="fixed right-0 top-0 h-full w-[480px] bg-[#0e0e16] border-l border-[#2a2a3a] z-50 overflow-y-auto"
        role="dialog"
        aria-label={`Project: ${project.displayName}`}
      >
        <div className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div className="flex-1 min-w-0">
              {renaming ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    type="text"
                    value={renameTo}
                    onChange={(e) => setRenameTo(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && renameTo.trim()) renameProject(renameTo.trim());
                      if (e.key === "Escape") { setRenaming(false); setRenameTo(project.displayName); }
                    }}
                    className="text-xl font-bold bg-[#12121a] border border-amber-500/40 rounded px-2 py-0.5 outline-none w-full"
                  />
                  <button
                    onClick={() => { if (renameTo.trim()) renameProject(renameTo.trim()); }}
                    className="text-amber-400 text-xs whitespace-nowrap hover:text-amber-300"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold truncate">{project.displayName}</h2>
                    <button
                      onClick={() => setRenaming(true)}
                      className="text-[#6b6b80] hover:text-amber-400 transition-colors text-[11px] flex-shrink-0 px-1.5 py-0.5 rounded border border-transparent hover:border-amber-500/30 hover:bg-amber-500/5"
                      aria-label="Rename project"
                    >
                      rename
                    </button>
                  </div>
                </div>
              )}
              {project.displayName !== project.name && (
                <p className="text-[#4a4a5a] text-[10px] mt-0.5">{project.name}</p>
              )}
              <p className="text-[#6b6b80] text-xs mt-1 font-mono truncate">
                {project.path}
              </p>
              {project.description && (
                <p className="text-[#9b9bab] text-sm mt-2 leading-snug">
                  {project.description}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-[#6b6b80] hover:text-white text-xl leading-none ml-3"
              aria-label="Close"
            >
              &times;
            </button>
          </div>

          {/* Status — single line */}
          <div className="flex flex-wrap items-center gap-2 mb-6 text-[11px] text-[#6b6b80]">
            {project.isActive && (
              <span className="text-green-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> Running
              </span>
            )}
            {project.deliverable?.framework && (
              <span>{project.deliverable.framework}</span>
            )}
            <span>{formatLoc(project.linesOfCode)} lines</span>
          </div>

          {/* Deliverable section */}
          {(project.deliverable.url || project.deliverable.devScript) && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-[#6b6b80] uppercase tracking-wider mb-3">
                Website
              </h3>
              <div className="space-y-2">
                {/* Production URL */}
                {project.deliverable.url && (
                  <a
                    href={project.deliverable.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm bg-green-500/10 rounded-lg border border-green-500/25 hover:border-green-500/50 hover:bg-green-500/15 transition-colors"
                  >
                    <span className="text-green-400 text-lg">&#x2197;</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-green-300 font-medium">Visit website</span>
                      <span className="block text-[11px] text-green-400/70 truncate">
                        {project.deliverable.url}
                      </span>
                    </div>
                  </a>
                )}

                {/* Local dev server */}
                {project.deliverable.devScript && (
                  serveInfo?.running ? (
                    <div className="w-full flex items-center gap-3 px-4 py-3 text-sm bg-cyan-500/10 rounded-lg border border-cyan-500/25">
                      <span className="text-cyan-400 text-lg">&#x25CF;</span>
                      <div className="flex-1 min-w-0">
                        <a
                          href={serveInfo.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-cyan-300 font-medium hover:text-cyan-200"
                        >
                          Running locally
                        </a>
                        <span className="block text-[11px] text-cyan-400/70">
                          {serveInfo.url}
                        </span>
                      </div>
                      <button
                        onClick={async () => {
                          await fetch("/api/projects/serve", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ path: project.path, action: "stop" }),
                          });
                          setServeInfo(null);
                        }}
                        className="text-[10px] text-red-400/60 hover:text-red-400 border border-red-500/20 px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
                      >
                        Stop
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={async () => {
                        setServing(true);
                        try {
                          const res = await fetch("/api/projects/serve", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ path: project.path }),
                          });
                          const data = await res.json();
                          if (data.ok) {
                            setServeInfo({ running: true, port: data.port, url: data.url });
                          }
                        } finally {
                          setServing(false);
                        }
                      }}
                      disabled={serving}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm bg-cyan-500/10 rounded-lg border border-cyan-500/25 hover:border-cyan-500/50 hover:bg-cyan-500/15 transition-colors disabled:opacity-50"
                    >
                      <span className="text-cyan-400 text-lg">&#x25B6;</span>
                      <div className="flex-1 text-left min-w-0">
                        <span className="text-cyan-300 font-medium">
                          {serving ? "Starting..." : "Show locally"}
                        </span>
                        <span className="block text-[11px] text-cyan-400/60">
                          {project.deliverable.devScript}
                          {project.deliverable.framework && ` (${project.deliverable.framework})`}
                        </span>
                      </div>
                    </button>
                  )
                )}
              </div>
            </div>
          )}

          {/* Open */}
          <div className="mb-6 space-y-2">
            {/* Focus existing session */}
            {project.isActive && project.activePid && (
              <button
                onClick={focusSession}
                disabled={launching}
                className="w-full text-left px-4 py-3 text-sm bg-green-500/10 rounded-lg border border-green-500/25 hover:border-green-500/50 hover:bg-green-500/15 transition-colors disabled:opacity-50"
              >
                <span className="text-green-400 mr-2">&#x25B6;</span>
                {launching ? "Focusing..." : "Open in terminal"}
                <span className="block text-[11px] text-green-400/60 mt-0.5">
                  Jump to the running session
                </span>
              </button>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => launchProject("claude")}
                disabled={launching}
                className="flex-1 text-left px-4 py-3 text-sm bg-amber-500/10 rounded-lg border border-amber-500/25 hover:border-amber-500/50 hover:bg-amber-500/15 transition-colors disabled:opacity-50"
              >
                <span className="text-amber-400 mr-2">&#x2B21;</span>
                {launching ? "Opening..." : "Claude Code"}
              </button>
              <button
                onClick={() => launchProject("claude-accept-edits")}
                disabled={launching}
                className="px-3 py-3 text-[10px] text-amber-400/60 bg-amber-500/5 rounded-lg border border-amber-500/15 hover:border-amber-500/40 hover:text-amber-400 transition-colors disabled:opacity-50 leading-tight"
                title="claude --permission-mode acceptEdits"
              >
                Auto-<br />accept
              </button>
              <button
                onClick={() => launchProject("claude-hierarchical")}
                disabled={launching}
                className="px-3 py-3 text-[10px] text-amber-400/60 bg-amber-500/5 rounded-lg border border-amber-500/15 hover:border-amber-500/40 hover:text-amber-400 transition-colors disabled:opacity-50 leading-tight"
                title="claude --dangerously-skip-permissions"
              >
                Skip<br />perms
              </button>
            </div>

            <div className="flex gap-2">
              {EDITORS.map((ed) => (
                <button
                  key={ed.key}
                  onClick={() => launchProject(ed.key)}
                  disabled={launching}
                  className="flex-1 text-center px-3 py-2 text-xs text-[#6b6b80] bg-[#12121a] rounded-lg border border-[#1e1e2e] hover:border-[#3a3a4a] hover:text-[#9b9bab] transition-colors disabled:opacity-50"
                >
                  {ed.label}
                </button>
              ))}
              <button
                onClick={() => navigator.clipboard.writeText(project.path)}
                className="px-3 py-2 text-xs text-[#4a4a5a] bg-[#12121a] rounded-lg border border-[#1e1e2e] hover:border-[#3a3a4a] hover:text-[#6b6b80] transition-colors"
                title="Copy path"
              >
                Copy path
              </button>
            </div>
          </div>

          {/* Recent activity — collapsed */}
          {project.recentSessions.length > 0 && (
            <div className="mb-6">
              <p className="text-[11px] text-[#4a4a5a] mb-2">Recent activity</p>
              <div className="space-y-1.5">
                {project.recentSessions.slice(0, 2).map((session) => (
                  <div
                    key={session.sessionId}
                    className="text-xs text-[#6b6b80] bg-[#0e0e16] rounded px-3 py-2 border border-[#1a1a28]"
                  >
                    <span className="line-clamp-1">
                      {session.summary || session.firstPrompt || "No details"}
                    </span>
                    <span className="text-[10px] text-[#4a4a5a] mt-0.5 block">
                      {new Date(session.modified).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Danger zone */}
          <div className="border-t border-[#2a2a3a] pt-6">
            {!deleteConfirm && (
              <button
                onClick={() => setDeleteConfirm("choosing")}
                className="w-full text-left px-3 py-2 text-sm text-red-400/60 bg-[#12121a] rounded-lg border border-[#2a2a3a] hover:border-red-500/30 hover:bg-red-500/5 hover:text-red-400 transition-colors"
              >
                Delete project...
              </button>
            )}

            {deleteConfirm === "choosing" && (
              <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4">
                <p className="text-sm text-red-400 font-semibold mb-1">
                  Delete {project.displayName}?
                </p>
                <p className="text-xs text-[#6b6b80] mb-4">
                  What do you want to do with <span className="font-mono text-[#9b9bab]">{project.path}</span>?
                </p>
                <div className="space-y-2">
                  <button
                    onClick={() => setDeleteConfirm("confirm-trash")}
                    className="w-full text-left px-3 py-2 text-sm bg-amber-500/10 text-amber-300 rounded-lg border border-amber-500/25 hover:bg-amber-500/15 transition-colors"
                  >
                    Move to trash
                    <span className="block text-[10px] text-[#6b6b80] mt-0.5">
                      Can be restored from your system trash
                    </span>
                  </button>
                  <button
                    onClick={() => setDeleteConfirm("confirm-delete")}
                    className="w-full text-left px-3 py-2 text-sm bg-red-500/10 text-red-400 rounded-lg border border-red-500/25 hover:bg-red-500/15 transition-colors"
                  >
                    Delete permanently
                    <span className="block text-[10px] text-[#6b6b80] mt-0.5">
                      The folder and all code will be permanently removed
                    </span>
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="w-full text-center px-3 py-2 text-sm text-[#6b6b80] hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {deleteConfirm === "confirm-trash" && (
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4">
                <p className="text-sm text-amber-300 font-semibold mb-2">
                  Move to trash?
                </p>
                <p className="text-xs text-[#6b6b80] mb-4">
                  The entire folder <span className="font-mono text-[#9b9bab]">{project.name}</span> will
                  be moved to trash. You can restore it from there.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => deleteProject("trash")}
                    disabled={deleting}
                    className="flex-1 px-3 py-2 text-sm bg-amber-500/15 text-amber-300 rounded-lg border border-amber-500/30 hover:bg-amber-500/25 disabled:opacity-50"
                  >
                    {deleting ? "Moving..." : "Yes, move to trash"}
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="px-3 py-2 text-sm text-[#6b6b80] hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {deleteConfirm === "confirm-delete" && (
              <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4">
                <p className="text-sm text-red-400 font-semibold mb-2">
                  Delete permanently?
                </p>
                <p className="text-xs text-red-300/70 mb-4">
                  WARNING: The entire folder <span className="font-mono font-bold">{project.path}</span> and
                  all its contents will be permanently deleted. This cannot be undone!
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => deleteProject("delete")}
                    disabled={deleting}
                    className="flex-1 px-3 py-2 text-sm bg-red-500/15 text-red-400 rounded-lg border border-red-500/30 hover:bg-red-500/25 disabled:opacity-50"
                  >
                    {deleting ? "Deleting..." : "Yes, delete permanently"}
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="px-3 py-2 text-sm text-[#6b6b80] hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

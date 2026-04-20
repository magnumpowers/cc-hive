"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import type { Project } from "@/lib/claude";
import HexCell from "./HexCell";
import ProjectDrawer from "./ProjectDrawer";
import CronPanel from "./CronPanel";

function packCircles(
  items: { project: Project; radius: number }[]
): { project: Project; radius: number; x: number; y: number }[] {
  const sorted = [...items].sort((a, b) => b.radius - a.radius);
  const placed: { x: number; y: number; radius: number; project: Project }[] = [];

  for (const item of sorted) {
    if (placed.length === 0) {
      placed.push({ ...item, x: 0, y: 0 });
      continue;
    }

    let bestPos = { x: 0, y: 0 };
    let bestDist = Infinity;

    for (const existing of placed) {
      const angles = 36;
      for (let i = 0; i < angles; i++) {
        const angle = (i / angles) * Math.PI * 2;
        const dist = existing.radius + item.radius + 18;
        const x = existing.x + Math.cos(angle) * dist;
        const y = existing.y + Math.sin(angle) * dist;

        let valid = true;
        for (const other of placed) {
          const dx = x - other.x;
          const dy = y - other.y;
          const minDist = item.radius + other.radius + 16;
          if (dx * dx + dy * dy < minDist * minDist) {
            valid = false;
            break;
          }
        }

        if (valid) {
          const d = x * x + y * y;
          if (d < bestDist) {
            bestDist = d;
            bestPos = { x, y };
          }
        }
      }
    }

    placed.push({ ...item, ...bestPos });
  }

  return placed;
}

export default function Honeycomb() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const [showCron, setShowCron] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [launchingNew, setLaunchingNew] = useState(false);

  async function startNewSession(commandKey: "claude" | "claude-accept-edits" | "claude-hierarchical") {
    setLaunchingNew(true);
    try {
      const res = await fetch("/api/projects/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "~", command: commandKey }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to start session");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start session");
    } finally {
      setLaunchingNew(false);
    }
  }

  // Pan & zoom state
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const cameraStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const hasAutoFit = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setProjects(data);
      setError(null);
    } catch (err) {
      // Only show error if we have no data yet (initial load)
      if (projects.length === 0) {
        setError(err instanceof Error ? err.message : "Failed to load projects");
      }
    } finally {
      setLoading(false);
    }
  }, [projects.length]);

  useEffect(() => {
    fetchProjects();
    const interval = setInterval(fetchProjects, 10000);
    return () => clearInterval(interval);
  }, [fetchProjects]);

  // Global keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Cmd/Ctrl+K to toggle search
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowSearch((prev) => !prev);
        setTimeout(() => searchRef.current?.focus(), 50);
      }
      // Escape to close search
      if (e.key === "Escape" && showSearch) {
        setShowSearch(false);
        setSearch("");
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [showSearch]);

  // Mouse wheel zoom
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setCamera((prev) => {
      const newZoom = Math.min(3, Math.max(0.05, prev.zoom * delta));
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { ...prev, zoom: newZoom };
      const mx = e.clientX - rect.width / 2;
      const my = e.clientY - rect.height / 2;
      const scale = newZoom / prev.zoom;
      return {
        x: mx - scale * (mx - prev.x),
        y: my - scale * (my - prev.y),
        zoom: newZoom,
      };
    });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // Mouse pan
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest(".hex-cell")) return;
      if ((e.target as HTMLElement).closest("input")) return;
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY };
      cameraStart.current = { x: camera.x, y: camera.y };
    },
    [camera.x, camera.y]
  );

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning.current) return;
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;
    setCamera((prev) => ({
      ...prev,
      x: cameraStart.current.x + dx,
      y: cameraStart.current.y + dy,
    }));
  }, []);

  const handleMouseUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  // Touch support
  const lastTouches = useRef<{ x: number; y: number; dist?: number } | null>(null);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if ((e.target as HTMLElement).closest(".hex-cell")) return;
      if (e.touches.length === 1) {
        lastTouches.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        cameraStart.current = { x: camera.x, y: camera.y };
      } else if (e.touches.length === 2) {
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        lastTouches.current = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
          dist: Math.sqrt(dx * dx + dy * dy),
        };
      }
    },
    [camera.x, camera.y]
  );

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (!lastTouches.current) return;
    if (e.touches.length === 1) {
      const dx = e.touches[0].clientX - lastTouches.current.x;
      const dy = e.touches[0].clientY - lastTouches.current.y;
      setCamera((prev) => ({
        ...prev,
        x: cameraStart.current.x + dx,
        y: cameraStart.current.y + dy,
      }));
    } else if (e.touches.length === 2 && lastTouches.current.dist) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const scale = dist / lastTouches.current.dist;
      setCamera((prev) => ({
        ...prev,
        zoom: Math.min(3, Math.max(0.05, prev.zoom * scale)),
      }));
      lastTouches.current.dist = dist;
    }
  }, []);

  // Filter projects by search
  const filtered = search
    ? projects.filter(
        (p) =>
          p.displayName.toLowerCase().includes(search.toLowerCase()) ||
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.path.toLowerCase().includes(search.toLowerCase())
      )
    : projects;

  // Compute layout
  const maxLoc = Math.max(1, ...filtered.map((p) => p.linesOfCode));
  const MIN_R = 50;
  const MAX_R = 140;

  const items = filtered.map((p) => {
    const ratio = Math.sqrt(Math.max(p.linesOfCode, 50) / maxLoc);
    const radius = MIN_R + ratio * (MAX_R - MIN_R);
    return { project: p, radius };
  });

  const layout = packCircles(items);

  function computeFit() {
    if (!containerRef.current || layout.length === 0) return null;
    const rect = containerRef.current.getBoundingClientRect();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const { x, y, radius } of layout) {
      minX = Math.min(minX, x - radius);
      maxX = Math.max(maxX, x + radius);
      minY = Math.min(minY, y - radius * 1.1);
      maxY = Math.max(maxY, y + radius * 1.1);
    }
    const contentW = maxX - minX + 80;
    const contentH = maxY - minY + 80;
    const zoom = Math.min(1, rect.width / contentW, rect.height / contentH);
    // Cells are positioned relative to 50%/50% (viewport center),
    // so camera {0,0} = centered. Only need to compensate if layout
    // center drifts from (0,0).
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    return { x: -centerX * zoom, y: -centerY * zoom, zoom };
  }

  // Auto-fit on first load
  useEffect(() => {
    if (hasAutoFit.current || layout.length === 0 || !containerRef.current) return;
    hasAutoFit.current = true;
    const fit = computeFit();
    if (fit) setCamera(fit);
  }, [layout]);

  function fitToScreen() {
    const fit = computeFit();
    if (fit) setCamera(fit);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-[#6b6b80] text-sm animate-pulse">
          Scanning projects...
        </div>
      </div>
    );
  }

  // Empty state / onboarding
  if (projects.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center max-w-md px-6">
          <h1 className="text-3xl font-bold mb-2">
            <span className="text-amber-400">&#x2B21;</span> Hive
          </h1>
          <p className="text-[#6b6b80] text-sm mb-6">
            No Claude Code projects found.
          </p>
          <div className="bg-[#12121a] rounded-lg p-4 border border-[#2a2a3a] text-left">
            <p className="text-xs text-[#6b6b80] mb-2">Get started by running Claude Code in a project:</p>
            <code className="text-amber-400 text-sm">
              cd ~/my-project && claude
            </code>
            <p className="text-xs text-[#4a4a5a] mt-3">
              Hive reads session data from <code className="text-[#6b6b80]">~/.claude/projects/</code>
            </p>
          </div>
          {error && (
            <p className="text-red-400/80 text-xs mt-4">{error}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        className="fixed inset-0 overflow-hidden select-none"
        style={{ cursor: isPanning.current ? "grabbing" : "grab" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={() => (lastTouches.current = null)}
      >
        {/* HUD + Search — top left */}
        <div className="absolute top-5 left-6 z-30 flex items-center gap-4">
          <h1 className="text-lg font-bold tracking-tight text-[#4a4a5a] pointer-events-none">
            <span className="text-amber-400/60">&#x2B21;</span> Hive
          </h1>
          <div className="pointer-events-auto">
            {showSearch ? (
              <input
                ref={searchRef}
                autoFocus
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setShowSearch(false);
                    setSearch("");
                  }
                }}
                className="w-56 px-3 py-1.5 text-sm bg-[#12121a]/90 backdrop-blur border border-[#2a2a3a] rounded-lg focus:border-amber-500/30 outline-none"
              />
            ) : (
              <button
                onClick={() => {
                  setShowSearch(true);
                  setTimeout(() => searchRef.current?.focus(), 50);
                }}
                className="px-3 py-1.5 text-xs text-[#4a4a5a] bg-[#12121a]/60 border border-[#1e1e2e] rounded-lg hover:border-[#3a3a4a] hover:text-[#6b6b80] transition-colors"
              >
                Search <kbd className="ml-1 text-[10px] text-[#3a3a4a]">&#8984;K</kbd>
              </button>
            )}
          </div>
        </div>

        {/* New session + Cron — top right */}
        <div className="absolute top-5 right-6 z-30 flex items-center gap-2 pointer-events-auto">
          <div className="flex">
            <button
              onClick={() => startNewSession("claude")}
              disabled={launchingNew}
              className="px-3 py-1.5 text-xs font-medium text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-l-lg hover:bg-amber-500/15 hover:border-amber-500/50 transition-colors disabled:opacity-50"
              title="Start a new Claude Code session in your home directory"
            >
              <span className="mr-1">&#x2B21;</span>
              {launchingNew ? "Opening..." : "New session"}
            </button>
            <button
              onClick={() => startNewSession("claude-accept-edits")}
              disabled={launchingNew}
              className="px-2 py-1.5 text-[10px] text-amber-400/70 bg-amber-500/5 border border-l-0 border-amber-500/30 hover:bg-amber-500/15 hover:text-amber-400 hover:border-amber-500/50 transition-colors disabled:opacity-50"
              title="claude --permission-mode acceptEdits"
            >
              Auto-accept
            </button>
            <button
              onClick={() => startNewSession("claude-hierarchical")}
              disabled={launchingNew}
              className="px-2 py-1.5 text-[10px] text-amber-400/70 bg-amber-500/5 border border-l-0 border-amber-500/30 rounded-r-lg hover:bg-amber-500/15 hover:text-amber-400 hover:border-amber-500/50 transition-colors disabled:opacity-50"
              title="claude --dangerously-skip-permissions"
            >
              Skip perms
            </button>
          </div>
          <button
            onClick={() => setShowCron(true)}
            className="px-3 py-1.5 text-xs text-[#6b6b80] bg-[#12121a] border border-[#2a2a3a] rounded-lg hover:border-amber-500/30 hover:text-amber-400 transition-colors"
            title="Scheduled jobs"
          >
            &#x21BB; Cron
          </button>
        </div>

        {/* Zoom — bottom right, minimal */}
        <div className="absolute bottom-5 right-6 z-30 flex items-center gap-1 pointer-events-auto">
          <button
            aria-label="Zoom in"
            className="w-7 h-7 bg-[#12121a]/60 border border-[#1e1e2e] rounded text-[#4a4a5a] hover:text-[#8b8ba0] text-sm leading-none"
            onClick={() => setCamera((prev) => ({ ...prev, zoom: Math.min(3, prev.zoom * 1.3) }))}
          >
            +
          </button>
          <button
            aria-label="Zoom out"
            className="w-7 h-7 bg-[#12121a]/60 border border-[#1e1e2e] rounded text-[#4a4a5a] hover:text-[#8b8ba0] text-sm leading-none"
            onClick={() => setCamera((prev) => ({ ...prev, zoom: Math.max(0.05, prev.zoom / 1.3) }))}
          >
            -
          </button>
          <button
            aria-label="Fit all"
            className="w-7 h-7 bg-[#12121a]/60 border border-[#1e1e2e] rounded text-[#4a4a5a] hover:text-[#8b8ba0] text-[9px] leading-none ml-0.5"
            onClick={fitToScreen}
          >
            fit
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 px-4 py-2 bg-red-500/10 border border-red-500/25 rounded-lg text-red-400 text-xs pointer-events-none">
            {error}
          </div>
        )}

        {/* Canvas */}
        <div
          className="absolute inset-0"
          style={{
            transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
            transformOrigin: "center center",
            transition: isPanning.current ? "none" : "transform 0.1s ease-out",
          }}
        >
          {/* Center anchor — all cells positioned relative to viewport center */}
          <div className="absolute" style={{ left: "50%", top: "50%" }}>

            {layout.map(({ project, radius, x, y }) => (
              <div
                key={project.path}
                className="absolute"
                style={{
                  left: x - radius,
                  top: y - radius,
                  width: radius * 2,
                  height: radius * 2,
                }}
              >
              <HexCell
                project={project}
                size={radius * 2}
                onClick={() => setSelected(project)}
              />
            </div>
          ))}
          </div>{/* close center anchor */}
        </div>
      </div>

      {selected && (
        <ProjectDrawer
          project={selected}
          onClose={() => setSelected(null)}
          onDeleted={() => {
            setSelected(null);
            fetchProjects();
          }}
        />
      )}

      {showCron && <CronPanel onClose={() => setShowCron(false)} />}
    </>
  );
}

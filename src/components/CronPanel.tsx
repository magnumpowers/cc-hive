"use client";

import { useEffect, useState } from "react";

interface CronJob {
  label: string;
  description: string | null;
  script: string;
  workingDirectory: string | null;
  schedule: string;
  interval: number | null;
  calendarIntervals: { hour: number; minute: number }[];
  logPath: string | null;
  isLoaded: boolean;
  lastLogLines: string[];
  plistPath: string;
  projectName: string | null;
}

export default function CronPanel({ onClose }: { onClose: () => void }) {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/cron")
      .then((r) => r.json())
      .then((data) => {
        setJobs(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />

      <div className="fixed right-0 top-0 h-full w-[560px] bg-[#0e0e16] border-l border-[#2a2a3a] z-50 overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <span className="text-cyan-400">&#x21BB;</span> Scheduled jobs
              </h2>
              <p className="text-[#6b6b80] text-xs mt-1">
                Automated tasks running on your machine
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-[#6b6b80] hover:text-white text-xl leading-none"
            >
              &times;
            </button>
          </div>

          {loading ? (
            <div className="text-[#6b6b80] text-sm animate-pulse">
              Scanning jobs...
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-[#4a4a5a] text-sm">
              No scheduled jobs found
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <div
                  key={job.label}
                  className="bg-[#12121a] rounded-lg border border-[#2a2a3a] overflow-hidden"
                >
                  <div className="p-4">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              job.isLoaded
                                ? "bg-green-400 shadow-[0_0_6px_rgba(34,197,94,0.4)]"
                                : "bg-red-400/60"
                            }`}
                          />
                          <span className="text-sm font-semibold truncate">
                            {job.label}
                          </span>
                        </div>
                        {job.projectName && (
                          <span className="text-[10px] text-amber-400/70 ml-4">
                            {job.projectName}
                          </span>
                        )}
                        {job.description && (
                          <p className="text-xs text-[#9b9bab] mt-1 ml-4 leading-snug">
                            {job.description}
                          </p>
                        )}
                      </div>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                          job.isLoaded
                            ? "bg-green-500/15 text-green-400 border border-green-500/30"
                            : "bg-red-500/10 text-red-400/60 border border-red-500/20"
                        }`}
                      >
                        {job.isLoaded ? "ON" : "OFF"}
                      </span>
                    </div>

                    {/* Schedule */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1 text-[11px] text-cyan-400/80 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                        <span>&#x23F0;</span>
                        {job.schedule}
                      </span>
                    </div>

                    {/* Script */}
                    <div className="mt-3">
                      <p className="text-[11px] text-[#6b6b80] font-mono truncate" title={job.script}>
                        $ {job.script}
                      </p>
                      {job.workingDirectory && (
                        <p className="text-[10px] text-[#4a4a5a] font-mono mt-0.5 truncate">
                          cwd: {job.workingDirectory}
                        </p>
                      )}
                    </div>

                    {/* Log toggle */}
                    {job.lastLogLines.length > 0 && (
                      <button
                        onClick={() =>
                          setExpandedLog(
                            expandedLog === job.label ? null : job.label
                          )
                        }
                        className="mt-2 text-[10px] text-[#6b6b80] hover:text-cyan-400 transition-colors"
                      >
                        {expandedLog === job.label
                          ? "Hide log"
                          : `Show last ${job.lastLogLines.length} log lines`}
                      </button>
                    )}
                  </div>

                  {/* Expanded log */}
                  {expandedLog === job.label && job.lastLogLines.length > 0 && (
                    <div className="border-t border-[#2a2a3a] bg-[#0a0a12] p-3">
                      <pre className="text-[10px] text-[#6b6b80] font-mono whitespace-pre-wrap break-all leading-relaxed">
                        {job.lastLogLines.join("\n")}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

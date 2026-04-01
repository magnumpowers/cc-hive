"use client";

// Approximate Claude Code limits (configurable)
// These are rough estimates — actual limits depend on plan and may change
const DAILY_TOKEN_LIMIT = 15_000_000; // ~15M tokens/day for Max plan
const MONTHLY_TOKEN_LIMIT = 300_000_000; // ~300M tokens/month estimate

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return `${n}`;
}

function barColor(pct: number): string {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 70) return "bg-amber-500";
  return "bg-emerald-500";
}

function barGlow(pct: number): string {
  if (pct >= 90) return "shadow-[0_0_8px_rgba(239,68,68,0.4)]";
  if (pct >= 70) return "shadow-[0_0_6px_rgba(245,158,11,0.3)]";
  return "";
}

export default function UsageBars({
  usage,
}: {
  usage: {
    today: { input: number; output: number; cacheRead: number; cacheWrite: number };
    month: { input: number; output: number; cacheRead: number; cacheWrite: number };
  };
}) {
  const dailyUsed = usage.today.input + usage.today.output;
  const monthlyUsed = usage.month.input + usage.month.output;

  const dailyPct = Math.min(100, (dailyUsed / DAILY_TOKEN_LIMIT) * 100);
  const monthlyPct = Math.min(100, (monthlyUsed / MONTHLY_TOKEN_LIMIT) * 100);

  return (
    <div className="mt-3 w-44 space-y-2">
      {/* Daily usage */}
      <div>
        <div className="flex justify-between text-[10px] mb-0.5">
          <span className="text-[#6b6b80]">Today</span>
          <span className="text-[#6b6b80]">
            {formatTokens(dailyUsed)} / {formatTokens(DAILY_TOKEN_LIMIT)}
          </span>
        </div>
        <div className="h-1.5 bg-[#1a1a28] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor(dailyPct)} ${barGlow(dailyPct)}`}
            style={{ width: `${Math.max(1, dailyPct)}%` }}
          />
        </div>
      </div>

      {/* Monthly usage */}
      <div>
        <div className="flex justify-between text-[10px] mb-0.5">
          <span className="text-[#6b6b80]">This month</span>
          <span className="text-[#6b6b80]">
            {formatTokens(monthlyUsed)} / {formatTokens(MONTHLY_TOKEN_LIMIT)}
          </span>
        </div>
        <div className="h-1.5 bg-[#1a1a28] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor(monthlyPct)} ${barGlow(monthlyPct)}`}
            style={{ width: `${Math.max(1, monthlyPct)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

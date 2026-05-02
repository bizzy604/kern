import { useGetDashboardSummary, useGetActivityBreakdown, getGetDashboardSummaryQueryKey, getGetActivityBreakdownQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Clock, Terminal, Flame, TrendingUp, CheckCircle, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from "recharts";

const ACTIVITY_COLORS: Record<string, string> = {
  CODING: "#3b82f6",
  DEBUGGING: "#ef4444",
  TESTING: "#22c55e",
  DEVOPS: "#f97316",
  RESEARCHING: "#a855f7",
  IDLE: "#6b7280",
};

const ACTIVITY_LABELS: Record<string, string> = {
  CODING: "Coding",
  DEBUGGING: "Debugging",
  TESTING: "Testing",
  DEVOPS: "DevOps",
  RESEARCHING: "Research",
  IDLE: "Idle",
};

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function timeAgo(isoStr: string) {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function StatCard({ label, value, sub, icon: Icon, color }: { label: string; value: string; sub?: string; icon: React.ElementType; color: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 flex flex-col gap-3 hover:border-accent/30 transition-colors" data-testid={`stat-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">{label}</span>
        <Icon className={`h-4 w-4`} style={{ color }} />
      </div>
      <div>
        <div className="text-3xl font-bold font-mono text-foreground">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() },
  });
  const { data: breakdown, isLoading: breakdownLoading } = useGetActivityBreakdown(
    { days: 7 },
    { query: { queryKey: getGetActivityBreakdownQueryKey({ days: 7 }) } },
  );

  const chartData = breakdown?.breakdown
    .filter(b => b.totalMinutes > 0)
    .map(b => ({
      name: ACTIVITY_LABELS[b.activityType] || b.activityType,
      minutes: b.totalMinutes,
      color: ACTIVITY_COLORS[b.activityType] || "#6b7280",
    })) ?? [];

  return (
    <div className="space-y-8" data-testid="page-dashboard">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        {summaryLoading ? (
          <Skeleton className="h-8 w-36" />
        ) : summary?.standupReady ? (
          <Link href="/standups">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-accent/10 border border-accent/30 text-accent text-sm font-medium cursor-pointer hover:bg-accent/20 transition-colors" data-testid="standup-ready-badge">
              <CheckCircle className="h-4 w-4" />
              Standup ready
            </div>
          </Link>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted border border-border text-muted-foreground text-sm" data-testid="standup-pending-badge">
            <AlertCircle className="h-4 w-4" />
            Standup pending
          </div>
        )}
      </div>

      {/* Stats grid */}
      {summaryLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Active Today" value={formatDuration(summary?.todayActiveMinutes ?? 0)} sub={`${summary?.todaySessionCount} sessions`} icon={Clock} color="#007B72" />
          <StatCard label="Commands Today" value={(summary?.todayCommandCount ?? 0).toLocaleString()} sub="terminal events captured" icon={Terminal} color="#3b82f6" />
          <StatCard label="Day Streak" value={`${summary?.currentStreak ?? 0}`} sub="consecutive days active" icon={Flame} color="#f97316" />
          <StatCard label="This Week" value={formatDuration(summary?.weeklyActiveMinutes ?? 0)} sub="total active time" icon={TrendingUp} color="#a855f7" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Activity breakdown chart */}
        <div className="lg:col-span-3 rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Activity Breakdown</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Last 7 days by type</p>
            </div>
          </div>
          {breakdownLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : chartData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No activity data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
                <XAxis dataKey="name" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${Math.floor(v / 60)}h`} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, color: "hsl(var(--foreground))" }}
                  formatter={(v: number) => [formatDuration(v), "Time"]}
                  cursor={{ fill: "rgba(255,255,255,0.03)" }}
                />
                <Bar dataKey="minutes" radius={[3, 3, 0, 0]}>
                  {chartData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Recent sessions */}
        <div className="lg:col-span-2 rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">Recent Sessions</h2>
            <Link href="/sessions">
              <span className="text-xs text-accent hover:underline cursor-pointer" data-testid="link-view-all-sessions">View all</span>
            </Link>
          </div>
          {summaryLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-md" />)}
            </div>
          ) : !summary?.recentSessions?.length ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">No sessions yet</div>
          ) : (
            <div className="space-y-2">
              {summary.recentSessions.map(s => (
                <Link key={s.id} href={`/sessions`}>
                  <div className="flex items-start gap-3 p-3 rounded-md hover:bg-muted/50 transition-colors cursor-pointer group" data-testid={`session-card-${s.id}`}>
                    <span
                      className="mt-1 h-2 w-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: ACTIVITY_COLORS[s.activityType] || "#6b7280" }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground truncate leading-snug">{s.inferredTask || s.activityType}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground font-mono">{formatDuration(s.durationMinutes)}</span>
                        {s.project && <span className="text-xs text-muted-foreground truncate">{s.project}</span>}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground flex-shrink-0">{timeAgo(s.endedAt)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

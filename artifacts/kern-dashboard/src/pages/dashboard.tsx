import { useGetDashboardSummary, useGetActivityBreakdown, useListGitCommits, getGetDashboardSummaryQueryKey, getGetActivityBreakdownQueryKey, getListGitCommitsQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Clock, Terminal, Flame, TrendingUp, CheckCircle, AlertCircle, GitCommit, GitBranch, Plus, Minus } from "lucide-react";
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
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
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

function CommitRow({ commit }: { commit: { shortHash: string; branch: string; message: string; filesChanged: number; insertions: number; deletions: number; committedAt: string; project: string } }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border/50 last:border-0 group" data-testid={`commit-row-${commit.shortHash}`}>
      <div className="mt-0.5 h-6 w-6 rounded bg-muted flex items-center justify-center flex-shrink-0">
        <GitCommit className="h-3 w-3 text-accent" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-foreground truncate leading-snug font-medium">{commit.message}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{commit.shortHash}</span>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <GitBranch className="h-2.5 w-2.5" />{commit.branch}
          </span>
          {commit.project && (
            <span className="text-[10px] text-muted-foreground">{commit.project}</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-[10px] text-green-500 flex items-center gap-0.5"><Plus className="h-2.5 w-2.5" />{commit.insertions}</span>
          <span className="text-[10px] text-red-500 flex items-center gap-0.5"><Minus className="h-2.5 w-2.5" />{commit.deletions}</span>
          <span className="text-[10px] text-muted-foreground">{commit.filesChanged} file{commit.filesChanged !== 1 ? "s" : ""}</span>
        </div>
      </div>
      <span className="text-[10px] text-muted-foreground flex-shrink-0 mt-0.5">{timeAgo(commit.committedAt)}</span>
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
  const { data: gitData, isLoading: gitLoading } = useListGitCommits(
    { limit: 6, days: 7 },
    { query: { queryKey: getListGitCommitsQueryKey({ limit: 6, days: 7 }) } },
  );

  const chartData = breakdown?.breakdown
    .filter(b => b.totalMinutes > 0)
    .map(b => ({
      name: ACTIVITY_LABELS[b.activityType] || b.activityType,
      minutes: b.totalMinutes,
      color: ACTIVITY_COLORS[b.activityType] || "#6b7280",
    })) ?? [];

  const commits = gitData?.commits ?? [];
  const gitStats = gitData?.stats;

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

      {/* Git commit stats bar */}
      {!gitLoading && gitStats && gitStats.totalCommits > 0 && (
        <div className="rounded-lg border border-border bg-card px-5 py-4 flex items-center gap-6 flex-wrap" data-testid="git-stats-bar">
          <div className="flex items-center gap-2 text-sm font-mono">
            <GitCommit className="h-4 w-4 text-accent" />
            <span className="text-foreground font-semibold">{gitStats.totalCommits}</span>
            <span className="text-muted-foreground">commits this week</span>
          </div>
          <div className="h-4 w-px bg-border hidden sm:block" />
          <div className="flex items-center gap-1.5 text-sm font-mono">
            <span className="text-green-500 font-medium">+{gitStats.totalInsertions.toLocaleString()}</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-red-500 font-medium">-{gitStats.totalDeletions.toLocaleString()}</span>
            <span className="text-muted-foreground ml-1">lines changed</span>
          </div>
          <div className="h-4 w-px bg-border hidden sm:block" />
          <div className="text-sm font-mono text-muted-foreground">
            <span className="text-foreground">{gitStats.totalFilesChanged}</span> files touched
          </div>
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

      {/* Recent git commits */}
      <div className="rounded-lg border border-border bg-card p-5" data-testid="section-recent-commits">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Recent Commits</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Captured via git integration</p>
          </div>
          <Link href="/sessions">
            <span className="text-xs text-accent hover:underline cursor-pointer">View sessions</span>
          </Link>
        </div>
        {gitLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-md" />)}
          </div>
        ) : commits.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
            <GitCommit className="h-6 w-6 opacity-30" />
            <p className="text-sm">No commits captured yet — run a <code className="font-mono text-xs bg-muted px-1 rounded">git commit</code> to start tracking</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {commits.map(c => <CommitRow key={c.id} commit={c} />)}
          </div>
        )}
      </div>
    </div>
  );
}

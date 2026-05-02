import { useState } from "react";
import { useListSessions, useGetSession, useListGitCommits, getListSessionsQueryKey, getGetSessionQueryKey, getListGitCommitsQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, X, Terminal, Clock, Zap, GitCommit, GitBranch, Plus, Minus } from "lucide-react";

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

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
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

function ActivityBadge({ type }: { type: string }) {
  const color = ACTIVITY_COLORS[type] || "#6b7280";
  const label = ACTIVITY_LABELS[type] || type;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium border"
      style={{ color, borderColor: `${color}40`, background: `${color}15` }}
      data-testid={`badge-activity-${type.toLowerCase()}`}
    >
      {label}
    </span>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-muted-foreground">{pct}%</span>
    </div>
  );
}

function SessionDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: session, isLoading } = useGetSession(id, {
    query: { enabled: !!id, queryKey: getGetSessionQueryKey(id) },
  });

  return (
    <div className="rounded-lg border border-accent/30 bg-card p-6 space-y-5" data-testid="session-detail-panel">
      <div className="flex items-start justify-between">
        <h3 className="text-sm font-semibold text-foreground">Session Detail</h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors" data-testid="button-close-session-detail">
          <X className="h-4 w-4" />
        </button>
      </div>
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
        </div>
      ) : session ? (
        <div className="space-y-4">
          <ActivityBadge type={session.activityType} />
          {session.inferredTask && (
            <p className="text-sm text-foreground leading-relaxed">{session.inferredTask}</p>
          )}
          <div className="grid grid-cols-2 gap-3 text-xs">
            {[
              ["Project", session.project || "—"],
              ["Language", session.language || "—"],
              ["Duration", formatDuration(session.durationMinutes)],
              ["Commands", session.commandCount.toLocaleString()],
              ["Started", `${formatDate(session.startedAt)} ${formatTime(session.startedAt)}`],
              ["Ended", formatTime(session.endedAt)],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="text-muted-foreground font-mono uppercase tracking-widest text-[10px] mb-1">{k}</div>
                <div className="text-foreground font-mono">{v}</div>
              </div>
            ))}
          </div>
          <div>
            <div className="text-muted-foreground font-mono uppercase tracking-widest text-[10px] mb-1.5">AI Confidence</div>
            <ConfidenceBar value={session.confidence} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

const PAGE_SIZE = 15;

export default function Sessions() {
  const [page, setPage] = useState(0);
  const [dateFilter, setDateFilter] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"sessions" | "commits">("sessions");

  const params = {
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    ...(dateFilter ? { date: dateFilter } : {}),
  };

  const { data, isLoading } = useListSessions(params, {
    query: { queryKey: getListSessionsQueryKey(params) },
  });

  const { data: gitData, isLoading: gitLoading } = useListGitCommits(
    { limit: 50, days: 30 },
    { query: { queryKey: getListGitCommitsQueryKey({ limit: 50, days: 30 }) } },
  );

  const sessions = data?.sessions ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const commits = gitData?.commits ?? [];
  const gitStats = gitData?.stats;

  return (
    <div className="space-y-6" data-testid="page-sessions">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono text-foreground">Sessions</h1>
          <p className="text-sm text-muted-foreground mt-1">Your classified work sessions &amp; git commits</p>
        </div>
        {activeTab === "sessions" && (
          <div className="flex items-center gap-3">
            <Input
              type="date"
              value={dateFilter}
              onChange={e => { setDateFilter(e.target.value); setPage(0); }}
              className="h-9 text-sm font-mono w-40 bg-card border-border text-foreground"
              data-testid="input-date-filter"
            />
            {dateFilter && (
              <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => { setDateFilter(""); setPage(0); }} data-testid="button-clear-date-filter">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        <button
          onClick={() => setActiveTab("sessions")}
          className={`px-4 py-2 text-sm font-mono border-b-2 -mb-px transition-colors ${activeTab === "sessions" ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          data-testid="tab-sessions"
        >
          Sessions
          {total > 0 && <span className="ml-2 text-xs bg-muted rounded px-1">{total}</span>}
        </button>
        <button
          onClick={() => setActiveTab("commits")}
          className={`px-4 py-2 text-sm font-mono border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${activeTab === "commits" ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          data-testid="tab-commits"
        >
          <GitCommit className="h-3.5 w-3.5" />
          Git Commits
          {commits.length > 0 && <span className="text-xs bg-muted rounded px-1">{commits.length}</span>}
        </button>
      </div>

      {activeTab === "sessions" ? (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Sessions list */}
          <div className="lg:col-span-3 space-y-2">
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)
            ) : sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 rounded-lg border border-border bg-card text-muted-foreground gap-3">
                <Terminal className="h-8 w-8 opacity-40" />
                <p className="text-sm">No sessions found</p>
              </div>
            ) : (
              sessions.map(s => (
                <div
                  key={s.id}
                  onClick={() => setSelectedId(selectedId === s.id ? null : s.id)}
                  className={`rounded-lg border p-4 cursor-pointer transition-all hover:border-accent/40 ${selectedId === s.id ? "border-accent/50 bg-accent/5" : "border-border bg-card"}`}
                  data-testid={`session-row-${s.id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="h-2 w-2 rounded-full flex-shrink-0 mt-1.5" style={{ backgroundColor: ACTIVITY_COLORS[s.activityType] || "#6b7280" }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground truncate">{s.inferredTask || `${ACTIVITY_LABELS[s.activityType]} session`}</p>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <ActivityBadge type={s.activityType} />
                          {s.project && <span className="text-xs text-muted-foreground font-mono">{s.project}</span>}
                          {s.language && <span className="text-xs text-muted-foreground">{s.language}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatDuration(s.durationMinutes)}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
                        <Zap className="h-3 w-3" />
                        {s.commandCount}
                      </div>
                      <div className="text-xs text-muted-foreground">{formatDate(s.startedAt)} {formatTime(s.startedAt)}</div>
                    </div>
                  </div>
                </div>
              ))
            )}

            {/* Pagination */}
            {total > PAGE_SIZE && (
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-muted-foreground font-mono">
                  {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} data-testid="button-prev-page">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} data-testid="button-next-page">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Detail panel */}
          <div className="lg:col-span-2">
            {selectedId ? (
              <SessionDetail id={selectedId} onClose={() => setSelectedId(null)} />
            ) : (
              <div className="rounded-lg border border-border bg-card p-6 flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
                <Terminal className="h-6 w-6 opacity-40" />
                <p className="text-sm text-center">Select a session to view details</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Commits tab */
        <div className="space-y-4">
          {/* Git summary bar */}
          {gitStats && gitStats.totalCommits > 0 && (
            <div className="rounded-lg border border-border bg-card px-5 py-4 flex items-center gap-6 flex-wrap" data-testid="git-commit-summary">
              <div className="flex items-center gap-2 text-sm font-mono">
                <GitCommit className="h-4 w-4 text-accent" />
                <span className="text-foreground font-semibold">{gitStats.totalCommits}</span>
                <span className="text-muted-foreground">total commits</span>
              </div>
              <div className="h-4 w-px bg-border hidden sm:block" />
              <div className="flex items-center gap-1.5 text-sm font-mono">
                <span className="text-green-500 font-medium">+{gitStats.totalInsertions.toLocaleString()}</span>
                <span className="text-muted-foreground">/</span>
                <span className="text-red-500 font-medium">-{gitStats.totalDeletions.toLocaleString()}</span>
                <span className="text-muted-foreground ml-1">lines</span>
              </div>
              <div className="h-4 w-px bg-border hidden sm:block" />
              <span className="text-sm font-mono text-muted-foreground">
                <span className="text-foreground">{gitStats.totalFilesChanged}</span> files touched
              </span>
            </div>
          )}

          {/* Commits list */}
          {gitLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
            </div>
          ) : commits.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 rounded-lg border border-border bg-card text-muted-foreground gap-3">
              <GitCommit className="h-8 w-8 opacity-40" />
              <p className="text-sm">No commits captured yet</p>
              <p className="text-xs text-center max-w-xs">Run <code className="font-mono bg-muted px-1 rounded">git commit</code> in any project — kern will automatically capture the commit metadata.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card divide-y divide-border/50">
              {commits.map(c => (
                <div key={c.id} className="flex items-start gap-4 p-4 hover:bg-muted/20 transition-colors" data-testid={`commit-row-${c.shortHash}`}>
                  <div className="mt-0.5 h-8 w-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                    <GitCommit className="h-4 w-4 text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground font-medium leading-snug">{c.message}</p>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      <span className="font-mono text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{c.shortHash}</span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <GitBranch className="h-3 w-3" />{c.branch}
                      </span>
                      {c.project && (
                        <span className="text-xs font-mono text-accent/80">{c.project}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1.5">
                      <span className="text-xs text-green-500 flex items-center gap-0.5 font-mono">
                        <Plus className="h-3 w-3" />{c.insertions}
                      </span>
                      <span className="text-xs text-red-500 flex items-center gap-0.5 font-mono">
                        <Minus className="h-3 w-3" />{c.deletions}
                      </span>
                      <span className="text-xs text-muted-foreground">{c.filesChanged} file{c.filesChanged !== 1 ? "s" : ""} changed</span>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0 mt-0.5 font-mono">{timeAgo(c.committedAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

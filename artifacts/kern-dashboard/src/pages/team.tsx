import { useState, useRef, useCallback } from "react";
import { useListTeamMembers, useGetTeamSnapshot, getListTeamMembersQueryKey, getGetTeamSnapshotQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/context/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Users, Clock, Activity, Flame, ChevronDown, ChevronUp,
  GitCommit, Terminal, Zap, RefreshCw, AlertTriangle, Copy,
} from "lucide-react";

/* ─── constants ──────────────────────────────────────────────── */

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

/* ─── helpers ────────────────────────────────────────────────── */

function formatDuration(minutes: number) {
  if (minutes === 0) return "0m";
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
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}

/* ─── small atoms ────────────────────────────────────────────── */

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    ADMIN: "border-amber-500/30 text-amber-400 bg-amber-500/10",
    TEAM_LEAD: "border-accent/30 text-accent bg-accent/10",
    DEVELOPER: "border-border text-muted-foreground bg-muted/30",
  };
  const labels: Record<string, string> = { ADMIN: "Admin", TEAM_LEAD: "Lead", DEVELOPER: "Dev" };
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-mono border ${styles[role] || styles.DEVELOPER}`}>
      {labels[role] || role}
    </span>
  );
}

function ActivityDot({ type }: { type: string }) {
  const color = ACTIVITY_COLORS[type] || "#6b7280";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-mono" style={{ color }}>
      <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: color }} />
      {ACTIVITY_LABELS[type] || type}
    </span>
  );
}

function SnapshotStat({ label, value, icon: Icon }: { label: string; value: string; icon: React.ElementType }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="text-2xl font-bold font-mono text-foreground">{value}</div>
    </div>
  );
}

/* ─── member detail panel (lazy-loaded on expand) ───────────── */

interface MemberDetail {
  recentSessions: Array<{
    id: number;
    activityType: string;
    project: string | null;
    durationMinutes: number;
    inferredTask: string | null;
    startedAt: string;
  }>;
  recentCommits: Array<{
    id: number;
    shortHash: string;
    branch: string;
    message: string;
    project: string;
    insertions: number;
    deletions: number;
    committedAt: string;
  }>;
  todayStandup: string | null;
}

function MemberDetailPanel({ devId, name }: { devId: number; name: string }) {
  const [data, setData] = useState<MemberDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const loaded = useRef(false);

  const load = useCallback(async () => {
    if (loaded.current) return;
    loaded.current = true;
    setLoading(true);
    try {
      const res = await fetch(`/api/team/members/${devId}/detail`, { credentials: "include" });
      if (res.ok) setData(await res.json());
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [devId]);

  // Trigger load on first render
  useState(() => { load(); });

  if (loading) {
    return (
      <div className="border-t border-border px-4 pb-4 pt-3 space-y-2">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
      </div>
    );
  }

  if (!data) return null;

  const jumpInText = `Hey ${name} 👋 saw you're working on ${data.recentSessions[0]?.project ?? "something"} — happy to jump in if you need another pair of eyes`;

  return (
    <div className="border-t border-border px-4 pb-4 pt-3 grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Recent sessions */}
      <div className="space-y-2">
        <h4 className="text-xs font-mono text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
          <Terminal className="h-3 w-3" /> Sessions (48h)
        </h4>
        {data.recentSessions.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No recent sessions</p>
        ) : (
          data.recentSessions.slice(0, 5).map(s => (
            <div key={s.id} className="flex items-start gap-2">
              <span className="h-1.5 w-1.5 rounded-full mt-1.5 flex-shrink-0"
                style={{ backgroundColor: ACTIVITY_COLORS[s.activityType] || "#6b7280" }} />
              <div className="min-w-0">
                <div className="text-xs text-foreground font-mono truncate">
                  {s.project || "—"} · {formatDuration(s.durationMinutes)}
                </div>
                {s.inferredTask && (
                  <div className="text-xs text-muted-foreground truncate">{s.inferredTask}</div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Recent commits */}
      <div className="space-y-2">
        <h4 className="text-xs font-mono text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
          <GitCommit className="h-3 w-3" /> Recent Commits
        </h4>
        {data.recentCommits.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No recent commits</p>
        ) : (
          data.recentCommits.slice(0, 5).map(c => (
            <div key={c.id} className="flex items-start gap-2">
              <span className="text-xs font-mono text-muted-foreground flex-shrink-0">{c.shortHash}</span>
              <span className="text-xs text-foreground truncate">{c.message}</span>
            </div>
          ))
        )}
      </div>

      {/* Standup + Jump in */}
      <div className="space-y-3">
        <div>
          <h4 className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <Activity className="h-3 w-3" /> Today's Standup
          </h4>
          {data.todayStandup ? (
            <p className="text-xs text-foreground leading-relaxed line-clamp-4">{data.todayStandup}</p>
          ) : (
            <p className="text-xs text-muted-foreground italic">No standup generated yet</p>
          )}
        </div>
        <div className="pt-1 border-t border-border">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs w-full border-accent/30 text-accent hover:bg-accent/10"
            onClick={() => { navigator.clipboard.writeText(jumpInText); }}
          >
            <Copy className="h-3 w-3 mr-1.5" /> Copy "Jump In" message
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── member card ────────────────────────────────────────────── */

interface Member {
  id: number;
  name: string;
  email: string;
  avatarUrl: string | null;
  githubHandle: string | null;
  role: string;
  todayActiveMinutes: number;
  todaySessionCount: number;
  currentActivity: string | null;
  lastSeenAt: string | null;
  streak: number;
}

function MemberCard({ m, isMe }: { m: Member; isMe: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`rounded-lg border bg-card transition-colors ${isMe ? "border-accent/40" : "border-border hover:border-border/80"}`}
      data-testid={`member-card-${m.id}`}
    >
      <button
        className="w-full text-left flex items-center gap-4 p-4"
        onClick={() => setExpanded(v => !v)}
      >
        {/* Avatar */}
        <div className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 border ${isMe ? "border-accent/50 bg-accent/10" : "border-border bg-muted/30"}`}>
          {m.avatarUrl ? (
            <img src={m.avatarUrl} alt={m.name} className="h-10 w-10 rounded-full object-cover" />
          ) : (
            <span className="text-xs font-bold font-mono" style={{ color: isMe ? "var(--accent)" : "var(--muted-foreground)" }}>
              {getInitials(m.name)}
            </span>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">{m.name}</span>
            {isMe && <span className="text-xs font-mono text-accent border border-accent/30 rounded px-1.5 py-0.5 bg-accent/10">you</span>}
            <RoleBadge role={m.role} />
            {m.githubHandle && (
              <span className="text-xs text-muted-foreground font-mono">@{m.githubHandle}</span>
            )}
          </div>
          <div className="flex items-center gap-4 mt-1 flex-wrap">
            {m.currentActivity ? (
              <ActivityDot type={m.currentActivity} />
            ) : (
              <span className="text-xs text-muted-foreground font-mono">No activity today</span>
            )}
            {m.lastSeenAt && (
              <span className="text-xs text-muted-foreground">Last seen {timeAgo(m.lastSeenAt)}</span>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-5 flex-shrink-0 text-right">
          <div>
            <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Today</div>
            <div className="text-sm font-mono font-bold text-foreground">{formatDuration(m.todayActiveMinutes)}</div>
            <div className="text-xs text-muted-foreground">{m.todaySessionCount} sessions</div>
          </div>
          <div>
            <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Streak</div>
            <div className="text-sm font-mono font-bold text-foreground">{m.streak}d</div>
          </div>
          <div className="text-muted-foreground">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>
      </button>

      {expanded && <MemberDetailPanel devId={m.id} name={m.name} />}
    </div>
  );
}

/* ─── AI blocker intel panel ─────────────────────────────────── */

function parseBlockerLines(text: string): Array<{ line: string; type: "blocked" | "at-risk" | "ok" | "section" | "normal" }> {
  return text.split("\n").map(line => {
    if (line.includes("🔴") || line.toLowerCase().includes("blocked")) return { line, type: "blocked" };
    if (line.includes("🟡") || line.toLowerCase().includes("at risk")) return { line, type: "at-risk" };
    if (line.includes("🟢") || line.toLowerCase().includes("on track")) return { line, type: "ok" };
    if (line.startsWith("##") || line.startsWith("###")) return { line, type: "section" };
    return { line, type: "normal" };
  });
}

function BlockerIntelPanel() {
  const [status, setStatus] = useState<"idle" | "scanning" | "done" | "error">("idle");
  const [content, setContent] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scan = async () => {
    if (status === "scanning") {
      abortRef.current?.abort();
      setStatus("idle");
      return;
    }
    setContent("");
    setStatus("scanning");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/team/blockers/analyze", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      if (!res.ok || !res.body) { setStatus("error"); return; }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          try {
            const parsed = JSON.parse(line.slice(5).trim()) as { content?: string; done?: boolean; error?: string };
            if (parsed.content) {
              setContent(prev => {
                const next = prev + parsed.content;
                requestAnimationFrame(() => {
                  if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                });
                return next;
              });
            }
            if (parsed.done) setStatus("done");
            if (parsed.error) setStatus("error");
          } catch { /* ignore */ }
        }
      }
      setStatus(s => s === "scanning" ? "done" : s);
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== "AbortError") setStatus("error");
      else if (!(e instanceof Error)) setStatus("error");
    }
  };

  const lines = parseBlockerLines(content);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-accent/10 border border-accent/20 flex items-center justify-center">
            <Zap className="h-4 w-4 text-accent" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">AI Team Intel</h2>
            <p className="text-xs text-muted-foreground">Scans all team activity for blockers and collaboration opportunities</p>
          </div>
        </div>
        <Button
          size="sm"
          className={`h-8 text-xs font-mono gap-2 ${status === "scanning" ? "bg-destructive/80 hover:bg-destructive text-white" : "bg-accent hover:bg-accent/90 text-background"}`}
          onClick={scan}
        >
          {status === "scanning" ? (
            <><RefreshCw className="h-3 w-3 animate-spin" /> Stop</>
          ) : (
            <><Zap className="h-3 w-3" />{status === "done" ? "Re-scan" : "Scan for blockers"}</>
          )}
        </Button>
      </div>

      {/* Body */}
      {status === "idle" && (
        <div className="flex flex-col items-center justify-center py-12 px-6 gap-3 text-center">
          <AlertTriangle className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Click <span className="font-mono text-accent">Scan for blockers</span> to analyze your team's recent activity</p>
          <p className="text-xs text-muted-foreground/70">Claude reviews sessions, commits, and standups to surface who's stuck and where you can help</p>
        </div>
      )}

      {status === "error" && (
        <div className="flex items-center gap-2 px-5 py-4 text-destructive text-sm">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          Analysis failed — check that the AI integration is configured
        </div>
      )}

      {(status === "scanning" || status === "done") && content && (
        <div ref={scrollRef} className="overflow-y-auto max-h-[520px] px-5 py-4 font-mono text-xs leading-relaxed space-y-0.5">
          {lines.map((item, i) => {
            if (!item.line.trim()) return <div key={i} className="h-2" />;
            const cls =
              item.type === "blocked" ? "text-red-400 font-semibold" :
              item.type === "at-risk" ? "text-amber-400 font-semibold" :
              item.type === "ok" ? "text-green-400 font-semibold" :
              item.type === "section" ? "text-accent font-bold mt-3 text-sm" :
              "text-foreground/80";
            const text = item.line
              .replace(/^#{1,3}\s*/, "")
              .replace(/\*\*(.*?)\*\*/g, "$1");
            return <div key={i} className={cls}>{text}</div>;
          })}
          {status === "scanning" && (
            <span className="inline-block h-3 w-0.5 bg-accent animate-pulse ml-0.5" />
          )}
        </div>
      )}
    </div>
  );
}

/* ─── main page ──────────────────────────────────────────────── */

export default function Team() {
  const { data: snapshot, isLoading: snapshotLoading } = useGetTeamSnapshot({
    query: { queryKey: getGetTeamSnapshotQueryKey() },
  });
  const { data: membersData, isLoading: membersLoading } = useListTeamMembers({
    query: { queryKey: getListTeamMembersQueryKey() },
  });

  const { developer: me } = useAuth();
  const members: Member[] = (membersData?.members ?? []) as Member[];
  const myId = me?.id ?? -1;

  return (
    <div className="space-y-8" data-testid="page-team">
      <div>
        <h1 className="text-2xl font-bold font-mono text-foreground">
          {snapshotLoading ? <Skeleton className="h-7 w-48" /> : snapshot?.teamName ?? "Team"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Team activity — click any member to see their sessions, commits, and standup</p>
      </div>

      {/* Snapshot stats */}
      {snapshotLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      ) : snapshot && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SnapshotStat label="Active Today" value={`${snapshot.activeMembersToday}/${snapshot.totalMembers}`} icon={Users} />
          <SnapshotStat label="Team Sessions" value={String(snapshot.totalSessionsToday)} icon={Activity} />
          <SnapshotStat label="Total Time" value={formatDuration(snapshot.totalActiveMinutesToday)} icon={Clock} />
          <SnapshotStat label="Top Projects" value={String(snapshot.topProjects.length)} icon={Flame} />
        </div>
      )}

      {/* AI Blocker Intel */}
      <BlockerIntelPanel />

      {/* Activity breakdown */}
      {snapshot && snapshot.activityBreakdown.some(b => b.totalMinutes > 0) && (
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-4">Team Activity Today</h2>
          <div className="space-y-3">
            {snapshot.activityBreakdown
              .filter(b => b.totalMinutes > 0)
              .sort((a, b) => b.totalMinutes - a.totalMinutes)
              .map(b => (
                <div key={b.activityType} className="flex items-center gap-3">
                  <span className="text-xs font-mono text-muted-foreground w-20 flex-shrink-0">{ACTIVITY_LABELS[b.activityType]}</span>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${b.percentage}%`, backgroundColor: ACTIVITY_COLORS[b.activityType] }} />
                  </div>
                  <span className="text-xs font-mono text-muted-foreground w-16 text-right">{formatDuration(b.totalMinutes)}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Top projects */}
      {snapshot && snapshot.topProjects.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-4">Top Projects Today</h2>
          <div className="space-y-2">
            {snapshot.topProjects.map((p, i) => (
              <div key={p.project} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <span className="text-sm font-mono text-foreground">{p.project}</span>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>{p.contributorCount} {p.contributorCount === 1 ? "contributor" : "contributors"}</span>
                  <span className="font-mono">{formatDuration(p.totalMinutes)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Member cards */}
      <div className="space-y-3">
        <h2 className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Members</h2>
        {membersLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)
        ) : members.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No team members found
          </div>
        ) : (
          members.map(m => <MemberCard key={m.id} m={m} isMe={m.id === myId} />)
        )}
      </div>
    </div>
  );
}

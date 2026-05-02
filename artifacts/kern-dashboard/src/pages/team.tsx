import { useListTeamMembers, useGetTeamSnapshot, getListTeamMembersQueryKey, getGetTeamSnapshotQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Clock, Activity, Flame } from "lucide-react";

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
  return `${h}h ago`;
}

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    ADMIN: "border-amber-500/30 text-amber-400 bg-amber-500/10",
    TEAM_LEAD: "border-accent/30 text-accent bg-accent/10",
    DEVELOPER: "border-border text-muted-foreground bg-muted/30",
  };
  const labels: Record<string, string> = { ADMIN: "Admin", TEAM_LEAD: "Lead", DEVELOPER: "Dev" };
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-mono border ${styles[role] || styles.DEVELOPER}`} data-testid={`badge-role-${role.toLowerCase()}`}>
      {labels[role] || role}
    </span>
  );
}

function ActivityDot({ type }: { type: string }) {
  const color = ACTIVITY_COLORS[type] || "#6b7280";
  const label = ACTIVITY_LABELS[type] || type;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-mono" style={{ color }}>
      <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function SnapshotStat({ label, value, icon: Icon }: { label: string; value: string; icon: React.ElementType }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-2" data-testid={`team-stat-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="text-2xl font-bold font-mono text-foreground">{value}</div>
    </div>
  );
}

export default function Team() {
  const { data: snapshot, isLoading: snapshotLoading } = useGetTeamSnapshot({
    query: { queryKey: getGetTeamSnapshotQueryKey() },
  });
  const { data: membersData, isLoading: membersLoading } = useListTeamMembers({
    query: { queryKey: getListTeamMembersQueryKey() },
  });

  const members = membersData?.members ?? [];

  return (
    <div className="space-y-8" data-testid="page-team">
      <div>
        <h1 className="text-2xl font-bold font-mono text-foreground">
          {snapshotLoading ? <Skeleton className="h-7 w-48" /> : snapshot?.teamName ?? "Team"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Team activity — updated every 15 minutes</p>
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

      {/* Activity breakdown */}
      {snapshot && snapshot.activityBreakdown.some(b => b.totalMinutes > 0) && (
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-4">Team Activity Today</h2>
          <div className="space-y-3">
            {snapshot.activityBreakdown
              .filter(b => b.totalMinutes > 0)
              .sort((a, b) => b.totalMinutes - a.totalMinutes)
              .map(b => (
                <div key={b.activityType} className="flex items-center gap-3" data-testid={`team-activity-${b.activityType.toLowerCase()}`}>
                  <span className="text-xs font-mono text-muted-foreground w-20 flex-shrink-0">{ACTIVITY_LABELS[b.activityType]}</span>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${b.percentage}%`, backgroundColor: ACTIVITY_COLORS[b.activityType] }}
                    />
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
              <div key={p.project} className="flex items-center justify-between py-2 border-b border-border last:border-0" data-testid={`project-row-${i}`}>
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

      {/* Member list */}
      <div className="space-y-3">
        <h2 className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Members</h2>
        {membersLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)
        ) : members.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">No team members found</div>
        ) : (
          members.map(m => (
            <div key={m.id} className="rounded-lg border border-border bg-card p-4 flex items-center gap-4 hover:border-border/80 transition-colors" data-testid={`member-card-${m.id}`}>
              {/* Avatar */}
              <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0 border border-border">
                {m.avatarUrl ? (
                  <img src={m.avatarUrl} alt={m.name} className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <span className="text-xs font-bold font-mono text-primary-foreground">{getInitials(m.name)}</span>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-foreground" data-testid={`text-member-name-${m.id}`}>{m.name}</span>
                  <RoleBadge role={m.role} />
                  {m.githubHandle && (
                    <span className="text-xs text-muted-foreground font-mono">@{m.githubHandle}</span>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-1 flex-wrap">
                  {m.currentActivity ? (
                    <ActivityDot type={m.currentActivity} />
                  ) : (
                    <span className="text-xs text-muted-foreground font-mono">—</span>
                  )}
                  {m.lastSeenAt && (
                    <span className="text-xs text-muted-foreground">Last seen {timeAgo(m.lastSeenAt)}</span>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-6 flex-shrink-0 text-right">
                <div>
                  <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest text-[10px]">Today</div>
                  <div className="text-sm font-mono font-bold text-foreground">{formatDuration(m.todayActiveMinutes)}</div>
                  <div className="text-xs text-muted-foreground">{m.todaySessionCount} sessions</div>
                </div>
                <div>
                  <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest text-[10px]">Streak</div>
                  <div className="text-sm font-mono font-bold text-foreground">{m.streak}d</div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

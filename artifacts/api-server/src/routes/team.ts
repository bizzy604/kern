import { Router } from "express";
import { randomBytes } from "crypto";
import { db } from "@workspace/db";
import { developersTable, teamsTable, workSessionsTable, gitCommitsTable, standupsTable } from "@workspace/db";
import { eq, and, gte, desc } from "drizzle-orm";
import { requireSession } from "../middleware/session";

const router = Router();

function getTodayStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = (n: number) => Array.from({ length: n }, () => chars[randomBytes(1)[0]! % chars.length]).join("");
  return `${part(4)}-${part(4)}`;
}

// Returns the current user's team invite code so they can share it with teammates.
router.get("/teams/invite-code", requireSession, async (req, res) => {
  try {
    const teamId = req.developer!.teamId;
    if (!teamId) {
      return res.json({ inviteCode: null, teamName: null, teamId: null, solo: true });
    }
    const team = await db.select().from(teamsTable).where(eq(teamsTable.id, teamId)).limit(1);
    if (!team[0]) return res.status(404).json({ error: "Team not found" });

    // Auto-generate code if somehow missing
    if (!team[0].inviteCode) {
      const code = generateInviteCode();
      await db.update(teamsTable).set({ inviteCode: code }).where(eq(teamsTable.id, teamId));
      return res.json({ inviteCode: code, teamName: team[0].name, teamId: team[0].id });
    }

    return res.json({ inviteCode: team[0].inviteCode, teamName: team[0].name, teamId: team[0].id });
  } catch (err) {
    req.log.error({ err }, "Failed to get team invite code");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Regenerates the team invite code — invalidates the old one immediately.
router.post("/teams/regenerate-invite", requireSession, async (req, res) => {
  try {
    const teamId = req.developer!.teamId;
    if (!teamId) return res.status(400).json({ error: "You are not in a team" });

    const newCode = generateInviteCode();
    await db.update(teamsTable).set({ inviteCode: newCode }).where(eq(teamsTable.id, teamId));
    req.log.info({ devId: req.developer!.id, teamId }, "Team invite code regenerated");
    return res.json({ inviteCode: newCode });
  } catch (err) {
    req.log.error({ err }, "Failed to regenerate invite code");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Returns all developers in the same team as the logged-in developer.
router.get("/team/members", requireSession, async (req, res) => {
  try {
    const me = req.developer!;
    const developers = await db
      .select({ id: developersTable.id, name: developersTable.name, email: developersTable.email, avatarUrl: developersTable.avatarUrl, githubHandle: developersTable.githubHandle, role: developersTable.role, teamId: developersTable.teamId })
      .from(developersTable)
      .where(me.teamId ? eq(developersTable.teamId, me.teamId) : eq(developersTable.id, me.id));

    const todayStart = getTodayStart();
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);

    const memberDetails = await Promise.all(
      developers.map(async dev => {
        const [todaySessions, weeklySessions] = await Promise.all([
          db.select().from(workSessionsTable).where(and(eq(workSessionsTable.developerId, dev.id), gte(workSessionsTable.startedAt, todayStart))).orderBy(desc(workSessionsTable.startedAt)),
          db.select().from(workSessionsTable).where(and(eq(workSessionsTable.developerId, dev.id), gte(workSessionsTable.startedAt, weekStart))),
        ]);
        const todayActiveMinutes = todaySessions.reduce((sum, s) => sum + s.durationMinutes, 0);
        const uniqueDates = new Set(weeklySessions.map(s => s.startedAt.toISOString().split("T")[0]));
        let streak = 0;
        const check = new Date();
        while (true) {
          const dateStr = check.toISOString().split("T")[0];
          if (uniqueDates.has(dateStr)) { streak++; check.setDate(check.getDate() - 1); } else break;
        }
        return { ...dev, todayActiveMinutes, todaySessionCount: todaySessions.length, currentActivity: todaySessions[0]?.activityType ?? null, lastSeenAt: todaySessions[0]?.endedAt?.toISOString() ?? null, streak };
      }),
    );

    return res.json({ members: memberDetails, total: memberDetails.length });
  } catch (err) {
    req.log.error({ err }, "Failed to list team members");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/team/snapshot", requireSession, async (req, res) => {
  try {
    const me = req.developer!;
    const [teamRows, developers] = await Promise.all([
      me.teamId ? db.select().from(teamsTable).where(eq(teamsTable.id, me.teamId)).limit(1) : Promise.resolve([]),
      db.select().from(developersTable).where(me.teamId ? eq(developersTable.teamId, me.teamId) : eq(developersTable.id, me.id)),
    ]);

    const teamName = (teamRows as Array<{ name: string }>)[0]?.name ?? "My Team";
    const todayStart = getTodayStart();
    const devIds = developers.map(d => d.id);

    const teamSessions = devIds.length > 0
      ? (await db.select().from(workSessionsTable).where(gte(workSessionsTable.startedAt, todayStart))).filter(s => devIds.includes(s.developerId))
      : [];

    const TYPES = ["CODING", "DEBUGGING", "TESTING", "DEVOPS", "RESEARCHING", "IDLE"] as const;
    const typeStats: Record<string, { totalMinutes: number; sessionCount: number }> = {};
    for (const t of TYPES) typeStats[t] = { totalMinutes: 0, sessionCount: 0 };
    for (const s of teamSessions) { typeStats[s.activityType].totalMinutes += s.durationMinutes; typeStats[s.activityType].sessionCount += 1; }
    const totalMin = Object.values(typeStats).reduce((sum, v) => sum + v.totalMinutes, 0);
    const activityBreakdown = TYPES.map(t => ({ activityType: t, totalMinutes: typeStats[t].totalMinutes, sessionCount: typeStats[t].sessionCount, percentage: totalMin > 0 ? Math.round((typeStats[t].totalMinutes / totalMin) * 100) : 0 }));

    const projectStats: Record<string, { totalMinutes: number; contributors: Set<number> }> = {};
    for (const s of teamSessions) {
      if (!s.project) continue;
      if (!projectStats[s.project]) projectStats[s.project] = { totalMinutes: 0, contributors: new Set() };
      projectStats[s.project].totalMinutes += s.durationMinutes;
      projectStats[s.project].contributors.add(s.developerId);
    }

    return res.json({
      teamName,
      totalActiveMinutesToday: teamSessions.reduce((sum, s) => sum + s.durationMinutes, 0),
      totalSessionsToday: teamSessions.length,
      activeMembersToday: new Set(teamSessions.map(s => s.developerId)).size,
      totalMembers: developers.length,
      activityBreakdown,
      topProjects: Object.entries(projectStats).sort((a, b) => b[1].totalMinutes - a[1].totalMinutes).slice(0, 5).map(([project, data]) => ({ project, totalMinutes: data.totalMinutes, contributorCount: data.contributors.size })),
      cachedAt: new Date().toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get team snapshot");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/team/members/:id/detail", requireSession, async (req, res) => {
  try {
    const me = req.developer!;
    const devId = parseInt(req.params["id"] ?? "", 10);
    if (isNaN(devId)) return res.status(400).json({ error: "Invalid developer id" });

    const [dev] = await db.select().from(developersTable).where(eq(developersTable.id, devId)).limit(1);
    if (!dev) return res.status(404).json({ error: "Developer not found" });

    if (me.teamId && dev.teamId !== me.teamId && dev.id !== me.id) return res.status(403).json({ error: "Access denied" });

    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const todayStr = new Date().toISOString().split("T")[0]!;

    const [recentSessions, recentCommits, todayStandup] = await Promise.all([
      db.select().from(workSessionsTable).where(and(eq(workSessionsTable.developerId, devId), gte(workSessionsTable.startedAt, twoDaysAgo))).orderBy(desc(workSessionsTable.startedAt)).limit(8),
      db.select().from(gitCommitsTable).where(and(eq(gitCommitsTable.developerId, devId), gte(gitCommitsTable.committedAt, sevenDaysAgo))).orderBy(desc(gitCommitsTable.committedAt)).limit(8),
      db.select().from(standupsTable).where(and(eq(standupsTable.developerId, devId), eq(standupsTable.date, todayStr))).limit(1),
    ]);

    return res.json({
      developer: { id: dev.id, name: dev.name, role: dev.role, githubHandle: dev.githubHandle },
      recentSessions: recentSessions.map(s => ({ ...s, startedAt: s.startedAt.toISOString(), endedAt: s.endedAt.toISOString() })),
      recentCommits: recentCommits.map(c => ({ ...c, committedAt: c.committedAt.toISOString() })),
      todayStandup: todayStandup[0]?.content ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get member detail");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

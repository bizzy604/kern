import { Router } from "express";
import { db } from "@workspace/db";
import { developersTable, teamsTable, workSessionsTable, gitCommitsTable, standupsTable } from "@workspace/db";
import { eq, and, gte, desc } from "drizzle-orm";

const router = Router();

function getTodayStart() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  return start;
}

router.get("/team/members", async (req, res) => {
  try {
    const developers = await db
      .select({
        id: developersTable.id,
        name: developersTable.name,
        email: developersTable.email,
        avatarUrl: developersTable.avatarUrl,
        githubHandle: developersTable.githubHandle,
        role: developersTable.role,
        teamId: developersTable.teamId,
      })
      .from(developersTable);

    const todayStart = getTodayStart();
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);

    const memberDetails = await Promise.all(
      developers.map(async dev => {
        const todaySessions = await db
          .select()
          .from(workSessionsTable)
          .where(and(eq(workSessionsTable.developerId, dev.id), gte(workSessionsTable.startedAt, todayStart)))
          .orderBy(desc(workSessionsTable.startedAt));

        const weeklySessions = await db
          .select()
          .from(workSessionsTable)
          .where(and(eq(workSessionsTable.developerId, dev.id), gte(workSessionsTable.startedAt, weekStart)));

        const todayActiveMinutes = todaySessions.reduce((sum, s) => sum + s.durationMinutes, 0);
        const currentActivity = todaySessions[0]?.activityType ?? null;
        const lastSeenAt = todaySessions[0]?.endedAt?.toISOString() ?? null;

        // Compute streak
        const allDates = weeklySessions.map(s => s.startedAt.toISOString().split("T")[0]);
        const uniqueDates = new Set(allDates);
        let streak = 0;
        const check = new Date();
        while (true) {
          const dateStr = check.toISOString().split("T")[0];
          if (uniqueDates.has(dateStr)) {
            streak++;
            check.setDate(check.getDate() - 1);
          } else break;
        }

        return {
          ...dev,
          todayActiveMinutes,
          todaySessionCount: todaySessions.length,
          currentActivity,
          lastSeenAt,
          streak,
        };
      }),
    );

    return res.json({ members: memberDetails, total: memberDetails.length });
  } catch (err) {
    req.log.error({ err }, "Failed to list team members");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/team/snapshot", async (req, res) => {
  try {
    const team = await db.select().from(teamsTable).limit(1);
    const teamName = team[0]?.name ?? "Engineering Team";

    const developers = await db.select().from(developersTable);
    const todayStart = getTodayStart();

    const allTodaySessions = await db
      .select()
      .from(workSessionsTable)
      .where(gte(workSessionsTable.startedAt, todayStart));

    const totalActiveMinutesToday = allTodaySessions.reduce((sum, s) => sum + s.durationMinutes, 0);
    const totalSessionsToday = allTodaySessions.length;

    const activeMemberIds = new Set(allTodaySessions.map(s => s.developerId));
    const activeMembersToday = activeMemberIds.size;

    // Activity breakdown
    const TYPES = ["CODING", "DEBUGGING", "TESTING", "DEVOPS", "RESEARCHING", "IDLE"];
    const typeStats: Record<string, { totalMinutes: number; sessionCount: number }> = {};
    for (const t of TYPES) typeStats[t] = { totalMinutes: 0, sessionCount: 0 };
    for (const s of allTodaySessions) {
      typeStats[s.activityType].totalMinutes += s.durationMinutes;
      typeStats[s.activityType].sessionCount += 1;
    }
    const totalMin = Object.values(typeStats).reduce((sum, v) => sum + v.totalMinutes, 0);
    const activityBreakdown = TYPES.map(t => ({
      activityType: t,
      totalMinutes: typeStats[t].totalMinutes,
      sessionCount: typeStats[t].sessionCount,
      percentage: totalMin > 0 ? Math.round((typeStats[t].totalMinutes / totalMin) * 100) : 0,
    }));

    // Top projects
    const projectStats: Record<string, { totalMinutes: number; contributors: Set<number> }> = {};
    for (const s of allTodaySessions) {
      if (!s.project) continue;
      if (!projectStats[s.project]) {
        projectStats[s.project] = { totalMinutes: 0, contributors: new Set() };
      }
      projectStats[s.project].totalMinutes += s.durationMinutes;
      projectStats[s.project].contributors.add(s.developerId);
    }

    const topProjects = Object.entries(projectStats)
      .sort((a, b) => b[1].totalMinutes - a[1].totalMinutes)
      .slice(0, 5)
      .map(([project, data]) => ({
        project,
        totalMinutes: data.totalMinutes,
        contributorCount: data.contributors.size,
      }));

    return res.json({
      teamName,
      totalActiveMinutesToday,
      totalSessionsToday,
      activeMembersToday,
      totalMembers: developers.length,
      activityBreakdown,
      topProjects,
      cachedAt: new Date().toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get team snapshot");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/team/members/:id/detail", async (req, res) => {
  try {
    const devId = parseInt(req.params["id"] ?? "", 10);
    if (isNaN(devId)) return res.status(400).json({ error: "Invalid developer id" });

    const [dev] = await db.select().from(developersTable).where(eq(developersTable.id, devId)).limit(1);
    if (!dev) return res.status(404).json({ error: "Developer not found" });

    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const todayStr = new Date().toISOString().split("T")[0]!;

    const [recentSessions, recentCommits, todayStandup] = await Promise.all([
      db
        .select()
        .from(workSessionsTable)
        .where(and(eq(workSessionsTable.developerId, devId), gte(workSessionsTable.startedAt, twoDaysAgo)))
        .orderBy(desc(workSessionsTable.startedAt))
        .limit(8),
      db
        .select()
        .from(gitCommitsTable)
        .where(and(eq(gitCommitsTable.developerId, devId), gte(gitCommitsTable.committedAt, sevenDaysAgo)))
        .orderBy(desc(gitCommitsTable.committedAt))
        .limit(8),
      db
        .select()
        .from(standupsTable)
        .where(and(eq(standupsTable.developerId, devId), eq(standupsTable.date, todayStr)))
        .limit(1),
    ]);

    return res.json({
      developer: dev,
      recentSessions: recentSessions.map(s => ({
        ...s,
        startedAt: s.startedAt.toISOString(),
        endedAt: s.endedAt.toISOString(),
      })),
      recentCommits: recentCommits.map(c => ({
        ...c,
        committedAt: c.committedAt.toISOString(),
      })),
      todayStandup: todayStandup[0]?.content ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get member detail");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

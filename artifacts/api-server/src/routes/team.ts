import { Router } from "express";
import { db } from "@workspace/db";
import { developersTable, teamsTable, workSessionsTable } from "@workspace/db";
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

export default router;

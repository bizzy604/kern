import { Router } from "express";
import { db } from "@workspace/db";
import { workSessionsTable, standupsTable, developersTable } from "@workspace/db";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { GetActivityBreakdownQueryParams } from "@workspace/api-zod";

const router = Router();

function getTodayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { start, end };
}

function getWeekRange() {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  return { start, end: now };
}

router.get("/dashboard/summary", async (req, res) => {
  try {
    const developer = await db.select().from(developersTable).limit(1);
    if (!developer[0]) return res.status(404).json({ error: "No developer found" });
    const devId = developer[0].id;

    const { start: todayStart, end: todayEnd } = getTodayRange();
    const { start: weekStart } = getWeekRange();
    const today = new Date().toISOString().split("T")[0];

    const [todaySessions, weeklySessions, todayStandup, recentSessions] = await Promise.all([
      db
        .select()
        .from(workSessionsTable)
        .where(
          and(
            eq(workSessionsTable.developerId, devId),
            gte(workSessionsTable.startedAt, todayStart),
            lte(workSessionsTable.startedAt, todayEnd),
          ),
        ),
      db
        .select()
        .from(workSessionsTable)
        .where(
          and(eq(workSessionsTable.developerId, devId), gte(workSessionsTable.startedAt, weekStart)),
        ),
      db
        .select()
        .from(standupsTable)
        .where(and(eq(standupsTable.developerId, devId), eq(standupsTable.date, today)))
        .limit(1),
      db
        .select()
        .from(workSessionsTable)
        .where(eq(workSessionsTable.developerId, devId))
        .orderBy(desc(workSessionsTable.startedAt))
        .limit(5),
    ]);

    const todayActiveMinutes = todaySessions.reduce((sum, s) => sum + s.durationMinutes, 0);
    const todayCommandCount = todaySessions.reduce((sum, s) => sum + s.commandCount, 0);
    const weeklyActiveMinutes = weeklySessions.reduce((sum, s) => sum + s.durationMinutes, 0);

    // Count activity type frequency for today
    const typeCounts: Record<string, number> = {};
    for (const s of todaySessions) {
      typeCounts[s.activityType] = (typeCounts[s.activityType] || 0) + s.durationMinutes;
    }
    const topActivityToday =
      Object.keys(typeCounts).length > 0
        ? (Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0][0] as string)
        : null;

    // Compute streak: consecutive days with sessions
    const allDates = weeklySessions.map(s => s.startedAt.toISOString().split("T")[0]);
    const uniqueDates = new Set(allDates);
    let streak = 0;
    const check = new Date();
    while (true) {
      const dateStr = check.toISOString().split("T")[0];
      if (uniqueDates.has(dateStr)) {
        streak++;
        check.setDate(check.getDate() - 1);
      } else {
        break;
      }
    }

    return res.json({
      todaySessionCount: todaySessions.length,
      todayActiveMinutes,
      todayCommandCount,
      weeklyActiveMinutes,
      currentStreak: streak,
      topActivityToday,
      recentSessions: recentSessions.map(s => ({
        ...s,
        startedAt: s.startedAt.toISOString(),
        endedAt: s.endedAt.toISOString(),
      })),
      standupReady: todayStandup.length > 0,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get dashboard summary");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/dashboard/activity-breakdown", async (req, res) => {
  try {
    const parsed = GetActivityBreakdownQueryParams.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Invalid query params" });

    const days = parsed.data.days ?? 7;
    const developer = await db.select().from(developersTable).limit(1);
    if (!developer[0]) return res.status(404).json({ error: "No developer found" });
    const devId = developer[0].id;

    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);

    const sessions = await db
      .select()
      .from(workSessionsTable)
      .where(and(eq(workSessionsTable.developerId, devId), gte(workSessionsTable.startedAt, start)))
      .orderBy(workSessionsTable.startedAt);

    // Aggregate by activity type
    const typeStats: Record<string, { totalMinutes: number; sessionCount: number }> = {};
    const TYPES = ["CODING", "DEBUGGING", "TESTING", "DEVOPS", "RESEARCHING", "IDLE"];

    for (const t of TYPES) {
      typeStats[t] = { totalMinutes: 0, sessionCount: 0 };
    }

    for (const s of sessions) {
      typeStats[s.activityType].totalMinutes += s.durationMinutes;
      typeStats[s.activityType].sessionCount += 1;
    }

    const totalMinutes = Object.values(typeStats).reduce((sum, v) => sum + v.totalMinutes, 0);
    const breakdown = TYPES.map(t => ({
      activityType: t,
      totalMinutes: typeStats[t].totalMinutes,
      sessionCount: typeStats[t].sessionCount,
      percentage: totalMinutes > 0 ? Math.round((typeStats[t].totalMinutes / totalMinutes) * 100) : 0,
    }));

    // Daily series
    const dailyMap: Record<string, { totalMinutes: number; sessionCount: number; breakdown: Record<string, number> }> = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const dateStr = d.toISOString().split("T")[0];
      dailyMap[dateStr] = { totalMinutes: 0, sessionCount: 0, breakdown: {} };
    }

    for (const s of sessions) {
      const dateStr = s.startedAt.toISOString().split("T")[0];
      if (dailyMap[dateStr]) {
        dailyMap[dateStr].totalMinutes += s.durationMinutes;
        dailyMap[dateStr].sessionCount += 1;
        dailyMap[dateStr].breakdown[s.activityType] =
          (dailyMap[dateStr].breakdown[s.activityType] || 0) + s.durationMinutes;
      }
    }

    const dailySeries = Object.entries(dailyMap).map(([date, data]) => ({ date, ...data }));

    return res.json({ days, breakdown, dailySeries });
  } catch (err) {
    req.log.error({ err }, "Failed to get activity breakdown");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

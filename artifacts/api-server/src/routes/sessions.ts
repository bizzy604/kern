import { Router } from "express";
import { db } from "@workspace/db";
import { workSessionsTable, developersTable } from "@workspace/db";
import { eq, desc, and, gte, lte, asc } from "drizzle-orm";
import { ListSessionsQueryParams, GetSessionParams } from "@workspace/api-zod";

const router = Router();

router.get("/sessions", async (req, res) => {
  try {
    const parsed = ListSessionsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid query params" });
    }
    const { limit = 20, offset = 0, date } = parsed.data;

    const developer = await db.select().from(developersTable).orderBy(asc(developersTable.id)).limit(1);
    if (!developer[0]) return res.status(404).json({ error: "No developer found" });
    const devId = developer[0].id;

    const conditions = [eq(workSessionsTable.developerId, devId)];
    if (date) {
      const start = new Date(`${date}T00:00:00.000Z`);
      const end = new Date(`${date}T23:59:59.999Z`);
      conditions.push(gte(workSessionsTable.startedAt, start));
      conditions.push(lte(workSessionsTable.startedAt, end));
    }

    const sessions = await db
      .select()
      .from(workSessionsTable)
      .where(and(...conditions))
      .orderBy(desc(workSessionsTable.startedAt))
      .limit(limit)
      .offset(offset);

    const total = await db
      .select({ id: workSessionsTable.id })
      .from(workSessionsTable)
      .where(and(...conditions));

    return res.json({
      sessions: sessions.map(s => ({
        ...s,
        startedAt: s.startedAt.toISOString(),
        endedAt: s.endedAt.toISOString(),
      })),
      total: total.length,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to list sessions");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/sessions/:id", async (req, res) => {
  try {
    const parsed = GetSessionParams.safeParse({ id: req.params.id });
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const session = await db
      .select()
      .from(workSessionsTable)
      .where(eq(workSessionsTable.id, parsed.data.id))
      .limit(1);

    if (!session[0]) {
      return res.status(404).json({ error: "Session not found" });
    }

    const s = session[0];
    return res.json({
      ...s,
      startedAt: s.startedAt.toISOString(),
      endedAt: s.endedAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get session");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

import { Router } from "express";
import { db } from "@workspace/db";
import { standupsTable, developersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import {
  ListStandupsQueryParams,
  GetStandupParams,
  UpdateStandupParams,
  UpdateStandupBody,
  PostStandupToSlackParams,
} from "@workspace/api-zod";

const router = Router();

function formatStandup(s: typeof standupsTable.$inferSelect) {
  return {
    ...s,
    generatedAt: s.generatedAt.toISOString(),
    postedAt: s.postedAt ? s.postedAt.toISOString() : null,
  };
}

router.get("/standups/today", async (req, res) => {
  try {
    const developer = await db.select().from(developersTable).limit(1);
    if (!developer[0]) return res.status(404).json({ error: "No developer found" });

    const today = new Date().toISOString().split("T")[0];
    const standup = await db
      .select()
      .from(standupsTable)
      .where(and(eq(standupsTable.developerId, developer[0].id), eq(standupsTable.date, today)))
      .limit(1);

    return res.json({ standup: standup[0] ? formatStandup(standup[0]) : null });
  } catch (err) {
    req.log.error({ err }, "Failed to get today's standup");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/standups", async (req, res) => {
  try {
    const parsed = ListStandupsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid query params" });
    }
    const { limit = 10, offset = 0 } = parsed.data;

    const developer = await db.select().from(developersTable).limit(1);
    if (!developer[0]) return res.status(404).json({ error: "No developer found" });

    const standups = await db
      .select()
      .from(standupsTable)
      .where(eq(standupsTable.developerId, developer[0].id))
      .orderBy(desc(standupsTable.date))
      .limit(limit)
      .offset(offset);

    const total = await db
      .select({ id: standupsTable.id })
      .from(standupsTable)
      .where(eq(standupsTable.developerId, developer[0].id));

    return res.json({
      standups: standups.map(formatStandup),
      total: total.length,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to list standups");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/standups/:id", async (req, res) => {
  try {
    const parsed = GetStandupParams.safeParse({ id: req.params.id });
    if (!parsed.success) return res.status(400).json({ error: "Invalid id" });

    const standup = await db
      .select()
      .from(standupsTable)
      .where(eq(standupsTable.id, parsed.data.id))
      .limit(1);

    if (!standup[0]) return res.status(404).json({ error: "Standup not found" });

    return res.json(formatStandup(standup[0]));
  } catch (err) {
    req.log.error({ err }, "Failed to get standup");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/standups/:id", async (req, res) => {
  try {
    const paramsParsed = UpdateStandupParams.safeParse({ id: req.params.id });
    if (!paramsParsed.success) return res.status(400).json({ error: "Invalid id" });

    const bodyParsed = UpdateStandupBody.safeParse(req.body);
    if (!bodyParsed.success) return res.status(400).json({ error: "Invalid body" });

    const updated = await db
      .update(standupsTable)
      .set({ content: bodyParsed.data.content, source: "MANUAL" })
      .where(eq(standupsTable.id, paramsParsed.data.id))
      .returning();

    if (!updated[0]) return res.status(404).json({ error: "Standup not found" });

    return res.json(formatStandup(updated[0]));
  } catch (err) {
    req.log.error({ err }, "Failed to update standup");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/standups/:id/post", async (req, res) => {
  try {
    const parsed = PostStandupToSlackParams.safeParse({ id: req.params.id });
    if (!parsed.success) return res.status(400).json({ error: "Invalid id" });

    const standup = await db
      .select()
      .from(standupsTable)
      .where(eq(standupsTable.id, parsed.data.id))
      .limit(1);

    if (!standup[0]) return res.status(404).json({ error: "Standup not found" });

    await db
      .update(standupsTable)
      .set({ postedToSlack: true, postedAt: new Date() })
      .where(eq(standupsTable.id, parsed.data.id));

    return res.json({ success: true, message: "Standup posted to Slack successfully" });
  } catch (err) {
    req.log.error({ err }, "Failed to post standup to Slack");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

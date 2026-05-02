import { Router } from "express";
import { db } from "@workspace/db";
import { standupsTable, integrationsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import {
  ListStandupsQueryParams,
  GetStandupParams,
  UpdateStandupParams,
  UpdateStandupBody,
  PostStandupToSlackParams,
} from "@workspace/api-zod";
import { requireSession } from "../middleware/session";

const router = Router();

function formatStandup(s: typeof standupsTable.$inferSelect) {
  return {
    ...s,
    generatedAt: s.generatedAt.toISOString(),
    postedAt: s.postedAt ? s.postedAt.toISOString() : null,
  };
}

router.get("/standups/today", requireSession, async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const standup = await db.select().from(standupsTable)
      .where(and(eq(standupsTable.developerId, req.developer!.id), eq(standupsTable.date, today)))
      .limit(1);
    return res.json({ standup: standup[0] ? formatStandup(standup[0]) : null });
  } catch (err) {
    req.log.error({ err }, "Failed to get today's standup");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/standups", requireSession, async (req, res) => {
  try {
    const parsed = ListStandupsQueryParams.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Invalid query params" });
    const { limit = 10, offset = 0 } = parsed.data;
    const devId = req.developer!.id;

    const [standups, total] = await Promise.all([
      db.select().from(standupsTable).where(eq(standupsTable.developerId, devId))
        .orderBy(desc(standupsTable.date)).limit(limit).offset(offset),
      db.select({ id: standupsTable.id }).from(standupsTable).where(eq(standupsTable.developerId, devId)),
    ]);

    return res.json({ standups: standups.map(formatStandup), total: total.length });
  } catch (err) {
    req.log.error({ err }, "Failed to list standups");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/standups/:id", requireSession, async (req, res) => {
  try {
    const parsed = GetStandupParams.safeParse({ id: req.params.id });
    if (!parsed.success) return res.status(400).json({ error: "Invalid id" });
    const standup = await db.select().from(standupsTable).where(eq(standupsTable.id, parsed.data.id)).limit(1);
    if (!standup[0]) return res.status(404).json({ error: "Standup not found" });
    return res.json(formatStandup(standup[0]));
  } catch (err) {
    req.log.error({ err }, "Failed to get standup");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/standups/:id", requireSession, async (req, res) => {
  try {
    const paramsParsed = UpdateStandupParams.safeParse({ id: req.params.id });
    if (!paramsParsed.success) return res.status(400).json({ error: "Invalid id" });
    const bodyParsed = UpdateStandupBody.safeParse(req.body);
    if (!bodyParsed.success) return res.status(400).json({ error: "Invalid body" });

    const updated = await db.update(standupsTable)
      .set({ content: bodyParsed.data.content, source: "MANUAL" })
      .where(and(eq(standupsTable.id, paramsParsed.data.id), eq(standupsTable.developerId, req.developer!.id)))
      .returning();

    if (!updated[0]) return res.status(404).json({ error: "Standup not found" });
    return res.json(formatStandup(updated[0]));
  } catch (err) {
    req.log.error({ err }, "Failed to update standup");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/standups/:id/post", requireSession, async (req, res) => {
  try {
    const parsed = PostStandupToSlackParams.safeParse({ id: req.params.id });
    if (!parsed.success) return res.status(400).json({ error: "Invalid id" });

    const standup = await db.select().from(standupsTable)
      .where(and(eq(standupsTable.id, parsed.data.id), eq(standupsTable.developerId, req.developer!.id)))
      .limit(1);
    if (!standup[0]) return res.status(404).json({ error: "Standup not found" });

    const slackIntegration = await db.select().from(integrationsTable)
      .where(and(eq(integrationsTable.developerId, standup[0].developerId), eq(integrationsTable.type, "slack")))
      .limit(1);

    let webhookUrl: string | null = null;
    if (slackIntegration[0]?.config) {
      try { webhookUrl = JSON.parse(slackIntegration[0].config).webhookUrl ?? null; } catch { /* ignore */ }
    }
    if (!webhookUrl) webhookUrl = process.env["SLACK_WEBHOOK_URL"] ?? null;

    if (webhookUrl) {
      const slackRes = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: standup[0].content, username: "KERN", icon_emoji: ":writing_hand:" }),
      });
      if (!slackRes.ok) {
        req.log.error({ status: slackRes.status }, "Slack webhook returned non-OK status");
        return res.status(502).json({ error: "Slack webhook failed — check your webhook URL in Settings" });
      }
    } else {
      req.log.warn("No Slack webhook configured");
    }

    await db.update(standupsTable).set({ postedToSlack: true, postedAt: new Date() }).where(eq(standupsTable.id, parsed.data.id));
    return res.json({
      success: true,
      message: webhookUrl ? "Standup posted to Slack successfully" : "Marked as posted (configure Slack in Settings to send for real)",
    });
  } catch (err) {
    req.log.error({ err }, "Failed to post standup to Slack");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

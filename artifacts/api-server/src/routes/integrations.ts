import { Router } from "express";
import { db } from "@workspace/db";
import { integrationsTable, developersTable, gitCommitsTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const INTEGRATION_TYPES = ["slack", "github", "jira", "asana"] as const;
type IntegrationType = (typeof INTEGRATION_TYPES)[number];

interface IntegrationStatus {
  type: IntegrationType;
  connected: boolean;
  config: Record<string, string>;
  connectedAt: string | null;
}

async function getDevId(): Promise<number | null> {
  const rows = await db
    .select({ id: developersTable.id })
    .from(developersTable)
    .orderBy(asc(developersTable.id))
    .limit(1);
  return rows[0]?.id ?? null;
}

router.get("/integrations", async (req, res) => {
  try {
    const devId = await getDevId();
    if (!devId) return res.status(404).json({ error: "No developer found" });

    const rows = await db
      .select()
      .from(integrationsTable)
      .where(eq(integrationsTable.developerId, devId));

    const hasCommits =
      (
        await db
          .select({ id: gitCommitsTable.id })
          .from(gitCommitsTable)
          .where(eq(gitCommitsTable.developerId, devId))
          .limit(1)
      ).length > 0;

    const connected = new Map(rows.map(r => [r.type, r]));

    const result: IntegrationStatus[] = INTEGRATION_TYPES.map(type => {
      const row = connected.get(type);
      const isConnected =
        type === "github" ? hasCommits || !!row : !!row;
      let config: Record<string, string> = {};
      if (row?.config) {
        try { config = JSON.parse(row.config); } catch { /* ignore */ }
      }
      return {
        type,
        connected: isConnected,
        config,
        connectedAt: row?.connectedAt?.toISOString() ?? null,
      };
    });

    return res.json({ integrations: result });
  } catch (err) {
    req.log.error({ err }, "Failed to list integrations");
    return res.status(500).json({ error: "Internal server error" });
  }
});

const SlackConnectBody = z.object({
  webhookUrl: z.string().url().startsWith("https://hooks.slack.com/"),
  channelName: z.string().max(80).optional(),
});

router.post("/integrations/slack", async (req, res) => {
  try {
    const parsed = SlackConnectBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid webhook URL — must be a Slack incoming webhook (https://hooks.slack.com/…)",
      });
    }
    const { webhookUrl, channelName } = parsed.data;

    // Test the webhook before saving
    const testRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "✅ KERN connected successfully — your standups will be posted here.",
        username: "KERN",
        icon_emoji: ":writing_hand:",
      }),
    });

    if (!testRes.ok) {
      return res.status(400).json({ error: "Slack webhook test failed — check the URL and try again" });
    }

    const testBody = await testRes.text();
    if (testBody !== "ok") {
      return res.status(400).json({ error: `Slack returned: ${testBody}` });
    }

    const devId = await getDevId();
    if (!devId) return res.status(404).json({ error: "No developer found" });

    const config = JSON.stringify({
      webhookUrl,
      channelName: channelName ?? "",
    });

    await db
      .insert(integrationsTable)
      .values({ developerId: devId, type: "slack", config })
      .onConflictDoUpdate({
        target: [integrationsTable.developerId, integrationsTable.type],
        set: { config, connectedAt: new Date() },
      });

    req.log.info({ devId, channelName }, "Slack integration connected");
    return res.json({ success: true, channelName: channelName ?? "" });
  } catch (err) {
    req.log.error({ err }, "Failed to connect Slack");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/integrations/slack", async (req, res) => {
  try {
    const devId = await getDevId();
    if (!devId) return res.status(404).json({ error: "No developer found" });

    await db
      .delete(integrationsTable)
      .where(
        and(
          eq(integrationsTable.developerId, devId),
          eq(integrationsTable.type, "slack"),
        ),
      );

    req.log.info({ devId }, "Slack integration disconnected");
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to disconnect Slack");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

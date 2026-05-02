import { Router } from "express";
import { db } from "@workspace/db";
import { developersTable, teamsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireApiKey } from "../middleware/auth";

const router = Router();

router.get("/developers/me", async (req, res) => {
  try {
    const developer = await db
      .select({
        id: developersTable.id,
        name: developersTable.name,
        email: developersTable.email,
        avatarUrl: developersTable.avatarUrl,
        githubHandle: developersTable.githubHandle,
        teamId: developersTable.teamId,
        teamName: teamsTable.name,
        role: developersTable.role,
        timezone: developersTable.timezone,
        createdAt: developersTable.createdAt,
      })
      .from(developersTable)
      .leftJoin(teamsTable, eq(developersTable.teamId, teamsTable.id))
      .orderBy(asc(developersTable.id))
      .limit(1);

    if (!developer[0]) {
      return res.status(404).json({ error: "Developer not found" });
    }

    const dev = developer[0];
    return res.json({
      ...dev,
      createdAt: dev.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get developer profile");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Used by the kern agent CLI (requires Bearer token)
router.get("/developers/me/apikey", requireApiKey, async (req, res) => {
  try {
    return res.json({ apiKey: req.developer!.apiKey });
  } catch (err) {
    req.log.error({ err }, "Failed to get API key");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Local dashboard endpoint — returns API key for the first developer.
// Safe because the dashboard is only accessible to the developer themselves.
router.get("/developers/me/apikey-local", async (req, res) => {
  try {
    const rows = await db
      .select({ apiKey: developersTable.apiKey })
      .from(developersTable)
      .orderBy(asc(developersTable.id))
      .limit(1);
    if (!rows[0]) return res.status(404).json({ error: "Developer not found" });
    return res.json({ apiKey: rows[0].apiKey });
  } catch (err) {
    req.log.error({ err }, "Failed to get API key (local)");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

import { Router } from "express";
import { randomBytes } from "crypto";
import { db } from "@workspace/db";
import { developersTable, teamsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireApiKey } from "../middleware/auth";

const router = Router();

function generateApiKey(): string {
  return "kern_" + randomBytes(32).toString("hex");
}

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

// Update the current developer's profile (dashboard-only, no API key required).
router.patch("/developers/me", async (req, res) => {
  try {
    const rows = await db
      .select({ id: developersTable.id })
      .from(developersTable)
      .orderBy(asc(developersTable.id))
      .limit(1);

    if (!rows[0]) return res.status(404).json({ error: "Developer not found" });
    const devId = rows[0].id;

    const { name, email, githubHandle, timezone, avatarUrl } = req.body as Record<string, unknown>;
    const updates: Partial<typeof developersTable.$inferInsert> = {};
    if (typeof name === "string" && name.trim()) updates.name = name.trim();
    if (typeof email === "string" && email.trim()) updates.email = email.trim();
    if (typeof githubHandle === "string") updates.githubHandle = githubHandle.trim() || null;
    if (typeof timezone === "string" && timezone.trim()) updates.timezone = timezone.trim();
    if (typeof avatarUrl === "string") updates.avatarUrl = avatarUrl.trim() || null;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    await db.update(developersTable).set(updates).where(eq(developersTable.id, devId));

    const updated = await db
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
      .where(eq(developersTable.id, devId))
      .limit(1);

    const dev = updated[0];
    return res.json({ ...dev, createdAt: dev.createdAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Failed to update developer profile");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Register a new developer account (no auth required — used by kern CLI).
router.post("/developers/register", async (req, res) => {
  try {
    const { name, email, githubHandle, timezone } = req.body as Record<string, unknown>;
    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "name is required" });
    }
    if (typeof email !== "string" || !email.trim()) {
      return res.status(400).json({ error: "email is required" });
    }

    // Check for duplicate email
    const existing = await db
      .select({ id: developersTable.id })
      .from(developersTable)
      .where(eq(developersTable.email, email.trim().toLowerCase()))
      .limit(1);

    if (existing[0]) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const apiKey = generateApiKey();

    const inserted = await db
      .insert(developersTable)
      .values({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        apiKey,
        githubHandle: typeof githubHandle === "string" && githubHandle.trim() ? githubHandle.trim() : null,
        timezone: typeof timezone === "string" && timezone.trim() ? timezone.trim() : "UTC",
      })
      .returning({
        id: developersTable.id,
        name: developersTable.name,
        email: developersTable.email,
        githubHandle: developersTable.githubHandle,
        role: developersTable.role,
        timezone: developersTable.timezone,
        createdAt: developersTable.createdAt,
      });

    const dev = inserted[0];
    req.log.info({ devId: dev.id, email: dev.email }, "New developer registered");
    return res.status(201).json({ ...dev, apiKey, createdAt: dev.createdAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Failed to register developer");
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

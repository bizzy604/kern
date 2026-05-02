import { Router } from "express";
import { randomBytes } from "crypto";
import { db } from "@workspace/db";
import { developersTable, teamsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireApiKey } from "../middleware/auth";
import { requireSession } from "../middleware/session";

const router = Router();

function generateApiKey(): string {
  return "kern_" + randomBytes(32).toString("hex");
}

// Returns profile of the currently logged-in developer (uses session cookie).
router.get("/developers/me", requireSession, async (req, res) => {
  try {
    const dev = req.developer!;
    const row = await db
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
      .where(eq(developersTable.id, dev.id))
      .limit(1);

    if (!row[0]) return res.status(404).json({ error: "Developer not found" });
    return res.json({ ...row[0], createdAt: row[0].createdAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Failed to get developer profile");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Update the current developer's profile.
router.patch("/developers/me", requireSession, async (req, res) => {
  try {
    const devId = req.developer!.id;
    const { name, email, githubHandle, timezone, avatarUrl } = req.body as Record<string, unknown>;
    const updates: Partial<typeof developersTable.$inferInsert> = {};
    if (typeof name === "string" && name.trim()) updates.name = name.trim();
    if (typeof email === "string" && email.trim()) updates.email = email.trim();
    if (typeof githubHandle === "string") updates.githubHandle = githubHandle.trim() || null;
    if (typeof timezone === "string" && timezone.trim()) updates.timezone = timezone.trim();
    if (typeof avatarUrl === "string") updates.avatarUrl = avatarUrl.trim() || null;

    if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No valid fields to update" });

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

// Register a new developer account (public — no auth required).
// Accepts optional teamCode to auto-join a team on registration.
router.post("/developers/register", async (req, res) => {
  try {
    const { name, email, githubHandle, timezone, teamCode } = req.body as Record<string, unknown>;
    if (typeof name !== "string" || !name.trim()) return res.status(400).json({ error: "name is required" });
    if (typeof email !== "string" || !email.trim()) return res.status(400).json({ error: "email is required" });

    const existing = await db
      .select({ id: developersTable.id })
      .from(developersTable)
      .where(eq(developersTable.email, email.trim().toLowerCase()))
      .limit(1);

    if (existing[0]) return res.status(409).json({ error: "Email already registered" });

    // Resolve team from invite code
    let resolvedTeamId: number | null = null;
    if (typeof teamCode === "string" && teamCode.trim()) {
      const team = await db
        .select({ id: teamsTable.id, name: teamsTable.name })
        .from(teamsTable)
        .where(eq(teamsTable.inviteCode, teamCode.trim().toUpperCase()))
        .limit(1);

      if (!team[0]) {
        return res.status(400).json({ error: "Invalid team invite code — ask your team admin to share the correct code from Settings." });
      }
      resolvedTeamId = team[0].id;
    }

    const apiKey = generateApiKey();
    const inserted = await db.insert(developersTable).values({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      apiKey,
      githubHandle: typeof githubHandle === "string" && githubHandle.trim() ? githubHandle.trim() : null,
      timezone: typeof timezone === "string" && timezone.trim() ? timezone.trim() : "UTC",
      teamId: resolvedTeamId,
    }).returning({
      id: developersTable.id,
      name: developersTable.name,
      email: developersTable.email,
      githubHandle: developersTable.githubHandle,
      role: developersTable.role,
      timezone: developersTable.timezone,
      teamId: developersTable.teamId,
      createdAt: developersTable.createdAt,
    });

    const dev = inserted[0];

    // Fetch team name for response
    let teamName: string | null = null;
    if (dev.teamId) {
      const t = await db.select({ name: teamsTable.name }).from(teamsTable).where(eq(teamsTable.id, dev.teamId)).limit(1);
      teamName = t[0]?.name ?? null;
    }

    req.log.info({ devId: dev.id, email: dev.email, teamId: dev.teamId }, "New developer registered");
    return res.status(201).json({ ...dev, apiKey, teamName, createdAt: dev.createdAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Failed to register developer");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Used by the kern agent CLI (requires Bearer token).
router.get("/developers/me/apikey", requireApiKey, async (req, res) => {
  try {
    return res.json({ apiKey: req.developer!.apiKey });
  } catch (err) {
    req.log.error({ err }, "Failed to get API key");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Returns the API key for the logged-in session (used by Settings page).
router.get("/developers/me/apikey-local", requireSession, async (req, res) => {
  try {
    return res.json({ apiKey: req.developer!.apiKey });
  } catch (err) {
    req.log.error({ err }, "Failed to get API key (local)");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

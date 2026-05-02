import { Router } from "express";
import { db } from "@workspace/db";
import { developersTable, teamsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const COOKIE_NAME = "kern_session";

function cookieOpts(maxAge?: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env["NODE_ENV"] === "production",
    signed: true,
    ...(maxAge !== undefined ? { maxAge } : {}),
  };
}

const router = Router();

router.post("/auth/login", async (req, res) => {
  try {
    const { apiKey } = req.body as { apiKey?: string };
    if (!apiKey?.trim()) {
      return res.status(400).json({ error: "API key is required" });
    }

    const rows = await db
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
      .where(eq(developersTable.apiKey, apiKey.trim()))
      .limit(1);

    if (!rows[0]) {
      return res.status(401).json({ error: "Invalid API key — check Settings → CLI Setup on your dashboard, or run kern register." });
    }

    const dev = rows[0];
    res.cookie(COOKIE_NAME, apiKey.trim(), cookieOpts(30 * 24 * 60 * 60 * 1000));
    req.log.info({ devId: dev.id }, "Developer logged in");
    return res.json({ developer: { ...dev, createdAt: dev.createdAt.toISOString() } });
  } catch (err) {
    req.log.error({ err }, "Login failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/auth/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, cookieOpts());
  return res.json({ success: true });
});

router.get("/auth/me", async (req, res) => {
  const apiKey = (req.signedCookies as Record<string, string | false>)[COOKIE_NAME];
  if (!apiKey) {
    return res.json({ developer: null });
  }
  try {
    const rows = await db
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
      .where(eq(developersTable.apiKey, String(apiKey)))
      .limit(1);

    if (!rows[0]) {
      res.clearCookie(COOKIE_NAME, cookieOpts());
      return res.json({ developer: null });
    }

    const dev = rows[0];
    return res.json({ developer: { ...dev, createdAt: dev.createdAt.toISOString() } });
  } catch (err) {
    req.log.error({ err }, "Auth check failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

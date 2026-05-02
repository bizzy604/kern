import { Router } from "express";
import { db } from "@workspace/db";
import { developersTable, teamsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

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

export default router;

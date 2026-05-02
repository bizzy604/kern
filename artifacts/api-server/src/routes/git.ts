import { Router } from "express";
import { db } from "@workspace/db";
import { gitCommitsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireApiKey } from "../middleware/auth";
import { requireSession } from "../middleware/session";

const router = Router();

function clamp(val: unknown, min: number, max: number, def: number): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(Math.round(n), min), max);
}

function formatCommit(c: typeof gitCommitsTable.$inferSelect) {
  return { ...c, committedAt: c.committedAt.toISOString() };
}

router.get("/git/commits", requireSession, async (req, res) => {
  try {
    const limit = clamp(req.query.limit, 1, 100, 20);
    const offset = clamp(req.query.offset, 0, 100000, 0);
    const devId = req.developer!.id;

    const [commits, all] = await Promise.all([
      db.select().from(gitCommitsTable).where(eq(gitCommitsTable.developerId, devId))
        .orderBy(desc(gitCommitsTable.committedAt)).limit(limit).offset(offset),
      db.select().from(gitCommitsTable).where(eq(gitCommitsTable.developerId, devId)),
    ]);

    const stats = all.reduce(
      (acc, c) => ({
        totalCommits: acc.totalCommits + 1,
        totalFilesChanged: acc.totalFilesChanged + c.filesChanged,
        totalInsertions: acc.totalInsertions + c.insertions,
        totalDeletions: acc.totalDeletions + c.deletions,
      }),
      { totalCommits: 0, totalFilesChanged: 0, totalInsertions: 0, totalDeletions: 0 },
    );

    return res.json({ commits: commits.map(formatCommit), total: all.length, stats });
  } catch (err) {
    req.log.error({ err }, "Failed to list git commits");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/git/ingest", requireApiKey, async (req, res) => {
  try {
    const devId = req.developer!.id;
    const rawCommits = req.body?.gitCommits;
    if (!Array.isArray(rawCommits)) return res.json({ gitAccepted: 0 });

    let accepted = 0;
    for (const c of rawCommits) {
      if (!c?.hash || typeof c.hash !== "string") continue;
      try {
        await db.insert(gitCommitsTable).values({
          developerId: devId,
          hash: String(c.hash),
          shortHash: String(c.shortHash ?? c.hash.slice(0, 7)),
          branch: String(c.branch ?? ""),
          message: String(c.message ?? ""),
          author: String(c.author ?? ""),
          filesChanged: Number(c.filesChanged ?? 0),
          insertions: Number(c.insertions ?? 0),
          deletions: Number(c.deletions ?? 0),
          project: String(c.project ?? ""),
          committedAt: c.committedAt ? new Date(c.committedAt) : new Date(),
        }).onConflictDoNothing();
        accepted++;
      } catch (_) { /* skip */ }
    }

    return res.json({ gitAccepted: accepted });
  } catch (err) {
    req.log.error({ err }, "Failed to ingest git commits");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

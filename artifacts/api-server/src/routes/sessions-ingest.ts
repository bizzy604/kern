import { Router } from "express";
import { db } from "@workspace/db";
import { workSessionsTable, gitCommitsTable } from "@workspace/db";
import { requireApiKey } from "../middleware/auth";

const VALID_ACTIVITY_TYPES = new Set([
  "CODING", "DEBUGGING", "TESTING", "DEVOPS", "RESEARCHING", "IDLE",
]);

const router = Router();

router.post("/sessions/ingest", requireApiKey, async (req, res) => {
  try {
    const devId = req.developer!.id;
    const body = req.body as {
      sessions?: unknown[];
      gitCommits?: unknown[];
    };

    const rawSessions = Array.isArray(body?.sessions) ? body.sessions : [];
    const rawCommits = Array.isArray(body?.gitCommits) ? body.gitCommits : [];

    let sessionAccepted = 0;
    let gitAccepted = 0;

    for (const s of rawSessions) {
      const session = s as Record<string, unknown>;
      const activityType = String(session.activityType ?? "CODING").toUpperCase();
      if (!VALID_ACTIVITY_TYPES.has(activityType)) continue;

      const startedAt = session.startedAt ? new Date(String(session.startedAt)) : null;
      const endedAt = session.endedAt ? new Date(String(session.endedAt)) : null;
      if (!startedAt || !endedAt || isNaN(startedAt.getTime()) || isNaN(endedAt.getTime())) continue;

      const durationMinutes = Number(session.durationMinutes ?? 0);
      if (durationMinutes < 1) continue;

      try {
        await db.insert(workSessionsTable).values({
          developerId: devId,
          activityType: activityType as "CODING" | "DEBUGGING" | "TESTING" | "DEVOPS" | "RESEARCHING" | "IDLE",
          inferredTask: session.inferredTask ? String(session.inferredTask) : null,
          project: session.project ? String(session.project) : null,
          language: session.language ? String(session.language) : null,
          durationMinutes,
          commandCount: Number(session.commandCount ?? 0),
          startedAt,
          endedAt,
          confidence: Number(session.confidence ?? 0.9),
        });
        sessionAccepted++;
      } catch {
        // skip invalid rows
      }
    }

    for (const c of rawCommits) {
      const commit = c as Record<string, unknown>;
      if (!commit?.hash || typeof commit.hash !== "string") continue;

      try {
        await db
          .insert(gitCommitsTable)
          .values({
            developerId: devId,
            hash: String(commit.hash),
            shortHash: String(commit.shortHash ?? commit.hash.slice(0, 7)),
            branch: String(commit.branch ?? ""),
            message: String(commit.message ?? ""),
            author: String(commit.author ?? ""),
            filesChanged: Number(commit.filesChanged ?? 0),
            insertions: Number(commit.insertions ?? 0),
            deletions: Number(commit.deletions ?? 0),
            project: String(commit.project ?? ""),
            committedAt: commit.committedAt ? new Date(String(commit.committedAt)) : new Date(),
          })
          .onConflictDoNothing();
        gitAccepted++;
      } catch {
        // skip duplicates / invalid rows
      }
    }

    req.log.info({ devId, sessionAccepted, gitAccepted }, "Ingest completed");
    return res.json({ accepted: sessionAccepted, gitAccepted });
  } catch (err) {
    req.log.error({ err }, "Failed to ingest sessions");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

import { Router } from "express";
import { db } from "@workspace/db";
import {
  standupsTable,
  developersTable,
  workSessionsTable,
  gitCommitsTable,
} from "@workspace/db";
import { eq, and, gte, lte, desc, asc } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router = Router();

router.post("/standups/generate", async (req, res) => {
  try {
    const developer = await db.select().from(developersTable).orderBy(asc(developersTable.id)).limit(1);
    if (!developer[0]) return res.status(404).json({ error: "No developer found" });
    const dev = developer[0];

    const today = new Date().toISOString().split("T")[0];

    // Gather yesterday's sessions (the most useful for a morning standup)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStart = new Date(yesterday.toISOString().split("T")[0] + "T00:00:00.000Z");
    const yEnd = new Date(yesterday.toISOString().split("T")[0] + "T23:59:59.999Z");

    // Also grab today's sessions so far
    const tStart = new Date(today + "T00:00:00.000Z");
    const tEnd = new Date(today + "T23:59:59.999Z");

    const [yesterdaySessions, todaySessions, recentCommits] = await Promise.all([
      db
        .select()
        .from(workSessionsTable)
        .where(
          and(
            eq(workSessionsTable.developerId, dev.id),
            gte(workSessionsTable.startedAt, yStart),
            lte(workSessionsTable.startedAt, yEnd),
          ),
        )
        .orderBy(desc(workSessionsTable.startedAt))
        .limit(20),
      db
        .select()
        .from(workSessionsTable)
        .where(
          and(
            eq(workSessionsTable.developerId, dev.id),
            gte(workSessionsTable.startedAt, tStart),
            lte(workSessionsTable.startedAt, tEnd),
          ),
        )
        .orderBy(desc(workSessionsTable.startedAt))
        .limit(10),
      db
        .select()
        .from(gitCommitsTable)
        .where(eq(gitCommitsTable.developerId, dev.id))
        .orderBy(desc(gitCommitsTable.committedAt))
        .limit(10),
    ]);

    const allSessions = [...yesterdaySessions, ...todaySessions];

    // Summarise sessions into readable text
    const sessionSummary = allSessions.length
      ? allSessions
          .map(
            s =>
              `- ${s.activityType} on ${s.project || "unknown project"} for ${s.durationMinutes}m` +
              (s.inferredTask ? `: "${s.inferredTask}"` : "") +
              (s.language ? ` [${s.language}]` : ""),
          )
          .join("\n")
      : "No sessions recorded.";

    const commitSummary = recentCommits.length
      ? recentCommits
          .map(
            c =>
              `- [${c.shortHash}] ${c.branch}: ${c.message}` +
              ` (+${c.insertions}/-${c.deletions} in ${c.filesChanged} files, project: ${c.project || "unknown"})`,
          )
          .join("\n")
      : "No recent commits.";

    // Total time stats
    const totalMins = allSessions.reduce((sum, s) => sum + s.durationMinutes, 0);
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

    const prompt = `You are a developer assistant that writes concise, honest daily standups in first person.

Developer: ${dev.name}
Date: ${today}

Recent work sessions (last 24-48h):
${sessionSummary}

Recent git commits:
${commitSummary}

Total active coding time: ${timeStr}

Write a standup update in this exact format:
**Yesterday:** [what was worked on, referencing actual task names and projects]
**Today:** [what to continue or tackle next, based on patterns in the sessions]
**Blockers:** [any blockers, or "None" if nothing obvious]

Rules:
- Keep it concise (3-5 sentences total)
- Use natural developer language, not corporate speak
- Reference actual project names and task descriptions from the data
- Don't mention time durations explicitly
- If there are commits, mention the key ones naturally
- Write as ${dev.name} speaking in first person`;

    // Set up SSE for streaming
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let fullContent = "";

    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        fullContent += event.delta.text;
        res.write(`data: ${JSON.stringify({ content: event.delta.text })}\n\n`);
      }
    }

    // Upsert the standup for today
    const existing = await db
      .select()
      .from(standupsTable)
      .where(
        and(eq(standupsTable.developerId, dev.id), eq(standupsTable.date, today)),
      )
      .limit(1);

    let savedId: number;
    if (existing[0]) {
      const updated = await db
        .update(standupsTable)
        .set({ content: fullContent, source: "AI", generatedAt: new Date() })
        .where(eq(standupsTable.id, existing[0].id))
        .returning({ id: standupsTable.id });
      savedId = updated[0].id;
    } else {
      const inserted = await db
        .insert(standupsTable)
        .values({
          developerId: dev.id,
          date: today,
          content: fullContent,
          source: "AI",
          postedToSlack: false,
        })
        .returning({ id: standupsTable.id });
      savedId = inserted[0].id;
    }

    res.write(`data: ${JSON.stringify({ done: true, standupId: savedId })}\n\n`);
    res.end();
  } catch (err) {
    req.log.error({ err }, "Failed to generate standup");
    if (!res.headersSent) {
      return res.status(500).json({ error: "Failed to generate standup" });
    }
    res.write(`data: ${JSON.stringify({ error: "Generation failed" })}\n\n`);
    res.end();
  }
});

export default router;

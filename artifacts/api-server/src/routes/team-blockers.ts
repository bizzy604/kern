import { Router } from "express";
import { db } from "@workspace/db";
import { developersTable, teamsTable, workSessionsTable, gitCommitsTable, standupsTable } from "@workspace/db";
import { eq, and, gte, desc } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { requireSession } from "../middleware/session";

const router = Router();

router.post("/team/blockers/analyze", requireSession, async (req, res) => {
  try {
    const me = req.developer!;

    // Scope to the logged-in developer's team only
    const developers = await db.select().from(developersTable)
      .where(
        me.teamId
          ? eq(developersTable.teamId, me.teamId)
          : eq(developersTable.id, me.id),
      );

    if (developers.length === 0) return res.status(404).json({ error: "No developers found" });

    const teamName = me.teamId
      ? (await db.select({ name: teamsTable.name }).from(teamsTable).where(eq(teamsTable.id, me.teamId)).limit(1))[0]?.name ?? "Engineering Team"
      : "Solo";

    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const todayStr = now.toISOString().split("T")[0]!;

    const devProfiles = await Promise.all(
      developers.map(async dev => {
        const [recentSessions, recentCommits, todayStandup] = await Promise.all([
          db.select().from(workSessionsTable)
            .where(and(eq(workSessionsTable.developerId, dev.id), gte(workSessionsTable.startedAt, twoDaysAgo)))
            .orderBy(desc(workSessionsTable.startedAt)).limit(15),
          db.select().from(gitCommitsTable)
            .where(and(eq(gitCommitsTable.developerId, dev.id), gte(gitCommitsTable.committedAt, sevenDaysAgo)))
            .orderBy(desc(gitCommitsTable.committedAt)).limit(10),
          db.select().from(standupsTable)
            .where(and(eq(standupsTable.developerId, dev.id), eq(standupsTable.date, todayStr))).limit(1),
        ]);

        const totalMins = recentSessions.reduce((sum, s) => sum + s.durationMinutes, 0);
        const debugMins = recentSessions.filter(s => s.activityType === "DEBUGGING").reduce((sum, s) => sum + s.durationMinutes, 0);

        return {
          name: dev.name,
          isMe: dev.id === me.id,
          role: dev.role,
          currentActivity: recentSessions[0]?.activityType ?? "IDLE",
          currentProject: recentSessions[0]?.project ?? null,
          lastSeen: recentSessions[0]?.endedAt?.toISOString() ?? null,
          totalMins,
          debugMins,
          standup: todayStandup[0]?.content ?? null,
          sessionSummary: recentSessions.length
            ? recentSessions.map(s =>
                `  - ${s.activityType} on "${s.project || "?"}" for ${s.durationMinutes}m` +
                (s.inferredTask ? `: ${s.inferredTask}` : ""),
              ).join("\n")
            : "  No sessions in the last 48h",
          commitSummary: recentCommits.length
            ? recentCommits.map(c =>
                `  - [${c.shortHash}] ${c.branch}: "${c.message}" (+${c.insertions}/-${c.deletions}, ${c.project || "?"})`,
              ).join("\n")
            : "  No recent commits",
        };
      }),
    );

    const profilesText = devProfiles.map(d => `
### ${d.name}${d.isMe ? " (you)" : ""} (${d.role})
- Status: ${d.currentActivity}${d.currentProject ? ` on "${d.currentProject}"` : ""}
- Last seen: ${d.lastSeen ? new Date(d.lastSeen).toLocaleString() : "unknown"}
- Time (last 48h): ${Math.floor(d.totalMins / 60)}h ${d.totalMins % 60}m (${d.debugMins}m debugging)
- Standup: ${d.standup ? `"${d.standup.slice(0, 300)}…"` : "Not generated yet"}
- Recent sessions:
${d.sessionSummary}
- Recent commits:
${d.commitSummary}`).join("\n");

    const prompt = `You are an engineering team intelligence system for ${teamName}. Analyze each developer's recent activity and identify:
1. Developers who appear to be blocked or struggling
2. Risk areas where someone might fall behind
3. Opportunities for teammates to jump in and help

Today's date: ${todayStr}

Team activity data:
${profilesText}

Produce a structured team intelligence report. For each developer, assess their status:
- 🔴 BLOCKED — clear signs of being stuck (extended debugging, repeated fix commits, no progress, standup says blocked)
- 🟡 AT RISK — low activity, unusual patterns, potential issue brewing
- 🟢 ON TRACK — normal productive activity

Format for EACH developer:

### [emoji] [Developer Name] — [STATUS]
**What they're working on:** [brief]
**Signal:** [specific evidence — commit messages, session patterns]
**Suggested action for teammates:** [concrete suggestion]

---

After all individual sections, add:

## Quick Wins for the Team
[2-3 bullet points: most impactful collaboration moves right now]

Be brief and direct. Reference actual project names and commit messages.`;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        res.write(`data: ${JSON.stringify({ content: event.delta.text })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    req.log.error({ err }, "Failed to analyze team blockers");
    if (!res.headersSent) return res.status(500).json({ error: "Internal server error" });
    res.write(`data: ${JSON.stringify({ error: "Analysis failed" })}\n\n`);
    res.end();
  }
});

export default router;

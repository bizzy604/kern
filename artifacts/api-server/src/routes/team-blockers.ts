import { Router } from "express";
import { db } from "@workspace/db";
import { developersTable, teamsTable, workSessionsTable, gitCommitsTable, standupsTable } from "@workspace/db";
import { eq, and, gte, desc } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router = Router();

router.post("/team/blockers/analyze", async (req, res) => {
  try {
    const developers = await db.select().from(developersTable);
    if (developers.length === 0) return res.status(404).json({ error: "No developers found" });

    const team = await db.select().from(teamsTable).limit(1);
    const teamName = team[0]?.name ?? "Engineering Team";

    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const todayStr = now.toISOString().split("T")[0]!;

    const devProfiles = await Promise.all(
      developers.map(async dev => {
        const [recentSessions, recentCommits, todayStandup] = await Promise.all([
          db
            .select()
            .from(workSessionsTable)
            .where(and(eq(workSessionsTable.developerId, dev.id), gte(workSessionsTable.startedAt, twoDaysAgo)))
            .orderBy(desc(workSessionsTable.startedAt))
            .limit(15),
          db
            .select()
            .from(gitCommitsTable)
            .where(and(eq(gitCommitsTable.developerId, dev.id), gte(gitCommitsTable.committedAt, sevenDaysAgo)))
            .orderBy(desc(gitCommitsTable.committedAt))
            .limit(10),
          db
            .select()
            .from(standupsTable)
            .where(and(eq(standupsTable.developerId, dev.id), eq(standupsTable.date, todayStr)))
            .limit(1),
        ]);

        const totalMins = recentSessions.reduce((sum, s) => sum + s.durationMinutes, 0);
        const debugMins = recentSessions.filter(s => s.activityType === "DEBUGGING").reduce((sum, s) => sum + s.durationMinutes, 0);
        const lastSeen = recentSessions[0]?.endedAt;
        const currentActivity = recentSessions[0]?.activityType;
        const currentProject = recentSessions[0]?.project;

        const sessionSummary = recentSessions.length
          ? recentSessions
              .map(s => `  - ${s.activityType} on "${s.project || "?"}" for ${s.durationMinutes}m` +
                (s.inferredTask ? `: ${s.inferredTask}` : ""))
              .join("\n")
          : "  No sessions in the last 48h";

        const commitSummary = recentCommits.length
          ? recentCommits
              .map(c => `  - [${c.shortHash}] ${c.branch}: "${c.message}" (+${c.insertions}/-${c.deletions}, ${c.project || "?"})`)
              .join("\n")
          : "  No recent commits";

        return {
          name: dev.name,
          role: dev.role,
          currentActivity: currentActivity ?? "IDLE",
          currentProject: currentProject ?? null,
          lastSeen: lastSeen?.toISOString() ?? null,
          totalMins,
          debugMins,
          standup: todayStandup[0]?.content ?? null,
          sessionSummary,
          commitSummary,
        };
      }),
    );

    const profilesText = devProfiles.map(d => `
### ${d.name} (${d.role})
- Current status: ${d.currentActivity}${d.currentProject ? ` on "${d.currentProject}"` : ""}
- Last seen: ${d.lastSeen ? new Date(d.lastSeen).toLocaleString() : "unknown"}
- Total time (last 48h): ${Math.floor(d.totalMins / 60)}h ${d.totalMins % 60}m (${d.debugMins}m debugging)
- Today's standup: ${d.standup ? `"${d.standup.slice(0, 300)}…"` : "Not generated yet"}
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

Produce a structured team intelligence report. For each developer, assess their status. Use these categories:
- 🔴 BLOCKED — clear signs of being stuck (extended debugging, repeated fix commits, no progress, standup says blocked)
- 🟡 AT RISK — low activity, unusual patterns, potential issue brewing
- 🟢 ON TRACK — normal productive activity

Format your output like this for EACH developer:

### [status emoji] [Developer Name] — [STATUS LABEL]
**What they're working on:** [brief description]
**Signal:** [specific evidence from the data — commit messages, session patterns, etc.]
**Suggested action for teammates:** [concrete, specific suggestion — what to offer, where Kevin's skills apply]

---

After all individual sections, add:

## Quick Wins for the Team
[2-3 bullet points: the most impactful collaboration moves right now]

Keep it brief and direct. Focus on actionable intelligence, not vague observations. Reference actual project names and commit messages.`;

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

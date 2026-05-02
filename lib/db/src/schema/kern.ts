import { pgTable, text, integer, serial, boolean, real, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const roleEnum = pgEnum("developer_role", ["DEVELOPER", "TEAM_LEAD", "ADMIN"]);
export const activityTypeEnum = pgEnum("activity_type", ["CODING", "DEBUGGING", "TESTING", "DEVOPS", "RESEARCHING", "IDLE"]);
export const standupSourceEnum = pgEnum("standup_source", ["AI", "MANUAL"]);

export const teamsTable = pgTable("teams", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const developersTable = pgTable("developers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  avatarUrl: text("avatar_url"),
  githubHandle: text("github_handle"),
  teamId: integer("team_id").references(() => teamsTable.id),
  role: roleEnum("role").default("DEVELOPER").notNull(),
  timezone: text("timezone").default("UTC").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const workSessionsTable = pgTable("work_sessions", {
  id: serial("id").primaryKey(),
  developerId: integer("developer_id").notNull().references(() => developersTable.id),
  activityType: activityTypeEnum("activity_type").notNull(),
  inferredTask: text("inferred_task"),
  project: text("project"),
  language: text("language"),
  durationMinutes: integer("duration_minutes").notNull(),
  commandCount: integer("command_count").notNull().default(0),
  startedAt: timestamp("started_at").notNull(),
  endedAt: timestamp("ended_at").notNull(),
  confidence: real("confidence").notNull().default(0.9),
});

export const standupsTable = pgTable("standups", {
  id: serial("id").primaryKey(),
  developerId: integer("developer_id").notNull().references(() => developersTable.id),
  date: text("date").notNull(),
  content: text("content").notNull(),
  source: standupSourceEnum("source").default("AI").notNull(),
  postedToSlack: boolean("posted_to_slack").default(false).notNull(),
  postedAt: timestamp("posted_at"),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
});

export const insertTeamSchema = createInsertSchema(teamsTable).omit({ id: true, createdAt: true });
export const insertDeveloperSchema = createInsertSchema(developersTable).omit({ id: true, createdAt: true });
export const insertWorkSessionSchema = createInsertSchema(workSessionsTable).omit({ id: true });
export const insertStandupSchema = createInsertSchema(standupsTable).omit({ id: true, generatedAt: true });

export type Team = typeof teamsTable.$inferSelect;
export type Developer = typeof developersTable.$inferSelect;
export type WorkSession = typeof workSessionsTable.$inferSelect;
export type Standup = typeof standupsTable.$inferSelect;

export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type InsertDeveloper = z.infer<typeof insertDeveloperSchema>;
export type InsertWorkSession = z.infer<typeof insertWorkSessionSchema>;
export type InsertStandup = z.infer<typeof insertStandupSchema>;

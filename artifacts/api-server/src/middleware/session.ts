import { type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { developersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function requireSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const apiKey = (req.signedCookies as Record<string, string | false>)[
    "kern_session"
  ];
  if (!apiKey) {
    res.status(401).json({ error: "Not authenticated", code: "UNAUTHENTICATED" });
    return;
  }
  try {
    const rows = await db
      .select()
      .from(developersTable)
      .where(eq(developersTable.apiKey, String(apiKey)))
      .limit(1);
    if (!rows[0]) {
      res.clearCookie("kern_session", { httpOnly: true, signed: true });
      res.status(401).json({ error: "Invalid session", code: "UNAUTHENTICATED" });
      return;
    }
    req.developer = rows[0];
    next();
  } catch (err) {
    req.log.error({ err }, "Session middleware DB error");
    res.status(500).json({ error: "Internal server error" });
  }
}

import { type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { developersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function requireApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers["authorization"];
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = header.slice(7).trim();
  if (!token) {
    res.status(401).json({ error: "Empty API key" });
    return;
  }

  try {
    const rows = await db
      .select()
      .from(developersTable)
      .where(eq(developersTable.apiKey, token))
      .limit(1);

    if (!rows[0]) {
      res.status(401).json({ error: "Invalid API key" });
      return;
    }

    req.developer = rows[0];
    next();
  } catch (err) {
    req.log.error({ err }, "Auth middleware DB error");
    res.status(500).json({ error: "Internal server error" });
  }
}

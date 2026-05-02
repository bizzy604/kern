import type { Developer } from "@workspace/db";

declare global {
  namespace Express {
    interface Request {
      developer?: Developer;
    }
  }
}

export {};

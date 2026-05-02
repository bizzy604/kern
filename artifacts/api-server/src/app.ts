import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { createGunzip } from "zlib";
import router from "./routes";
import { logger } from "./lib/logger";

function decompressGzip(req: Request, res: Response, next: NextFunction): void {
  if (req.headers["content-encoding"] !== "gzip") {
    return next();
  }
  const gunzip = createGunzip();
  const chunks: Buffer[] = [];
  req.pipe(gunzip);
  gunzip.on("data", (chunk: Buffer) => chunks.push(chunk));
  gunzip.on("end", () => {
    try {
      req.body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      req.body = {};
    }
    next();
  });
  gunzip.on("error", () => {
    res.status(400).json({ error: "Invalid gzip payload" });
  });
}

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(decompressGzip);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;

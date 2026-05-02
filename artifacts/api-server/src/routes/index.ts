import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import developersRouter from "./developers";
import sessionsRouter from "./sessions";
import standupsRouter from "./standups";
import dashboardRouter from "./dashboard";
import teamRouter from "./team";
import gitRouter from "./git";
import standupsGenerateRouter from "./standups-generate";
import sessionsIngestRouter from "./sessions-ingest";
import integrationsRouter from "./integrations";
import teamBlockersRouter from "./team-blockers";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(developersRouter);
router.use(sessionsRouter);
router.use(sessionsIngestRouter);
router.use(standupsRouter);
router.use(standupsGenerateRouter);
router.use(dashboardRouter);
router.use(teamRouter);
router.use(gitRouter);
router.use(integrationsRouter);
router.use(teamBlockersRouter);

export default router;

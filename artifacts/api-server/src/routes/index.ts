import { Router, type IRouter } from "express";
import healthRouter from "./health";
import developersRouter from "./developers";
import sessionsRouter from "./sessions";
import standupsRouter from "./standups";
import dashboardRouter from "./dashboard";
import teamRouter from "./team";

const router: IRouter = Router();

router.use(healthRouter);
router.use(developersRouter);
router.use(sessionsRouter);
router.use(standupsRouter);
router.use(dashboardRouter);
router.use(teamRouter);

export default router;

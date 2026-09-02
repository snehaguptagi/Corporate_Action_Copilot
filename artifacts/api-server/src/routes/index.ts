import { Router, type IRouter } from "express";
import authRouter from "./auth";
import corporateActionsRouter from "./corporate-actions";
import healthRouter from "./health";
import storageRouter from "./storage";
import arkaDeskRouter from "./arka-desk";
import liveDiscoveryRouter from "./live-discovery";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(storageRouter);
router.use(corporateActionsRouter);
router.use(arkaDeskRouter);
router.use(liveDiscoveryRouter);

export default router;

import { Router, type IRouter } from "express";
import authRouter from "./auth";
import corporateActionsRouter from "./corporate-actions";
import healthRouter from "./health";
import storageRouter from "./storage";
import arkaDeskRouter from "./arka-desk";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(storageRouter);
router.use(corporateActionsRouter);
router.use(arkaDeskRouter);

export default router;

import { Router, type IRouter } from "express";
import authRouter from "./auth";
import corporateActionsRouter from "./corporate-actions";
import healthRouter from "./health";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(storageRouter);
router.use(corporateActionsRouter);

export default router;

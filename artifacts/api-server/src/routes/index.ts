import { Router, type IRouter } from "express";
import authRouter from "./auth";
import corporateActionsRouter from "./corporate-actions";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(corporateActionsRouter);

export default router;

import { Router, type IRouter } from "express";
import corporateActionsRouter from "./corporate-actions";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(corporateActionsRouter);

export default router;

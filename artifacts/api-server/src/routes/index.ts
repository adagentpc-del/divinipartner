import { Router, type IRouter } from "express";
import healthRouter from "./health";
import partnersRouter from "./partners";
import publicPortalRouter from "./publicPortal";
import requestsRouter from "./requests";
import pricingRouter from "./pricing";
import dashboardRouter from "./dashboard";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(partnersRouter);
router.use(publicPortalRouter);
router.use(requestsRouter);
router.use(pricingRouter);
router.use(dashboardRouter);
router.use(storageRouter);

export default router;

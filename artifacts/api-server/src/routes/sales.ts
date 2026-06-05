import { Router, type IRouter } from "express";
import { requireSalesUser, getSalesUser } from "../middlewares/requireSalesUser.js";

const router: IRouter = Router();

// Who am I in the sales module? Drives role-aware UI (rep vs super admin) and
// row-level scoping on the client. 403 means the signed-in user has no sales
// access at all.
router.get("/sales/me", requireSalesUser(), (req, res) => {
  const user = getSalesUser(res);
  res.json(user);
});

export default router;

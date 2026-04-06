import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, pricingRulesTable } from "@workspace/db";
import {
  ListPricingRulesQueryParams,
  CreatePricingRuleBody,
  UpdatePricingRuleParams,
  UpdatePricingRuleBody,
  DeletePricingRuleParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/pricing-rules", async (req, res): Promise<void> => {
  const params = ListPricingRulesQueryParams.safeParse(req.query);
  const conditions: any[] = [];

  if (params.success) {
    if (params.data.category) {
      conditions.push(eq(pricingRulesTable.category, params.data.category));
    }
    if (params.data.active !== undefined) {
      conditions.push(eq(pricingRulesTable.isActive, params.data.active));
    }
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const rules = await db.select().from(pricingRulesTable).where(whereClause).orderBy(pricingRulesTable.category, pricingRulesTable.itemName);
  res.json(rules);
});

router.post("/pricing-rules", async (req, res): Promise<void> => {
  const parsed = CreatePricingRuleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [rule] = await db.insert(pricingRulesTable).values(parsed.data).returning();
  res.status(201).json(rule);
});

router.patch("/pricing-rules/:id", async (req, res): Promise<void> => {
  const params = UpdatePricingRuleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdatePricingRuleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [rule] = await db
    .update(pricingRulesTable)
    .set(parsed.data)
    .where(eq(pricingRulesTable.id, params.data.id))
    .returning();

  if (!rule) {
    res.status(404).json({ error: "Pricing rule not found" });
    return;
  }

  res.json(rule);
});

router.delete("/pricing-rules/:id", async (req, res): Promise<void> => {
  const params = DeletePricingRuleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [rule] = await db
    .delete(pricingRulesTable)
    .where(eq(pricingRulesTable.id, params.data.id))
    .returning();

  if (!rule) {
    res.status(404).json({ error: "Pricing rule not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;

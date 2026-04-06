import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, partnersTable, partnerAssetsTable } from "@workspace/db";
import {
  CreatePartnerBody,
  GetPartnerParams,
  UpdatePartnerParams,
  UpdatePartnerBody,
  DeletePartnerParams,
  ListPartnersQueryParams,
  ListPartnerAssetsParams,
  CreatePartnerAssetParams,
  CreatePartnerAssetBody,
  DeletePartnerAssetParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/partners", async (req, res): Promise<void> => {
  const params = ListPartnersQueryParams.safeParse(req.query);
  let query = db.select().from(partnersTable).orderBy(partnersTable.createdAt);

  if (params.success && params.data.active !== undefined) {
    const results = await db.select().from(partnersTable).where(eq(partnersTable.isActive, params.data.active)).orderBy(partnersTable.createdAt);
    res.json(results);
    return;
  }

  const results = await query;
  res.json(results);
});

router.post("/partners", async (req, res): Promise<void> => {
  const parsed = CreatePartnerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [partner] = await db.insert(partnersTable).values(parsed.data).returning();
  res.status(201).json(partner);
});

router.get("/partners/:id", async (req, res): Promise<void> => {
  const params = GetPartnerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.id, params.data.id));
  if (!partner) {
    res.status(404).json({ error: "Partner not found" });
    return;
  }

  res.json(partner);
});

router.patch("/partners/:id", async (req, res): Promise<void> => {
  const params = UpdatePartnerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdatePartnerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [partner] = await db
    .update(partnersTable)
    .set(parsed.data)
    .where(eq(partnersTable.id, params.data.id))
    .returning();

  if (!partner) {
    res.status(404).json({ error: "Partner not found" });
    return;
  }

  res.json(partner);
});

router.delete("/partners/:id", async (req, res): Promise<void> => {
  const params = DeletePartnerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [partner] = await db
    .delete(partnersTable)
    .where(eq(partnersTable.id, params.data.id))
    .returning();

  if (!partner) {
    res.status(404).json({ error: "Partner not found" });
    return;
  }

  res.sendStatus(204);
});

router.get("/partners/:id/assets", async (req, res): Promise<void> => {
  const params = ListPartnerAssetsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const assets = await db
    .select()
    .from(partnerAssetsTable)
    .where(eq(partnerAssetsTable.partnerId, params.data.id))
    .orderBy(partnerAssetsTable.createdAt);

  res.json(assets);
});

router.post("/partners/:id/assets", async (req, res): Promise<void> => {
  const params = CreatePartnerAssetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreatePartnerAssetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [asset] = await db
    .insert(partnerAssetsTable)
    .values({ ...parsed.data, partnerId: params.data.id })
    .returning();

  res.status(201).json(asset);
});

router.delete("/partners/:id/assets/:assetId", async (req, res): Promise<void> => {
  const params = DeletePartnerAssetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db
    .delete(partnerAssetsTable)
    .where(eq(partnerAssetsTable.id, params.data.assetId));

  res.sendStatus(204);
});

export default router;

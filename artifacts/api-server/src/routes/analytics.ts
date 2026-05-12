import { Router, type IRouter } from "express";
import {
  kpis, profitability, supplierPerformance, packageAnalytics, zoneAnalytics, productAnalytics,
  forecast, risk, trends, toCsv, type Filters,
} from "../services/analytics";

const router: IRouter = Router();

function parseFilters(q: any): Filters {
  return {
    from: q.from ? new Date(String(q.from)) : null,
    to: q.to ? new Date(String(q.to)) : null,
    partnerId: q.partnerId ? parseInt(String(q.partnerId)) : null,
    portalType: q.portalType ? String(q.portalType) : null,
    cityId: q.cityId ? parseInt(String(q.cityId)) : null,
    supplierId: q.supplierId ? parseInt(String(q.supplierId)) : null,
    billingExecModel: q.billingExecModel ? String(q.billingExecModel) : null,
  };
}

router.get("/analytics/kpis", async (req, res) => {
  res.json(await kpis(parseFilters(req.query)));
});

router.get("/analytics/profitability", async (req, res) => {
  const dim = String(req.query.dimension || "partner") as any;
  res.json(await profitability(dim, parseFilters(req.query)));
});

router.get("/analytics/suppliers", async (req, res) => {
  res.json(await supplierPerformance(parseFilters(req.query)));
});

router.get("/analytics/packages", async (req, res) => {
  res.json(await packageAnalytics(parseFilters(req.query)));
});

router.get("/analytics/zones", async (req, res) => {
  res.json(await zoneAnalytics(parseFilters(req.query)));
});

router.get("/analytics/products", async (req, res) => {
  res.json(await productAnalytics(parseFilters(req.query)));
});

router.get("/analytics/forecast", async (req, res) => {
  res.json(await forecast(parseFilters(req.query)));
});

router.get("/analytics/risk", async (req, res) => {
  res.json(await risk(parseFilters(req.query)));
});

router.get("/analytics/trends", async (req, res) => {
  const g = (String(req.query.granularity || "month")) as any;
  res.json(await trends(parseFilters(req.query), g));
});

router.get("/analytics/export", async (req, res) => {
  const view = String(req.query.view || "");
  const filters = parseFilters(req.query);
  let rows: any[] = [];
  switch (view) {
    case "profitability": rows = await profitability((req.query.dimension as any) || "partner", filters); break;
    case "suppliers": rows = await supplierPerformance(filters); break;
    case "packages": rows = await packageAnalytics(filters); break;
    case "zones": rows = await zoneAnalytics(filters); break;
    case "products": rows = await productAnalytics(filters); break;
    case "trends": rows = await trends(filters, (req.query.granularity as any) || "month"); break;
    default: { res.status(400).json({ error: "Unknown view" }); return; }
  }
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="analytics_${view}_${Date.now()}.csv"`);
  res.send(toCsv(rows));
});

export default router;

/**
 * Shared response DTO for `GET /api/orders/:orderId/supplier-packet/:supplierId`.
 *
 * This route is not (yet) modeled in the OpenAPI spec, but the admin
 * SupplierPacket page should still pull its row shapes from the schema so
 * that renamed/removed columns surface as type errors instead of silently
 * breaking the UI. Each header section is a `Pick` of the underlying schema
 * row, with `Date` columns serialized to ISO strings to match the JSON wire
 * format.
 */
import type {
  Order,
  Partner,
  Event as EventRow,
  Supplier,
  OrderItem,
  Asset,
  AssetLink,
} from "../schema";

type Iso<T> = {
  [K in keyof T]: T[K] extends Date
    ? string
    : T[K] extends Date | null
      ? string | null
      : T[K];
};

export type SupplierPacketOrder = Iso<
  Pick<
    Order,
    | "id"
    | "orderNumber"
    | "status"
    | "internalNotes"
    | "vendorNotes"
    | "shipDateTarget"
    | "deliveryByDate"
    | "packageCount"
    | "totalShipmentWeight"
    | "totalShipmentWeightUnit"
    | "oversizeFlag"
    | "crateRequired"
    | "palletRequired"
    | "shippingContactJson"
    | "receivingContactJson"
    | "customsNotes"
    | "internationalShippingNotes"
    | "logisticsNotes"
    | "measurementSystem"
  >
>;

export type SupplierPacketPartner = Pick<Partner, "id" | "companyName"> | null;

export type SupplierPacketEvent =
  | Iso<Pick<EventRow, "id" | "name" | "eventStartDate" | "eventEndDate" | "venueId">>
  | null;

export type SupplierPacketSupplier = Pick<Supplier, "id" | "name">;

export type SupplierPacketAsset = Iso<Asset>;

export type SupplierPacketAssetLink = Iso<AssetLink> & {
  asset: SupplierPacketAsset | null;
};

export type SupplierPacketDualValue = {
  primary: string;
  secondary: string | null;
  converted: boolean;
};

export type SupplierPacketItemSpecs = {
  finished: SupplierPacketDualValue | null;
  artwork: SupplierPacketDualValue | null;
  visible: SupplierPacketDualValue | null;
  bleed: SupplierPacketDualValue | null;
  safeArea: SupplierPacketDualValue | null;
};

export type SupplierPacketPricingBasis = {
  pricingModel: string | null;
  pricingUnit: string | null;
  pricingUnitLabel: string | null;
  unitRate: string | number | null;
  billableAreaSqm: number | null;
  billableLinearM: number | null;
  unitPrice: string | number | null;
  minBillableSize: number | null;
  minCharge: string | number | null;
  calculation: string | null;
  requiresQuote?: boolean;
};

export type SupplierPacketItem = {
  itemId: number;
  name: OrderItem["name"];
  productId: OrderItem["productId"];
  productName: string | null;
  quantity: OrderItem["quantity"];
  dimensionDisplay: string | null;
  specs: SupplierPacketItemSpecs | null;
  pricingBasis: SupplierPacketPricingBasis | null;
  fulfillmentMode: OrderItem["fulfillmentMode"];
  supplierStatus: OrderItem["supplierStatus"];
  supplierDueDate: string | null;
  supplierShipDate: string | null;
  supplierInstallDate: string | null;
  internalFulfillmentNotes: OrderItem["internalFulfillmentNotes"];
  productionBlockedReason: OrderItem["productionBlockedReason"];
  assets: SupplierPacketAssetLink[];
  flags: string[];
  ready: boolean;
};

export type SupplierPacketMeasurementContext = {
  system: string;
  primarySystem?: string;
  secondarySystem?: string;
  source: string;
  reason: string;
};

export type SupplierPacketSummary = {
  totalItems: number;
  ready: number;
  blocked: number;
};

export type SupplierPacketResponse = {
  order: SupplierPacketOrder;
  partner: SupplierPacketPartner;
  event: SupplierPacketEvent;
  supplier: SupplierPacketSupplier;
  items: SupplierPacketItem[];
  measurementContext?: SupplierPacketMeasurementContext;
  orderLevelAssets: SupplierPacketAsset[];
  summary: SupplierPacketSummary;
};

// Resolves the billing execution model with inheritance: order > event > partner default.
export function resolveBillingExecModel(args: { order?: any; event?: any; partner?: any }) {
  const { order, event, partner } = args;
  if (order?.billingExecModel && order?.billingExecModelSource === "order") {
    return { model: order.billingExecModel, source: "order" as const };
  }
  if (event?.billingExecModelOverride) {
    return { model: event.billingExecModelOverride, source: "event" as const };
  }
  if (partner?.defaultBillingExecModel) {
    return { model: partner.defaultBillingExecModel, source: "partner" as const };
  }
  return { model: "a3_collected", source: "partner" as const };
}

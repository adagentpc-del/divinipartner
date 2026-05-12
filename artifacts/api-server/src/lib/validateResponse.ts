import type { Request, Response } from "express";
import type { ZodTypeAny } from "zod";

/**
 * Validate an outgoing JSON payload against a generated zod *Response schema
 * (mirrors the inline pattern used in production.ts / partners.ts). On a
 * schema mismatch we log via req.log and respond 500 with a structured
 * envelope so broken responses do not silently leak to clients.
 *
 * On success the original `payload` is sent (not parsed.data) so that
 * additionalProperties pass through unchanged, matching existing routes.
 */
export function sendValidated(
  req: Request,
  res: Response,
  schema: ZodTypeAny,
  payload: unknown,
  label: string,
  status: number = 200,
): void {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    req.log.error(
      { err: parsed.error.flatten() },
      `${label} response failed schema validation`,
    );
    res.status(500).json({
      error: `${label} response failed schema validation`,
      details: parsed.error.issues,
    });
    return;
  }
  res.status(status).json(payload);
}

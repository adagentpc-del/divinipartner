import rateLimit, { type Options } from "express-rate-limit";

/**
 * Centralised rate-limiter factories. `trust proxy` is set on the Express app
 * so we can safely key by req.ip (the client IP behind Replit's proxy).
 */

const baseOptions: Partial<Options> = {
  standardHeaders: "draft-7",
  legacyHeaders: false,
  // Don't count successful conditional requests against the bucket.
  skipSuccessfulRequests: false,
};

export const loginLimiter = rateLimit({
  ...baseOptions,
  windowMs: 5 * 60 * 1000,
  limit: 30, // 30 sign-in attempts / 5 min / ip
  message: { error: "Too many sign-in attempts. Please wait a few minutes and try again." },
});

export const orderSubmitLimiter = rateLimit({
  ...baseOptions,
  windowMs: 10 * 60 * 1000,
  limit: 20, // 20 order submissions / 10 min / ip — generous but not unlimited
  message: { error: "Too many orders submitted from this network. Please wait a moment and retry." },
});

export const uploadLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 1000,
  limit: 60, // 60 upload-url requests / minute / ip
  message: { error: "Too many uploads from this network. Slow down and retry shortly." },
});

export const publicWriteLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 1000,
  limit: 30,
  message: { error: "Too many requests. Please slow down." },
});

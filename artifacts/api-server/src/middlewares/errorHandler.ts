import type { Request, Response, NextFunction } from "express";

/**
 * Final error middleware. Logs the full error with request context (which goes
 * to the structured logger that already redacts cookies / authorization), but
 * never leaks internals to the client in production. In development we return
 * the message + name so debugging stays fast.
 */
export function safeErrorHandler() {
  return function safeErrorHandlerMw(err: any, req: Request, res: Response, _next: NextFunction): void {
    if (res.headersSent) {
      return;
    }
    const status = Number(err?.status || err?.statusCode) >= 400
      ? Number(err.status || err.statusCode)
      : 500;

    req.log?.error({ err, path: req.path, method: req.method }, "Unhandled error");

    if (process.env.NODE_ENV === "production") {
      res.status(status).json({
        error: status >= 500
          ? "Internal server error. The team has been notified."
          : (typeof err?.message === "string" && err.message.length < 200 ? err.message : "Request failed."),
      });
      return;
    }

    res.status(status).json({
      error: err?.message || "Request failed",
      name: err?.name,
    });
  };
}

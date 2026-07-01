/**
 * Native email/password auth (mounted at /api/auth). Replaces Authentik OIDC.
 *
 * Security model (see also lib/session.ts):
 *   - Passwords hashed with node:crypto scrypt; verified with timingSafeEqual.
 *   - Sessions are HS256 JWTs { sub, email } signed with SESSION_SECRET, 30-day
 *     expiry, delivered as an httpOnly + Secure + SameSite=Lax cookie
 *     (divini_session) AND returned in the JSON body for Bearer use.
 *   - Email verification is REQUIRED before login. Register creates the user
 *     unverified with a 32-byte hex verify_token (~24h) and emails a verify link.
 *   - Generic errors on bad credentials and no user enumeration on resend/forgot.
 *
 * Zero em dashes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import {
  hashPassword,
  verifyPassword,
  signSession,
  randomToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from "../lib/session.js";
import { sendEmail } from "../lib/email.js";
import { PUBLIC_APP_URL, BASE_PATH, IS_PROD, getAdminAllowedEmails } from "../config.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const router = Router();

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const RESET_TTL_MS = 60 * 60 * 1000; // 1h

function appBase(): string {
  return (PUBLIC_APP_URL || "https://divinipartners.com") + (BASE_PATH || "");
}

function isAdminEmail(email: string | null): boolean {
  if (!email) return false;
  return getAdminAllowedEmails().includes(email.toLowerCase());
}

function validEmail(email: unknown): email is string {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Set the session cookie. httpOnly + SameSite=Lax; Secure in production. */
function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS * 1000,
    path: "/",
  });
}

function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: IS_PROD, sameSite: "lax", path: "/" });
}

/** Issue a session for a user: set cookie + return the token + user. */
async function issueSession(
  res: Response,
  user: { id: string; email: string | null },
): Promise<{ token: string }> {
  const token = await signSession(user.id, user.email);
  setSessionCookie(res, token);
  return { token };
}

async function sendVerifyEmail(email: string, token: string): Promise<void> {
  const link = `${appBase()}/verify-email?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to: email,
    subject: "Verify your Divini Partners email",
    text:
      `Welcome to Divini Partners.\n\n` +
      `Please verify your email address to activate your account:\n${link}\n\n` +
      `This link expires in 24 hours. If you did not create an account you can ignore this email.`,
  }).catch(() => undefined);
}

// ---- Register --------------------------------------------------------------
router.post(
  "/register",
  h(async (req, res) => {
    const { email, password, passwordConfirm } = req.body ?? {};
    if (!validEmail(email)) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }
    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }
    if (password !== passwordConfirm) {
      return res.status(400).json({ error: "Passwords do not match." });
    }
    const normEmail = (email as string).trim().toLowerCase();
    const token = randomToken(32);
    await db.upsertUserForRegistration({
      email: normEmail,
      passwordHash: hashPassword(password),
      verifyToken: token,
      verifyExpires: new Date(Date.now() + VERIFY_TTL_MS),
    });
    await sendVerifyEmail(normEmail, token);
    // No session until verified.
    return res.status(201).json({ ok: true, needsVerification: true });
  }),
);

// ---- Verify email ----------------------------------------------------------
async function doVerify(token: string, res: Response): Promise<Response> {
  const user = await db.findUserByVerifyToken(token);
  if (!user) {
    return res.status(400).json({ error: "This verification link is invalid or has expired." });
  }
  await db.markVerified(user.id);
  const { token: session } = await issueSession(res, { id: user.id, email: user.email });
  return res.json({
    ok: true,
    token: session,
    user: { id: user.id, email: user.email },
    isAdmin: isAdminEmail(user.email),
  });
}

router.get(
  "/verify",
  h(async (req, res) => {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    if (!token) return res.status(400).json({ error: "Missing token." });
    return doVerify(token, res);
  }),
);

router.post(
  "/verify",
  h(async (req, res) => {
    const token = typeof req.body?.token === "string" ? req.body.token : "";
    if (!token) return res.status(400).json({ error: "Missing token." });
    return doVerify(token, res);
  }),
);

// ---- Resend verification (no user enumeration) -----------------------------
router.post(
  "/resend-verification",
  h(async (req, res) => {
    const { email } = req.body ?? {};
    if (validEmail(email)) {
      const normEmail = (email as string).trim().toLowerCase();
      const user = await db.findUserByEmail(normEmail);
      if (user && !user.email_verified) {
        const token = randomToken(32);
        await db.setVerifyToken(user.id, token, new Date(Date.now() + VERIFY_TTL_MS));
        await sendVerifyEmail(normEmail, token);
      }
    }
    // Always 200, regardless of whether the account exists.
    return res.json({ ok: true });
  }),
);

// ---- Login -----------------------------------------------------------------
router.post(
  "/login",
  h(async (req, res) => {
    const { email, password } = req.body ?? {};
    const generic = { error: "Incorrect email or password." };
    if (!validEmail(email) || typeof password !== "string" || !password) {
      return res.status(401).json(generic);
    }
    const normEmail = (email as string).trim().toLowerCase();
    const user = await db.findUserByEmail(normEmail);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json(generic);
    }
    if (!user.email_verified) {
      return res.status(403).json({
        error: "Please verify your email before signing in.",
        needsVerification: true,
      });
    }
    const { token } = await issueSession(res, { id: user.id, email: user.email });
    return res.json({
      ok: true,
      token,
      user: { id: user.id, email: user.email },
      isAdmin: isAdminEmail(user.email),
    });
  }),
);

// ---- Logout ----------------------------------------------------------------
router.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

// ---- Me (mirror /api/me shape the SPA expects) -----------------------------
router.get(
  "/me",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const user = await db.ensureUser(auth.userId!, auth.email);
    const org = await db.getMyOrg(user.id);
    res.json({
      user: { id: user.id, email: auth.email },
      isAdmin: auth.isAdmin,
      company: org
        ? {
            id: org.id,
            kind: org.type,
            name: org.name,
            tier: org.tier,
            verification_status: org.verification_status,
            white_label_status: org.white_label_status,
          }
        : null,
    });
  }),
);

// ---- Forgot password (no user enumeration) ---------------------------------
router.post(
  "/forgot",
  h(async (req, res) => {
    const { email } = req.body ?? {};
    if (validEmail(email)) {
      const normEmail = (email as string).trim().toLowerCase();
      const user = await db.findUserByEmail(normEmail);
      if (user) {
        const token = randomToken(32);
        await db.setResetToken(user.id, token, new Date(Date.now() + RESET_TTL_MS));
        const link = `${appBase()}/reset?token=${encodeURIComponent(token)}`;
        await sendEmail({
          to: normEmail,
          subject: "Reset your Divini Partners password",
          text:
            `We received a request to reset your Divini Partners password.\n\n` +
            `Reset it here:\n${link}\n\n` +
            `This link expires in 1 hour. If you did not request this you can ignore this email.`,
        }).catch(() => undefined);
      }
    }
    return res.json({ ok: true });
  }),
);

// ---- Reset password --------------------------------------------------------
router.post(
  "/reset",
  h(async (req, res) => {
    const { token, password } = req.body ?? {};
    if (typeof token !== "string" || !token) {
      return res.status(400).json({ error: "Missing reset token." });
    }
    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }
    const user = await db.findUserByResetToken(token);
    if (!user) {
      return res.status(400).json({ error: "This reset link is invalid or has expired." });
    }
    await db.applyPasswordReset(user.id, hashPassword(password));
    const { token: session } = await issueSession(res, { id: user.id, email: user.email });
    return res.json({
      ok: true,
      token: session,
      user: { id: user.id, email: user.email },
      isAdmin: isAdminEmail(user.email),
    });
  }),
);

export default router;

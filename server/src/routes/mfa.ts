/**
 * MFA / 2FA (TOTP) self-service routes. Mounted at /api/mfa, all requireUser.
 *
 * Enrollment is two steps (start -> verify) so a secret is never "live"
 * until the user proves possession of it with a real code from their
 * authenticator app -- an interrupted or abandoned enrollment leaves
 * totp_enabled false and login unaffected.
 *
 * The actual login-time MFA challenge (POST /auth/mfa-verify) lives in
 * routes/auth-native.ts, not here, since it runs BEFORE a session exists.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as mfa from "../db/mfa.js";
import { generateTotpSecret, verifyTotp, buildOtpauthUri, generateBackupCodes } from "../lib/totp.js";
import { verifyPassword } from "../lib/session.js";
import * as db from "../db.js";
import { logAction } from "../lib/audit.js";
import { notify } from "../lib/notify.js";
import qrcode from "qrcode";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const router = Router();
router.use(requireUser);

router.get(
  "/status",
  h(async (req, res) => {
    const auth = getAuth(req);
    const user = await mfa.getMfaUser(auth.userId!);
    if (!user) return res.status(404).json({ error: "not found" });
    const remaining = user.totp_enabled ? await mfa.remainingBackupCodeCount(user.id) : 0;
    res.json({ enabled: user.totp_enabled, remainingBackupCodes: remaining });
  }),
);

/** Step 1: generate a pending secret + QR code. Does not enable MFA yet. */
router.post(
  "/enroll/start",
  h(async (req, res) => {
    const auth = getAuth(req);
    const user = await mfa.getMfaUser(auth.userId!);
    if (!user) return res.status(404).json({ error: "not found" });
    if (user.totp_enabled) {
      return res.status(409).json({ error: "MFA is already enabled. Disable it before re-enrolling." });
    }
    const secret = generateTotpSecret();
    await mfa.setPendingTotpSecret(user.id, secret);
    const otpauthUri = buildOtpauthUri({ secret, accountEmail: user.email ?? user.id });
    const qrCodeDataUrl = await qrcode.toDataURL(otpauthUri);
    res.json({ secret, otpauthUri, qrCodeDataUrl });
  }),
);

/** Step 2: confirm the pending secret with a real code from the app. */
router.post(
  "/enroll/verify",
  h(async (req, res) => {
    const auth = getAuth(req);
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    const user = await mfa.getMfaUser(auth.userId!);
    if (!user) return res.status(404).json({ error: "not found" });
    if (!user.totp_secret) {
      return res.status(400).json({ error: "No enrollment in progress. Start enrollment first." });
    }
    if (!verifyTotp(user.totp_secret, code)) {
      return res.status(400).json({ error: "Incorrect code. Check your authenticator app and try again." });
    }
    await mfa.confirmTotpEnrollment(user.id);
    const backupCodes = generateBackupCodes(10);
    await mfa.replaceBackupCodes(user.id, backupCodes);
    await logAction({ id: user.id, email: user.email }, "mfa.enabled", "user", user.id, null, null, {
      summary: "User enabled two-factor authentication (TOTP).",
    });
    if (user.email) {
      await notify.securityEvent(user.email, "Two-factor authentication enabled", {
        message:
          "Two-factor authentication was just turned on for your Divini Partners account. " +
          "If this was not you, contact support immediately.",
      });
    }
    // Backup codes are returned ONCE, in plaintext, and never retrievable again
    // (only their hashes are stored) -- the UI must show these to the user now.
    res.json({ ok: true, backupCodes });
  }),
);

/** Regenerate backup codes (invalidates all previous ones). Requires a fresh TOTP code. */
router.post(
  "/backup-codes/regenerate",
  h(async (req, res) => {
    const auth = getAuth(req);
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    const user = await mfa.getMfaUser(auth.userId!);
    if (!user || !user.totp_enabled || !user.totp_secret) {
      return res.status(400).json({ error: "MFA is not enabled." });
    }
    if (!verifyTotp(user.totp_secret, code)) {
      return res.status(400).json({ error: "Incorrect code." });
    }
    const backupCodes = generateBackupCodes(10);
    await mfa.replaceBackupCodes(user.id, backupCodes);
    await logAction({ id: user.id, email: user.email }, "mfa.backup_codes_regenerated", "user", user.id, null, null, {
      summary: "User regenerated their MFA backup codes (previous codes invalidated).",
    });
    res.json({ ok: true, backupCodes });
  }),
);

/** Disable MFA entirely. Requires the account password as a speed bump. */
router.post(
  "/disable",
  h(async (req, res) => {
    const auth = getAuth(req);
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!password) return res.status(400).json({ error: "password required" });
    const authUser = await db.findUserByEmail(auth.email ?? "");
    if (!authUser || !verifyPassword(password, authUser.password_hash)) {
      return res.status(403).json({ error: "incorrect password" });
    }
    await mfa.disableMfa(auth.userId!);
    await logAction({ id: auth.userId!, email: auth.email }, "mfa.disabled", "user", auth.userId!, null, null, {
      summary: "User disabled two-factor authentication.",
    });
    if (auth.email) {
      await notify.securityEvent(auth.email, "Two-factor authentication disabled", {
        message:
          "Two-factor authentication was just turned off for your Divini Partners account. " +
          "If this was not you, contact support immediately and change your password.",
      });
    }
    res.json({ ok: true });
  }),
);

export default router;

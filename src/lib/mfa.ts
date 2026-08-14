/**
 * MFA / 2FA (TOTP) client calls. Backed by server/src/routes/mfa.ts
 * (/api/mfa/*, requireUser) plus the login-time challenge in
 * server/src/routes/auth-native.ts (see src/lib/auth.tsx's verifyMfa).
 */
import { apiGet, apiSend } from './api';

export type MfaStatus = { enabled: boolean; remainingBackupCodes: number };
export type MfaEnrollStart = { secret: string; otpauthUri: string; qrCodeDataUrl: string };
export type MfaEnrollVerify = { ok: true; backupCodes: string[] };

export const mfaStatus = () => apiGet<MfaStatus>('/mfa/status');
export const mfaEnrollStart = () => apiSend<MfaEnrollStart>('POST', '/mfa/enroll/start');
export const mfaEnrollVerify = (code: string) =>
  apiSend<MfaEnrollVerify>('POST', '/mfa/enroll/verify', { code });
export const mfaRegenerateBackupCodes = (code: string) =>
  apiSend<MfaEnrollVerify>('POST', '/mfa/backup-codes/regenerate', { code });
export const mfaDisable = (password: string) =>
  apiSend<{ ok: true }>('POST', '/mfa/disable', { password });

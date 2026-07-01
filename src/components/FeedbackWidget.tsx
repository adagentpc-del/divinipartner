import React, { useState } from 'react';
import { apiSend } from '../lib/api';

/**
 * FeedbackWidget - a reusable feedback / feature-request launcher (blueprint 36).
 *
 * Drop it into any dashboard. It renders a floating "Feedback" button that opens
 * a small modal to submit a typed feedback item to POST /api/feedback. Brand
 * styles are self-contained (emerald / gold / ivory). Default export.
 */
const TYPES: { key: string; label: string }[] = [
  { key: 'feature_request', label: 'Feature request' },
  { key: 'bug', label: 'Bug report' },
  { key: 'improvement', label: 'Improvement' },
  { key: 'praise', label: 'Praise' },
  { key: 'complaint', label: 'Complaint' },
  { key: 'other', label: 'Other' },
];

export default function FeedbackWidget({ context }: { context?: string }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('feature_request');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!description.trim()) {
      setErr('Please add a short description.');
      return;
    }
    setSending(true);
    setErr(null);
    try {
      await apiSend('POST', '/feedback', {
        type,
        title: title || undefined,
        description,
        related_object_type: context || undefined,
      });
      setDone(true);
      setTitle('');
      setDescription('');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  function close() {
    setOpen(false);
    setDone(false);
    setErr(null);
  }

  return (
    <div className="fbw">
      <style>{FBW_CSS}</style>
      <button type="button" className="fbw-launch" onClick={() => setOpen(true)}>
        <span aria-hidden="true">F</span> Feedback
      </button>

      {open ? (
        <div className="fbw-overlay" role="dialog" aria-modal="true" aria-label="Send feedback">
          <div className="fbw-card">
            <div className="fbw-head">
              <h3>Share feedback</h3>
              <button type="button" className="fbw-x" onClick={close}>Close</button>
            </div>

            {done ? (
              <div className="fbw-done">
                <p>Thank you. Your feedback has been logged for the Divini Partners team.</p>
                <button type="button" className="fbw-btn" onClick={close}>Done</button>
              </div>
            ) : (
              <>
                <label className="fbw-label">Type</label>
                <select className="fbw-input" value={type} onChange={(e) => setType(e.target.value)}>
                  {TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>

                <label className="fbw-label">Title (optional)</label>
                <input
                  className="fbw-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Short summary"
                />

                <label className="fbw-label">Details</label>
                <textarea
                  className="fbw-input fbw-area"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Tell us what would make Divini Partners better."
                  rows={4}
                />

                {err ? <p className="fbw-err">{err}</p> : null}

                <div className="fbw-actions">
                  <button type="button" className="fbw-btn ghost" onClick={close}>Cancel</button>
                  <button type="button" className="fbw-btn" onClick={submit} disabled={sending}>
                    {sending ? 'Sending...' : 'Send feedback'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const FBW_CSS = `
.fbw {
  --dp-emerald: #123c2e; --dp-emerald-2: #1E5D4A; --dp-gold: #C9A35B;
  --dp-ivory: #F7F4EE; --dp-ink: #2c2a26; --dp-muted: #7d776c; --dp-line: #e7e1d6;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
}
.fbw *, .fbw *::before, .fbw *::after { box-sizing: border-box; }
.fbw-launch {
  position: fixed; right: 22px; bottom: 22px; z-index: 60;
  display: inline-flex; align-items: center; gap: 8px;
  background: var(--dp-emerald); color: var(--dp-ivory);
  border: 1px solid rgba(201,163,91,.5); border-radius: 999px;
  font: inherit; font-size: 13px; font-weight: 600; padding: 11px 18px;
  cursor: pointer; box-shadow: 0 6px 20px rgba(18,60,46,.25);
  transition: background .15s ease;
}
.fbw-launch:hover { background: var(--dp-emerald-2); }
.fbw-launch span {
  width: 20px; height: 20px; border-radius: 6px; background: var(--dp-gold); color: var(--dp-emerald);
  display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 11px;
}
.fbw-overlay { position: fixed; inset: 0; background: rgba(18,30,24,.5); display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 70; }
.fbw-card { background: #fff; border: 1px solid var(--dp-line); border-radius: 16px; width: 100%; max-width: 440px; padding: 22px; }
.fbw-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.fbw-head h3 { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 22px; color: var(--dp-emerald); margin: 0; }
.fbw-x { background: transparent; border: 1px solid var(--dp-line); border-radius: 8px; padding: 5px 11px; font: inherit; font-size: 12px; cursor: pointer; color: var(--dp-muted); }
.fbw-label { display: block; font-size: 11px; letter-spacing: .4px; text-transform: uppercase; color: #9a8a5e; font-weight: 600; margin: 12px 0 5px; }
.fbw-input { width: 100%; font: inherit; font-size: 13px; padding: 9px 11px; border: 1px solid var(--dp-line); border-radius: 9px; background: #fff; color: var(--dp-ink); }
.fbw-area { resize: vertical; }
.fbw-err { color: #8a3a3a; background: #f6eaea; border: 1px solid #e2caca; border-radius: 8px; padding: 8px 11px; font-size: 12px; margin: 10px 0 0; }
.fbw-actions { display: flex; justify-content: flex-end; gap: 9px; margin-top: 16px; }
.fbw-btn { background: var(--dp-emerald); color: #fff; border: 0; border-radius: 9px; font: inherit; font-size: 13px; font-weight: 600; padding: 9px 16px; cursor: pointer; }
.fbw-btn:hover { background: var(--dp-emerald-2); }
.fbw-btn:disabled { opacity: .6; cursor: default; }
.fbw-btn.ghost { background: transparent; color: var(--dp-emerald); border: 1px solid var(--dp-line); }
.fbw-done { padding: 8px 0; }
.fbw-done p { font-size: 13.5px; color: var(--dp-ink); line-height: 1.6; margin: 0 0 14px; }
`;

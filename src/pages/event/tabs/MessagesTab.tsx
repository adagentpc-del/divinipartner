import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiSend } from '../../../lib/api';
import LeakageModal, { type LeakageAction } from '../../../components/LeakageModal';

/** Server leakage shape (server/src/lib/leakage.ts LeakageDetection). */
type Leakage = {
  flagged: boolean;
  terms: string[];
  categories: string[];
  snippet: string | null;
};

/** Client-side mirror of LEAKAGE_TERMS for a pre-send check (before the post). */
const LEAKAGE_PATTERNS: RegExp[] = [
  /\bvenmo\b/i,
  /\bzelle\b/i,
  /\bcash[\s-]?app\b/i,
  /\bpay[\s-]?pal\b/i,
  /\bwire(\s+transfer)?\b/i,
  /\bach\b/i,
  /\bcash\b(?!\s*app)/i,
  /\b(che(ck|que)s?|by\s+check)\b/i,
  /\bpay(ing)?\s+(outside|off[\s-]?platform|directly)\b/i,
  /\boff[\s-]?platform\b/i,
  /\boff\s+the\s+platform\b/i,
  /\binvoice\s+(you\s+)?separately\b/i,
  /\bbill\s+(you\s+)?separately\b/i,
  /\b(skip|avoid|save\s+on)\s+(the\s+)?(platform\s+)?fee\b/i,
  /\bdirect\s+deposit\b/i,
  /\bsend\s+(it\s+)?to\s+my\s+(bank\s+)?account\b/i,
  /\bhandle\s+(it|payment)\s+(ourselves|between us)\b/i,
];

function detectLeakageClient(text: string): boolean {
  return LEAKAGE_PATTERNS.some((re) => re.test(text));
}

type Message = {
  id: string;
  thread_type: string | null;
  thread_ref: string | null;
  sender_id: string | null;
  body: string | null;
  visibility: string | null;
  read_status: boolean;
  created_at: string;
};
type Thread = { thread_type: string; thread_ref: string | null; count: number; last_at: string; unread: number };

const VISIBILITY = ['event_wide', 'venue_client', 'vendor_client', 'bid_thread', 'invoice_thread', 'internal'];

export default function MessagesTab({ eventId }: { eventId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState('event_wide');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [leakageOpen, setLeakageOpen] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const nav = useNavigate();

  async function load() {
    try {
      const [m, t] = await Promise.all([
        apiGet<{ messages: Message[] }>(`/messages/event/${eventId}`),
        apiGet<{ threads: Thread[] }>(`/messages/event/${eventId}/threads`),
      ]);
      setMessages(m.messages);
      setThreads(t.threads);
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [eventId]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    setErr(null);
    // Pre-send client check so the notice can surface even if the response is slow.
    let flagged = detectLeakageClient(text);
    try {
      // Blueprint 21.4: the server scans the message and returns a leakage result.
      // The message still posts (this is a warning / education layer, not a hard
      // block on chat); we just surface the Payment Protection notice when flagged.
      const res = await apiSend<{ message: unknown; leakage?: Leakage }>(
        'POST',
        '/messages',
        { event_id: eventId, body: text, visibility },
      );
      if (res?.leakage?.flagged) flagged = true;
      setBody('');
      await load();
      if (flagged) setLeakageOpen(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function onLeakageAction(action: LeakageAction) {
    switch (action) {
      case 'continue':
        // Keep payments on-platform: just dismiss; the message already posted.
        setLeakageOpen(false);
        break;
      case 'external':
        // Route to the external payment flow (payments dashboard).
        setLeakageOpen(false);
        nav('/payments');
        break;
      case 'support':
        setLeakageOpen(false);
        nav('/support');
        break;
      case 'policy':
        setLeakageOpen(false);
        nav('/privacy');
        break;
    }
  }

  return (
    <div className="ew-msg">
      <style>{M_CSS}</style>
      {err ? <p className="ew-error">{err}</p> : null}

      {threads.length ? (
        <div className="ew-msg-threads">
          {threads.map((t, i) => (
            <span key={i} className="ew-msg-chip">
              {t.thread_type}{t.unread ? <em className="ew-msg-unread">{t.unread}</em> : null}
            </span>
          ))}
        </div>
      ) : null}

      <div className="ew-msg-feed">
        {messages.length === 0 ? (
          <div className="ew-empty"><p>No messages yet. Start the conversation below.</p></div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="ew-msg-row">
              <div className="ew-msg-meta">
                <span className="ew-msg-vis">{m.visibility ?? 'event_wide'}</span>
                <span className="ew-msg-time">{new Date(m.created_at).toLocaleString()}</span>
              </div>
              <p className="ew-msg-body">{m.body}</p>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      <form className="ew-msg-compose" onSubmit={send}>
        <select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
          {VISIBILITY.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <input placeholder="Write a message..." value={body} onChange={(e) => setBody(e.target.value)} />
        <button type="submit" className="ew-btn" disabled={busy}>Send</button>
      </form>

      <LeakageModal
        open={leakageOpen}
        onClose={() => setLeakageOpen(false)}
        onAction={onLeakageAction}
      />
    </div>
  );
}

const M_CSS = `
.ew-msg-threads { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 12px; }
.ew-msg-chip { font-size: 11px; background: rgba(30,93,74,.1); color: #1E5D4A; border: 1px solid rgba(30,93,74,.25); border-radius: 999px; padding: 3px 10px; display: inline-flex; align-items: center; gap: 5px; }
.ew-msg-unread { font-style: normal; background: #C9A35B; color: #123c2e; border-radius: 999px; font-size: 9.5px; font-weight: 700; padding: 0 5px; }
.ew-msg-feed { background: rgba(247,244,238,.5); border: 1px solid #e7e1d6; border-radius: 12px; padding: 14px; max-height: 380px; overflow-y: auto; margin-bottom: 12px; display: flex; flex-direction: column; gap: 10px; }
.ew-msg-row { background: #fff; border: 1px solid #ece6da; border-radius: 10px; padding: 10px 13px; }
.ew-msg-meta { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
.ew-msg-vis { font-size: 9.5px; letter-spacing: .5px; text-transform: uppercase; color: #9a8a5e; font-weight: 600; }
.ew-msg-time { font-size: 10.5px; color: #b3aa99; }
.ew-msg-body { margin: 0; font-size: 13.5px; color: #2c2a26; line-height: 1.5; }
.ew-msg-compose { display: flex; gap: 9px; }
.ew-msg-compose select { font: inherit; padding: 9px 10px; border: 1px solid #e7e1d6; border-radius: 8px; background: #fff; }
.ew-msg-compose input { font: inherit; flex: 1 1 auto; padding: 9px 12px; border: 1px solid #e7e1d6; border-radius: 8px; background: #fff; }
`;

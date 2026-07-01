import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../../../lib/api';

/**
 * Internal notes for an event. Backed by the messages layer with the
 * `internal` visibility scope (blueprint 7.2: internal notes are only visible
 * to Divini staff / the owning side). Reuses /api/messages.
 */
type Message = {
  id: string;
  body: string | null;
  visibility: string | null;
  created_at: string;
};

export default function NotesTab({ eventId }: { eventId: string }) {
  const [notes, setNotes] = useState<Message[]>([]);
  const [body, setBody] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const r = await apiGet<{ messages: Message[] }>(`/messages/event/${eventId}`);
      setNotes(r.messages.filter((m) => m.visibility === 'internal'));
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [eventId]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await apiSend('POST', '/messages', {
        event_id: eventId,
        body: body.trim(),
        thread_type: 'internal',
        visibility: 'internal',
      });
      setBody('');
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <style>{N_CSS}</style>
      {err ? <p className="ew-error">{err}</p> : null}
      <p className="ew-muted ew-notes-hint">Internal notes are private to your side of the event.</p>

      <form className="ew-notes-add" onSubmit={add}>
        <textarea placeholder="Add an internal note..." value={body} onChange={(e) => setBody(e.target.value)} rows={3} />
        <button type="submit" className="ew-btn" disabled={busy}>Add note</button>
      </form>

      {notes.length === 0 ? (
        <div className="ew-empty"><p>No internal notes yet.</p></div>
      ) : (
        <div className="ew-notes-list">
          {notes.map((n) => (
            <div key={n.id} className="ew-note">
              <span className="ew-note-time">{new Date(n.created_at).toLocaleString()}</span>
              <p>{n.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const N_CSS = `
.ew-notes-hint { margin-bottom: 12px; }
.ew-notes-add { display: flex; flex-direction: column; gap: 9px; margin-bottom: 18px; align-items: flex-start; }
.ew-notes-add textarea { font: inherit; width: 100%; padding: 11px 13px; border: 1px solid #e7e1d6; border-radius: 10px; background: #fff; resize: vertical; }
.ew-notes-list { display: flex; flex-direction: column; gap: 10px; }
.ew-note { background: #fff; border: 1px solid #ece6da; border-left: 3px solid #C9A35B; border-radius: 10px; padding: 11px 14px; }
.ew-note-time { font-size: 10.5px; color: #b3aa99; }
.ew-note p { margin: 4px 0 0; font-size: 13.5px; color: #2c2a26; line-height: 1.5; }
`;

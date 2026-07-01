import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../lib/api';

/**
 * Divini AI COO V2 - Divini Command Center (executive Q&A).
 *
 * A combined CRO + COO + Chief Partnership / Risk Officer view. The executive
 * picks one of a fixed set of canned questions; the server answers it
 * DETERMINISTICALLY by routing through the already-built engines (Revenue
 * Leakage, Opportunity, Partnership Matching, Relationship Graph, Event War
 * Room) and returns a structured answer: a headline, supporting items, and
 * recommended actions. Everything degrades to graceful empty states - no
 * fabrication before real data accumulates.
 */

type SupportedQuestion = { key: string; label: string };

type AnswerItem = {
  title: string;
  detail?: string | null;
  value?: number | null;
  score?: number | null;
  href?: string | null;
};
type AnswerAction = { label: string; href?: string | null };
type CommandAnswer = {
  questionKey: string;
  question: string;
  headline: string;
  items: AnswerItem[];
  actions: AnswerAction[];
};

function money(n: unknown): string {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v) || v <= 0) return '';
  return `$${Math.round(v).toLocaleString()}`;
}

export default function CommandCenter() {
  const [questions, setQuestions] = useState<SupportedQuestion[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [answer, setAnswer] = useState<CommandAnswer | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoadingList(true);
      setErr(null);
      try {
        const res = await apiGet<{ questions: SupportedQuestion[] }>('/command-center/questions');
        setQuestions(res.questions ?? []);
      } catch (e) {
        setErr((e as Error).message);
        setQuestions([]);
      } finally {
        setLoadingList(false);
      }
    })();
  }, []);

  async function ask(questionKey: string) {
    setActive(questionKey);
    setBusy(true);
    setErr(null);
    setAnswer(null);
    try {
      const res = await apiSend<{ answer: CommandAnswer }>('POST', '/command-center/ask', {
        questionKey,
      });
      setAnswer(res.answer ?? null);
    } catch (e) {
      setErr((e as Error).message);
      setAnswer(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Command Center</h1>
          <div className="sub">Ask your AI COO an executive question</div>
        </div>
      </div>

      {err && (
        <div className="card" style={{ borderColor: '#c0392b', color: '#c0392b', marginBottom: 16 }}>
          {err}
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <p className="note" style={{ margin: '0 0 12px', lineHeight: 1.6 }}>
          Pick a question. Answers are computed deterministically from your venues,
          events, revenue, partnerships, and risk signals.
        </p>
        {loadingList ? (
          <p className="note" style={{ margin: 0 }}>Loading questions...</p>
        ) : questions.length === 0 ? (
          <p className="note" style={{ margin: 0 }}>No questions available.</p>
        ) : (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {questions.map((qq) => (
              <button
                key={qq.key}
                className={`btn${active === qq.key ? ' primary' : ''}`}
                onClick={() => ask(qq.key)}
                disabled={busy}
              >
                {qq.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {busy ? (
        <div className="card">
          <p className="note" style={{ margin: 0 }}>Thinking...</p>
        </div>
      ) : answer ? (
        <div className="card">
          <span
            className="note"
            style={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: '.5px' }}
          >
            {answer.question}
          </span>
          <h2 style={{ margin: '8px 0 0', lineHeight: 1.4 }}>{answer.headline}</h2>

          {answer.items.length > 0 ? (
            <div className="grid cards2" style={{ marginTop: 16 }}>
              {answer.items.map((it, i) => {
                const v = money(it.value);
                const inner = (
                  <>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        gap: 8,
                      }}
                    >
                      <h3 style={{ margin: 0 }}>{it.title}</h3>
                      {v ? (
                        <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{v}</span>
                      ) : typeof it.score === 'number' ? (
                        <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{it.score}/100</span>
                      ) : null}
                    </div>
                    {it.detail && (
                      <p className="note" style={{ margin: '8px 0 0', lineHeight: 1.5 }}>
                        {it.detail}
                      </p>
                    )}
                  </>
                );
                return it.href ? (
                  <a
                    className="card"
                    key={i}
                    href={`#${it.href}`}
                    style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
                  >
                    {inner}
                  </a>
                ) : (
                  <div className="card" key={i}>
                    {inner}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="note" style={{ margin: '16px 0 0' }}>
              Nothing to list yet for this question.
            </p>
          )}

          {answer.actions.length > 0 && (
            <>
              <div className="sectitle" style={{ marginTop: 20 }}>Recommended actions</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {answer.actions.map((act, i) =>
                  act.href ? (
                    <a className="btn" key={i} href={`#${act.href}`}>
                      {act.label}
                    </a>
                  ) : (
                    <span className="btn" key={i} style={{ opacity: 0.85 }}>
                      {act.label}
                    </span>
                  ),
                )}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="card">
          <p className="note" style={{ margin: 0 }}>
            Select a question above to see your AI COO answer.
          </p>
        </div>
      )}
    </>
  );
}

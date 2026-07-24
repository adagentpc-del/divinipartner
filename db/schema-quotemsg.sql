-- ============================================================================
-- Divini Partners - Quote Q&A thread (negotiate / ask the vendor questions).
-- Additive, guarded. A client asks questions on a quote; sending with a change
-- request pushes the quote back to the vendor (status revision_requested). Both
-- sides read the thread. Zero em dashes.
-- ============================================================================

create table if not exists quote_messages (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid references quotes(id) on delete cascade,
  event_id uuid,
  author_user_id uuid references users(id) on delete set null,
  author_side text not null check (author_side in ('client','vendor')),
  body text not null,
  request_revision boolean not null default false,
  created_at timestamptz default now()
);
create index if not exists idx_quote_messages_quote on quote_messages(quote_id);

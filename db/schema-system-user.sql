-- ---------------------------------------------------------------------------
-- System user (Final Event Schedule / Event Execution Packet completion
-- phase, Part 8, 2026-08-09).
--
-- Live-testing runPacketDistribution() surfaced a real bug: its SYSTEM_ACTOR
-- (mirroring lib/scheduleDistribution.ts's SYSTEM_ACTOR, id "system") failed
-- every run with "invalid input syntax for type uuid: system" because,
-- unlike scheduleDistribution's read-only use, generatePacketVersion()
-- writes actor.user.id into generated_by, a uuid-typed foreign key column.
-- scheduleDistribution.ts's SYSTEM_ACTOR is untouched (it never writes a
-- uuid FK, so it has no bug to fix); this seeds a REAL users row with a
-- fixed, well-known id so a system-initiated write has a real foreign key
-- target instead of a placeholder string.
-- ---------------------------------------------------------------------------

insert into users (id, email, name, role, status)
values ('00000000-0000-0000-0000-000000000001', null, 'Divini Partners (System)', 'super_admin', 'active')
on conflict (id) do nothing;

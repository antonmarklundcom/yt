# Handoff → Opus track (PR-14)

PR-08 → PR-13 are merged to `main`. The UI is complete: dashboard shell,
digest feed, single analysis view, sources CRUD, ingest form, outline
generator. This note is what PR-14 needs that isn't already in `PLAN.md` or
`docs/HANDOFF-SONNET.md`.

---

## 1. What actually shipped in PR-08 → PR-13

No new environment variables were introduced. `.env.example` from PR-02/03
is still the complete list except for `CRON_SECRET`, which is explicitly
PR-14's to add (see `docs/HANDOFF-SONNET.md` §4).

Routes that now exist:

| Route | What it does |
|---|---|
| `/` | Digest feed — video cards, search, caption-status filter, SQL pagination |
| `/video/[id]` | Single analysis view + outline generator per idea |
| `/sources` | Add/pause/resume/remove tracked channels and playlists |
| `/ingest` | Paste a URL or a manual transcript, direct-analyse |

**No `/api/ingest` or `/api/analyze` route handlers exist.** PLAN.md §2
anticipated them, but PR-12 and PR-13 used React 19 Server Actions
(`src/lib/ingest.actions.ts`, `src/lib/outline.actions.ts`,
`src/lib/sources.actions.ts`) instead — same server-side-only guarantee,
less boilerplate, and it's what the ingest form and outline buttons actually
call. `/api/cron/poll` is still a real HTTP route handler you need to build
for PR-14, since Hostinger's cron hits it over HTTP with a header, which a
Server Action cannot receive.

## 2. Still unresolved — same three items HANDOFF-SONNET.md flagged

1. **The PR-01 caption gate has never been run from Hostinger.** Nothing in
   PR-08→13 changes this. Run it before trusting anything end to end:
   ```bash
   npm run probe:captions
   ```
2. **Migrations are not applied to Hostinger MySQL.** `npm run db:migrate`
   then `npm run db:seed`.
3. **The UI has never been exercised against a live database or a live
   Anthropic/YouTube API call.** Every PR-08→13 build was verified with
   `npm run build` / `typecheck` / `lint` / `test` only — no `DATABASE_URL`
   was available in that environment. Treat the UI as compiled and
   internally consistent with the frozen schema and contract, not as
   proven against real data.

## 3. What PR-14 needs to wire up

- `/api/cron/poll` — new route handler, shared-secret header, calls
  `scripts/poll-sources.ts`'s logic (or the underlying functions it calls —
  don't shell out to the script from the route handler).
- Compare `CRON_SECRET` in constant time (`crypto.timingSafeEqual`, not `===`).
- Deploy per the `nextjs-deploy-hostinger` skill.
- HTTP basic auth on the subdomain, at the Hostinger level, not in the app —
  matches PLAN.md §0's "no login screen in v1" decision.
- Once live: apply the migration, ingest one real channel or video from
  `/ingest`, confirm an analysis is stored, confirm the header's spend
  counter reflects a real number.

Report honestly what is verified live versus only written, same as
`docs/HANDOFF-SONNET.md` asked of this track.

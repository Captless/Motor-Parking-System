# Release Guide — never-forget checklist

> Read this first every session. Update the Session Memory block every release.

## Session Memory (keep current)

- Current version: `1.0.4`
- Live on owner's phone: `1.0.1`
- In flight: `1.0.4` — Analytics rebuilt as a **Today-first overview**:
  a today hero (collected vs yesterday, bikes, parked now), a week to
  date vs last week with average ticket, and a global unpaid card with
  oldest-debt age linking to History. Trend line, calendar, period tabs,
  ledger, rhythm note, averages, performance cards, insights, and
  outlook were all cut on purpose.
  Not yet merged/deployed.
- Shipped: `1.0.1` — visible versioning, tab-bar consistency,
  update procedure.
- Also already committed on this branch: `1.0.3` (Operations delete for
  paid entries, TXT-default daily report with split PAID/UNPAID,
  silent 24h-throttled updates, Settings "Last update" line), plus the
  History/report correctness pass (paid parked deletion, cross-day paid
  display, report coverage/revenue wording).

## Version rules

- `patch` (1.0.1 → 1.0.2): fixes, tweaks, copy changes. Nearly every
  owner update is a patch.
- `minor` (1.0.x → 1.1.0): new user-visible feature.
- Never `major` during trial unless the storage format breaks.
- Every merge to `main` touching `src/` carries a bump. Docs-only skips it.

## Branch flow (human, manual)

1. `git checkout -b update/<short-name>` (e.g. `update/backup-reminder`).
2. Work happens on the branch. Push it: `git push -u origin update/<name>`.
3. Test the Cloudflare preview URL for that branch first.
4. Merge to `main` → Cloudflare Pages deploys production automatically.

## Per-release checklist (every session, in order)

0. Read Session Memory above; update it when done.
1. Bump: `npm version patch --no-git-tag-version`
   (or `minor`). No auto-commit — human owns git.
   This updates `package.json` + `package-lock.json`.
2. Implement the change (smallest diff that does the job).
3. Update `docs/owner-trial.md` if anything owner-visible changed.
4. `npm test -- --run` — must be green.
5. `npm run build` — must succeed; confirm the new version string
   is in the built JS bundle.
6. Hand back: exact commit / push / merge steps for the human's branch.

## Owner rollout (after every production deploy)

Tell the owner:

1. Close the app fully (swipe it away).
2. Reopen with mobile data on.
3. Settings → Data & storage → confirm the version number moved
   (e.g. v1.0.2 → v1.0.3). If it didn't move, repeat step 1.

Same procedure lives in `docs/owner-trial.md` §8. Keep both copies
in sync.

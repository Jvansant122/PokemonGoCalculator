# Plan: Login + persistent roster storage (auth infrastructure)

Self-contained implementation plan for a fresh Claude Code session. Read `CLAUDE.md` in
full first — this plan introduces the project's **first-ever backend dependency**, which
is exactly the kind of cross-cutting call `CLAUDE.md` says the overseer session should make
before delegating implementation, not something to improvise mid-task. Read `IDEAS.md`'s
"Power-Up Optimizer" section too — this plan exists to unblock that idea's step 2 (a scope
decision explicitly left open by `pogo-researcher` on 2026-09-07: no-login `Scenario`-URL
roster vs. real auth+persistence). The user has since decided: **build real login.**

## Why this needs its own plan instead of folding into the Optimizer's plan

Login + persistence is infrastructure the *whole app* could eventually use (saved rosters
today, but the same account system is the obvious place any future "remember my usual
settings" feature would live) — it shouldn't be scoped or built as a Power-Up-Optimizer-only
concern. Land this first, standalone, verified with a trivial feature (see "Minimal vertical
slice" below) before the Optimizer's own UI/engine work depends on it.

## Recommended architecture

**Firebase Authentication (Google Sign-In) + Cloud Firestore.** Reasoning, not just a
default pick:

- **No server, no change to hosting.** Both are client-SDK-only services — the app stays a
  static site built by Vite and deployed to GitHub Pages exactly as today (`CLAUDE.md`'s
  "Deployed as a static site to GitHub Pages" stays true; nothing about `deploy.yml` or the
  Vite `base` path changes). This ruled out anything requiring a real backend process
  (a Node/Express API, etc.) — that would be a much bigger, unjustified infra jump for what
  this feature actually needs.
- **No password handling, ever.** Google Sign-In via Firebase Auth is OAuth delegation —
  this app never sees, stores, or transmits a credential. That's not just simpler, it's the
  only acceptable option: this assistant is barred from ever entering or handling passwords
  on a user's behalf, and a hand-rolled email/password flow would put real user credentials
  in a hobby project's care for no benefit. Firebase also supports GitHub/anonymous sign-in
  behind the same SDK if a non-Google option is wanted later — start with Google only.
- **The Firebase Web API key is safe to commit.** Unlike a real secret, Firebase's client
  config (`apiKey`, `authDomain`, `projectId`, etc.) is meant to be public — it identifies
  the project, it doesn't authorize access. Real access control lives entirely in Firestore
  **security rules** (server-enforced, can't be bypassed from the client), not in keeping
  the config secret. Don't treat this config like a credential or gitignore it.
- **Firestore's per-document ownership model maps directly onto "one user's own roster."**
  A document keyed by the user's own `uid`, restricted by a security rule to
  `request.auth.uid == the path's uid`, is the entire access-control story — no custom
  authorization code needed.
- **Free tier is generous enough for a hobby project's real usage** (Spark plan: 50K reads
  + 20K writes/day, 1 GiB stored) — cost is not a practical concern here; still worth saying
  explicitly so a future session doesn't second-guess it.
- **Alternative considered and rejected for now, not because it's bad**: Supabase (Postgres
  + Auth) is an equally legitimate choice with a more powerful query model, but its
  row-level-security policies are SQL and meaningfully more setup than Firestore's rule
  syntax for this simple "one document per user" shape. Revisit if the data model ever needs
  real relational queries across users' rosters (it doesn't, today).

## This does NOT change the existing Scenario/query-param pattern — it adds to it

`CLAUDE.md`'s standing decision ("every user-facing assumption must round-trip through
`Scenario`") is about **shareable state on a URL**, and stays exactly as-is for all five
existing tabs. Login solves a *different* problem — "remember my stuff without a link" — not
a replacement for shareability. The Power-Up Optimizer (and anything else building on this)
should support **both**, not choose one:

- **Signed in**: roster autosaves to/loads from Firestore, tied to the account. No link
  needed for personal use.
- **Share button**: still encodes the current roster into a `Scenario`-family type + query
  param, exactly like every other tab — sharing a link never requires the *recipient* to be
  signed in, since the link carries the full state itself (same as today).

Don't let "we have real persistence now" become an excuse to skip the Scenario round-trip
for this tab — it's still a real, independent requirement.

## Two product-level constraints, decided up front (overseer call, 2026-09-07)

Neither of these is an implementation detail to settle mid-task; both follow from what this
app already is, so they're settled here:

- **Signed-out must stay fully functional, on every tab, forever.** This tool is a
  zero-account, client-side calculator today, and a shared link has to work for a recipient
  who has never signed in and never will. Auth is strictly additive — "remember my stuff"
  layered on top, never a gate in front of a calculation. If any part of the design starts
  requiring an account to see a number, that's the wrong design, not a missing login prompt.
  Concretely: the Optimizer's roster UI must work against local component state alone, with
  Firestore wired in as an *optional* sync on top, not as its state store.
- **Storing a user's data means owning its deletion.** Signing out is not deleting. Whatever
  ships must include a visible way to delete the stored roster document(s) from Firestore —
  not just clear them locally — and the sign-in UI should say plainly what is stored (roster
  contents; whatever the Google profile hands over, which is name/email/avatar). This is a
  small amount of work if designed in from the start and an awkward retrofit if not, which
  is the only reason it's pinned here rather than left to step 3.

## Data model

```
Firestore path: /users/{uid}/rosters/{rosterId}

{
  name: string,               // user-given label, e.g. "My raid team"
  updatedAt: Timestamp,
  slots: [
    {
      speciesId: string,
      attackIv: number,       // 0-15
      defenseIv: number,      // 0-15
      staminaIv: number,      // 0-15
      level: number,          // 1-50, step 0.5
      isShadow: boolean,      // reuse the existing shadow-toggle convention (see shadowToggle.ts)
      isLucky: boolean,
      isPurified: boolean,
      candyOnHand: number,
      candyXlOnHand: number,
    },
    // up to 6 slots
  ],
  stardustOnHand: number,
}
```

Firestore security rule (starting point, tighten during implementation as needed):

```
match /users/{uid}/rosters/{rosterId} {
  allow read, write: if request.auth != null && request.auth.uid == uid;
}
```

## Step-by-step

Note: **no existing subagent in `.claude/agents/` owns "auth/backend infrastructure"** —
`web-developer` explicitly never touches build/deploy config, `site-builder` explicitly
never implements UI features, and neither has ever dealt with a third-party backend SDK.
Two reasonable paths, pick one before starting:

- (a) The overseer session does the Firebase project setup + SDK wiring directly (it's
  genuinely cross-cutting/first-of-its-kind, which `CLAUDE.md` already says is grounds for
  doing something directly rather than delegating), then hands the resulting hooks
  (`useAuth()`, `useRoster()` or similar) to `web-developer` for the actual UI.
- (b) Ask `meta-architect` first whether a new subagent (e.g. `backend-integrator`) is
  worth defining, if this kind of work looks likely to recur (e.g. if login later expands
  beyond just the Optimizer).

This plan assumes (a) for a first pass — simpler, and this is one isolated feature so far.

### 1. Firebase project setup (manual, outside the codebase)

This step needs the **user**, not an agent — creating a Firebase project and enabling
Google Sign-In requires signing into a Google/Firebase console account, which is exactly
the kind of "create an account" action this assistant must never do on the user's behalf.
Hand the user this checklist:

1. Go to the Firebase console, create a new project (or reuse an existing one).
2. Enable **Authentication → Sign-in method → Google**.
3. Enable **Firestore Database** (start in production mode, not test mode — test mode
   allows open read/write and expires after 30 days).
4. Add a **Web app** to the project; copy the resulting config object
   (`apiKey`/`authDomain`/`projectId`/`storageBucket`/`messagingSenderId`/`appId`).
5. Under **Firestore → Rules**, paste the security rule above (or the implementer's
   refined version) and publish it.
6. Add the deployed GitHub Pages host to **Authentication → Settings → Authorized domains**.
   Enter it as a bare domain — `jvansant122.github.io`, no `https://` and no path — since
   that field takes a domain, not an origin or URL. Google Sign-In fails silently on an
   unauthorized domain, so this is worth getting right up front. `localhost` is already on
   that list by default, so local dev works before this step is done — which is exactly why
   this gotcha usually surfaces only after the first deploy.

Hand the copied config back to whichever agent/session does step 2.

### 2. Install + wire the SDK (`packages/web`)

- `npm install firebase --workspace=packages/web`.
- New file `packages/web/src/firebase.ts`: initializes the app once from the config
  (hardcoded is fine per the "safe to commit" note above; an env var is also fine if
  preferred for per-environment flexibility, but not required for security reasons).
- New file `packages/web/src/auth.ts` (or a `useAuth` hook): `signInWithPopup`/`signOut`/
  `onAuthStateChanged` wrapped as a small React hook exposing `{ user, signIn, signOut }`.
- New file `packages/web/src/rosterStore.ts` (or a `useRoster` hook): Firestore
  read/write/subscribe for the current user's roster document(s), matching the data model
  above.

### 3. Minimal vertical slice (verify before building the Optimizer on top of it)

Before wiring this into the Power-Up Optimizer tab at all, prove the plumbing works
end-to-end with the smallest possible surface:

- A sign-in/sign-out button in the site header (visible on every tab, not Optimizer-only —
  this is app-wide infrastructure).
- One trivial round-trip: e.g. save a single dummy field (a display name, or a "favorite
  species" dropdown) to Firestore and read it back after a page reload, signed in with a
  real Google account.
- Verify live in the browser: sign in, write, hard-refresh, confirm the value persisted;
  sign out; sign back in on the same account, confirm it's still there. Also verify the
  security rule actually blocks an unauthenticated read (check the browser console for a
  permission-denied error when signed out, don't just trust the rule text).

Only once this slice is proven should the Power-Up Optimizer's own roster UI (from
`IDEAS.md`) be built against `useRoster()`.

### 4. Wire into the Power-Up Optimizer (separate follow-up work, not this plan's scope)

Once the slice above is verified, resume `IDEAS.md`'s Power-Up Optimizer step list starting
at its step 3 (roster data model), using `useRoster()` for persistence and keeping the
existing `Scenario`+query-param pattern for the separate "share a link" feature. That
remains its own follow-up plan/session — don't scope-creep this plan into also building the
Optimizer's engine/UI work.

### 5. Verification

- `npm run test:engine` — unaffected by this plan (no engine changes), but run it anyway
  as a baseline before/after.
- `npx tsc --noEmit -p tsconfig.json` in `packages/web` (Firebase's types must resolve
  cleanly).
- `npm run build --workspace=packages/web` — confirm bundle size impact (Firebase's SDK is
  not tiny; check whether it's worth code-splitting/lazy-loading behind the sign-in button
  rather than bundling it into the initial page load). **Baseline measured 2026-09-07:
  1,457.67 kB raw / 184.97 kB gzipped, single chunk**, already over Vite's 500 kB warning
  threshold. Compare against that number, and weigh it in gzipped terms — that's what a user
  actually downloads, and it's the figure that decides whether lazy-loading is worth the
  complexity here.
- Manually exercise sign-in/sign-out and the vertical-slice round-trip live in the browser
  (see step 3) — this repo's convention is not to claim a UI feature works without actually
  driving it.
- A `skeptic` pass isn't very applicable here (it checks *displayed numbers* against game
  data) — a manual security-rule check (try reading another account's data while signed in
  as a different user, confirm it's denied) is the more relevant independent check for this
  specific feature.

## Open questions to resolve during implementation, not before

- Whether to support only Google Sign-In or add more providers later — start with Google
  only, this is not a blocking decision.
- Whether the roster document should be a single doc per user or a subcollection allowing
  multiple named rosters (the data model above already assumes multiple, via `rosterId` —
  confirm this is actually wanted before building multi-roster UI, since it may be
  overkill for v1 and a single implicit roster per user could ship faster).
- Whether to lazy-load the Firebase SDK behind the sign-in button (bundle size) — decide
  during step 5's build-size check, not speculatively now.
- Whether any of the other five tabs should eventually gain "save my usual assumptions"
  using this same auth layer — explicitly out of scope for this plan; note it as a
  possibility for `IDEAS.md` if it comes up, don't build toward it here.

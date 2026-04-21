# Teachbook — open items

A running list of work that's been designed or started but isn't finished.
This is not a wishlist — every entry here has either been implemented
partially, explicitly deferred with a reason, or blocks a later feature.

Authoritative roadmap (phases 0–9): [`docs/PLAN.md`](docs/PLAN.md).

## Near-term polish

### Auto-save / progress files
- Conflict detection if two Teachbook instances touch the same progress
  file. Today's auto-save is last-write-wins with no mtime check.
- Explicit **Finalise & submit** flow that locks the progress file after
  the student submits, so they can't accidentally edit graded answers.
- Per-attempt history: today the `<slug>-<student>-<date>.json` path is
  deterministic and overwrites within the day. Add a `-n` suffix for
  multi-attempts, plus a student-visible history viewer.

### Teacher push
- **Server-sent events** (SSE) instead of 15 s polling. Real-time
  delivery; zero extra UX change for students. Rust side needs a
  `tokio::sync::broadcast` wired into an `/api/stream` endpoint.
- OS notifications / audio on new push (student-side). Use
  `tauri-plugin-notification`.
- Student-side **acknowledgement** so the teacher can see who actually
  loaded a push, not just who could theoretically see it.

### Teacher dashboard
- Notification bell in the header when a submission arrives while the
  dashboard is closed. Today it auto-refreshes while open but you'd
  miss it with the window minimised.
- Bulk export submissions as a ZIP or CSV for gradebook import.
- Per-student aggregate view (all attempts across all quizzes).

### Editor
- Arrow endpoint drag (two handles per arrow) and graph-node drag.
  Today only `shape` + `label` are draggable.
- Polygon drag (currently disabled; vertex tweening doesn't exist).
- Drag snapping / axis constraints for structured notebooks.
- Inline hover SVG preview of a partial scene JSON object. Expensive
  if the renderer rejects partial shapes; needs a lenient render path.

### Quiz
- Partial-credit MCQ (multi-correct, weighted by overlap with the key).
- Author-time quiz validator — e.g. warn when no `[x]` is set on an
  `mcq` question, or when `>>` is missing for a `short` one.
- Rubric-less quizzes: grade against the notebook prose alone via
  Claude.
- Teacher read-only review mode: open a student's progress JSON as
  source, render all answers inline without allowing edits.
- Per-question time-on-task tracking.

## Security / hardening (deliberately deferred)

These are flagged in commit messages as explicit non-goals for the
current MVP. Re-opening any of them needs a design conversation first.

- **HTTPS + self-signed certs** on the teaching server. Cert pinning
  in the student client. Browser/webview trust prompts.
- **Authentication** between teacher and student. Options:
  - Pairing via QR code (teacher shows, student scans) exchanging an
    ed25519 pubkey + shared secret
  - IP + manual accept with fingerprint confirmation
- **API-key auth mode** for users who don't have Claude Code. Needs
  secret storage (OS keychain via `keyring`?). Out of current scope.
- **Signed third-party plugins**. Currently plugins are compile-time
  static. Runtime loading would need a security model we haven't
  designed.
- **Windows cancel support** for the Claude subprocess. `SIGTERM` is
  Unix-only; Windows uses a different termination mechanism (ctrl-break
  or TerminateProcess).

## Docs / release hygiene

- NOTEBOOK_FORMAT.md still uses the pre-Phase-6 quiz examples in the
  "Full example" section. Typed questions are documented in their own
  subsection but the end-to-end example isn't updated.
- CHANGELOG.md doesn't exist. We rely on commit messages; at some
  point a curated CHANGELOG per release would help.
- Pre-built Pyodide bundle under `public/pyodide/` for offline use.
  Today the Run pane fetches from jsdelivr on first run.

## Where to find the design notes

- Individual commit messages on `main` explain the "why" for each
  change (see `git log --oneline`).
- Phase-level design: [`docs/PLAN.md`](docs/PLAN.md) per-phase sections
  have a "Follow-ups" list that seeded most of this document.
- Architecture walk-through: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
  §4 (Data flow) covers the happy path for each feature area.

# Contributing to Teachbook

Thanks for your interest! Teachbook is a local-first, self-hosted teaching
app built by and for contributors who care about making step-by-step
learning work across every subject.

There are three common ways to contribute:

1. **New notebooks** — author a `.tbk` file demonstrating a concept
2. **New plugins** — add a primitive for a domain the engine doesn't cover
3. **Engine improvements** — bug fixes, new features, polish

Each has a different weight of review and coordination; start where you
fit.

## Getting set up

Requirements: **Node 18+**, **pnpm 10+**, **Rust stable**, and
[**Claude Code**](https://claude.com/claude-code) logged in.

```bash
git clone https://github.com/<you>/teachbook.git
cd teachbook
pnpm install
pnpm tauri dev
```

First run may compile for a minute — the Tauri app ships a Rust backend
and it needs a debug build. Subsequent runs are fast.

### Quick sanity checks

```bash
pnpm build                                                  # type-check + bundle frontend
cargo check --manifest-path src-tauri/Cargo.toml            # type-check Rust
```

Both should pass cleanly on `main`. If they don't, that's a bug — open an
issue.

## Contributing a new notebook

The easiest way to contribute. No code changes needed.

1. Write the `.tbk` file. See [`docs/NOTEBOOK_FORMAT.md`](docs/NOTEBOOK_FORMAT.md)
   for the reference and one of the bundled notebooks (`notebooks/*.tbk`)
   for a template.
2. Verify it loads and steps through cleanly in `pnpm tauri dev`:
   - Use **Open** to pick your file
   - Step from start to finish; every scene should render something
     meaningful
   - If any scenes show `unknown primitive: ...`, you referenced a
     primitive that doesn't exist
3. Add it to the Examples gallery by editing `src-tauri/src/examples.rs`:
   ```rust
   const MY_NOTEBOOK: &str = include_str!("../../notebooks/my-notebook.tbk");

   // ... in list_bundled_notebooks():
   BundledNotebook {
     filename: "my-notebook.tbk".into(),
     content: MY_NOTEBOOK.into(),
   },
   ```
4. Run the JSON validator:
   ```bash
   node --input-type=module -e '
   import { readFileSync, readdirSync } from "node:fs";
   import { join } from "node:path";
   const files = readdirSync("notebooks").filter(f => f.endsWith(".tbk"));
   for (const f of files) {
     const src = readFileSync(join("notebooks", f), "utf8");
     const re = /```scene[^\n]*\n([\s\S]*?)\n```/g;
     let m, n = 0;
     while ((m = re.exec(src))) { n++; try { JSON.parse(m[1]); } catch (e) { console.log(`${f} scene ${n}: ${e.message}`); } }
     console.log(`${f}: ${n} scenes`);
   }'
   ```
   Every scene must JSON-parse.

5. Commit (see commit style below) and open a PR.

### What makes a good notebook

- **4–12 scenes.** Shorter tend to feel rushed; longer benefit from being
  split into multiple cells.
- **Execution-trace discipline.** If you write code/pseudocode, the
  `code_lines` on step N+1 should logically follow step N. No silent
  jumps across unrelated functions — see the "Execution-trace discipline"
  section in `src/lib/prompts.ts`.
- **Stable `id`s for moving objects.** A projectile ball, a graph node
  you're currently visiting, a pointer advancing through an array — give
  each a consistent `id` across steps so Framer Motion tweens it.
- **Prose + code + scenes tell one coherent story.** Prose introduces;
  code shows the structure; scenes walk through the execution.
- **At least one quiz question.** Two or three is better. Students
  benefit from being asked to reflect.

## Contributing a new plugin

Extend the engine into a new domain. Full walkthrough in
[`docs/PLUGIN_AUTHORING.md`](docs/PLUGIN_AUTHORING.md).

High-level:

1. Open an issue describing the domain, the primitive's JSON shape, and a
   sample notebook idea. **Do this before writing code** — we'd rather
   iterate on the JSON contract in an issue than after a PR lands.
2. Create `src/plugins/<category>/<name>.tsx` implementing the
   `TeachbookPlugin` interface.
3. Register it in `src/plugins/index.ts` — import + push to `allPlugins`.
4. Add a demo notebook under `notebooks/` and wire it into
   `src-tauri/src/examples.rs`.
5. Run the sanity checks and open a PR.

## Contributing engine code

For bug fixes, features, or polish.

### Before you start

- Open an issue describing the bug or the proposed feature
- Check the backlog in [`docs/PLAN.md`](docs/PLAN.md) — we may already be
  planning the change
- For significant features, get a sign-off on the approach in the issue
  before writing lots of code

### Coding standards

- **TypeScript `strict: true`**. No `any` without a brief comment
  explaining why.
- **Function components** with explicit `Props` types. No `React.FC`.
- **Rust errors** across the IPC boundary: `Result<T, String>` with
  actionable strings.
- **Tailwind** for styling. Use `dark:` variants for dark mode.
- **Keep the Rust layer thin.** It exists for privileged operations
  (files, subprocesses, OS keychain later) — resist adding business
  logic.

### Commit messages

Follow the existing style in `git log`. Format:

```
<area>: <what> (<why in one clause if non-obvious>)

Optional body. Explain *why*, not what — the diff says what.
Wrap at ~72 columns. Use bullet points for lists of related changes.

Co-Authored-By: <name> <email>
```

Examples from recent commits:

- `Phase 1b: Claude CLI integration — chat + notebook generation`
- `Polish merge sort into a real execution trace + extend grid primitive`
- `Extend engine for graphs + DP: weighted/directed graph, matrix primitive, 2 new notebooks`

### PR checklist

- [ ] `pnpm build` passes
- [ ] `cargo check --manifest-path src-tauri/Cargo.toml` passes
- [ ] Existing notebooks still step through cleanly (`pnpm tauri dev`)
- [ ] If you changed the `.tbk` schema: updated
      [`docs/NOTEBOOK_FORMAT.md`](docs/NOTEBOOK_FORMAT.md),
      [`src/lib/prompts.ts`](src/lib/prompts.ts), and at least one example
      notebook in the same PR
- [ ] If you added or changed a primitive: a bundled notebook uses it
- [ ] Docs updated if the change is user-visible

## Branching and PRs

- `main` is always shippable — CI gates (when we add them) are green
- Create a topic branch: `<username>/<short-description>`
- Rebase before opening a PR; we prefer linear history
- Squash or amend to keep commit history meaningful — one meaningful
  commit is better than six "fix typo"s

## Questions, discussion, design

- **Bugs**: open an issue with a minimal reproduction and the notebook
  involved (if applicable)
- **Features**: open an issue first to align on approach
- **Plugins**: open an issue describing the schema before coding
- **Security**: do NOT open a public issue. Email the maintainer.

## License

By contributing, you agree that your contributions are licensed under
the MIT License — see [LICENSE](LICENSE).

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project structure

**Read [ARCHITECTURE.md](./ARCHITECTURE.md) before adding or moving any file.**
It defines the three layers (`app/` → `modules/` → `shared/`), the rule for
where a new file goes, and the invariants that cause real defects when broken.

Two that catch people immediately:

- Contact details (phone, email, domain, socials) live **only** in
  `src/shared/config/site.ts`. Never inline them.
- `messages/en.json`, `ru.json`, and `lt.json` must have identical key sets.

Verify with `npm run verify` before finishing (typecheck, locale parity, tests,
lint). CI runs the same checks plus a production build on every push.

A second editing session may be working in this tree at the same time. Stage
explicit paths — never `git add -A`.

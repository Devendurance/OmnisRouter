# Repository Notes

- This repo currently has no application source, package manifest, README, CI, or build/test/lint config at the root. Do not invent `npm`, `pnpm`, test, or dev-server commands unless a future manifest adds them.
- The root content is a repo-local OpenCode skills bundle: `.agents/skills/` plus `skills-lock.json`.
- `skills-lock.json` is the source of truth for installed skills and upstream hashes. It currently pins `ai-sdk`, `frontend-design`, and `nextjs`.
- Treat `.agents/skills/*` as vendored skill content. Edit it only when the task is explicitly about maintaining local OpenCode skills or instructions.
- For AI SDK, Next.js, or frontend-design guidance, load/read the matching skill under `.agents/skills/<name>/SKILL.md`; do not rely on this repo having an app-specific stack.

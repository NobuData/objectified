---
name: handle-ticket
description: Fetches the GitHub Issue for the current repo, implements it on branch ticket-<n>, tests, pushes, opens a PR with Copilot as reviewer, then returns to main.
---

# Handle ticket (`/handle-ticket <number>`)

When the user invokes **handle-ticket** with an issue number (for example `/handle-ticket 124`), treat that number as the **GitHub issue** in the **current repository** (e.g. `NobuData/objectified` for this workspace). Follow this workflow end to end unless the user stops you or the environment blocks a step (auth, permissions, missing `gh`, etc.).

## 1. Load the issue into context

- Fetch the full issue **title, body, labels, and any linked/previous discussion** needed to understand scope. Prefer the **user-github** MCP (or `gh issue view <number> --json ...`) so the ticket text is summarized and available in the conversation.
- **Do not invent** requirements; implement only what the issue and agreed clarifications describe.

## 2. Create and use branch `ticket-<number>`

- Ensure you have the latest **default branch** (usually `main`): `git fetch origin` and `git checkout main` (or the repo’s default), then `git pull`.
- Create and switch to **`ticket-<number>`** (example: issue `124` → `ticket-124`):
  - `git checkout -b ticket-<number>`
- All implementation commits for this ticket belong on this branch.

## 3. Implement

- Apply **CLAUDE.md** / **copilot-instructions.md** and other workspace rules (tests, version bumps, no edits to reference-only trees, etc.).
- Implement the behavior **as specified in the issue**.
- If the issue is **ambiguous, underspecified, or contradicts the codebase**, **ask concise clarifying questions** before large changes.
- If the change is **large or risky** and the issue alone is not enough to proceed safely, **outline a short plan** in the chat (and optionally in the PR later), then execute after alignment or per issue instructions.

## 4. Verify from repository root

- From the **repository root**, run the project’s standard checks so this ticket doesn’t regress the monorepo:
  - Run **`yarn test`** (and any package-specific tests the issue touches, per READMEs).
  - Run **`yarn build`** where required by workspace rules (e.g. after substantive **objectified-ui** changes, run it in **objectified-ui** per **CLAUDE.md**; if the repo root defines a single build/test entry, use that consistently).
- Fix failures **you introduced or that block the ticket** before committing.

## 5. Commit and push

- **Commit** with a clear message that references the issue (e.g. `Fix #124 — …` or `Addresses #124 — …`).
- **Push** the branch: `git push -u origin ticket-<number>` (use `-u` on first push).

## 6. Open a pull request

- Create a PR **from `ticket-<number>`** into the **default branch** using `gh pr create` or the GitHub UI.
- **PR title:** concise; include or reference the issue number.
- **PR body:** summarize **what was done**, **why**, **how to test**, and **risk/notes**. Use a markdown checklist if it helps. Link the issue (e.g. `Closes #124` or `Fixes #124` if the team uses auto-close semantics).

## 7. Assign Copilot as reviewer

- **Request a review from GitHub Copilot** on the PR. Use the same reviewer login your org uses when typing **@Copilot** in the GitHub reviewer field (often the Copilot PR-review bot account—confirm via UI or org docs). Examples to try:
  - `gh pr edit <pr-number> --add-reviewer <copilot-reviewer-login>`
  - or pass `--reviewer <copilot-reviewer-login>` at `gh pr create` if supported.
- If CLI assignment fails, use the **GitHub web UI** to add **Copilot** as a reviewer and note that in a comment if needed.

## 8. Return to default branch

- After the PR is created (and push is complete), switch back locally:
  - `git checkout main` (or the repo default branch), then optionally `git pull` so the workspace matches upstream.

## Constraints

- **Scope:** Only change what the ticket requires; avoid unrelated refactors.
- **Secrets:** Never commit credentials or tokens.
- **Blocked:** If `gh` is not authenticated, tests cannot be run, or the issue is inaccessible, say so clearly and stop after doing what is possible safely.

# Contributing to Fairway Friends

Start with README.md, AGENTS.md and docs/HANDOFF.md. The website is in apps/web; root importer/scoring modules are a separate implementation.

## Propose a change

1. Clone this repository if you have write access; otherwise fork it first.
2. Create a branch: `git switch -c fix/short-description`.
3. Install web dependencies using the pinned pnpm version and README instructions.
4. Make a focused change and run `npm test`, `npm run test:web`, and `npm run build` from the repository root.
5. Commit and push your branch, then open a pull request to main. Explain the problem, behavior change, checks and remaining limitations.

Do not include local databases, credentials, photos, node_modules or build output. Preserve third-party notices. Captured webpages used as fixtures must have embedded credentials and unnecessary third-party scripts removed.

Public visibility permits reading the code; pushing requires authorized write access. AI tools may need their own GitHub connection. Public visibility does not grant an open-source license.

## Verified baseline

[GitHub Actions run 42233991397](https://github.com/cchambruhs/fairway-friends/actions/runs/42233991397) passed dependency installation, standalone tests, web tests and production build for commit `351b7f364f9e52b6c59b7435d4662f0b983e6e86` on November 6, 2026. The local suites contained 54 standalone and 83 web tests.

Check the current Actions result when making changes; this historical baseline is not a guarantee about future commits. Automated tests do not verify live UDisc access, target-host authentication or production deployment. GitHub updates do not automatically deploy to Polsia.

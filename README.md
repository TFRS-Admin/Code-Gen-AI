# TFRS-Admin Repo Template

This is the base template for all new TFRS-Admin repositories.

When you create a new repo using this template, it will automatically create:

- `main` — production
- `develop` — active development (use this as your working branch)
- `staging` — pre-production testing
- `feature/init` — starting feature branch

## How to use this template

When creating a new repo on GitHub:
1. Click **"Use this template"** instead of creating a blank repo
2. The branch structure will auto-populate on first push

## Branch Rules

| Branch | Purpose |
|---|---|
| `main` | Production only — never commit directly |
| `develop` | All development work starts here |
| `staging` | Testing before going to production |
| `feature/*` | Individual features, branched from `develop` |

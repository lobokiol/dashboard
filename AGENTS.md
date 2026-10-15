# AGENTS.md

Guidance for AI agents working in this repository.

## Repository status

This repository is an empty starter for a future **dashboard** project. As of the initial commit, the only tracked file is `README.md`. There is no application source, dependency manifest, test suite, or service configuration yet.

## Cursor Cloud specific instructions

### What is (not) in this repo

- No `package.json`, `requirements.txt`, `go.mod`, or other dependency manifests
- No Docker or docker-compose configuration
- No `.env.example` or runtime config
- No lint, test, or build scripts

Until application code and manifests are added, there is nothing to install beyond what the VM already provides.

### VM runtimes available for future development

The cloud VM includes common runtimes that can be used once the project is scaffolded:

| Runtime | Version (approx.) | Notes |
|---------|-------------------|-------|
| Node.js | v22.x (via nvm) | npm included |
| Python | 3.12.x | system Python |
| Go | 1.22.x | system Go |

Docker is not pre-installed on the VM. If the project later requires containerized services, install Docker during setup or document an alternative (e.g. local Postgres via apt, cloud-hosted DB).

### Standard commands (when code exists)

Once manifests and scripts are added, document them here. Expected placeholders:

- **Install:** TBD (e.g. `npm install`, `pnpm install`)
- **Dev server:** TBD (e.g. `npm run dev`)
- **Lint:** TBD
- **Test:** TBD
- **Build:** TBD

### Git

- Default branch: `main`
- Remote: `https://github.com/lobokiol/dashboard`

When adding a dashboard app, prefer updating `README.md` with setup/run instructions and adding a `.env.example` if secrets are required.

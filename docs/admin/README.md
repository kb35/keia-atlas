# Keia Atlas admin guide

This guide is for the person who installs and runs Keia Atlas for a team. It is being written alongside the [road to production](../../ROADMAP.md#road-to-production); each section below says what exists today. Until a section is written, the page it points to is the best source.

In v0.1 there is one way to run Atlas, repo mode: your records as YAML in a private Git repository, built into a static site you host behind your own sign-in. Database mode, with its own sign-in, roles and live connectors, is designed in [docs/architecture.md](../architecture.md) and not built yet.

## Sections to come

| Section | What it will cover | Status today |
|---|---|---|
| **Install** | Running Atlas on your own server or container host, from one command for a small team to Kubernetes and OpenShift. | Repo mode only: see [GETTING-STARTED, "Host it"](../../GETTING-STARTED.md#6-host-it), the `Dockerfile` and `compose.yaml`. |
| **Configure** | Your house values, where the site is served from, which modules are on, and the settings a real estate needs that the demo does not. | Partly in [GETTING-STARTED, section 4](../../GETTING-STARTED.md#4-replace-the-demo-data-with-your-own); the switch that turns off the demo-only checks is not built yet (M1). |
| **Back up and restore** | What to back up, how often, and a restore you have practised. | Repo mode: your Git host is the backup. Database-mode backups are designed ([architecture, 7.4](../architecture.md#74-backups-and-restore)), not built. |
| **Upgrade** | Moving to a new version without losing data: reading the changelog, running migrations, rolling back. | Pull the new release and run `npm run validate`; data migrations are kept in `tools/migrations/`. See [CHANGELOG.md](../../CHANGELOG.md). |
| **Connectors** | Connecting the tools you already run, with read-only access and credentials from your vault. | File importers only (spreadsheet and NetBox): see [docs/connectors/](../connectors/README.md). No live connectors yet. |
| **Security** | Keeping the record private, sign-in, secrets in a vault, checking a release's signature and SBOM (software bill of materials). | Follow "Keep your workplace data safe" in the [README](../../README.md#keep-your-workplace-data-safe) and [SECURITY.md](../../SECURITY.md). No sign-in of its own: put it behind your reverse proxy's single sign-on. |
| **Troubleshooting** | What an error means and what to do about it: validation failures, build failures, a page that looks wrong. | `npm run validate` names the file, the line and the rule that failed; the rule book is in [docs/rules/](../rules/README.md). |

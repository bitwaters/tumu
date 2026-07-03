## Context

The repository already includes a production Compose file, preflight validation, smoke checks, backup scripts, and `.env.production.example`. The remaining handoff friction is creating `.env.production` safely. Operators must replace every `CHANGE_ME` value, choose URLs, and avoid committing the result.

## Goals / Non-Goals

**Goals:**
- Generate `.env.production` with cryptographically random PostgreSQL, MinIO, JWT, and smoke password values.
- Accept a required host/IP argument and derive `PUBLIC_API_BASE_URL` and `PUBLIC_WEB_BASE_URL`.
- Preserve explicit operator choices for ports, backup directory, smoke username, and image tag.
- Refuse to overwrite an existing `.env.production` unless `--force` is provided.
- Keep the generated file out of Git and compatible with existing preflight/Compose scripts.

**Non-Goals:**
- Create production users or seed production data.
- Start Docker services or run migrations.
- Manage DNS/TLS/reverse proxy certificates.

## Decisions

1. **Use a Node script instead of shell-only generation.**  
   Node is already required by the project and provides portable `crypto.randomBytes`, argument parsing, and safe file handling across macOS/Linux.

2. **Require `--host` as the main operator input.**  
   Public URLs need a concrete host/IP. Requiring it avoids silently generating unusable `SERVER_HOSTNAME_OR_IP` URLs.

3. **Generate all secrets by default.**  
   Operators should not invent passwords by hand. The script can still accept smoke account options so smoke checks can match a real account created later.

4. **Do not run preflight automatically.**  
   Preflight checks backup directory existence and Docker availability. The initializer writes config; the operator then runs `npm run prod:preflight` after preparing the backup path.

## Risks / Trade-offs

- [Risk] A generated smoke password may not match an actual production user.  
  Mitigation: document `--smoke-username` and `--smoke-password`; smoke remains a post-deployment validation step after creating/importing that user.

- [Risk] Generated local file contains real secrets.  
  Mitigation: `.env.production` remains gitignored, and the script refuses to print secrets to stdout.

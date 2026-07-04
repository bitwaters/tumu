## Context

The repository already has production Docker Compose, environment initialization, preflight validation, image build, migration, startup/status, and smoke scripts. Operators still need to remember and run these commands in the right order.

## Goals / Non-Goals

**Goals:**
- Provide one command for first deployment and repeat deployments.
- Keep deployment behavior transparent by printing each step.
- Reuse existing scripts rather than duplicating their validation logic.
- Make script tests possible without starting Docker by supporting a dry-run mode.

**Non-Goals:**
- Install Docker or system packages.
- Create production smoke users automatically.
- Manage TLS, DNS, or reverse proxy configuration.

## Decisions

1. **Use a shell script orchestration layer.**  
   Existing production operations are shell/npm/Compose commands. A shell wrapper keeps server usage simple and avoids adding dependencies.

2. **Generate `.env.production` only when missing.**  
   Existing production secrets must not be overwritten during routine upgrades. Operators can still run `prod:init-env -- --force` explicitly if they intend to replace the env file.

3. **Run migration after Compose startup.**  
   This matches the existing documented flow and ensures PostgreSQL is healthy before migrations run.

4. **Support dry-run tests.**  
   `DEPLOY_DRY_RUN=true` will print the exact command sequence without executing Docker, allowing deterministic script-level tests.

## Risks / Trade-offs

- [Risk] Smoke checks can fail if the smoke account has not been created yet.  
  Mitigation: document `--skip-smoke` for pre-account deployments and keep smoke enabled by default.

- [Risk] Initial backup directory creation may require sudo.  
  Mitigation: keep preflight strict and document that the directory must exist and be writable before deployment.

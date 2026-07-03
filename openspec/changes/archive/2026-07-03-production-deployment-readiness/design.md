## Context

The project now has a React frontend, Node.js API, Prisma/PostgreSQL persistence, Redis, MinIO/S3-compatible photo storage, and API-backed smoke validation. The current `infra/docker-compose.yml` is development-oriented: it mounts the repository, installs dependencies at container start, runs Vite dev server, and contains development credentials. A production deployment on an intranet project server needs repeatable runtime configuration, health checks, migration steps, backup/restore operations, and a clear operator runbook.

The first production target is a single Linux server or VM managed with Docker Compose. The system must remain usable without Kubernetes, external CI/CD, enterprise SSO, or managed cloud services.

## Goals / Non-Goals

**Goals:**

- Provide a production Compose topology that runs built API and Web services with persistent PostgreSQL and object storage data.
- Separate required production configuration from development defaults through environment templates.
- Add scripts for preflight validation, database migration, deployment smoke checks, PostgreSQL backup/restore, and MinIO object backup/restore.
- Document first deployment, upgrade, rollback, backup verification, and day-two operational checks.
- Preserve the existing local development workflow.

**Non-Goals:**

- Do not introduce Kubernetes, Helm, Terraform, cloud load balancers, or external CI/CD.
- Do not implement enterprise SSO, SMS, DingTalk, WeChat, or external notification integrations.
- Do not implement full import/export business features in this change.
- Do not replace PostgreSQL/MinIO with managed services, though the environment model should allow those endpoints later.

## Decisions

1. **Use a separate production Compose file instead of overloading the development Compose file.**

   Production needs pinned images, restart policies, health checks, no source-code bind mount, and production commands. Keeping `infra/docker-compose.yml` for local development avoids breaking developer ergonomics.

2. **Build application images locally from repository Dockerfiles.**

   The first intranet deployment may not have a container registry. Local Dockerfile builds keep deployment repeatable while allowing a future registry tag to be introduced without changing service contracts.

3. **Use a generated/static Web image served by Nginx.**

   Production should serve `apps/web/dist` as static files instead of running Vite. The API base URL should be supplied at build time or via a small runtime config file if implemented.

4. **Run migrations as an explicit deployment step.**

   API startup should not silently mutate production schema. The runbook and script will run `npm run db:migrate` against the configured `DATABASE_URL` before API/Web rollout.

5. **Use filesystem backup artifacts as the first backup target.**

   The intranet server can write backup archives to a mounted directory. Scripts should create timestamped PostgreSQL dumps and MinIO object archives, then verify the output files exist and are non-empty.

6. **Keep secrets in `.env.production`, not committed defaults.**

   The repository should provide `.env.production.example` with required keys and comments. Real passwords, JWT secret, and object storage credentials must be provided by the operator.

## Risks / Trade-offs

- **[Risk] Single-server Compose is simpler but not highly available.**  
  Mitigation: document this as a v1 deployment baseline and keep service definitions portable for later clustered deployment.

- **[Risk] Build-time frontend API URLs can be awkward when server hostnames change.**  
  Mitigation: document the required `VITE_API_BASE_URL` value and validate it in preflight. Runtime config can be added later if frequent hostname changes become common.

- **[Risk] Backup scripts can give false confidence if restore is never tested.**  
  Mitigation: include a restore dry-run or restore-to-target workflow and require a backup verification command in the production checklist.

- **[Risk] Pinned container digests improve reproducibility but require maintenance.**  
  Mitigation: centralize pinned images in Compose and document upgrade steps.

## Migration Plan

1. Add production Dockerfiles, Compose file, environment template, scripts, and deployment documentation.
2. Validate production configuration with `docker compose config`, local build, migration, startup, health, and smoke checks.
3. Deploy to the intranet server by copying the repository or release bundle, creating `.env.production`, running preflight, running migrations, and starting production Compose.
4. Roll back by stopping production Compose, checking out the previous Git commit or image tag, rerunning migrations only when safe, and restoring database/object backups when data rollback is explicitly required.

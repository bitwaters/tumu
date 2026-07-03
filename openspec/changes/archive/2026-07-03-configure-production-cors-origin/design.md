## Context

The API currently sets CORS headers in `http.ts` with a hard-coded wildcard origin. The production Web URL is already known during environment bootstrap as `PUBLIC_WEB_BASE_URL`, making it a natural default for the allowed API origin.

## Goals / Non-Goals

**Goals:**
- Let the API emit a configured `Access-Control-Allow-Origin` value.
- Preserve `*` as the development fallback when no value is configured.
- Generate and validate `API_CORS_ORIGIN` for production deployments.
- Keep the change limited to response headers; no session-cookie or CSRF behavior changes.

**Non-Goals:**
- Implement multi-origin CORS allowlists.
- Add credentialed cookie auth.
- Add reverse proxy or TLS certificate management.

## Decisions

1. **Single origin string.**  
   The intranet deployment has one Web origin. A single `API_CORS_ORIGIN` keeps the configuration obvious and testable.

2. **Use `PUBLIC_WEB_BASE_URL` as the generated production default.**  
   Operators already provide or derive the Web URL, so the production API should allow that same browser origin.

3. **Keep local default as `*`.**  
   Local development and tests often use varying hosts/ports. Production preflight will require the explicit value.

## Risks / Trade-offs

- [Risk] Operators using a reverse proxy/domain must set the final browser-visible Web URL.  
  Mitigation: document `API_CORS_ORIGIN` and keep `--web-url` override in the env initializer.

## Why

The API currently returns `Access-Control-Allow-Origin: *` for every response. A production intranet deployment should explicitly allow the deployed Web origin so browser access is predictable and not broader than needed.

## What Changes

- Add an API CORS origin configuration value.
- Keep local development default permissive for convenience.
- Generate `API_CORS_ORIGIN` in `.env.production` from the production Web URL.
- Pass the configured origin through the production Compose runtime.
- Add HTTP/config tests for configured CORS headers.

## Capabilities

### New Capabilities

### Modified Capabilities
- `production-runtime-deployment`: Add production CORS origin configuration to the runtime environment and validation expectations.

## Impact

- API config and HTTP response helpers.
- Production env bootstrap, example env, preflight, and Compose environment.
- Production deployment docs and script tests.

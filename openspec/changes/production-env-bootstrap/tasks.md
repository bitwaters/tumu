## 1. Environment Bootstrap Script

- [x] 1.1 Add `scripts/prod/init-env.mjs` to generate `.env.production` with random production secrets and host-derived public URLs.
- [x] 1.2 Add `prod:init-env` package script and ensure `.env.production` remains ignored.
- [x] 1.3 Add focused script tests for host validation, no-overwrite behavior, generated secret replacement, and force overwrite.

## 2. Documentation And Verification

- [x] 2.1 Update production deployment and backend setup docs to use the bootstrap command.
- [x] 2.2 Run script tests, production Compose config validation against generated env, and OpenSpec validation.
- [ ] 2.3 Archive the OpenSpec change after all tasks complete.

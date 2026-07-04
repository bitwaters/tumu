## 1. Deploy Command

- [ ] 1.1 Add a production deploy script that orchestrates env initialization, preflight, build, up, migrate, status, and smoke.
- [ ] 1.2 Add a root `prod:deploy` package script.
- [ ] 1.3 Support `--host`, env bootstrap pass-through options, `--skip-smoke`, and dry-run command sequencing.

## 2. Documentation And Tests

- [ ] 2.1 Update production deployment docs to recommend `npm run prod:deploy`.
- [ ] 2.2 Add script tests for first-deploy env initialization, existing env preservation, default sequence, and skip-smoke behavior.
- [ ] 2.3 Run deploy script tests, production env/preflight validation, builds/typechecks, and OpenSpec validation.

## 3. Archive

- [ ] 3.1 Archive the OpenSpec change after implementation completes.

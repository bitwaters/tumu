## 1. Runtime Configuration

- [x] 1.1 Add `API_CORS_ORIGIN` to API config with a development fallback of `*`.
- [x] 1.2 Use configured CORS origin for normal, error, and OPTIONS responses.
- [x] 1.3 Pass `API_CORS_ORIGIN` through production Compose.

## 2. Environment Bootstrap And Docs

- [x] 2.1 Generate `API_CORS_ORIGIN` from the production Web URL in `prod:init-env`.
- [x] 2.2 Add the value to `.env.production.example`, preflight required keys, and deployment docs.

## 3. Tests And Archive

- [x] 3.1 Add tests for configured CORS header behavior and generated production env values.
- [x] 3.2 Run targeted tests, production env validation, builds/typechecks, and OpenSpec validation.
- [x] 3.3 Archive the OpenSpec change after all tasks complete.

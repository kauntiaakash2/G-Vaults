# Controlled Performance and Rate-Limit Baseline

**Date:** 29 August 2026  
**Environment:** Local WSL2/Docker Desktop, one NestJS development process,
PostgreSQL and MinIO Compose services, seeded development dataset  
**Scope:** Bounded application-layer probe only; this was not a DDoS test

## Request profile and results

| Endpoint/profile | Requests | Status distribution | p50 | p95 | p99 |
| --- | ---: | --- | ---: | ---: | ---: |
| `POST /api/auth/login`, deliberately wrong password, sequential | 12 | 8 × 401, 4 × 429 | 231.4 ms | 244.7 ms | 244.7 ms |
| `GET /api/search?q=phase1-rate-probe`, authenticated concurrent burst | 65 | 60 × 200, 5 × 429 | 335.0 ms | 472.4 ms | 486.2 ms |

The search result threshold matches the configured 60 requests/minute. The
login run began in an already-used one-minute bucket, explaining four rather
than two throttled requests against a nominal threshold of ten.

## Interpretation

- Login and search rate limits are active in the observed single process.
- The measurements include development-mode overhead and a small dataset; they
  are not production capacity targets.
- The in-memory limiter is not shared across API replicas or restarts.
- Request identity depends on Express `request.ip`; reverse-proxy trust must be
  explicitly configured before deployment.
- CPU, memory, database connections and OCR saturation were not captured in
  this Phase 1 probe.
- No before/after performance optimization claim is made.

## Next baseline work

- Run a scripted, repeatable k6/autocannon test against an isolated deployment.
- Capture CPU, resident memory, PostgreSQL connections and MinIO/OCR metrics.
- Test upload/download and duplicate OCR triggers with bounded concurrency.
- Define dataset size and acceptable service-level objectives before tuning.


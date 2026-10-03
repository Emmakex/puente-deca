# Runtime health, readiness and metrics

Puente DeCA exposes separate endpoints for liveness, readiness and internal metrics.

## Liveness

```text
GET /health
```

Purpose: prove that the Node process can accept HTTP requests.

It deliberately does not query MongoDB or GridFS.

Expected response:

```json
{
  "status": "ok",
  "service": "puente-deca"
}
```

## Readiness

```text
GET /ready
```

Purpose: determine whether the service can perform real DeCA operations.

The endpoint probes:

- metadata persistence;
- PDF artifact storage.

Production therefore checks both MongoDB Atlas metadata and the GridFS bucket.

No connection strings, host names, exception messages or credentials are returned.

Ready:

```json
{
  "status": "ready",
  "service": "puente-deca",
  "components": {
    "metadata": "ok",
    "artifacts": "ok"
  }
}
```

A dependency failure returns HTTP 503 with only `unavailable` component status.

Kairoseth Platform should use `/ready`, not `/health`, when deciding whether the Puente DeCA workspace is operational.

## Metrics

```text
GET /metrics
X-Kairoseth-Service-Secret: <server-only secret>
```

The endpoint uses Prometheus text format and is protected by the same server-to-server secret used by Kairoseth Platform.

Current low-cardinality process metrics:

- `puente_deca_requests_total`
- `puente_deca_active_requests`
- `puente_deca_responses_2xx_total`
- `puente_deca_responses_4xx_total`
- `puente_deca_responses_5xx_total`
- `puente_deca_uptime_seconds`
- `puente_deca_memory_rss_bytes`
- `puente_deca_memory_heap_used_bytes`

No organization, shipment, credential, document or URL-token labels are emitted.

## Monitoring guidance

- liveness failure: restart/process-level incident;
- readiness failure with liveness OK: dependency/configuration incident;
- sustained 5xx growth: application/dependency incident;
- active request growth without completion: saturation or downstream latency;
- RSS/heap growth: investigate memory pressure/leaks.

These process metrics are defense/operations signals, not billing or customer analytics.

# Authenticated API rate limiting

Puente DeCA applies a lightweight per-process fixed-window limit after successful authentication.

## Identity key

Kairoseth Platform service calls:

```text
platform:<organizationId>
```

Connector calls:

```text
connector:<credentialId>
```

This avoids IP-based coupling. Many organizations may legitimately reach the engine from the same Kairoseth infrastructure address, and connector traffic may pass through proxies.

## Default

```text
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=600
RATE_LIMIT_MAX_ENTRIES=10000
```

The default therefore allows 600 authenticated requests per minute per Kairoseth organization or connector credential, per service process.

## Response

When the limit is exceeded:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: <seconds>
X-RateLimit-Limit: 600
X-RateLimit-Remaining: 0
```

Body:

```json
{
  "error": "rate_limited",
  "message": "Too many authenticated requests"
}
```

## Scope and limitations

This limiter is defense-in-depth for authenticated operational API traffic.

It is deliberately:

- low dependency;
- bounded in memory;
- isolated per authenticated subject;
- free of customer/domain labels in metrics;
- independent of client IP and forwarded headers.

It is **not** a global distributed or volumetric DDoS control. Multiple Puente DeCA processes each keep their own counters.

Public QR traffic should be protected separately at the Kairoseth/Hostinger edge or reverse-proxy layer. Unauthenticated credential brute-force and volumetric network abuse also belong at that edge/WAF layer.

## Scaling direction

If Puente DeCA moves to many replicas and needs a strict global API quota, replace the per-process limiter with a shared backend/edge limit without changing the API's 429 contract.

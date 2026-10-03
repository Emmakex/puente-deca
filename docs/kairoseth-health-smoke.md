# Kairoseth protected Puente DeCA health smoke

After deployment, verify the complete Kairoseth → engine readiness chain without creating customer data:

```bash
OPERATIONS_HEALTH_SECRET='<same secret configured in Kairoseth>' \
npm run production:kairoseth-health-smoke
```

The command calls:

```text
https://kairoseth.com/api/health/puente-deca
```

with Bearer authentication and requires:

```json
{
  "status": "ok",
  "service": "puente-deca-health",
  "engine": "ready"
}
```

It follows no redirects and never prints the operations secret.

A green result proves that the public Kairoseth application can reach the configured Puente DeCA service and that the engine's own dependency-aware `/ready` check reports MongoDB + GridFS available.

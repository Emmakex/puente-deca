# Production container

Puente DeCA ships a production-oriented OCI/Docker image contract.

## Build

```bash
docker build -t puente-deca:local .
```

The image uses two stages:

1. dependency stage — installs the committed lockfile using `npm ci --omit=dev --ignore-scripts`;
2. runtime stage — copies only the API, runtime packages and production dependencies.

The repository, tests, docs, examples and connector source are not copied into the runtime image.

## Runtime identity

The final process runs as the built-in non-root `node` user.

No production secret is baked into the image.

Required values such as `MONGODB_URI` and `KAIROSETH_SERVICE_SECRET` are runtime environment variables or secret mounts managed by the deployment platform.

## Health

The image healthcheck calls:

```text
GET http://127.0.0.1:$PORT/ready
```

It deliberately does not call `/health`.

A container whose Node process is alive but whose MongoDB/GridFS dependencies are unavailable must become unhealthy.

## Recommended runtime restrictions

Puente DeCA does not need a writable application filesystem in production because metadata and PDFs live in Atlas/GridFS.

Recommended container settings:

```text
read-only root filesystem
no-new-privileges
drop all Linux capabilities
init process enabled
runtime secrets injected externally
only the application port exposed to the trusted Kairoseth/service network
```

Example local hardening smoke:

```bash
docker run --rm \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=32m \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --init \
  puente-deca:local
```

Production still requires the environment described in `docs/deployment-runbook.md`.

## Image release policy

Do not publish a public production image merely because the Docker build succeeds.

The image becomes a release candidate only after:

- fast CI is green;
- production preflight is green;
- Atlas/GridFS live smoke is green;
- Kairoseth protected-health smoke is green;
- public PDF smoke is green;
- connector compatibility smokes and backup/restore gates required for the release are green.

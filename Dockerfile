# syntax=docker/dockerfile:1.7

FROM node:22.23.3-bookworm-slim AS dependencies

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json .npmrc ./

RUN npm ci \
      --omit=dev \
      --ignore-scripts \
      --no-audit \
      --no-fund \
    && npm cache clean --force


FROM node:22.23.3-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    PORT=8080

COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules

COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node apps/api ./apps/api
COPY --chown=node:node connectors/woocommerce ./connectors/woocommerce
COPY --chown=node:node connectors/prestashop ./connectors/prestashop
COPY --chown=node:node connectors/file-import ./connectors/file-import
COPY --chown=node:node packages/contracts ./packages/contracts
COPY --chown=node:node packages/core ./packages/core
COPY --chown=node:node packages/document-engine ./packages/document-engine
COPY --chown=node:node packages/ecmr-amendment ./packages/ecmr-amendment
COPY --chown=node:node packages/ecmr-signature ./packages/ecmr-signature
COPY --chown=node:node packages/ecmr-xml ./packages/ecmr-xml
COPY --chown=node:node packages/persistence ./packages/persistence

USER node

EXPOSE 8080

HEALTHCHECK \
  --interval=30s \
  --timeout=5s \
  --start-period=15s \
  --retries=3 \
  CMD ["node", "-e", "const port=process.env.PORT||'8080';fetch('http://127.0.0.1:'+port+'/ready').then((response)=>process.exit(response.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "apps/api/src/main.mjs"]

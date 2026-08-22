# The-Lab IoT socket-server (access-control WS + offline allowlist) production image.
# Coolify builds this with Base Directory = lab-site/the-lab/vps (a second app alongside the
# Next.js one; see lab-stack/coolify/reconcile.sh --app socket-server).
# Hardened per @rules/topic-container-k8s: minimal base, multi-stage, NON-ROOT, no secrets baked
# (Coolify injects env at runtime — @rules/workflow-secrets.md).
# SUPPLY-CHAIN TODO (@rules/std-supplychain.md): pin the base image by digest before production.

# ---- deps: install prod-only from the committed lockfile ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- runner: minimal, non-root runtime ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001
RUN apk add --no-cache curl && addgroup -g 1001 -S nodejs && adduser -S socketsvc -u 1001
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=socketsvc:nodejs package.json ./
COPY --chown=socketsvc:nodejs socket-server.js ./
COPY --chown=socketsvc:nodejs lib ./lib
USER socketsvc
EXPOSE 3001
# Liveness: the socket-server's own healthcheck route (returns {status:'ok'}).
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/status/healthcheck').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "socket-server.js"]

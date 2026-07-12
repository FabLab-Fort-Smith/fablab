# Next.js (App Router) production image for self-hosting on Coolify.
# Coolify builds this with Base Directory = lab-site/the-lab (ADR 0002/0005).
# Hardened per @rules/topic-container-k8s: minimal base, multi-stage, NON-ROOT, read-only-friendly,
# no secrets baked in (Coolify injects env at runtime — @rules/workflow-secrets.md).
# SUPPLY-CHAIN TODO (@rules/std-supplychain.md): pin the base image by digest before production.

# ---- deps: install from a clean lockfile ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci

# ---- builder: compile the standalone server bundle ----
FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- runner: minimal, non-root runtime ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
# Standalone output + the assets it does NOT bundle (static chunks, public/ incl. PWA sw).
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
# Liveness: the server answers on the port (any HTTP response = up). Coolify may override.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)).then(()=>process.exit(0)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

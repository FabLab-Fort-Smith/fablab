# Node 20 LTS — required by fastify 5 (Node 18 is EOL). See issue #115.
FROM node:20-alpine

WORKDIR /app

# Install from the committed lockfile for reproducible, pinned deps (§9).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000

CMD ["node", "index.js"]

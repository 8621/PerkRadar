# Official Node image publishes linux/amd64 and linux/arm64.
# Docker Desktop on a Mac builds the architecture of that machine; do not pin --platform.
FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Build while devDependencies are present, then drop them.
# next.config.mjs is plain JavaScript, so `next start` does not install TypeScript.
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=38471

RUN mkdir -p /data && chown -R node:node /data
VOLUME /data
EXPOSE 38471

# Run as the unprivileged node user (uid 1000). A host bind mount at /data
# must still be writable by that uid; see docs/OPERATIONS.md.
USER node

CMD ["npm", "run", "start"]

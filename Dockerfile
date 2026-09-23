# syntax=docker/dockerfile:1
# ---- build the web UI ----
FROM node:24-bookworm-slim AS web
WORKDIR /app
ARG VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
COPY package.json package-lock.json ./
# the npm cache survives between builds, so a changed lockfile only downloads what is new
RUN --mount=type=cache,target=/root/.npm npm ci --prefer-offline --no-audit --no-fund
COPY tsconfig.json vite.config.ts ./
COPY web ./web
RUN npx vite build

# ---- runtime: Node API + Python CP-SAT solver ----
FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=5178
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY solver/requirements.txt solver/
RUN python3 -m venv solver/.venv && solver/.venv/bin/pip install --no-cache-dir -r solver/requirements.txt
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --prefer-offline --no-audit --no-fund
COPY tsconfig.json ./
COPY server ./server
COPY scripts ./scripts
COPY solver/cpsat.py solver/
COPY extension ./extension
COPY --from=web /app/dist ./dist
# app files stay root-owned and read-only; the app only writes to the mounted data/ (uid 1000)
USER node
EXPOSE 5178
CMD ["node", "--import", "tsx", "server/index.ts"]

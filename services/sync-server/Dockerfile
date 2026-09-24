# syntax=docker/dockerfile:1
#
# Build context is the REPO ROOT, not this directory — this package has
# TypeScript project references into packages/db and packages/types and cannot
# compile on its own:
#
#   docker build -f services/sync-server/Dockerfile .

FROM node:22-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# ---------------------------------------------------------------------------
# build: install everything, compile, then carve this one service out.
# ---------------------------------------------------------------------------
FROM base AS build

# The same system packages CI installs, for the same reason: bcrypt and canvas
# have no prebuilt binary for this Node and compile from source. They are
# needed here and deliberately not in the runtime stage.
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential python3 \
      libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /repo
COPY . .

# There is no .git in here, so the prepare hook would only print a warning.
# Skipping it outright keeps the log honest.
ENV HUSKY=0
RUN pnpm install --frozen-lockfile

# The trailing "..." builds this package's workspace dependencies first.
RUN pnpm build --filter=@canvasflow/sync-server...

# Collect the service and its workspace deps into one self-contained tree.
# --legacy is required: from v10, pnpm refuses to deploy from a workspace that
# does not set inject-workspace-packages, and this one does not.
#
# A legacy deploy resolves every package again from the registry rather than
# from the lockfile, and holding that metadata outgrew Node's default heap of
# about 2 GB on the builder. 4 GB is for this build step only; the running
# service never sees it.
RUN NODE_OPTIONS=--max-old-space-size=4096 pnpm --filter=@canvasflow/sync-server deploy --prod --legacy /out

# ---------------------------------------------------------------------------
# runtime: Node and the deployed tree, nothing else.
# ---------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out /app
USER node
# WebSocket, then the HTTP routes (/health, /internal/board-access).
EXPOSE 4000 4001
CMD ["node", "dist/index.js"]

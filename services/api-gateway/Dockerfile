# syntax=docker/dockerfile:1
#
# Build context is the REPO ROOT, not this directory — the build reaches into
# packages/db and packages/types, and turbo needs the whole graph to order it:
#
#   docker build -f services/api-gateway/Dockerfile .

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
RUN pnpm build --filter=@canvasflow/api-gateway...

# Collect the service and its workspace deps into one self-contained tree.
# --legacy is required: from v10, pnpm refuses to deploy from a workspace that
# does not set inject-workspace-packages, and this one does not.
RUN pnpm --filter=@canvasflow/api-gateway deploy --prod --legacy /out

# ---------------------------------------------------------------------------
# runtime: Node and the deployed tree, nothing else.
# ---------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out /app
USER node
EXPOSE 3001
CMD ["node", "dist/main.js"]

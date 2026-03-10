FROM node:22-bookworm-slim
WORKDIR /workspace
ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"
RUN corepack enable

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/runner-worker/package.json ./apps/runner-worker/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/tools/package.json ./packages/tools/package.json
COPY packages/flogo-graph/package.json ./packages/flogo-graph/package.json
RUN pnpm install --no-frozen-lockfile

COPY . .
RUN pnpm --filter @flogo-agent/contracts build \
  && pnpm --filter @flogo-agent/flogo-graph build \
  && pnpm --filter @flogo-agent/tools build \
  && pnpm --filter @flogo-agent/runner-worker build

CMD ["pnpm", "--filter", "@flogo-agent/runner-worker", "start"]


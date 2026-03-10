FROM node:22-bookworm-slim AS base
WORKDIR /workspace
ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"
RUN corepack enable

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY prisma ./prisma
COPY apps/control-plane/package.json ./apps/control-plane/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/flogo-graph/package.json ./packages/flogo-graph/package.json
COPY packages/tools/package.json ./packages/tools/package.json
COPY packages/agent/package.json ./packages/agent/package.json
COPY packages/prompts/package.json ./packages/prompts/package.json
RUN pnpm install --no-frozen-lockfile

COPY . .
RUN pnpm --filter @flogo-agent/contracts build \
  && pnpm --filter @flogo-agent/flogo-graph build \
  && pnpm --filter @flogo-agent/tools build \
  && pnpm --filter @flogo-agent/prompts build \
  && pnpm --filter @flogo-agent/agent build \
  && pnpm --filter @flogo-agent/control-plane build

CMD ["pnpm", "--filter", "@flogo-agent/control-plane", "start"]


FROM node:22-bookworm-slim
WORKDIR /workspace
ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"
RUN corepack enable

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web-console/package.json ./apps/web-console/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
RUN pnpm install --no-frozen-lockfile

COPY . .
RUN pnpm --filter @flogo-agent/contracts build \
  && pnpm --filter @flogo-agent/web-console build

CMD ["pnpm", "--filter", "@flogo-agent/web-console", "start"]


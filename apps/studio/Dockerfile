FROM node:20-alpine

WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/agent-graph-sdk/package.json packages/agent-graph-sdk/tsconfig.json ./packages/agent-graph-sdk/
COPY packages/agent-graph-sdk/src ./packages/agent-graph-sdk/src
COPY apps/studio/package.json ./apps/studio/
COPY apps/studio ./apps/studio

RUN pnpm install --frozen-lockfile --filter @bstockwelldev/agent-graph-studio... \
  && pnpm --filter @bstockwelldev/agent-graph-sdk run build

WORKDIR /workspace/apps/studio
EXPOSE 3000

CMD ["pnpm", "run", "dev"]

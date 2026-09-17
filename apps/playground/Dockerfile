FROM node:20-alpine

WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/agent-graph-sdk/package.json packages/agent-graph-sdk/tsconfig.json ./packages/agent-graph-sdk/
COPY packages/agent-graph-sdk/src ./packages/agent-graph-sdk/src
COPY apps/playground/package.json ./apps/playground/
COPY apps/playground ./apps/playground
# pnpm needs every workspace member's manifest present to honor the frozen
# lockfile, even though this image only runs the playground + sdk.
COPY apps/studio/package.json ./apps/studio/

RUN pnpm install --frozen-lockfile --filter @bstockwelldev/agent-graph-playground... \
  && pnpm --filter @bstockwelldev/agent-graph-sdk run build

WORKDIR /workspace/apps/playground
EXPOSE 5173

CMD ["pnpm", "run", "dev"]

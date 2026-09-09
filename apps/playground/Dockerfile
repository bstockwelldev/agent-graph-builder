FROM node:20-alpine

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY packages/agent-graph-sdk/package.json packages/agent-graph-sdk/tsconfig.json ./packages/agent-graph-sdk/
COPY packages/agent-graph-sdk/src ./packages/agent-graph-sdk/src
COPY apps/playground/package.json apps/playground/package-lock.json ./apps/playground/
COPY apps/playground ./apps/playground

RUN npm ci && npm run build:sdk

WORKDIR /workspace/apps/playground
EXPOSE 5173

CMD ["npm", "run", "dev"]

FROM node:22-alpine AS base
LABEL org.opencontainers.image.source="https://github.com/docmost/docmost"

FROM base AS builder

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++ py3-pip

WORKDIR /app

COPY . .

RUN npm config set registry https://registry.npmmirror.com
RUN npm install -g pnpm@10.4.0
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM base AS installer

# Install build dependencies for native modules and runtime tools
RUN apk add --no-cache curl bash python3 make g++ py3-pip

WORKDIR /app

# Copy apps
COPY --from=builder /app/apps/server/dist /app/apps/server/dist
COPY --from=builder /app/apps/client/dist /app/apps/client/dist
COPY --from=builder /app/apps/server/package.json /app/apps/server/package.json

# Copy packages
COPY --from=builder /app/packages/editor-ext/dist /app/packages/editor-ext/dist
COPY --from=builder /app/packages/editor-ext/package.json /app/packages/editor-ext/package.json

# Copy root package files
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/pnpm*.yaml /app/

# Copy patches
COPY --from=builder /app/patches /app/patches

# Set npm registry to use mirror for faster downloads
RUN npm config set registry https://registry.npmmirror.com
RUN npm install -g pnpm@10.4.0

RUN chown -R node:node /app

USER node

# Configure pnpm to use the mirror registry as node user
RUN pnpm config set registry https://registry.npmmirror.com

RUN pnpm install --frozen-lockfile --prod

RUN mkdir -p /app/data/storage

VOLUME ["/app/data/storage"]

EXPOSE 3000

CMD ["pnpm", "start"]

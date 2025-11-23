# ============================================================================
# Backend Dockerfile - Multi-stage build for EvaluaCode API
# Target environment: Azure Container Apps / Azure App Service for Containers
# ============================================================================

# ------------ Stage 1: Dependencies (base builder) ------------
FROM node:20.17.0-bookworm-slim AS base

WORKDIR /app
# Instalar pnpm directamente
RUN npm install -g pnpm@10.22.0
# Install OS packages required by node-gyp / Prisma during build
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    openssl \
    libssl-dev \
    build-essential \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ------------ Stage 2: Dependencies with cache ------------
FROM base AS deps
# Copy package manifests
COPY package.json pnpm-lock.yaml* ./
# Install production + dev dependencies (needed for build)
RUN pnpm install --frozen-lockfile

# ------------ Stage 3: Build ------------
FROM deps AS build
COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
# Generate Prisma client & compile TS (tsc + tsc-alias configurado en package.json)
RUN pnpm prisma generate && pnpm build

# ------------ Stage 4: Production image ------------
FROM node:20.17.0-bookworm-slim AS production
ENV NODE_ENV=production
WORKDIR /app

# Instalar pnpm directamente
RUN npm install -g pnpm@10.22.0

# Dependencias solo de producción
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Prisma y dist
COPY --from=build /app/prisma ./prisma
RUN pnpm prisma generate
COPY --from=build /app/dist ./dist

EXPOSE 3000
ENV PORT=3000
CMD ["node", "dist/main.js"]

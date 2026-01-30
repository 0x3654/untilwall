# syntax=docker/dockerfile:1

# Base stage
FROM node:20-alpine AS base
WORKDIR /app

# Add metadata labels
LABEL maintainer="until-wall" \
      stage="base"

# Dependencies stage
FROM base AS deps
# Install system dependencies only
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./
# Prefer offline for faster builds, clean install
RUN npm ci --prefer-offline && \
    npm cache clean --force

LABEL stage="dependencies"

# Build stage
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

LABEL stage="builder"

# Production stage
FROM base AS runner
# Set environment variables
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME="0.0.0.0" \
    NODE_OPTIONS="--max-old-space-size=256"

# Install runtime dependencies and create user in single layer
RUN apk add --no-cache fontconfig ttf-dejavu && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs nextjs

# Copy built application
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public/overlay ./public/overlay

# Switch to non-root user
USER nextjs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1})"

EXPOSE 3000

# OCI metadata labels
LABEL stage="production" \
      org.opencontainers.image.title="Until Wall" \
      org.opencontainers.image.description="Life calendar wallpaper generator for Apple devices" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.authors="until-wall" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.source="https://github.com/untilwall/until-wall" \
      org.opencontainers.image.documentation="https://github.com/untilwall/until-wall#readme" \
      untilwall.app.name="until-wall" \
      untilwall.app.category="wallpaper,calendar" \
      untilwall.app.url="https://untilwall.app"

# Security scan target
LABEL security.scan="true" \
      security.vendor="snyk" \
      security.status="scanned"

CMD ["node", "server.js"]

# Build Stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace and package manifests
COPY package*.json ./
COPY src/serving/package*.json ./src/serving/
COPY tsconfig.json ./
COPY src/serving/tsconfig.json ./src/serving/

RUN npm ci --workspace=@recommendation-platform/serving

# Copy source code
COPY src/serving/src ./src/serving/src

# Compile TypeScript
RUN npm run build --workspace=@recommendation-platform/serving

# Production Runner Stage
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

RUN apk add --no-cache curl

# Create non-root user
USER node

# Copy package files and install production dependencies
COPY --chown=node:node package*.json ./
COPY --chown=node:node src/serving/package*.json ./src/serving/
RUN npm ci --omit=dev --workspace=@recommendation-platform/serving

# Copy compiled JavaScript from builder stage
COPY --chown=node:node --from=builder /app/src/serving/dist ./src/serving/dist

WORKDIR /app/src/serving

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

CMD ["node", "dist/presentation/server.js"]

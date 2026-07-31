# ─── Stage 1: deps ───────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Copy package files only — leverages layer cache
COPY package.json package-lock.json ./

# Install production deps only
RUN npm ci --omit=dev


# ─── Stage 2: production image ───────────────────────────────────────────────
FROM node:20-alpine AS runner

# Security: run as non-root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy production node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY --chown=appuser:appgroup . .

# Create writable runtime directories
RUN mkdir -p public/tts-cache public/uploads data logs \
    && chown -R appuser:appgroup public/tts-cache public/uploads data logs

USER appuser

# Port the app listens on (matches PORT env var)
EXPOSE 5000

# Health check — hits the /health endpoint every 30s
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:5000/health || exit 1

# Production start — no nodemon
CMD ["node", "server.js"]

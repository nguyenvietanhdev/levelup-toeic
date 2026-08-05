# ─── Stage 1: deps ───────────────────────────────────────────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

# Copy package files only — leverages layer cache
COPY package.json package-lock.json ./

# Install production deps only
RUN npm ci --omit=dev


# ─── Stage 2: production image ───────────────────────────────────────────────
FROM node:22-alpine AS runner

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

# Không trông vào platform tự tiêm: Render KHÔNG tiêm NODE_ENV cho Docker service,
# Railway thì tuỳ builder. Thiếu nó thì log rớt về mức debug và morgan mất định
# dạng combined — và trước đây còn mở luôn /api-docs (nay đã fail closed ở server.js).
ENV NODE_ENV=production

USER appuser

# Comment cũ bảo "matches PORT env var" nhưng KHÔNG có gì bắt buộc điều đó — cả
# EXPOSE lẫn URL của probe đều là số gõ cứng. App thì bind theo `process.env.PORT`
# (server.js). Render/Railway tiêm PORT riêng → probe gõ 5000 sẽ trượt, container
# bị đánh dấu unhealthy rồi restart-loop TRONG KHI app đang phục vụ bình thường.
# Log lúc đó nhìn hoàn toàn khoẻ mạnh — kiểu hỏng tốn thời gian nhất.
ENV PORT=5000
EXPOSE ${PORT}

# Health check — hits the /health endpoint every 30s
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1

# Production start — no nodemon
CMD ["node", "server.js"]

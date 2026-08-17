# ──────────────────────────────────────────────────────────────
# S-Care Backend — Dockerfile for Render deployment
# Multi-stage build for smaller image size
# ──────────────────────────────────────────────────────────────

# ── Stage 1: Install dependencies ──
FROM node:22-alpine AS deps

WORKDIR /app

# Copy only package files first for better Docker cache
COPY package.json package-lock.json* ./

# Install production dependencies only
RUN npm ci --omit=dev

# ── Stage 2: Production image ──
FROM node:22-alpine AS runner

WORKDIR /app

# Add non-root user for security
RUN addgroup --system --gid 1001 scare && \
    adduser --system --uid 1001 scare

# Copy dependencies from build stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY package.json ./
COPY src/ ./src/

# Set ownership
RUN chown -R scare:scare /app

# Switch to non-root user
USER scare

# Expose port (Render uses PORT env var)
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/api/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

# Start the server
CMD ["node", "src/index.js"]

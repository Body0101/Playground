# ──────────────────────────────────────────
#  Smart Attendance System — Docker Image
# ──────────────────────────────────────────
FROM node:20-alpine

# Build tools needed for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install dependencies first (layer cache)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy source
COPY . .

# Create data directory (will be mounted as volume)
RUN mkdir -p data/backups logs

# Non-root user for security
RUN addgroup -S attendance && adduser -S attendance -G attendance
RUN chown -R attendance:attendance /app
USER attendance

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "server.js"]

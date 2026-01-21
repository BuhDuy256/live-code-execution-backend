# Multi-stage build for production-ready Node.js TypeScript app

# Stage 1: Build
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript to JavaScript
RUN npm run build

# Remove devDependencies
RUN npm prune --production

# Stage 2: Production Runtime
FROM node:20-alpine

# Install runtime dependencies for code execution
# Python for python code execution
# OpenJDK for Java code execution
RUN apk add --no-cache \
  python3 \
  openjdk11-jre \
  && ln -sf python3 /usr/bin/python

WORKDIR /app

# Copy built application from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Copy database schema (for SQLite initialization if needed)
COPY db ./db
COPY scripts ./scripts

# Create directory for SQLite database
RUN mkdir -p /app/data

# Set environment variables
ENV NODE_ENV=production \
  PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Run the application
CMD ["node", "dist/index.js"]

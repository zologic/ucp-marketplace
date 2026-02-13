FROM node:20-alpine

# Add security updates and required tools
RUN apk update && apk upgrade && apk add --no-cache netcat-openbsd

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

WORKDIR /app

# Copy package files
COPY api/package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application code
COPY api/ .

# Copy worker code into /app/worker (for background jobs when RUN_WORKER=true)
COPY worker/ ./worker

# Copy database migrations to /database and scripts to /app
COPY --chown=nodejs:nodejs database/ /database
COPY --chown=nodejs:nodejs database/migrations_archive/migrate.js /app/migrate.js
COPY --chown=nodejs:nodejs database/init-db.js /app/init-db.js

# Copy startup script
COPY --chown=nodejs:nodejs api/start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Change ownership to non-root user
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start server with initialization
CMD ["sh", "/app/start.sh"]

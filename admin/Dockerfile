# Multi-stage build for React admin dashboard

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci --production=false

# Copy source files
COPY . .

# Build production bundle
RUN npm run build

# Stage 2: Production
FROM nginx:alpine

# Copy built files to nginx html directory
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration for SPA routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80 (production)
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

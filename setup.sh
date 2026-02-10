#!/bin/bash

# UCPReady AI Commerce Directory - One-Command Production Installer
# This script installs, configures, and boots the entire platform on a fresh Linux server
# Usage: ./setup.sh

set -e  # Exit on any error
set -o pipefail  # Exit on pipe failures

# =============================================================================
# Color Codes for Output
# =============================================================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# =============================================================================
# Logging Functions
# =============================================================================
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [INFO] $1" >> setup.log
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [SUCCESS] $1" >> setup.log
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [ERROR] $1" >> setup.log
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [WARNING] $1" >> setup.log
}

# =============================================================================
# Validation Functions
# =============================================================================
validate_domain() {
    local domain=$1
    # Check for http://, https://, or trailing slash
    if [[ "$domain" =~ ^https?:// ]] || [[ "$domain" =~ /$ ]]; then
        return 1
    fi
    # Check for valid domain format
    if [[ ! "$domain" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$ ]]; then
        return 1
    fi
    return 0
}

validate_email() {
    local email=$1
    if [[ ! "$email" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
        return 1
    fi
    return 0
}

validate_password() {
    local password=$1
    local min_length=${2:-12}
    if [ ${#password} -lt $min_length ]; then
        return 1
    fi
    return 0
}

validate_percent() {
    local value=$1
    if ! [[ "$value" =~ ^[0-9]+$ ]] || [ "$value" -lt 0 ] || [ "$value" -gt 100 ]; then
        return 1
    fi
    return 0
}

# =============================================================================
# Utility Functions
# =============================================================================
generate_password() {
    # Generate a 24-character secure password
    openssl rand -base64 18 | tr -d '/+=' | cut -c1-24
}

generate_jwt_secret() {
    openssl rand -base64 32
}

# =============================================================================
# Welcome Banner
# =============================================================================
display_banner() {
    echo -e "${CYAN}"
    cat << "EOF"
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║  UCPReady AI Commerce Directory - Production Installer        ║
║                                                                ║
║  This script will:                                             ║
║  • Install and configure all services                          ║
║  • Generate secure secrets and keys                            ║
║  • Configure automatic HTTPS with Let's Encrypt                ║
║  • Initialize the database                                     ║
║  • Create your admin account                                   ║
║                                                                ║
║  Time required: ~5-10 minutes                                  ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
}

# =============================================================================
# Preflight Checks
# =============================================================================
preflight_checks() {
    log_info "Running preflight checks..."

    # Check if Docker is installed and running
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Install it from https://get.docker.com"
        exit 1
    fi

    if ! docker info &> /dev/null; then
        log_error "Docker is not running. Start Docker: sudo systemctl start docker"
        exit 1
    fi

    # Check if docker compose is available
    if ! docker compose version &> /dev/null; then
        log_error "docker compose not found. Ensure you have Docker Compose V2 installed"
        exit 1
    fi

    # Check if openssl is installed
    if ! command -v openssl &> /dev/null; then
        log_error "openssl is not installed. Install it: sudo apt-get install openssl"
        exit 1
    fi

    # Check disk space (min 5GB)
    available=$(df -BG . | awk 'NR==2 {print $4}' | sed 's/G//')
    if [ "$available" -lt 5 ]; then
        log_error "Insufficient disk space. Available: ${available}GB, Required: 5GB minimum"
        exit 1
    fi

    # Check if ports 80 and 443 are available
    if ss -tulpn 2>/dev/null | grep -qE ':80 |:443 '; then
        log_error "Ports 80 or 443 are already in use. Stop conflicting services first."
        exit 1
    fi

    # Check if .env already exists
    if [ -f .env ]; then
        log_warning ".env file already exists"
        read -p "Overwrite existing .env? This cannot be undone. [y/N] " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Installation cancelled. Remove or backup .env first."
            exit 0
        fi
    fi

    log_success "Preflight checks passed"
}

# =============================================================================
# Interactive Prompts
# =============================================================================
collect_configuration() {
    log_info "Starting interactive configuration..."
    echo ""

    # Primary Domain
    while true; do
        read -p "Enter your primary domain (e.g., search.example.com): " PRIMARY_DOMAIN
        if validate_domain "$PRIMARY_DOMAIN"; then
            break
        else
            log_error "Invalid domain. Do not include http://, https://, or trailing slash"
        fi
    done

    # Admin Email
    while true; do
        read -p "Enter admin email (for Let's Encrypt and admin account): " ADMIN_EMAIL
        if validate_email "$ADMIN_EMAIL"; then
            break
        else
            log_error "Invalid email format"
        fi
    done

    # Admin Password
    echo ""
    read -p "Generate random admin password? (recommended) [Y/n]: " gen_password
    if [[ "$gen_password" =~ ^[Nn]$ ]]; then
        while true; do
            read -s -p "Enter admin password (min 12 characters): " ADMIN_PASSWORD
            echo ""
            if ! validate_password "$ADMIN_PASSWORD" 12; then
                log_error "Password too short (min 12 characters)"
                continue
            fi
            read -s -p "Confirm admin password: " password_confirm
            echo ""
            if [ "$ADMIN_PASSWORD" != "$password_confirm" ]; then
                log_error "Passwords do not match. Try again."
            else
                break
            fi
        done
    else
        ADMIN_PASSWORD=$(generate_password)
        log_info "Generated secure admin password"
    fi

    # Postgres Configuration
    echo ""
    read -p "Postgres database name [ucpready]: " POSTGRES_DB
    POSTGRES_DB=${POSTGRES_DB:-ucpready}

    # Always use 'postgres' as the username (hardcoded in docker-compose.yml)
    POSTGRES_USER=postgres
    log_info "Using default postgres user (hardcoded in docker-compose.yml)"

    while true; do
        read -s -p "Postgres password (min 8 characters): " POSTGRES_PASSWORD
        echo ""
        if validate_password "$POSTGRES_PASSWORD" 8; then
            break
        else
            log_error "Password too short (min 8 characters)"
        fi
    done

    # JWT Secret
    echo ""
    read -p "Generate JWT secret automatically? [Y/n]: " gen_jwt
    if [[ "$gen_jwt" =~ ^[Nn]$ ]]; then
        while true; do
            read -s -p "Enter JWT secret (min 32 characters): " ADMIN_JWT_SECRET
            echo ""
            if [ ${#ADMIN_JWT_SECRET} -ge 32 ]; then
                break
            else
                log_error "JWT secret too short (min 32 characters)"
            fi
        done
    else
        ADMIN_JWT_SECRET=$(generate_jwt_secret)
        log_info "Generated JWT secret"
    fi

    # Stripe Configuration
    echo ""
    log_info "Stripe configuration (optional - press Enter to skip)"
    read -p "Stripe Secret Key (sk_live_... or sk_test_...): " STRIPE_SECRET_KEY
    if [ -n "$STRIPE_SECRET_KEY" ]; then
        if [[ ! "$STRIPE_SECRET_KEY" =~ ^sk_(live|test)_ ]]; then
            log_warning "Stripe key format may be invalid (should start with sk_live_ or sk_test_)"
        fi
        read -p "Stripe Webhook Signing Secret (whsec_...): " STRIPE_WEBHOOK_SECRET
        if [[ -n "$STRIPE_WEBHOOK_SECRET" ]] && [[ ! "$STRIPE_WEBHOOK_SECRET" =~ ^whsec_ ]]; then
            log_warning "Webhook secret format may be invalid (should start with whsec_)"
        fi
    else
        STRIPE_WEBHOOK_SECRET=""
        log_info "Skipping Stripe configuration"
    fi

    # Tenant Configuration
    echo ""
    read -p "Default tenant name (e.g., My Marketplace): " DEFAULT_TENANT_NAME
    DEFAULT_TENANT_NAME=${DEFAULT_TENANT_NAME:-UCPReady Marketplace}

    while true; do
        read -p "Tenant revenue percentage (0-100, default 80): " tenant_revenue
        tenant_revenue=${tenant_revenue:-80}
        if validate_percent "$tenant_revenue"; then
            DEFAULT_TENANT_REVENUE_PERCENT=$tenant_revenue
            break
        else
            log_error "Invalid percentage (must be 0-100)"
        fi
    done

    # Display configuration summary
    echo ""
    log_info "Configuration Summary:"
    echo "  Domain: $PRIMARY_DOMAIN"
    echo "  Admin Email: $ADMIN_EMAIL"
    echo "  Database: $POSTGRES_DB (user: postgres)"
    echo "  Tenant: $DEFAULT_TENANT_NAME (revenue split: ${DEFAULT_TENANT_REVENUE_PERCENT}%)"
    echo "  Stripe: $([ -n "$STRIPE_SECRET_KEY" ] && echo "Configured" || echo "Skipped")"
    echo ""

    read -p "Proceed with installation? [Y/n]: " confirm
    if [[ "$confirm" =~ ^[Nn]$ ]]; then
        log_info "Installation cancelled by user"
        exit 0
    fi
}

# =============================================================================
# Generate .env File
# =============================================================================
generate_env_file() {
    log_info "Generating .env file..."

    cat > .env << EOF
# UCPReady AI Commerce Directory - Environment Configuration
# Generated by setup.sh on $(date)

# =============================================================================
# Database Configuration
# =============================================================================
DATABASE_URL=postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

# =============================================================================
# Redis Configuration
# =============================================================================
REDIS_URL=redis://redis:6379

# =============================================================================
# Internal Service URLs (Docker Network)
# =============================================================================
MCP_URL=http://mcp-server:8080
API_INTERNAL_URL=http://api:3000

# =============================================================================
# Domain Configuration
# =============================================================================
PRIMARY_DOMAIN=${PRIMARY_DOMAIN}
CORS_ORIGIN=https://${PRIMARY_DOMAIN}

# =============================================================================
# Admin Configuration
# =============================================================================
ADMIN_JWT_SECRET=${ADMIN_JWT_SECRET}
ADMIN_EMAIL=${ADMIN_EMAIL}

# =============================================================================
# Platform Cryptographic Keys (Ed25519)
# =============================================================================
PLATFORM_PRIVATE_KEY_FILE=/run/secrets/platform_private_key
PLATFORM_PUBLIC_KEY_FILE=/secrets/platform_public_key.pem

# =============================================================================
# Stripe Configuration
# =============================================================================
STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}

# =============================================================================
# Revenue Configuration
# =============================================================================
DEFAULT_TENANT_REVENUE_PERCENT=${DEFAULT_TENANT_REVENUE_PERCENT}

# =============================================================================
# Node Environment
# =============================================================================
NODE_ENV=production

# =============================================================================
# Service Ports
# =============================================================================
API_PORT=3000
MCP_PORT=8080
ADMIN_PORT=5173

# =============================================================================
# Rate Limiting Configuration
# =============================================================================
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# =============================================================================
# SEO Configuration
# =============================================================================
MIN_PRODUCTS_PER_CATEGORY=5
MIN_PRODUCTS_PER_BRAND=3
EOF

    chmod 600 .env
    log_success ".env file created with secure permissions (600)"
}

# =============================================================================
# Generate Ed25519 Keys
# =============================================================================
generate_keys() {
    log_info "Generating Ed25519 cryptographic keys..."

    mkdir -p secrets

    if [ -f secrets/platform_private_key.pem ] && [ ! "${FORCE_KEYGEN:-false}" = "true" ]; then
        log_warning "Keys already exist, skipping generation"
        return 0
    fi

    openssl genpkey -algorithm ed25519 -out secrets/platform_private_key.pem 2>> setup.log
    if [ $? -ne 0 ]; then
        log_error "Failed to generate private key"
        exit 1
    fi

    openssl pkey -in secrets/platform_private_key.pem -pubout -out secrets/platform_public_key.pem 2>> setup.log
    if [ $? -ne 0 ]; then
        log_error "Failed to generate public key"
        exit 1
    fi

    chmod 600 secrets/platform_private_key.pem
    chmod 644 secrets/platform_public_key.pem

    log_success "Ed25519 keys generated successfully"
}

# =============================================================================
# Generate Caddyfile
# =============================================================================
generate_caddyfile() {
    log_info "Generating Caddyfile..."

    cat > Caddyfile << EOF
# UCPReady AI Commerce Directory - Caddy Configuration
# Generated by setup.sh on $(date)
# Automatic HTTPS via Let's Encrypt

${PRIMARY_DOMAIN} {
    # Enable automatic HTTPS
    tls ${ADMIN_EMAIL}

    # Security headers
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "SAMEORIGIN"
        X-XSS-Protection "1; mode=block"
        Referrer-Policy "strict-origin-when-cross-origin"
    }

    # Enable compression
    encode gzip zstd

    # API routes
    handle /api/* {
        reverse_proxy api:3000
    }

    # Admin routes
    handle /admin/* {
        reverse_proxy api:3000
    }

    # Health check endpoint
    handle /health {
        reverse_proxy api:3000
    }

    # Frontend (default)
    handle {
        reverse_proxy frontend:80
    }

    # Logging
    log {
        output file /var/log/caddy/access.log
        level INFO
    }
}
EOF

    log_success "Caddyfile generated for domain: $PRIMARY_DOMAIN"
}

# =============================================================================
# Update .gitignore
# =============================================================================
update_gitignore() {
    log_info "Updating .gitignore..."

    # Add setup.log and upgrade.log if not already present
    grep -q "setup.log" .gitignore || echo "setup.log" >> .gitignore
    grep -q "upgrade.log" .gitignore || echo "upgrade.log" >> .gitignore

    log_success ".gitignore updated"
}

# =============================================================================
# Docker Build and Start
# =============================================================================
docker_build_and_start() {
    log_info "Building Docker images..."
    docker compose build 2>&1 | tee -a setup.log

    if [ ${PIPESTATUS[0]} -ne 0 ]; then
        log_error "Docker build failed. Check setup.log for details"
        exit 1
    fi

    log_success "Docker images built successfully"

    # Start postgres and redis first
    log_info "Starting database services..."
    docker compose up -d postgres redis 2>&1 | tee -a setup.log

    # Wait for postgres to be healthy
    log_info "Waiting for PostgreSQL to be ready..."
    max_wait=60
    elapsed=0
    while ! docker compose exec -T postgres pg_isready -U "$POSTGRES_USER" > /dev/null 2>&1; do
        if [ $elapsed -ge $max_wait ]; then
            log_error "PostgreSQL failed to start within ${max_wait} seconds"
            exit 1
        fi
        sleep 2
        elapsed=$((elapsed + 2))
    done

    log_success "PostgreSQL is ready"

    # Start all remaining services
    log_info "Starting all services..."
    docker compose up -d 2>&1 | tee -a setup.log

    # Wait for API to be healthy
    log_info "Waiting for API to be ready (migrations will run automatically)..."
    max_wait=180
    elapsed=0
    while ! curl -f http://localhost/health > /dev/null 2>&1; do
        if [ $elapsed -ge $max_wait ]; then
            log_error "API failed to become healthy within ${max_wait} seconds"
            log_error "Check logs: docker compose logs api"
            exit 1
        fi
        sleep 5
        elapsed=$((elapsed + 5))

        # Show progress
        if [ $((elapsed % 20)) -eq 0 ]; then
            log_info "Still waiting... ($elapsed/${max_wait}s)"
        fi
    done

    log_success "All services are running"
}

# =============================================================================
# Bootstrap: Create Admin and Tenant
# =============================================================================
bootstrap_system() {
    log_info "Bootstrapping system (creating admin and tenant)..."

    # Generate bcrypt hash for admin password
    log_info "Hashing admin password..."
    ADMIN_PASSWORD_HASH=$(docker compose run --rm -T api node -e "console.log(require('bcryptjs').hashSync('${ADMIN_PASSWORD}', 10))" 2>/dev/null | tail -1)

    if [ -z "$ADMIN_PASSWORD_HASH" ]; then
        log_error "Failed to hash admin password"
        exit 1
    fi

    # Insert admin user
    log_info "Creating admin user..."
    docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" << EOF 2>&1 | tee -a setup.log
INSERT INTO admins (email, password_hash, role)
VALUES ('${ADMIN_EMAIL}', '${ADMIN_PASSWORD_HASH}', 'superadmin')
ON CONFLICT (email) DO NOTHING;
EOF

    # Insert default tenant
    log_info "Creating default tenant..."
    docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" << EOF 2>&1 | tee -a setup.log
INSERT INTO tenants (domain, name, status)
VALUES ('${PRIMARY_DOMAIN}', '${DEFAULT_TENANT_NAME}', 'active')
ON CONFLICT (domain) DO NOTHING;
EOF

    # Update system_meta with installation info
    log_info "Recording installation metadata..."
    MIGRATION_COUNT=$(docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -A -c "SELECT COUNT(*) FROM schema_migrations" 2>/dev/null)
    GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

    docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" << EOF 2>&1 | tee -a setup.log
INSERT INTO system_meta (key, value, updated_at)
VALUES
    ('schema_version', '${MIGRATION_COUNT}', NOW()),
    ('app_version', '${GIT_COMMIT}', NOW()),
    ('last_upgrade', NOW()::TEXT, NOW()),
    ('installation_date', NOW()::TEXT, NOW())
ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;
EOF

    log_success "System bootstrapped successfully"
}

# =============================================================================
# Health Checks
# =============================================================================
run_health_checks() {
    log_info "Running health checks..."

    # Check API health
    if curl -f http://localhost/health > /dev/null 2>&1; then
        log_success "API health check passed"
    else
        log_error "API health check failed"
        return 1
    fi

    # Check MCP health (internal)
    if docker compose exec -T api curl -f http://mcp-server:8080/internal/health > /dev/null 2>&1; then
        log_success "MCP health check passed"
    else
        log_warning "MCP health check failed (non-critical)"
    fi

    # Check Postgres
    if docker compose exec -T postgres pg_isready -U "$POSTGRES_USER" > /dev/null 2>&1; then
        log_success "PostgreSQL health check passed"
    else
        log_error "PostgreSQL health check failed"
        return 1
    fi

    # Check Redis
    if docker compose exec -T redis redis-cli ping 2>&1 | grep -q PONG; then
        log_success "Redis health check passed"
    else
        log_error "Redis health check failed"
        return 1
    fi

    log_success "All health checks passed"
    return 0
}

# =============================================================================
# Success Output
# =============================================================================
display_success() {
    echo ""
    echo -e "${GREEN}"
    cat << "EOF"
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║  UCPReady AI Commerce Directory - Installation Complete!      ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"

    MIGRATION_COUNT=$(docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -A -c "SELECT COUNT(*) FROM schema_migrations" 2>/dev/null || echo "unknown")

    echo -e "${GREEN}✅ All services running${NC}"
    echo -e "${GREEN}✅ Database migrated (${MIGRATION_COUNT} migrations applied)${NC}"
    echo -e "${GREEN}✅ SSL certificates provisioning (may take a few minutes)${NC}"
    echo ""

    echo -e "${CYAN}🌐 Your marketplace is live at:${NC}"
    echo -e "   ${BLUE}https://${PRIMARY_DOMAIN}${NC}"
    echo ""

    echo -e "${CYAN}🔐 Admin Credentials:${NC}"
    echo -e "   Email: ${BLUE}${ADMIN_EMAIL}${NC}"
    echo -e "   Password: ${BLUE}${ADMIN_PASSWORD}${NC}"
    echo ""
    echo -e "   ${YELLOW}⚠️  Save these credentials now - they won't be shown again!${NC}"
    echo ""

    echo -e "${CYAN}📊 Admin Dashboard:${NC}"
    echo -e "   ${BLUE}https://${PRIMARY_DOMAIN}/admin/login${NC}"
    echo ""

    echo -e "${CYAN}📝 Next Steps:${NC}"
    echo "   1. Log in to the admin dashboard"
    echo "   2. Onboard your first merchant at /admin/merchants"
    echo "   3. Configure MCP tools for AI orchestration"
    echo "   4. Test search functionality at the homepage"
    echo ""

    echo -e "${CYAN}🔄 To upgrade in the future:${NC}"
    echo -e "   ${BLUE}git pull && ./upgrade.sh${NC}"
    echo ""

    echo -e "${CYAN}📚 Documentation:${NC}"
    echo "   • Deployment Guide: docs/DEPLOYMENT.md"
    echo "   • API Documentation: docs/API.md (if available)"
    echo ""

    echo -e "${CYAN}💾 Installation log saved to:${NC} setup.log"
    echo ""
}

# =============================================================================
# Cleanup on Error
# =============================================================================
cleanup_on_error() {
    log_error "Installation failed. Check setup.log for details"
    echo ""
    echo "Troubleshooting steps:"
    echo "  1. Check setup.log for error details"
    echo "  2. Verify Docker is running: docker info"
    echo "  3. Check service logs: docker compose logs"
    echo "  4. You can re-run ./setup.sh after fixing issues (it's idempotent)"
    echo ""
}

trap cleanup_on_error ERR

# =============================================================================
# Main Execution
# =============================================================================
main() {
    # Initialize log file
    echo "=== UCPReady Installation Log ===" > setup.log
    echo "Started at: $(date)" >> setup.log
    echo "" >> setup.log

    display_banner
    preflight_checks
    collect_configuration
    generate_env_file
    generate_keys
    generate_caddyfile
    update_gitignore
    docker_build_and_start
    bootstrap_system

    if run_health_checks; then
        display_success

        # Final log entry
        echo "" >> setup.log
        echo "=== Installation completed successfully at: $(date) ===" >> setup.log

        exit 0
    else
        log_error "Health checks failed after installation"
        exit 1
    fi
}

# Run main function
main

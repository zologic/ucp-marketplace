#!/bin/bash

# UCPReady AI Commerce Directory - Zero-Downtime Upgrade Script
# This script safely upgrades an existing installation with minimal downtime
# Usage: ./upgrade.sh

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
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [INFO] $1" >> upgrade.log
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [SUCCESS] $1" >> upgrade.log
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [ERROR] $1" >> upgrade.log
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [WARNING] $1" >> upgrade.log
}

# =============================================================================
# Utility Functions
# =============================================================================
wait_for_health() {
    local url=$1
    local service=$2
    local max_wait=${3:-60}
    local elapsed=0

    log_info "Waiting for ${service} to be healthy..."

    while ! curl -f "$url" > /dev/null 2>&1; do
        if [ $elapsed -ge $max_wait ]; then
            log_error "${service} failed to become healthy within ${max_wait} seconds"
            return 1
        fi
        sleep 2
        elapsed=$((elapsed + 2))
    done

    log_success "${service} is healthy"
    return 0
}

# =============================================================================
# Welcome Banner
# =============================================================================
display_banner() {
    echo -e "${CYAN}"
    cat << "EOF"
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║  UCPReady AI Commerce Directory - Upgrade Script              ║
║                                                                ║
║  This script will:                                             ║
║  • Run database migrations                                     ║
║  • Rebuild and restart services with minimal downtime          ║
║  • Verify system health                                        ║
║                                                                ║
║  Expected downtime: ~10-20 seconds                             ║
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

    # Check if Docker is running
    if ! docker info &> /dev/null; then
        log_error "Docker is not running. Start Docker: sudo systemctl start docker"
        exit 1
    fi

    # Check if docker compose is available
    if ! docker compose version &> /dev/null; then
        log_error "docker compose not found"
        exit 1
    fi

    # Check if required files exist
    for file in .env docker-compose.yml Caddyfile; do
        if [ ! -f "$file" ]; then
            log_error "Required file not found: $file"
            log_error "This doesn't appear to be a valid UCPReady installation"
            exit 1
        fi
    done

    # Load environment variables
    if [ -f .env ]; then
        export $(cat .env | grep -v '^#' | grep -v '^$' | xargs)
    fi

    # Check if database is reachable
    if ! docker compose exec -T postgres pg_isready -U ${POSTGRES_USER:-postgres} > /dev/null 2>&1; then
        log_error "Database not reachable. Ensure all services are running."
        exit 1
    fi

    # Check disk space (min 2GB free)
    available=$(df -BG . | awk 'NR==2 {print $4}' | sed 's/G//')
    if [ "$available" -lt 2 ]; then
        log_warning "Low disk space: ${available}GB available (recommended: 5GB+)"
    fi

    # Check git repo status
    if [ -d .git ]; then
        if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
            log_warning "Git working directory has uncommitted changes"
            read -p "Continue anyway? [y/N] " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                log_info "Upgrade cancelled by user"
                exit 0
            fi
        fi
    fi

    # Check if upgrade lock exists
    if [ -f upgrade.log.lock ]; then
        log_error "Upgrade lock file exists. Another upgrade may be in progress."
        log_error "If no upgrade is running, remove: rm upgrade.log.lock"
        exit 1
    fi

    # Create lock file
    touch upgrade.log.lock

    log_success "Preflight checks passed"
}

# =============================================================================
# Read Current System Version
# =============================================================================
read_current_version() {
    log_info "Reading current system version..."

    POSTGRES_USER=${POSTGRES_USER:-postgres}
    POSTGRES_DB=${POSTGRES_DB:-ucpready}

    CURRENT_VERSION=$(docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -A -c \
        "SELECT value FROM system_meta WHERE key='schema_version'" 2>/dev/null || echo "0")

    CURRENT_GIT_COMMIT=$(docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -A -c \
        "SELECT value FROM system_meta WHERE key='app_version'" 2>/dev/null || echo "unknown")

    log_info "Current schema version: ${CURRENT_VERSION}"
    log_info "Current git commit: ${CURRENT_GIT_COMMIT}"

    echo "CURRENT_VERSION=${CURRENT_VERSION}" >> upgrade.log
    echo "CURRENT_GIT_COMMIT=${CURRENT_GIT_COMMIT}" >> upgrade.log
}

# =============================================================================
# Backup Current Images
# =============================================================================
backup_images() {
    log_info "Tagging current images for rollback..."

    BACKUP_TAG="backup-$(date +%Y%m%d%H%M%S)"

    # Get list of images and tag them
    docker compose images --quiet 2>/dev/null | while read image; do
        if [ -n "$image" ]; then
            docker tag "$image" "${image}:${BACKUP_TAG}" 2>&1 | tee -a upgrade.log || true
        fi
    done

    log_success "Current images tagged with: ${BACKUP_TAG}"
    echo "BACKUP_TAG=${BACKUP_TAG}" >> upgrade.log
}

# =============================================================================
# Run Database Migrations
# =============================================================================
run_migrations() {
    log_info "Checking for pending migrations..."

    # Run migrations
    log_info "Running database migrations..."
    if docker compose run --rm -T api npm run migrate 2>&1 | tee -a upgrade.log; then
        log_success "Migrations completed successfully"
        return 0
    else
        log_error "Migration failed"
        display_rollback_instructions
        exit 1
    fi
}

# =============================================================================
# Detect Configuration Changes
# =============================================================================
detect_config_changes() {
    log_info "Checking for new configuration variables..."

    if [ ! -f .env.example ]; then
        log_warning ".env.example not found, skipping config drift detection"
        return 0
    fi

    # Extract variable names from .env.example (lines with =)
    EXAMPLE_VARS=$(grep -E '^[A-Z_]+=.' .env.example 2>/dev/null | cut -d= -f1 | sort)
    CURRENT_VARS=$(grep -E '^[A-Z_]+=.' .env 2>/dev/null | cut -d= -f1 | sort)

    # Find missing variables
    MISSING_VARS=$(comm -23 <(echo "$EXAMPLE_VARS") <(echo "$CURRENT_VARS"))

    if [ -n "$MISSING_VARS" ]; then
        log_warning "New configuration variables detected:"
        echo "$MISSING_VARS" | while read var; do
            echo "  - $var"
        done
        echo ""
        log_warning "You may need to add these to your .env file"
        log_warning "Check .env.example for descriptions and default values"
        echo ""

        read -p "Continue upgrade without these variables? [y/N] " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Upgrade paused. Update .env and re-run ./upgrade.sh"
            exit 0
        fi
    else
        log_info "No new configuration variables detected"
    fi
}

# =============================================================================
# Rolling Service Restart
# =============================================================================
restart_service() {
    local service=$1
    log_info "Restarting ${service}..."

    # Rebuild if code changed
    docker compose build "$service" 2>&1 | tee -a upgrade.log

    # Restart service without affecting others
    docker compose up -d --no-deps "$service" 2>&1 | tee -a upgrade.log

    if [ $? -ne 0 ]; then
        log_error "Failed to restart ${service}"
        return 1
    fi

    # Wait a moment for service to initialize
    sleep 5

    # Service-specific health checks
    case ${service} in
        api)
            if ! wait_for_health "http://localhost/health" "API" 60; then
                log_error "API health check failed after restart"
                return 1
            fi
            ;;
        mcp-server)
            if ! docker compose exec -T api curl -f http://mcp-server:8080/internal/health > /dev/null 2>&1; then
                log_warning "MCP health check failed (may be non-critical)"
            fi
            ;;
        *)
            # Generic wait for other services
            log_info "${service} restarted (no specific health check)"
            ;;
    esac

    log_success "${service} restarted successfully"
    return 0
}

rolling_restart() {
    log_info "Performing rolling service restart..."

    # Services restart order: worker → mcp-server → api → frontend → caddy
    # Postgres and Redis are never restarted during upgrade
    SERVICES=("worker" "mcp-server" "api" "frontend" "caddy")

    for service in "${SERVICES[@]}"; do
        if ! restart_service "$service"; then
            log_error "Failed to restart ${service}"
            display_rollback_instructions
            exit 1
        fi
    done

    log_success "All services restarted successfully"
}

# =============================================================================
# Update System Version
# =============================================================================
update_system_version() {
    log_info "Updating system version metadata..."

    # Get new version info
    NEW_VERSION=$(docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -A -c \
        "SELECT COUNT(*) FROM schema_migrations" 2>/dev/null)

    NEW_GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

    # Update system_meta table
    docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" << EOF 2>&1 | tee -a upgrade.log
INSERT INTO system_meta (key, value, updated_at)
VALUES
    ('schema_version', '${NEW_VERSION}', NOW()),
    ('app_version', '${NEW_GIT_COMMIT}', NOW()),
    ('last_upgrade', NOW()::TEXT, NOW())
ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;
EOF

    log_success "System version updated: ${CURRENT_VERSION} → ${NEW_VERSION}"

    echo "NEW_VERSION=${NEW_VERSION}" >> upgrade.log
    echo "NEW_GIT_COMMIT=${NEW_GIT_COMMIT}" >> upgrade.log
}

# =============================================================================
# Post-Upgrade Health Checks
# =============================================================================
run_health_checks() {
    log_info "Running post-upgrade health checks..."

    # API health
    if ! curl -f http://localhost/health > /dev/null 2>&1; then
        log_error "API health check failed after upgrade"
        return 1
    fi
    log_success "API health check passed"

    # Database connectivity
    if ! docker compose exec -T postgres pg_isready -U "$POSTGRES_USER" > /dev/null 2>&1; then
        log_error "Database connectivity check failed"
        return 1
    fi
    log_success "Database connectivity check passed"

    # Redis connectivity
    if ! docker compose exec -T redis redis-cli ping 2>&1 | grep -q PONG; then
        log_error "Redis connectivity check failed"
        return 1
    fi
    log_success "Redis connectivity check passed"

    # Check worker logs for errors
    WORKER_ERRORS=$(docker compose logs worker --tail=50 2>/dev/null | grep -i error | wc -l || echo "0")
    if [ "$WORKER_ERRORS" -gt 5 ]; then
        log_warning "Worker has ${WORKER_ERRORS} errors in recent logs"
    fi

    # Check API logs for errors
    API_ERRORS=$(docker compose logs api --tail=50 2>/dev/null | grep -i error | wc -l || echo "0")
    if [ "$API_ERRORS" -gt 5 ]; then
        log_warning "API has ${API_ERRORS} errors in recent logs"
    fi

    log_success "All health checks passed"
    return 0
}

# =============================================================================
# Success Output
# =============================================================================
display_success() {
    local duration=$1

    echo ""
    echo -e "${GREEN}"
    cat << "EOF"
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║  UCPReady AI Commerce Directory - Upgrade Complete!           ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"

    MIGRATIONS_APPLIED=$((NEW_VERSION - CURRENT_VERSION))

    echo -e "${GREEN}✅ Migrations applied: ${MIGRATIONS_APPLIED}${NC}"
    echo -e "${GREEN}✅ Services restarted: worker, mcp-server, api, frontend, caddy${NC}"
    echo -e "${GREEN}✅ Health checks passed${NC}"
    echo -e "${GREEN}✅ Version updated: ${CURRENT_VERSION} → ${NEW_VERSION}${NC}"
    echo ""

    echo -e "${CYAN}📊 System Status:${NC}"
    echo "   - Schema version: ${NEW_VERSION}"
    echo "   - Git commit: ${NEW_GIT_COMMIT}"
    echo "   - Upgrade duration: ${duration}s"
    echo "   - Downtime: ~10-20s (API restart only)"
    echo ""

    echo -e "${CYAN}🌐 Your marketplace is running at:${NC}"
    echo -e "   ${BLUE}https://${PRIMARY_DOMAIN:-your-domain.com}${NC}"
    echo ""

    echo -e "${CYAN}📝 Upgrade log saved to:${NC} upgrade.log"
    echo ""

    echo -e "${CYAN}🔄 Need to rollback?${NC}"
    echo -e "   ${BLUE}docker compose up -d --force-recreate${NC}"
    echo "   (Note: Database migrations are forward-only and won't be rolled back)"
    echo ""
}

# =============================================================================
# Rollback Instructions
# =============================================================================
display_rollback_instructions() {
    echo ""
    echo -e "${RED}"
    cat << "EOF"
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║  UPGRADE FAILED - Rollback Instructions                       ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"

    echo -e "${RED}❌ Upgrade failed${NC}"
    echo ""

    echo -e "${CYAN}🔄 To rollback:${NC}"
    echo "   1. Restore previous container images:"
    echo -e "      ${BLUE}docker compose up -d --force-recreate${NC}"
    echo ""
    echo "   2. Check logs for errors:"
    echo -e "      ${BLUE}docker compose logs api --tail=100${NC}"
    echo -e "      ${BLUE}docker compose logs worker --tail=100${NC}"
    echo ""
    echo "   3. Verify database integrity:"
    echo -e "      ${BLUE}docker compose exec postgres psql -U postgres -d ucpready -c 'SELECT COUNT(*) FROM schema_migrations'${NC}"
    echo ""

    echo -e "${YELLOW}⚠️  Database migrations are forward-only and have NOT been rolled back.${NC}"
    echo "    The system is safe, but may be at a newer schema version."
    echo ""

    echo -e "${CYAN}📝 Full error log:${NC} upgrade.log"
    echo ""
}

# =============================================================================
# Cleanup
# =============================================================================
cleanup() {
    # Remove lock file
    rm -f upgrade.log.lock
}

trap cleanup EXIT

# =============================================================================
# Main Execution
# =============================================================================
main() {
    local start_time=$(date +%s)

    # Initialize log file
    echo "=== UCPReady Upgrade Log ===" > upgrade.log
    echo "Started at: $(date)" >> upgrade.log
    echo "" >> upgrade.log

    display_banner

    preflight_checks
    read_current_version
    detect_config_changes

    # Confirm upgrade
    echo ""
    log_warning "This will upgrade your UCPReady installation"
    read -p "Continue with upgrade? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Upgrade cancelled by user"
        exit 0
    fi

    backup_images
    run_migrations
    rolling_restart
    update_system_version

    if run_health_checks; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))

        display_success "$duration"

        # Final log entry
        echo "" >> upgrade.log
        echo "=== Upgrade completed successfully at: $(date) ===" >> upgrade.log
        echo "Duration: ${duration}s" >> upgrade.log

        exit 0
    else
        log_error "Health checks failed after upgrade"
        display_rollback_instructions
        exit 1
    fi
}

# Run main function
main

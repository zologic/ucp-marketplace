# UCPReady AI Commerce Directory

A production-ready, white-label AI shopping marketplace that connects AI agents to WooCommerce merchants via the UCP protocol.

## Features

- **Multi-Tenant Architecture** - Deploy on multiple domains without code changes
- **MCP Server** - AI orchestration middleware for agent-based commerce
- **Zero PII Storage** - GDPR-compliant, privacy-first design
- **Automated Billing** - Commission and CPC billing with auto-suspension
- **Revenue Sharing** - Built-in white-label partner revenue splits
- **Real-time Control** - Hot reload merchant registry without restarts

## Architecture

### Components

- **Frontend** - Vanilla JS consumer marketplace (white-label ready)
- **API** - Node.js/Express backend with tenant resolution
- **MCP Server** - AI agent tool provider with merchant enforcement
- **Worker** - Background job processing (indexing, billing, analytics)
- **PostgreSQL** - Primary data store with full-text search
- **Redis** - Cache and session storage
- **Caddy** - Reverse proxy with automatic SSL

### Tech Stack

- **Backend:** Node.js 20, Express, PostgreSQL 16
- **Frontend:** Vanilla JavaScript (ES2020+), no frameworks
- **Infrastructure:** Docker, Docker Compose, Caddy
- **Protocol:** UCP (Universal Commerce Protocol)
- **Crypto:** Ed25519 signatures for attribution

## 🚀 Installation (5-Minute Setup)

### One-Command Production Install

Install the entire UCPReady AI Commerce Directory platform on a fresh Linux server with a single command:

```bash
git clone https://github.com/your-org/ucp-marketplace.git
cd ucp-marketplace
chmod +x setup.sh
./setup.sh
```

The interactive installer will:
- ✅ Prompt for all required configuration (domain, credentials, etc.)
- ✅ Generate secure secrets and keys automatically
- ✅ Configure automatic HTTPS with Let's Encrypt
- ✅ Initialize the database with all migrations
- ✅ Create your admin account and default tenant
- ✅ Start all Docker services
- ✅ Verify system health

**Time:** 5-10 minutes
**Expertise Required:** Basic Linux command line
**Manual Steps:** Zero

### Prerequisites

- Fresh Linux VPS (Ubuntu 22.04+ or Debian 11+ recommended)
- Docker 24.0+ and Docker Compose V2
- Domain name pointed to your server's IP address
- Ports 80 and 443 open in firewall
- Minimum 2GB RAM, 20GB disk space

### Installing Docker

If you don't have Docker installed:

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker
```

### What Gets Installed

The setup script deploys these services:

| Service    | Purpose                                      | Port       |
|------------|----------------------------------------------|------------|
| Caddy      | Reverse proxy + automatic SSL                | 80, 443    |
| Frontend   | Consumer search + chat UI                     | Internal   |
| API        | REST API (search, admin, billing)            | Internal   |
| MCP Server | AI orchestration middleware                   | Internal   |
| Worker     | Background jobs (billing, indexing, etc.)    | Internal   |
| PostgreSQL | Primary database                              | Internal   |
| Redis      | Rate limiting + caching                       | Internal   |

All services run in isolated Docker networks. Only Caddy is exposed publicly.

### After Installation

Once setup.sh completes, your marketplace is live at your domain with HTTPS. You'll see output like this:

```
╔════════════════════════════════════════════════════════════════╗
║  UCPReady AI Commerce Directory - Installation Complete!       ║
╚════════════════════════════════════════════════════════════════╝

🌐 Your marketplace is live at:
   https://search.example.com

🔐 Admin Credentials:
   Email: admin@example.com
   Password: Xy9k2!mP... (save this now!)

📊 Admin Dashboard:
   https://search.example.com/admin/login
```

**Next Steps:**
1. Log in to the admin dashboard
2. Onboard your first merchant at `/admin/merchants`
3. Configure MCP tools for AI orchestration
4. Test search functionality at the homepage

## 🔄 Upgrading

To upgrade to the latest version:

```bash
cd ucp-marketplace
git pull
./upgrade.sh
```

The upgrade script will:
- ✅ Check system prerequisites
- ✅ Run database migrations
- ✅ Rebuild and restart services with minimal downtime (~10-20s)
- ✅ Verify system health
- ✅ Provide rollback instructions if anything fails

**Upgrade Safety:**
- Database migrations are forward-only and transactional
- Services restart in a safe order (worker → mcp → api → frontend → caddy)
- Postgres and Redis never stop (zero data loss)
- Automatic rollback to previous container images if health checks fail
- Full upgrade log saved to `upgrade.log`

### Upgrade Checklist

Before running `./upgrade.sh`:
- [ ] Backup your database (recommended)
- [ ] Review CHANGELOG for breaking changes
- [ ] Notify users of brief maintenance window (if applicable)
- [ ] Ensure disk space available (check with `df -h`)

### Rollback

If an upgrade fails, rollback with:

```bash
docker compose up -d --force-recreate
```

This reverts containers to their previous state. Database migrations are NOT rolled back automatically.

## 📋 System Requirements

**Minimum (Testing/Small deployments):**
- 2 CPU cores
- 2GB RAM
- 20GB disk space
- Ubuntu 22.04 or Debian 11

**Recommended (Production):**
- 4+ CPU cores
- 8GB+ RAM
- 100GB+ SSD disk space
- Ubuntu 22.04 LTS
- Separate backup storage

**Network:**
- Static IP address
- Domain name with DNS configured
- Firewall allowing ports 80 (HTTP) and 443 (HTTPS)

## 🛠️ Manual Configuration (Advanced)

If you need to configure manually without `setup.sh`, see [DEPLOYMENT.md](docs/DEPLOYMENT.md) for detailed step-by-step instructions.

## 🏗️ Architecture Overview

```
                                    ┌─────────────┐
                                    │   Internet  │
                                    └──────┬──────┘
                                           │ :80/:443
                                           ▼
                              ┌────────────────────────┐
                              │   Caddy (SSL + Proxy)  │
                              └─────────┬──────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
                    ▼                   ▼                   ▼
             ┌──────────┐        ┌──────────┐       ┌──────────┐
             │ Frontend │        │   API    │       │   MCP    │
             │ (Nginx)  │        │ (Node.js)│       │ (Node.js)│
             └──────────┘        └────┬─────┘       └────┬─────┘
                                      │                   │
                                      └─────────┬─────────┘
                                                │
                          ┌─────────────────────┼─────────────┐
                          │                     │             │
                          ▼                     ▼             ▼
                   ┌──────────┐         ┌──────────┐   ┌─────────┐
                   │ Postgres │         │  Redis   │   │ Worker  │
                   │   (DB)   │         │ (Cache)  │   │ (Cron)  │
                   └──────────┘         └──────────┘   └─────────┘
```

**Network Isolation:**
- `public` network: Caddy ↔ Frontend, API
- `internal` network: API ↔ Postgres, Redis, MCP, Worker
- MCP not publicly accessible (internal-only)

## 🔒 Security Considerations

The setup script implements these security measures:

- ✅ All secrets generated with cryptographically secure random (openssl)
- ✅ .env file permissions set to 600 (owner read/write only)
- ✅ Private keys stored in secrets/ with 600 permissions
- ✅ Admin passwords hashed with bcrypt (10 rounds)
- ✅ Services run as non-root users in containers
- ✅ Security headers enabled (HSTS, CSP, X-Frame-Options)
- ✅ Automatic HTTPS with Let's Encrypt
- ✅ Internal services not exposed to internet
- ✅ Rate limiting enabled on API endpoints

**Additional Hardening (Recommended):**
- Set up firewall (ufw/iptables) to allow only 80/443 + SSH
- Configure fail2ban for SSH brute-force protection
- Regular security updates: `apt update && apt upgrade`
- Database backups to separate storage
- Monitor logs for suspicious activity

## 📊 Monitoring & Health Checks

**Check system status:**
```bash
# All services
docker compose ps

# Service logs
docker compose logs -f api
docker compose logs -f worker

# Health endpoints
curl https://your-domain.com/health
```

**Database connection:**
```bash
docker compose exec postgres psql -U postgres -d ucpready
```

**Redis connection:**
```bash
docker compose exec redis redis-cli ping
```

## 🐛 Troubleshooting

**Setup failed during installation:**
1. Check `setup.log` for error details
2. Verify Docker is running: `docker info`
3. Check DNS: `dig your-domain.com` should point to your server IP
4. Verify ports 80/443 are not in use: `ss -tulpn | grep -E ':80|:443'`
5. Re-run setup.sh (it's idempotent)

**Services won't start:**
```bash
# Check which service failed
docker compose ps

# View logs
docker compose logs <service-name>

# Restart specific service
docker compose restart <service-name>
```

**Migrations failed:**
```bash
# Check migration status
docker compose exec postgres psql -U postgres -d ucpready -c "SELECT * FROM schema_migrations ORDER BY applied_at DESC LIMIT 5"

# Manually run migrations
docker compose run --rm api npm run migrate
```

**SSL certificate issues:**
```bash
# Check Caddy logs
docker compose logs caddy

# Verify DNS is correct
dig +short your-domain.com

# Restart Caddy
docker compose restart caddy
```

**Can't access admin dashboard:**
1. Verify API health: `curl https://your-domain.com/health`
2. Check admin user exists: `docker compose exec postgres psql -U postgres -d ucpready -c "SELECT email, role FROM admins"`
3. Reset admin password if needed (see DEPLOYMENT.md)

## Documentation

- [Deployment Guide](docs/DEPLOYMENT.md) - Production deployment instructions
- [API Documentation](docs/API.md) - Complete API reference
- [Manual Testing Guide](docs/MANUAL_TESTING.md) - End-to-end testing scenarios

## Project Structure

```
ucp-marketplace/
├── frontend/           # Vanilla JS consumer marketplace
├── api/               # Backend REST API
├── mcp-server/        # MCP tool provider for AI agents
├── worker/            # Background job processing
├── database/          # SQL migrations
├── docs/              # Documentation
├── docker-compose.yml # Multi-container orchestration
├── Caddyfile          # Reverse proxy configuration
└── .env.example       # Environment template
```

## Database Schema

18 tables implementing:
- Multi-tenant architecture (tenants, merchants)
- Product catalog with full-text search
- Analytics (search_events, click_events, merchant_daily_stats)
- Billing (billable_events, invoices, invoice_items)
- Revenue sharing (revenue_splits, tenant_statements)
- Admin management (admins)

## Background Jobs

Worker service runs scheduled jobs:
- **Merchant verification** - Daily at 02:00 UTC
- **Product indexing** - Every 6 hours
- **Stats rollup** - Daily at 00:30 UTC
- **Invoice generation** - Monthly on 1st at 00:00 UTC
- **Statement generation** - Monthly on 1st at 01:00 UTC
- **Non-payment enforcement** - Daily at 06:00 UTC

## Security

- Ed25519 signatures for webhook verification
- JWT authentication for admin endpoints
- Docker network isolation (MCP server internal only)
- HTTPS-only in production (automatic via Caddy)
- Rate limiting (100 req/min public, 300 req/min admin)
- Content Security Policy headers
- No PII storage (GDPR compliant)

## Multi-Domain Setup

1. Configure DNS A records pointing to server IP
2. Add domains to `Caddyfile`:

```caddyfile
shop.ai {
    handle /api/* {
        reverse_proxy api:3000
    }
    handle {
        reverse_proxy frontend:80
    }
}
```

3. Create tenant records:

```sql
INSERT INTO tenants (domain, name, status)
VALUES ('shop.ai', 'Shop AI', 'active');
```

4. Restart Caddy:

```bash
docker-compose restart caddy
```

Caddy automatically provisions SSL certificates via Let's Encrypt.

## Scaling

### Horizontal Scaling

```bash
# Scale API to 3 instances
docker-compose up -d --scale api=3
```

### Database Backups

```bash
# Automated daily backups
0 2 * * * docker-compose exec -T postgres pg_dump -U postgres ucpready > /backups/ucpready_$(date +\%Y\%m\%d).sql
```

## Development

### Run in Development Mode

```bash
# API with hot reload
cd api && npm run dev

# Frontend (serve with any static server)
cd frontend && python -m http.server 8000

# Worker with hot reload
cd worker && npm run dev
```

### Database Migrations

```bash
# Run migrations
docker-compose exec api npm run migrate

# Check migration status
docker-compose exec postgres psql -U postgres -d ucpready -c "SELECT * FROM schema_migrations;"
```

## Testing

See [Manual Testing Guide](docs/MANUAL_TESTING.md) for comprehensive test scenarios.

Quick smoke test:

```bash
# API health
curl http://localhost/api/health

# Search
curl -X POST http://localhost/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"test"}'
```

## Monitoring

### Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api

# Last 100 lines
docker-compose logs --tail=100 worker
```

### Metrics

```bash
# Container stats
docker stats

# Disk usage
docker system df
```

## Troubleshooting

### Service Won't Start

```bash
# Check service status
docker-compose ps

# View logs
docker-compose logs <service-name>

# Restart service
docker-compose restart <service-name>
```

### Database Connection Issues

```bash
# Test connection
docker-compose exec postgres pg_isready -U postgres

# Check PostgreSQL logs
docker-compose logs postgres
```

### API Returns 404

```bash
# Verify tenant exists
docker-compose exec postgres psql -U postgres -d ucpready -c "SELECT * FROM tenants WHERE domain='localhost';"

# Check Host header matches tenant domain
```

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

Apache License 2.0 - See LICENSE file for details

## Support

- **Issues:** https://github.com/your-org/ucp-marketplace/issues
- **Documentation:** https://docs.zologic.nl
- **Email:** support@zologic.nl

## Roadmap

- [ ] Admin dashboard (React)
- [ ] Enhanced MCP tools (recommendations, cart management)
- [ ] Analytics dashboard with charts
- [ ] Email notifications
- [ ] Stripe integration for automated payments
- [ ] Multi-currency support
- [ ] i18n/l10n
- [ ] GraphQL API
- [ ] Mobile app

## Credits

Built on the [Universal Commerce Protocol (UCP)](https://ucp.dev/latest/) specification.

Compatible with [UCPReady WooCommerce Plugin](https://woocommerce.com/vendor/zologic) v1.1.2+.

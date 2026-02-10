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

## Quick Start

### Prerequisites

- Docker and Docker Compose
- 2GB RAM minimum
- Ports 80 and 443 available

### Installation

```bash
# Clone repository
git clone https://github.com/your-org/ucp-marketplace.git
cd ucp-marketplace

# Copy environment template
cp .env.example .env

# Generate platform keys
openssl genpkey -algorithm ED25519 -out secrets/platform_private_key.pem
openssl pkey -in secrets/platform_private_key.pem -pubout -out secrets/platform_public_key.pem

# Build and start services
docker-compose build
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

### Create Admin User

```bash
# Connect to database
docker-compose exec postgres psql -U postgres -d ucpready

# Create admin (replace password hash)
INSERT INTO admins (email, password_hash, role)
VALUES ('admin@example.com', '$2a$10$...', 'superadmin');
```

Generate password hash:

```bash
node -e "console.log(require('bcryptjs').hashSync('your-password', 10))"
```

### Create First Tenant

```bash
docker-compose exec postgres psql -U postgres -d ucpready -c "
INSERT INTO tenants (domain, name, status)
VALUES ('localhost', 'Local Tenant', 'active');
"
```

### Access

- **Frontend:** http://localhost
- **API:** http://localhost/api
- **Admin:** http://localhost/admin (login endpoint)

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
- **Documentation:** https://docs.ucpready.io
- **Email:** support@ucpready.io

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

Built on the [Universal Commerce Protocol (UCP)](https://ucp-protocol.org) specification.

Compatible with [UCPReady WooCommerce Plugin](https://github.com/ucpready/wordpress-plugin) v1.1.2+.

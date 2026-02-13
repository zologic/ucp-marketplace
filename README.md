# UCP Marketplace v2.0 - Bug-Free Release

**A decentralized dropshipping aggregator using the Universal Commerce Protocol (UCP)**

## Quick Start

```bash
./install.sh
```

That's it! One command to install everything.

## What This Does

The install script will:
- ✅ Check system requirements
- ✅ Gather configuration (domain, database, etc.)
- ✅ Generate cryptographic keys
- ✅ Start all Docker services
- ✅ Run database migrations
- ✅ Create admin user
- ✅ Verify everything works

**Time:** ~5-10 minutes

## Requirements

- Docker & Docker Compose v2
- Linux, macOS, or Windows with WSL2
- Ports 80, 443, 5432 available

## After Installation

Access your marketplace:
- **Frontend**: http://localhost/
- **Admin Panel**: http://localhost/admin-ui/
- **API**: http://localhost/api/
- **Health**: http://localhost/health

## Documentation

- **GETTING_STARTED.md** - Complete setup guide & troubleshooting
- **database/README.md** - Migration system documentation
- **BUGS_FIXED.md** - List of all fixes in v2.0

## Architecture

7 Docker services:
- **caddy** - Reverse proxy & SSL
- **frontend** - Public marketplace (Nginx)
- **admin** - Admin dashboard (React)
- **api** - REST API + Background worker (Node.js)
- **mcp-server** - AI orchestration
- **postgres** - Database (PostgreSQL 16)
- **redis** - Cache & pub/sub (Redis 7)

## Key Features

✅ UCP protocol integration (`.well-known/ucp`)
✅ Multi-tenant white-label support
✅ Product aggregation from WooCommerce stores
✅ Full-text search with PostgreSQL
✅ Embedded checkout (UCP 2026 ECP)
✅ Admin dashboard for merchant management
✅ CPC and commission billing
✅ Background workers for indexing
✅ Revenue sharing for white-label tenants

## Quick Commands

```bash
# View logs
docker compose logs -f

# Restart services
docker compose restart

# Stop everything
docker compose down

# Create admin user
./create-admin.sh

# Run migrations
./migrate.sh

# Diagnostics
./diagnose.sh
```

## Configuration

All configuration in `.env` file (auto-generated during install).

Key settings:
- `DOMAIN` - Your domain name
- `POSTGRES_DB` - Database name
- `TENANT_NAME` - Marketplace name
- `JWT_SECRET` - API authentication
- `RUN_WORKER` - Enable background jobs

## Version 2.0 Improvements

**Critical Bugs Fixed:**
1. ✅ Dual migration systems consolidated
2. ✅ Hardcoded database names removed
3. ✅ Admin billing routes aligned
4. ✅ Duplicate invoice prevention added

**New Features:**
- 🎉 One-command installation
- 📚 Complete documentation
- 🔧 Automated configuration
- ✅ Comprehensive health checks

See **BUGS_FIXED.md** for complete details.

## Troubleshooting

**Services won't start?**
```bash
docker compose logs
```

**Database errors?**
```bash
./diagnose.sh
```

**Migration issues?**
```bash
docker compose logs api | grep migration
```

**Need help?** Check **GETTING_STARTED.md** for detailed troubleshooting.

## Production Deployment

For production:
1. Set production domain in `.env`
2. Caddy handles SSL automatically
3. Configure SMTP for email notifications
4. Add Stripe keys for payments
5. Set up database backups
6. Monitor logs

See **GETTING_STARTED.md** production checklist.

## Development

```bash
# API development
docker compose logs -f api

# Frontend development
cd frontend && npm run dev

# Admin development
cd admin && npm run dev

# Run migrations
./migrate.sh
```

## Backup & Restore

```bash
# Backup database
docker compose exec postgres pg_dump -U postgres ucpready > backup.sql

# Restore database
cat backup.sql | docker compose exec -T postgres psql -U postgres -d ucpready

# Backup config
tar -czf backup.tar.gz .env secrets/ Caddyfile
```

## Support

- Check logs: `docker compose logs -f`
- Run diagnostics: `./diagnose.sh`
- Review docs: `GETTING_STARTED.md`
- Check install info: `INSTALL_INFO.txt`

## License

[Your License Here]

---

**Ready to start?** Run `./install.sh`

**Need help?** Check `GETTING_STARTED.md`

**Version:** 2.0 Bug-Free Release | **Date:** 2026-02-13

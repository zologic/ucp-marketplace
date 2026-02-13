# UCP Marketplace - Quick Start Guide

## Installation (Fresh Install)

### One Command Install

```bash
./install.sh
```

That's it! The install script will:
1. Check your system requirements
2. Gather configuration (domain, database name, etc.)
3. Generate cryptographic keys
4. Configure reverse proxy
5. Start all Docker services
6. Run database migrations
7. Create your admin user
8. Verify everything is working

### Requirements

- Docker and Docker Compose v2
- Linux, macOS, or Windows with WSL2
- Ports 80, 443, 5432 available

### What You'll Be Asked

The installer will prompt you for:
- **Domain name** (default: localhost)
- **Marketplace name** (default: UCP Marketplace)
- **Database name** (default: ucpready)
- **Admin email** (your email address)
- **Admin password** (minimum 12 characters)

Everything else is auto-generated securely.

## Access Your Marketplace

After installation completes:

- **Frontend**: http://localhost/ (or your domain)
- **Admin Panel**: http://localhost/admin-ui/
- **API**: http://localhost/api/
- **Health Check**: http://localhost/health

## First Steps

1. **Log into Admin Panel**
   - Go to http://localhost/admin-ui/
   - Use the email and password you set during install

2. **Add Your First Merchant**
   - Click "Merchants" in the sidebar
   - Click "Add Merchant"
   - Enter merchant domain (e.g., "example.com")
   - Click "Verify UCP Endpoint"
   - Click "Activate"

3. **Index Products**
   - On the merchant page, click "Index Products"
   - Wait for indexing to complete
   - Products will appear in your marketplace

4. **Visit Your Marketplace**
   - Go to http://localhost/
   - You should see indexed products
   - Try searching, filtering, and checkout

## Useful Commands

### View Logs
```bash
docker compose logs -f          # All services
docker compose logs -f api      # Just API
docker compose logs -f postgres # Just database
```

### Restart Services
```bash
docker compose restart          # Restart all
docker compose restart api      # Restart just API
```

### Stop/Start
```bash
docker compose down             # Stop all
docker compose up -d            # Start all
```

### Create Additional Admin
```bash
./create-admin.sh
```

### Run Migrations Manually
```bash
./migrate.sh
```

### Diagnose Issues
```bash
./diagnose.sh                   # General diagnostics
./diagnose-analytics.sh         # Check analytics
```

### Database Access
```bash
docker compose exec postgres psql -U postgres -d ucpready
```

## Configuration

All configuration is in `.env` file:

```bash
# Edit configuration
nano .env

# Restart to apply changes
docker compose down
docker compose up -d
```

### Important Settings

- `DOMAIN` - Your marketplace domain
- `TENANT_NAME` - Marketplace display name
- `POSTGRES_DB` - Database name
- `JWT_SECRET` - API authentication secret
- `RUN_WORKER` - Enable background jobs (true/false)

### Optional: Email Notifications

Add to `.env`:
```
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your-password
SMTP_FROM=noreply@yourdomain.com
```

### Optional: Stripe Payments

Add to `.env`:
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
```

## Database Migrations

The system uses sequential SQL migrations in `database/migrations/`.

**Adding new migrations:**
1. Create `database/migrations/007_your_change.sql`
2. Write your SQL (use `IF NOT EXISTS` clauses)
3. Run `./migrate.sh`

See `database/README.md` for full migration documentation.

## Troubleshooting

### Services Won't Start

```bash
# Check Docker is running
docker ps

# Check logs for errors
docker compose logs

# Try fresh start
docker compose down
docker compose up -d
```

### Database Connection Errors

```bash
# Check database is running
docker compose ps postgres

# Check database logs
docker compose logs postgres

# Verify DATABASE_URL in .env
cat .env | grep DATABASE_URL
```

### Migration Failures

```bash
# Check migration status
docker compose exec postgres psql -U postgres -d ucpready -c \
  "SELECT * FROM schema_migrations ORDER BY applied_at;"

# Check API logs for migration errors
docker compose logs api | grep migration

# Manually run migrations
./migrate.sh
```

### "Database ucpready does not exist"

If you changed `POSTGRES_DB` in `.env`, update all scripts:
```bash
# They now read from environment automatically
# Just make sure .env is loaded
```

### Admin Can't Log In

```bash
# Reset admin password
./create-admin.sh

# Use same email to update password
```

### No Products Showing

```bash
# Check if merchants are active
docker compose exec postgres psql -U postgres -d ucpready -c \
  "SELECT domain, status FROM merchants;"

# Check if products are indexed
docker compose exec postgres psql -U postgres -d ucpready -c \
  "SELECT COUNT(*) FROM products;"

# Manually trigger indexing
./diagnose.sh
```

## Architecture

```
┌─────────────┐
│   Caddy     │  (Reverse Proxy, SSL)
│   :80, :443 │
└──────┬──────┘
       │
       ├─────────► Frontend (Nginx)
       ├─────────► Admin (React)
       └─────────► API (Node.js + Worker)
                      │
                      ├─────► PostgreSQL
                      ├─────► Redis
                      └─────► MCP Server
```

**7 Docker Services:**
1. **caddy** - Reverse proxy and SSL termination
2. **frontend** - Public marketplace (Nginx)
3. **admin** - Admin dashboard (React)
4. **api** - REST API + Background worker
5. **mcp-server** - AI orchestration
6. **postgres** - Database (PostgreSQL 16)
7. **redis** - Cache and pub/sub (Redis 7)

## Backup & Restore

### Backup Database
```bash
docker compose exec postgres pg_dump -U postgres ucpready > backup.sql
```

### Restore Database
```bash
cat backup.sql | docker compose exec -T postgres psql -U postgres -d ucpready
```

### Backup Configuration
```bash
tar -czf backup-config.tar.gz .env secrets/ Caddyfile
```

## Production Deployment

For production deployment:

1. **Set production domain** in `.env`
2. **Enable SSL** - Caddy handles this automatically
3. **Configure email** - Set SMTP settings in `.env`
4. **Set strong passwords** - Change all defaults
5. **Enable Stripe** - Add Stripe keys for payments
6. **Backup regularly** - Automate database backups
7. **Monitor logs** - Set up log aggregation

### Production Checklist

- [ ] Domain configured with proper DNS
- [ ] SSL certificates working
- [ ] Strong admin passwords
- [ ] Database backups automated
- [ ] Email notifications working
- [ ] Stripe configured for payments
- [ ] Monitoring and alerts set up
- [ ] Regular security updates

## Getting Help

1. Check `database/README.md` for migration help
2. Run `./diagnose.sh` for automated diagnostics
3. Check logs: `docker compose logs -f api`
4. Review `INSTALL_INFO.txt` for your setup details

## Files & Directories

```
/
├── install.sh           # Main installation script (RUN THIS)
├── .env                 # Configuration (auto-generated)
├── docker-compose.yml   # Service definitions
├── Caddyfile           # Reverse proxy config (auto-generated)
├── secrets/            # Cryptographic keys (auto-generated)
├── database/
│   ├── README.md       # Migration documentation
│   ├── migrations/     # Database migrations
│   └── schema.sql      # (archived, use migrations/)
├── api/                # Backend API source
├── admin/              # Admin dashboard source
├── frontend/           # Public frontend source
├── worker/             # Background jobs
└── mcp-server/         # AI orchestration

Helper Scripts:
├── create-admin.sh     # Create additional admin users
├── migrate.sh          # Run database migrations
├── diagnose.sh         # System diagnostics
└── diagnose-*.sh       # Specific diagnostics
```

## System Status

Check overall health:
```bash
docker compose ps
./diagnose.sh
```

All services should show "running" status.

## Version Information

- **UCP Marketplace**: v2.0 (Bug-Free Release)
- **Database Schema**: v1.0.0
- **Migration System**: v2.0 (Unified)
- **Install Date**: Check `INSTALL_INFO.txt`

---

**Need help?** Check the logs and diagnostic scripts first!

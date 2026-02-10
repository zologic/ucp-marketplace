# Deployment Guide

## Prerequisites

- Docker and Docker Compose installed
- Domain names configured (DNS A records pointing to your server)
- At least 2GB RAM, 2 CPU cores, 20GB disk space
- Ports 80 and 443 available

## Initial Setup

### 1. Clone and Configure

```bash
# Clone repository
git clone https://github.com/your-org/ucp-marketplace.git
cd ucp-marketplace

# Copy environment template
cp .env.example .env

# Edit environment variables
nano .env
```

### 2. Generate Platform Keys

Generate Ed25519 key pair for signing checkout referrals:

```bash
# Create secrets directory if it doesn't exist
mkdir -p secrets

# Generate private key
openssl genpkey -algorithm ED25519 -out secrets/platform_private_key.pem

# Generate public key
openssl pkey -in secrets/platform_private_key.pem -pubout -out secrets/platform_public_key.pem

# Set permissions
chmod 600 secrets/platform_private_key.pem
```

### 3. Configure Environment Variables

Edit `.env` file with production values:

```bash
# Database
POSTGRES_PASSWORD=your-secure-password-here

# Admin
ADMIN_JWT_SECRET=$(openssl rand -base64 32)

# Node Environment
NODE_ENV=production
```

### 4. Configure Domains

Edit `Caddyfile` to add your domains:

```caddyfile
# Replace shop.ai with your domain
shop.ai {
    handle /api/* {
        reverse_proxy api:3000
    }
    handle /admin/* {
        reverse_proxy api:3000
    }
    handle {
        reverse_proxy frontend:80
    }
}
```

## Deployment

### Build and Start Services

```bash
# Build all containers
docker-compose build

# Start services
docker-compose up -d

# Check service status
docker-compose ps

# View logs
docker-compose logs -f
```

### Run Database Migrations

Migrations run automatically on API startup. To run manually:

```bash
docker-compose exec api npm run migrate
```

### Create Admin User

Connect to database and create first admin:

```bash
docker-compose exec postgres psql -U postgres -d ucpready
```

```sql
-- Create admin user (replace with your email and hashed password)
-- Generate password hash: node -e "console.log(require('bcryptjs').hashSync('your-password', 10))"
INSERT INTO admins (email, password_hash, role)
VALUES ('admin@yourdomain.com', '$2a$10$...', 'superadmin');
```

Exit psql with `\q`.

## Verification

### 1. Health Checks

```bash
# API health
curl http://localhost/api/health

# MCP server health (internal)
docker-compose exec api curl http://mcp-server:8080/internal/health

# Frontend
curl http://localhost/health
```

### 2. Create Test Tenant

```bash
docker-compose exec postgres psql -U postgres -d ucpready -c "
INSERT INTO tenants (domain, name, status)
VALUES ('localhost', 'Test Tenant', 'active');
"
```

### 3. Test Search

Open browser to `http://localhost` and try searching for products.

## Multi-Domain Setup

### 1. Configure DNS

Add A records for each domain pointing to your server IP:

```
shop.ai       A    123.456.789.0
partner.nl    A    123.456.789.0
```

### 2. Update Caddyfile

Add each domain to Caddyfile with the same routing:

```caddyfile
shop.ai {
    handle /api/* {
        reverse_proxy api:3000
    }
    handle {
        reverse_proxy frontend:80
    }
}

partner.nl {
    handle /api/* {
        reverse_proxy api:3000
    }
    handle {
        reverse_proxy frontend:80
    }
}
```

### 3. Create Tenants

```bash
docker-compose exec postgres psql -U postgres -d ucpready -c "
INSERT INTO tenants (domain, name, status) VALUES
('shop.ai', 'Shop AI', 'active'),
('partner.nl', 'Partner NL', 'active');
"
```

### 4. Reload Caddy

```bash
docker-compose restart caddy
```

Caddy will automatically provision SSL certificates via Let's Encrypt.

## Scaling

### Scale API Horizontally

```bash
# Run 3 API instances
docker-compose up -d --scale api=3
```

Note: Requires load balancer in front (Caddy handles this automatically).

### Database Backups

Set up automated PostgreSQL backups:

```bash
# Create backup script
cat > backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)
docker-compose exec -T postgres pg_dump -U postgres ucpready > "$BACKUP_DIR/ucpready_$DATE.sql"
# Keep only last 7 days
find $BACKUP_DIR -name "ucpready_*.sql" -mtime +7 -delete
EOF

chmod +x backup.sh

# Add to crontab (daily at 2 AM)
0 2 * * * /path/to/backup.sh
```

## Monitoring

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f worker

# Last 100 lines
docker-compose logs --tail=100 api
```

### Resource Usage

```bash
# Container stats
docker stats

# Disk usage
docker system df
```

## Maintenance

### Update Services

```bash
# Pull latest code
git pull

# Rebuild and restart
docker-compose build
docker-compose up -d
```

### Database Migrations

New migrations are applied automatically on API startup. To check migration status:

```bash
docker-compose exec postgres psql -U postgres -d ucpready -c "SELECT * FROM schema_migrations ORDER BY applied_at DESC LIMIT 10;"
```

### Clean Up Old Data

```bash
# Remove old Docker images
docker image prune -a

# Remove unused volumes
docker volume prune
```

## Troubleshooting

### API Won't Start

```bash
# Check database connection
docker-compose exec api node -e "require('pg').Client({connectionString:process.env.DATABASE_URL}).connect().then(()=>console.log('OK')).catch(console.error)"

# Check logs
docker-compose logs api
```

### Database Connection Failed

```bash
# Check PostgreSQL status
docker-compose ps postgres

# Check PostgreSQL logs
docker-compose logs postgres

# Test connection
docker-compose exec postgres pg_isready -U postgres
```

### SSL Certificate Issues

```bash
# Check Caddy logs
docker-compose logs caddy

# Ensure ports 80 and 443 are accessible
# Check firewall rules
```

### Worker Jobs Not Running

```bash
# Check worker logs
docker-compose logs worker

# Verify worker is running
docker-compose ps worker

# Check scheduled jobs
docker-compose exec worker node -e "console.log(new Date())"
```

## Production Checklist

- [ ] Secrets changed from defaults
- [ ] Database backups configured
- [ ] SSL certificates provisioned (automatic with Caddy)
- [ ] Firewall configured (only ports 80/443 exposed)
- [ ] Admin user created
- [ ] Tenants configured
- [ ] Test merchant added and verified
- [ ] Monitoring set up (logs, metrics)
- [ ] Error tracking configured (optional: Sentry)

## Security Hardening

### 1. Firewall Configuration

```bash
# Allow only HTTP/HTTPS
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

### 2. Restrict MCP Server

MCP server should NEVER be publicly accessible. Verify:

```bash
# This should fail (connection refused)
curl http://your-server-ip:8080/internal/health
```

### 3. Regular Updates

```bash
# Update Docker images
docker-compose pull
docker-compose up -d

# Update system packages
apt update && apt upgrade -y
```

## Support

For issues and questions:
- GitHub Issues: https://github.com/your-org/ucp-marketplace/issues
- Documentation: https://docs.ucpready.io

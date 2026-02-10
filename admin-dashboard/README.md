# UCPReady Admin Dashboard

Production-ready React admin dashboard for managing merchants, tenants, billing, and system health in the UCPReady AI Commerce Directory.

## Features

- **Authentication** - Secure JWT-based login with role-based access control
- **Merchant Management** - CRUD operations, verification, activation, CPC billing
- **Tenant Management** - Multi-tenant configuration and management
- **Analytics Dashboard** - Platform-wide metrics and insights
- **Billing & Invoicing** - Invoice management and payment tracking
- **Audit Logs** - Complete admin action history
- **System Health** - Real-time service status monitoring
- **Admin User Management** - Create and manage admin accounts (superadmin only)

## Tech Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **TailwindCSS** - Styling
- **Shadcn/ui** - UI components (Radix primitives)
- **TanStack Query** - Server state management
- **React Router** - Client-side routing
- **Chart.js** - Data visualization
- **Axios** - HTTP client

## Development

### Prerequisites

- Node.js 20+
- npm or yarn

### Installation

```bash
cd admin-dashboard
npm install
```

### Configuration

Create `.env` file:

```bash
VITE_API_URL=http://localhost/admin
```

### Run Development Server

```bash
npm run dev
```

The dashboard will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
```

Built files will be in `dist/` directory.

## Docker Deployment

The admin dashboard is included in the main docker-compose setup.

### Build and Run

```bash
# From repository root
docker-compose build admin
docker-compose up -d admin
```

### Access

**Development (localhost):**
- Admin Dashboard: `http://localhost/admin-ui`
- API: `http://localhost/admin/*`

**Production (separate subdomain):**
- Admin Dashboard: `https://admin.yourdomain.com`
- Configure in Caddyfile (see Production Setup below)

## Production Setup

### 1. Update Caddyfile

Uncomment and configure the admin subdomain in `/Caddyfile`:

```caddy
admin.yourdomain.com {
    reverse_proxy admin:5173
}
```

### 2. Set API URL

Build with production API URL:

```dockerfile
# In Dockerfile
ARG API_URL=https://yourdomain.com/admin
ENV VITE_API_URL=$API_URL
```

Or configure via environment variable in docker-compose.yml:

```yaml
admin:
  environment:
    - VITE_API_URL=https://yourdomain.com/admin
```

### 3. Deploy

```bash
docker-compose build admin
docker-compose up -d admin
docker-compose restart caddy
```

## API Endpoints

All admin API endpoints are prefixed with `/admin`:

### Authentication
- `POST /admin/login` - Admin login

### Merchants
- `GET /admin/merchants` - List merchants
- `POST /admin/merchants` - Add merchant
- `GET /admin/merchants/:id` - Get merchant details
- `PATCH /admin/merchants/:id` - Update merchant
- `POST /admin/merchants/:id/verify` - Verify UCP endpoints
- `POST /admin/merchants/:id/activate` - Activate merchant
- `POST /admin/merchants/:id/suspend` - Suspend merchant
- `GET /admin/merchants/:id/analytics` - Merchant analytics
- `GET /admin/merchants/:id/cpc/preview` - Preview CPC billing
- `PATCH /admin/merchants/:id/cpc` - Toggle CPC billing
- `GET /admin/merchants/:id/invoices` - Merchant invoices

### Tenants
- `GET /admin/tenants` - List tenants
- `POST /admin/tenants` - Create tenant
- `GET /admin/tenants/:id` - Get tenant details
- `PATCH /admin/tenants/:id` - Update tenant
- `DELETE /admin/tenants/:id` - Delete tenant
- `PATCH /admin/tenants/:id/status` - Toggle tenant status

### Admin Users (Superadmin only)
- `GET /admin/admins` - List admin users
- `POST /admin/admins` - Create admin user
- `GET /admin/admins/:id` - Get admin details
- `PATCH /admin/admins/:id` - Update admin role
- `DELETE /admin/admins/:id` - Delete admin user
- `PATCH /admin/admins/:id/password` - Change password

### Invoices & Billing
- `GET /admin/invoices` - List invoices
- `GET /admin/invoices/:id` - Get invoice details
- `PATCH /admin/invoices/:id/status` - Update invoice status

### Audit Logs
- `GET /admin/audit-logs` - Query audit logs

### System Health & Metrics
- `GET /admin/dashboard/stats` - Dashboard summary statistics
- `GET /admin/system/health` - System health check
- `GET /admin/analytics/overview` - Platform-wide analytics
- `POST /admin/mcp/reload` - Trigger MCP hot reload

## Project Structure

```
admin-dashboard/
├── public/               # Static assets
├── src/
│   ├── components/
│   │   ├── layout/      # Layout components (DashboardLayout, etc.)
│   │   └── ui/          # Shadcn UI components (Button, Card, etc.)
│   ├── contexts/        # React contexts (AuthContext)
│   ├── hooks/           # Custom hooks
│   ├── lib/             # Utilities (api, utils)
│   ├── pages/           # Page components (Login, Dashboard, etc.)
│   ├── types/           # TypeScript types
│   ├── App.tsx          # Main app component
│   ├── main.tsx         # Entry point
│   └── index.css        # Global styles
├── Dockerfile           # Production Docker image
├── nginx.conf           # Nginx configuration
├── package.json
├── tsconfig.json
├── tailwind.config.js
└── vite.config.ts
```

## Authentication

### Login

The dashboard uses JWT-based authentication. Admin users are stored in the `admins` database table.

**Default admin creation** (via database):

```sql
INSERT INTO admins (email, password_hash, role)
VALUES (
  'admin@example.com',
  '$2a$10$...',  -- bcrypt hash of password
  'superadmin'
);
```

### Roles

- **superadmin** - Full access including admin user management
- **admin** - Standard access (cannot manage admin users)

### Token Storage

- JWT token stored in `localStorage` as `admin_token`
- User info stored in `localStorage` as `admin_user`
- Token expiry: 24 hours
- Automatic logout on 401 responses

## Security

- All admin routes require JWT authentication
- Superadmin-only routes enforce role-based access control
- CORS configured in API server
- HTTPS enforced in production (via Caddy)
- Security headers set in nginx.conf
- Input validation on all forms
- Parameterized SQL queries (SQL injection prevention)

## Troubleshooting

### Can't login

1. Verify admin user exists in database:
   ```sql
   SELECT * FROM admins WHERE email = 'your@email.com';
   ```

2. Check API is accessible:
   ```bash
   curl http://localhost/admin/login
   ```

3. Check browser console for errors
4. Verify `VITE_API_URL` is correct

### 401 Unauthorized errors

- Token expired (24h) - login again
- Invalid token - clear localStorage and login again
- Admin user deleted - contact superadmin

### Pages not loading

1. Check if admin service is running:
   ```bash
   docker-compose ps admin
   ```

2. Check logs:
   ```bash
   docker-compose logs admin
   ```

3. Verify Caddyfile routing is correct

## Development Guidelines

### Adding a New Page

1. Create page component in `src/pages/`
2. Add route in `src/App.tsx`
3. Add navigation item in `src/components/layout/DashboardLayout.tsx`
4. Create API hooks in `src/hooks/` if needed

### Adding a New API Endpoint

1. Add TypeScript types in `src/types/index.ts`
2. Create API client method in `src/lib/api.ts` (optional)
3. Use `useQuery` or `useMutation` from TanStack Query
4. Handle loading and error states

## Future Enhancements

Current implementation provides core functionality. Planned enhancements:

- **Additional Pages** - Complete implementations for all navigation items
- **Advanced Filters** - More filtering options on list pages
- **Bulk Operations** - Bulk activate/suspend merchants
- **Data Export** - Export data to CSV/Excel
- **Real-time Updates** - WebSocket for live notifications
- **Advanced Analytics** - More charts and metrics
- **Dark Mode** - Theme toggle
- **Email Notifications** - Invoice and alert emails
- **2FA** - Two-factor authentication for admin users

## License

Apache License 2.0

## Support

- **Issues:** https://github.com/your-org/ucp-marketplace/issues
- **Documentation:** https://docs.zologic.nl
- **Email:** support@zologic.nl

#!/bin/bash
# Diagnostic script for admin-ui issues

echo "============================================"
echo "Admin Dashboard Diagnostics"
echo "============================================"
echo ""

echo "1. Checking admin container status..."
docker ps -a | grep admin

echo ""
echo "2. Checking admin container logs (last 50 lines)..."
docker logs ucpready-admin 2>&1 | tail -50

echo ""
echo "3. Checking if built assets exist in container..."
docker exec ucpready-admin ls -lah /usr/share/nginx/html/

echo ""
echo "4. Checking if assets directory exists..."
docker exec ucpready-admin ls -lah /usr/share/nginx/html/assets/ 2>&1 || echo "Assets directory not found!"

echo ""
echo "5. Checking nginx configuration..."
docker exec ucpready-admin cat /etc/nginx/conf.d/default.conf

echo ""
echo "6. Checking index.html content..."
docker exec ucpready-admin head -20 /usr/share/nginx/html/index.html

echo ""
echo "7. Checking Caddyfile routing..."
grep -A3 "admin-ui" Caddyfile

echo ""
echo "8. Checking API container status (should not be restarting)..."
docker ps | grep api

echo ""
echo "9. Checking API logs for errors..."
docker logs ucp-marketplace-api-1 2>&1 | tail -30

echo ""
echo "10. Testing direct nginx access in admin container..."
docker exec ucpready-admin wget -O- http://localhost:5173/admin-ui/ 2>&1 | head -50

echo ""
echo "============================================"
echo "Diagnostics complete. Please share output."
echo "============================================"

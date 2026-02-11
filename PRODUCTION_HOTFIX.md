# Production Hotfix - Redis API Fix

## Issue
Checkout failing with: `TypeError: req.app.locals.redis.setex is not a function`

Redis v4 changed API from `setex(key, ttl, value)` to `set(key, value, { EX: ttl })`

## Fix

In `api/routes/public.js` line 291-299, change:

```javascript
// OLD (Redis v3):
await req.app.locals.redis.setex(
    sessionKey,
    300, // 5 minutes
    JSON.stringify({
        product_id,
        merchant_id,
        created_at: Date.now()
    })
);

// NEW (Redis v4):
await req.app.locals.redis.set(
    sessionKey,
    JSON.stringify({
        product_id,
        merchant_id,
        created_at: Date.now()
    }),
    { EX: 300 } // 5 minutes
);
```

## Apply on server

```bash
# Option 1: Quick inline fix
docker compose exec api sed -i 's/redis.setex(/redis.set(/g' /app/routes/public.js
docker compose restart api

# Option 2: Edit file locally and rebuild
# Make the change above, then:
git add api/routes/public.js
git commit -m "Fix Redis v4 API compatibility"
git push
# On server: git pull && docker compose up -d --build api
```

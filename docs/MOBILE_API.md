# Mobile API Documentation

The UCP Marketplace API is designed to support mobile applications with optimized responses and mobile-friendly features.

## Overview

While the core REST and GraphQL APIs work with mobile apps, certain optimizations are available specifically for mobile clients.

## Base URL

```
https://your-domain.com/api
```

## Authentication

Mobile apps should use JWT tokens for authentication (future feature). Currently, the API is accessible without authentication for public endpoints.

## Mobile-Optimized Endpoints

### Search Products

**Endpoint:** `POST /api/search`

**Mobile Optimization Parameter:**
Add `format=mobile` query parameter for mobile-optimized responses.

```
POST /api/search?format=mobile
```

**Mobile Optimizations:**
- Image URLs include thumbnail parameter (`?w=300`)
- Reduced response payload (omits verbose fields)
- Includes `is_mobile_optimized: true` flag

**Example Request:**
```bash
curl -X POST "https://your-domain.com/api/search?format=mobile" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_domain": "your-tenant.com",
    "query": "laptop",
    "limit": 20
  }'
```

**Example Response:**
```json
{
  "products": [
    {
      "id": "product-uuid",
      "name": "MacBook Pro",
      "price_cents": 199900,
      "currency": "EUR",
      "image_url": "https://example.com/image.jpg?w=300",
      "stock_status": "in_stock",
      "merchant": {
        "id": "merchant-uuid",
        "domain": "store.example.com"
      },
      "is_mobile_optimized": true
    }
  ],
  "total_count": 45
}
```

### Get Product Details

**Endpoint:** `GET /api/products/:id?format=mobile`

Mobile-optimized product details with thumbnail images and reduced payload.

### Checkout

**Endpoint:** `POST /api/checkout`

Standard checkout endpoint - mobile apps should open the returned `checkout_url` in a webview or external browser.

## CORS Configuration

The API includes CORS headers to support mobile app requests:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE
Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With
```

**Note:** In production, update CORS settings to restrict to specific mobile app domains.

## Rate Limiting

- **Rate Limit:** 100 requests per minute per IP
- **Headers:** Rate limit info is returned in response headers
  - `X-RateLimit-Limit`
  - `X-RateLimit-Remaining`
  - `X-RateLimit-Reset`

## Best Practices for Mobile Apps

### 1. Image Loading
- Use the thumbnail versions for list views (`?w=300`)
- Load full-resolution images only for detail views
- Implement progressive image loading

### 2. Caching
- Cache API responses locally (especially product lists and categories)
- Use ETags if available for cache validation
- Implement offline mode with cached data

### 3. Error Handling
```javascript
try {
  const response = await fetch('/api/search?format=mobile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenant_domain: 'example.com', query: 'laptop' })
  });

  if (!response.ok) {
    if (response.status === 429) {
      // Rate limited - show user-friendly message
    } else if (response.status >= 500) {
      // Server error - retry with exponential backoff
    }
  }

  const data = await response.json();
  // Handle data
} catch (error) {
  // Network error - show offline message
}
```

### 4. Pagination
Use `offset` and `limit` parameters for efficient pagination:

```json
{
  "tenant_domain": "example.com",
  "query": "laptop",
  "limit": 20,
  "offset": 0
}
```

Increment `offset` by `limit` for next page.

### 5. Connectivity
- Detect network connectivity changes
- Queue requests when offline
- Sync when connection restored

## Push Notifications (Future)

Infrastructure is in place for future push notification support:

- `push_tokens` table stores device tokens
- Supports iOS (APNs), Android (FCM), and Web Push
- Platform-specific token management

**Coming soon:** API endpoints for registering and managing push tokens.

## GraphQL for Mobile

For complex data requirements, consider using GraphQL:

```
POST /graphql
```

GraphQL allows mobile apps to request exactly the data they need, reducing payload size and improving performance.

**Example Mobile GraphQL Query:**
```graphql
query MobileProductSearch($tenant: String!, $query: String!) {
  searchProducts(tenant_domain: $tenant, query: $query, limit: 20) {
    products {
      id
      name
      price_cents
      currency
      image_url
      stock_status
    }
    total_count
  }
}
```

## Security Recommendations

1. **HTTPS Only:** Always use HTTPS in production
2. **API Key:** Implement API key authentication for mobile apps (future)
3. **Certificate Pinning:** Consider certificate pinning for high-security apps
4. **Input Validation:** Validate all user inputs before sending to API
5. **Secure Storage:** Store sensitive data (tokens, user info) in secure storage (Keychain/Keystore)

## Example Mobile App Integration

### React Native
```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'https://your-domain.com/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Search products
async function searchProducts(query) {
  try {
    const response = await api.post('/search?format=mobile', {
      tenant_domain: 'your-tenant.com',
      query: query,
      limit: 20
    });
    return response.data.products;
  } catch (error) {
    console.error('Search failed:', error);
    throw error;
  }
}

// Checkout
async function createCheckout(productId, merchantId) {
  try {
    const response = await api.post('/checkout', {
      tenant_domain: 'your-tenant.com',
      product_id: productId,
      merchant_id: merchantId,
      quantity: 1
    });

    // Open checkout URL in WebView or browser
    const checkoutUrl = response.data.checkout_url;
    Linking.openURL(checkoutUrl);
  } catch (error) {
    console.error('Checkout failed:', error);
    throw error;
  }
}
```

### Flutter
```dart
import 'package:http/http.dart' as http;
import 'dart:convert';

class ApiService {
  static const String baseUrl = 'https://your-domain.com/api';

  Future<List<Product>> searchProducts(String query) async {
    final response = await http.post(
      Uri.parse('$baseUrl/search?format=mobile'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'tenant_domain': 'your-tenant.com',
        'query': query,
        'limit': 20
      }),
    );

    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      return (data['products'] as List)
          .map((p) => Product.fromJson(p))
          .toList();
    } else {
      throw Exception('Failed to search products');
    }
  }
}
```

## Testing

Use these tools for API testing:

- **Postman:** Import API collection for testing
- **cURL:** Command-line testing (see examples above)
- **Mobile Simulators:** Test with iOS Simulator and Android Emulator

## Support

For mobile API issues or questions:
- Check the main API documentation
- Review error messages carefully
- Test with cURL first to isolate mobile-specific issues

## Future Enhancements

- Native SDK for iOS and Android
- Offline sync capabilities
- Push notification API endpoints
- Mobile-specific analytics
- Deep linking support
- Biometric authentication

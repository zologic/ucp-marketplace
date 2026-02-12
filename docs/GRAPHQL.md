# GraphQL API Documentation

The UCP Marketplace provides a GraphQL API alongside the REST API for flexible data querying.

## Endpoint

```
POST /graphql
```

GraphiQL interactive playground available in development mode at: `http://localhost:3000/graphql`

## Configuration

Enable/disable GraphQL via environment variable:
```bash
GRAPHQL_ENABLED=true  # Default: true (enabled)
```

GraphiQL is automatically disabled in production (`NODE_ENV=production`).

## Schema

### Types

#### Product
```graphql
type Product {
  id: ID!
  name: String!
  description: String
  price_cents: Int!
  currency: String!
  image_url: String
  stock_status: String!
  category: String
  brand: String
  merchant: Merchant!
  created_at: String!
}
```

#### Merchant
```graphql
type Merchant {
  id: ID!
  domain: String!
  business_name: String
  business_description: String
  contact_email: String
  status: String!
  products: [Product!]
}
```

#### Tenant
```graphql
type Tenant {
  id: ID!
  domain: String!
  name: String!
  status: String!
  merchants: [Merchant!]
}
```

#### SearchResult
```graphql
type SearchResult {
  products: [Product!]!
  total_count: Int!
  facets: [ProductFacet!]
}
```

### Queries

#### searchProducts

Search for products with filtering and pagination.

**Arguments:**
- `tenant_domain: String!` - Required tenant domain
- `query: String` - Optional search query (full-text search)
- `category: String` - Optional category filter
- `brand: String` - Optional brand filter
- `max_price_cents: Int` - Optional maximum price filter (in cents)
- `limit: Int` - Results per page (default: 20)
- `offset: Int` - Pagination offset (default: 0)

**Example:**
```graphql
query SearchProducts {
  searchProducts(
    tenant_domain: "search.example.com"
    query: "laptop"
    category: "Electronics"
    max_price_cents: 100000
    limit: 10
  ) {
    products {
      id
      name
      price_cents
      currency
      image_url
      merchant {
        domain
        business_name
      }
    }
    total_count
    facets {
      category
      count
    }
  }
}
```

#### getProduct

Get a single product by ID.

**Arguments:**
- `id: ID!` - Product ID

**Example:**
```graphql
query GetProduct {
  getProduct(id: "550e8400-e29b-41d4-a716-446655440000") {
    id
    name
    description
    price_cents
    currency
    merchant {
      domain
      business_name
      contact_email
    }
  }
}
```

#### getMerchant

Get merchant details with products.

**Arguments:**
- `id: ID!` - Merchant ID

**Example:**
```graphql
query GetMerchant {
  getMerchant(id: "merchant-uuid-here") {
    id
    domain
    business_name
    business_description
    products {
      id
      name
      price_cents
      currency
    }
  }
}
```

#### getTenants

Get all active tenants.

**Example:**
```graphql
query GetTenants {
  getTenants {
    id
    domain
    name
    merchants {
      id
      domain
      business_name
    }
  }
}
```

## Usage Examples

### cURL
```bash
curl -X POST http://localhost:3000/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query { searchProducts(tenant_domain: \"localhost\", query: \"laptop\") { products { id name price_cents } total_count } }"
  }'
```

### JavaScript (fetch)
```javascript
const query = `
  query SearchProducts($tenant: String!, $query: String!) {
    searchProducts(tenant_domain: $tenant, query: $query) {
      products {
        id
        name
        price_cents
        currency
      }
      total_count
    }
  }
`;

const variables = {
  tenant: "search.example.com",
  query: "laptop"
};

fetch('http://localhost:3000/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query, variables })
})
  .then(res => res.json())
  .then(data => console.log(data));
```

### Python
```python
import requests

query = """
query {
  searchProducts(tenant_domain: "localhost", query: "laptop") {
    products {
      id
      name
      price_cents
    }
    total_count
  }
}
"""

response = requests.post(
    'http://localhost:3000/graphql',
    json={'query': query}
)

print(response.json())
```

## Best Practices

1. **Use variables** instead of inline values in queries
2. **Request only needed fields** to minimize data transfer
3. **Implement pagination** for large result sets using `limit` and `offset`
4. **Use fragments** for reusable field selections
5. **Handle errors** returned in the `errors` array

## Error Handling

GraphQL errors are returned in the response:

```json
{
  "errors": [
    {
      "message": "Tenant not found",
      "locations": [{"line": 2, "column": 3}],
      "path": ["searchProducts"]
    }
  ],
  "data": null
}
```

## Performance

- Results are limited to 20 products by default (configurable via `limit` parameter)
- Full-text search uses PostgreSQL's built-in text search
- Merchant and billing status filters are applied automatically
- Nested resolvers are optimized to avoid N+1 queries where possible

## Future Enhancements

- Mutations for cart management
- Subscriptions for real-time updates
- Advanced filtering (price ranges, ratings)
- Sorting options
- Aggregations and analytics queries

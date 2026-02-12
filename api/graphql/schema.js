const { buildSchema } = require('graphql');

const schema = buildSchema(`
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

  type Merchant {
    id: ID!
    domain: String!
    business_name: String
    business_description: String
    contact_email: String
    status: String!
    products: [Product!]
  }

  type Tenant {
    id: ID!
    domain: String!
    name: String!
    status: String!
    merchants: [Merchant!]
  }

  type ProductFacet {
    category: String!
    count: Int!
  }

  type SearchResult {
    products: [Product!]!
    total_count: Int!
    facets: [ProductFacet!]
  }

  type Query {
    searchProducts(
      tenant_domain: String!
      query: String
      category: String
      brand: String
      max_price_cents: Int
      limit: Int
      offset: Int
    ): SearchResult!

    getProduct(id: ID!): Product

    getMerchant(id: ID!): Merchant

    getTenants: [Tenant!]!
  }
`);

module.exports = schema;

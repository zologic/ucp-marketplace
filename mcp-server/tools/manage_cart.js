/**
 * MCP Tool: Manage Shopping Cart
 * Session-based cart operations for AI agents
 */

const CART_TTL = 24 * 60 * 60; // 24 hours in seconds

module.exports = {
    name: 'manage_cart',
    description: 'Manage shopping cart (add, remove, get, clear items)',
    inputSchema: {
        type: 'object',
        properties: {
            action: {
                type: 'string',
                enum: ['add', 'remove', 'get', 'clear'],
                description: 'Cart action to perform'
            },
            session_id: {
                type: 'string',
                description: 'Session ID for cart persistence'
            },
            product_id: {
                type: 'string',
                description: 'Product ID (required for add/remove actions)'
            },
            merchant_id: {
                type: 'string',
                description: 'Merchant ID (required for add action)'
            },
            quantity: {
                type: 'number',
                description: 'Quantity to add (default: 1)',
                default: 1
            }
        },
        required: ['action', 'session_id']
    },

    async execute({ action, session_id, product_id, merchant_id, quantity = 1 }, { db, redis }) {
        try {
            if (!session_id) {
                return { error: 'session_id is required' };
            }

            const cartKey = `cart:${session_id}`;

            switch (action) {
                case 'add':
                    return await addToCart(cartKey, product_id, merchant_id, quantity, db, redis);

                case 'remove':
                    return await removeFromCart(cartKey, product_id, redis);

                case 'get':
                    return await getCart(cartKey, db, redis);

                case 'clear':
                    return await clearCart(cartKey, redis);

                default:
                    return { error: 'Invalid action' };
            }

        } catch (error) {
            console.error('[manage_cart] Error:', error);
            return {
                error: 'Cart operation failed',
                details: error.message
            };
        }
    }
};

/**
 * Add item to cart
 */
async function addToCart(cartKey, product_id, merchant_id, quantity, db, redis) {
    if (!product_id || !merchant_id) {
        return { error: 'product_id and merchant_id are required for add action' };
    }

    if (quantity > 99) {
        return { error: 'Quantity too large (maximum 99)' };
    }

    // Validate product exists and is in stock
    const productResult = await db.query(`
        SELECT p.*, m.status as merchant_status, mb.status as billing_status
        FROM products p
        JOIN merchants m ON p.merchant_id = m.id
        JOIN merchant_billing mb ON m.id = mb.merchant_id
        WHERE p.id = $1 AND p.merchant_id = $2
    `, [product_id, merchant_id]);

    if (productResult.rows.length === 0) {
        return { error: 'Product not found' };
    }

    const product = productResult.rows[0];

    if (product.stock_status === 'out_of_stock') {
        return { error: 'Product unavailable (out of stock)' };
    }

    if (product.merchant_status !== 'active' || product.billing_status !== 'active') {
        return { error: 'Merchant unavailable' };
    }

    // Get current cart
    const cartData = await redis.get(cartKey);
    let cart = cartData ? JSON.parse(cartData) : [];

    // Check if product already in cart
    const existingItemIndex = cart.findIndex(
        item => item.product_id === product_id && item.merchant_id === merchant_id
    );

    if (existingItemIndex >= 0) {
        // Update quantity
        cart[existingItemIndex].quantity += quantity;
    } else {
        // Add new item
        cart.push({
            product_id,
            merchant_id,
            quantity,
            added_at: new Date().toISOString()
        });
    }

    // Save cart with TTL
    await redis.setEx(cartKey, CART_TTL, JSON.stringify(cart));

    return await getCart(cartKey, db, redis);
}

/**
 * Remove item from cart
 */
async function removeFromCart(cartKey, product_id, redis) {
    if (!product_id) {
        return { error: 'product_id is required for remove action' };
    }

    const cartData = await redis.get(cartKey);
    if (!cartData) {
        return {
            items: [],
            total_items: 0,
            total_cents: 0,
            currency: 'EUR'
        };
    }

    let cart = JSON.parse(cartData);
    cart = cart.filter(item => item.product_id !== product_id);

    if (cart.length === 0) {
        await redis.del(cartKey);
    } else {
        await redis.setEx(cartKey, CART_TTL, JSON.stringify(cart));
    }

    return {
        items: cart,
        total_items: cart.reduce((sum, item) => sum + item.quantity, 0),
        message: 'Item removed from cart'
    };
}

/**
 * Get cart with full product details
 */
async function getCart(cartKey, db, redis) {
    const cartData = await redis.get(cartKey);
    if (!cartData) {
        return {
            items: [],
            total_items: 0,
            total_cents: 0,
            currency: 'EUR'
        };
    }

    const cart = JSON.parse(cartData);

    if (cart.length === 0) {
        return {
            items: [],
            total_items: 0,
            total_cents: 0,
            currency: 'EUR'
        };
    }

    // Fetch product details for all items
    const productIds = cart.map(item => item.product_id);
    const productsResult = await db.query(`
        SELECT
            p.id,
            p.name,
            p.description,
            p.price_cents,
            p.currency,
            p.image_url,
            p.stock_status,
            p.merchant_id,
            m.domain as merchant_domain,
            m.business_name as merchant_name
        FROM products p
        JOIN merchants m ON p.merchant_id = m.id
        WHERE p.id = ANY($1)
    `, [productIds]);

    const productsMap = {};
    productsResult.rows.forEach(p => {
        productsMap[p.id] = p;
    });

    // Build cart items with full details
    const items = cart.map(cartItem => {
        const product = productsMap[cartItem.product_id];
        if (!product) return null;

        return {
            product_id: cartItem.product_id,
            merchant_id: cartItem.merchant_id,
            quantity: cartItem.quantity,
            added_at: cartItem.added_at,
            product: {
                name: product.name,
                description: product.description,
                price_cents: product.price_cents,
                currency: product.currency,
                image_url: product.image_url,
                stock_status: product.stock_status
            },
            merchant: {
                domain: product.merchant_domain,
                name: product.merchant_name
            },
            subtotal_cents: product.price_cents * cartItem.quantity
        };
    }).filter(item => item !== null);

    // Calculate totals (assuming single currency for simplicity)
    const totalCents = items.reduce((sum, item) => sum + item.subtotal_cents, 0);
    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
    const currency = items.length > 0 ? items[0].product.currency : 'EUR';

    return {
        items,
        total_items: totalItems,
        total_cents: totalCents,
        currency,
        formatted_total: `${(totalCents / 100).toFixed(2)} ${currency}`
    };
}

/**
 * Clear entire cart
 */
async function clearCart(cartKey, redis) {
    await redis.del(cartKey);
    return {
        items: [],
        total_items: 0,
        total_cents: 0,
        currency: 'EUR',
        message: 'Cart cleared'
    };
}

/**
 * Webhook Registration Utility
 * Registers marketplace webhook URLs with merchant UCP plugins via MCP RPC
 * Follows UCP 2026 specification for webhook registration
 */

const axios = require('axios');

/**
 * Register webhook with merchant plugin via MCP RPC
 * @param {string} merchantDomain - Merchant domain (e.g., 'test.zologic.nl')
 * @param {string} webhookUrl - Marketplace webhook endpoint URL
 * @param {string} platformId - Marketplace platform identifier
 * @returns {Promise<Object>} Registration result
 */
async function registerWebhookWithMerchant(merchantDomain, webhookUrl, platformId = 'ucp_marketplace') {
    try {
        // Construct MCP RPC endpoint URL
        const mcpEndpoint = merchantDomain.startsWith('http')
            ? `${merchantDomain}/wp-json/ucpready/v1/mcp-rpc`
            : `https://${merchantDomain}/wp-json/ucpready/v1/mcp-rpc`;

        console.log(`[Webhook Registration] Registering with ${mcpEndpoint}`);
        console.log(`[Webhook Registration] Platform: ${platformId}, URL: ${webhookUrl}`);

        // Prepare MCP RPC request
        const rpcRequest = {
            jsonrpc: '2.0',
            method: 'ucp_register_webhook',
            params: {
                platform_id: platformId,
                webhook_url: webhookUrl,
                events: ['order.completed'] // Register for order completion events
            },
            id: `reg_${Date.now()}`
        };

        // Make RPC call with timeout
        const response = await axios.post(mcpEndpoint, rpcRequest, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 10000, // 10 second timeout
            validateStatus: (status) => status < 500 // Don't throw on 4xx errors
        });

        // Check for RPC error response
        if (response.data.error) {
            return {
                success: false,
                error: response.data.error.message || 'RPC error',
                error_code: response.data.error.code || 'RPC_ERROR',
                details: response.data.error.data
            };
        }

        // Success - extract result
        const result = response.data.result;

        return {
            success: true,
            webhook_id: result.webhook_id || result.id,
            status: result.status || 'registered',
            registered_at: result.registered_at || new Date().toISOString(),
            events: result.events || ['order.completed']
        };

    } catch (error) {
        console.error(`[Webhook Registration] Failed for ${merchantDomain}:`, error.message);

        // Determine error type
        let errorCode = 'REGISTRATION_FAILED';
        let errorMessage = error.message;

        if (error.code === 'ENOTFOUND') {
            errorCode = 'DNS_ERROR';
            errorMessage = 'Could not resolve merchant domain';
        } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
            errorCode = 'TIMEOUT';
            errorMessage = 'Connection to merchant timed out';
        } else if (error.code === 'ECONNREFUSED') {
            errorCode = 'CONNECTION_REFUSED';
            errorMessage = 'Merchant server refused connection';
        } else if (error.response?.status === 404) {
            errorCode = 'ENDPOINT_NOT_FOUND';
            errorMessage = 'MCP RPC endpoint not found - plugin may not support webhooks';
        } else if (error.response?.status >= 400 && error.response?.status < 500) {
            errorCode = 'CLIENT_ERROR';
            errorMessage = `Merchant returned ${error.response.status}: ${error.response.statusText}`;
        }

        return {
            success: false,
            error: errorMessage,
            error_code: errorCode,
            http_status: error.response?.status
        };
    }
}

/**
 * Unregister webhook from merchant plugin
 * @param {string} merchantDomain - Merchant domain
 * @param {string} webhookId - Webhook ID to unregister
 * @param {string} platformId - Marketplace platform identifier
 * @returns {Promise<Object>} Unregistration result
 */
async function unregisterWebhookFromMerchant(merchantDomain, webhookId, platformId = 'ucp_marketplace') {
    try {
        const mcpEndpoint = merchantDomain.startsWith('http')
            ? `${merchantDomain}/wp-json/ucpready/v1/mcp-rpc`
            : `https://${merchantDomain}/wp-json/ucpready/v1/mcp-rpc`;

        console.log(`[Webhook Unregistration] Removing webhook ${webhookId} from ${mcpEndpoint}`);

        const rpcRequest = {
            jsonrpc: '2.0',
            method: 'ucp_unregister_webhook',
            params: {
                platform_id: platformId,
                webhook_id: webhookId
            },
            id: `unreg_${Date.now()}`
        };

        const response = await axios.post(mcpEndpoint, rpcRequest, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 10000,
            validateStatus: (status) => status < 500
        });

        if (response.data.error) {
            return {
                success: false,
                error: response.data.error.message || 'RPC error',
                error_code: response.data.error.code || 'RPC_ERROR'
            };
        }

        return {
            success: true,
            status: 'unregistered',
            unregistered_at: new Date().toISOString()
        };

    } catch (error) {
        console.error(`[Webhook Unregistration] Failed for ${merchantDomain}:`, error.message);

        return {
            success: false,
            error: error.message,
            error_code: 'UNREGISTRATION_FAILED'
        };
    }
}

/**
 * Test webhook delivery to merchant
 * @param {string} merchantDomain - Merchant domain
 * @param {string} platformId - Marketplace platform identifier
 * @returns {Promise<Object>} Test result
 */
async function testWebhookDelivery(merchantDomain, platformId = 'ucp_marketplace') {
    try {
        const mcpEndpoint = merchantDomain.startsWith('http')
            ? `${merchantDomain}/wp-json/ucpready/v1/mcp-rpc`
            : `https://${merchantDomain}/wp-json/ucpready/v1/mcp-rpc`;

        const rpcRequest = {
            jsonrpc: '2.0',
            method: 'ucp_test_webhook',
            params: {
                platform_id: platformId
            },
            id: `test_${Date.now()}`
        };

        const response = await axios.post(mcpEndpoint, rpcRequest, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 10000,
            validateStatus: (status) => status < 500
        });

        if (response.data.error) {
            return {
                success: false,
                error: response.data.error.message || 'Test failed'
            };
        }

        return {
            success: true,
            message: 'Test webhook sent successfully',
            tested_at: new Date().toISOString()
        };

    } catch (error) {
        return {
            success: false,
            error: error.message,
            error_code: 'TEST_FAILED'
        };
    }
}

module.exports = {
    registerWebhookWithMerchant,
    unregisterWebhookFromMerchant,
    testWebhookDelivery
};

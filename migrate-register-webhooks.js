#!/usr/bin/env node
/**
 * Webhook Registration Migration
 *
 * This script registers the marketplace webhook URL with all verified merchants.
 * Run this after upgrading to the version that includes webhook registration.
 *
 * Usage:
 *   node migrate-register-webhooks.js
 *
 * Or via Docker:
 *   docker compose exec api node /app/migrate-register-webhooks.js
 */

const { Pool } = require('pg');
const axios = require('axios');

const db = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function registerWebhookWithMerchant(merchant) {
    const marketplaceWebhookUrl = process.env.PUBLIC_URL
        ? `${process.env.PUBLIC_URL}/api/webhooks/order-completed`
        : 'https://bizform.app/api/webhooks/order-completed';

    try {
        const mcpEndpoint = `${merchant.service_base_url}/mcp-rpc`;
        const response = await axios.post(mcpEndpoint, {
            jsonrpc: '2.0',
            method: 'ucp_register_webhook',
            params: {
                platform_id: 'bizform_app',
                webhook_url: marketplaceWebhookUrl
            },
            id: `reg_${Date.now()}`
        }, { timeout: 10000 });

        return {
            success: true,
            webhook_url: marketplaceWebhookUrl,
            mcp_response: response.data
        };
    } catch (error) {
        return {
            success: false,
            error: error.message,
            error_code: error.code || 'UNKNOWN'
        };
    }
}

async function main() {
    console.log('=== Webhook Registration Migration ===\n');

    try {
        // Get all verified merchants
        const result = await db.query(`
            SELECT id, domain, business_name, service_base_url, status
            FROM merchants
            WHERE status = 'verified'
            ORDER BY domain
        `);

        const merchants = result.rows;

        if (merchants.length === 0) {
            console.log('No verified merchants found.');
            console.log('Merchants must be verified before webhooks can be registered.\n');
            await db.end();
            process.exit(0);
        }

        console.log(`Found ${merchants.length} verified merchant(s):\n`);

        let successCount = 0;
        let failureCount = 0;

        for (const merchant of merchants) {
            console.log(`[${merchant.id}] ${merchant.domain} (${merchant.business_name || 'N/A'})`);

            // Check if merchant has service_base_url
            if (!merchant.service_base_url) {
                console.log('  ✗ SKIP: No service_base_url (re-verify merchant first)\n');
                failureCount++;
                continue;
            }

            // Register webhook
            process.stdout.write('  Registering webhook... ');
            const registrationResult = await registerWebhookWithMerchant(merchant);

            if (registrationResult.success) {
                console.log('✓ SUCCESS');
                console.log(`  Webhook URL: ${registrationResult.webhook_url}`);
                successCount++;
            } else {
                console.log('✗ FAILED');
                console.log(`  Error: ${registrationResult.error} (${registrationResult.error_code})`);
                failureCount++;
            }

            console.log('');
        }

        console.log('=== Summary ===');
        console.log(`Total merchants: ${merchants.length}`);
        console.log(`Successfully registered: ${successCount}`);
        console.log(`Failed: ${failureCount}\n`);

        if (failureCount > 0) {
            console.log('For failed merchants:');
            console.log('  - Ensure merchant site is accessible');
            console.log('  - Verify merchant plugin includes MCP endpoint');
            console.log('  - Re-verify merchant in admin dashboard\n');
        }

        if (successCount > 0) {
            console.log('Next steps:');
            console.log('  1. Complete a test order on merchant site');
            console.log('  2. Check API logs: docker compose logs api | grep webhook');
            console.log('  3. Verify order created: SELECT * FROM orders ORDER BY created_at DESC LIMIT 5;');
            console.log('  4. Check analytics for conversions\n');
        }

        await db.end();
        process.exit(failureCount > 0 ? 1 : 0);

    } catch (error) {
        console.error('Migration failed:', error.message);
        await db.end();
        process.exit(1);
    }
}

main();

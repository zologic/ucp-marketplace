/**
 * Manual Webhook Test Script
 * Tests webhook endpoint with mock data
 */

const axios = require('axios');
const nacl = require('tweetnacl');
const util = require('tweetnacl-util');

// Configuration
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://localhost:3000/api/webhooks/order-completed';
const MERCHANT_DOMAIN = process.env.MERCHANT_DOMAIN || 'test.zologic.nl';

// Test payload
const payload = {
    order_id: 'TEST-' + Date.now(),
    merchant_domain: MERCHANT_DOMAIN,
    referral_id: '00000000-0000-0000-0000-000000000000', // Test UUID
    total_cents: 7900, // €79.00
    currency: 'EUR'
};

// Generate test keypair (for demo - in production, use merchant's actual keys)
const keypair = nacl.sign.keyPair();
const publicKeyBase64 = util.encodeBase64(keypair.publicKey);
const privateKey = keypair.secretKey;

console.log('\n=== Webhook Test ===\n');
console.log('Public Key (base64):', publicKeyBase64);
console.log('\nPaste this into merchants.public_key in database:\n');
console.log(`UPDATE merchants SET public_key = '${publicKeyBase64}' WHERE domain = '${MERCHANT_DOMAIN}';\n`);

// Sign the payload
const canonicalMessage = JSON.stringify(payload, Object.keys(payload).sort());
const messageBytes = util.decodeUTF8(canonicalMessage);
const signatureBytes = nacl.sign.detached(messageBytes, privateKey);
const signature = util.encodeBase64(signatureBytes);

// Add signature to payload
const webhookPayload = {
    ...payload,
    signature
};

console.log('Payload:', JSON.stringify(webhookPayload, null, 2));
console.log('\nSending webhook to:', WEBHOOK_URL);

// Send webhook
axios.post(WEBHOOK_URL, webhookPayload, {
    headers: {
        'Content-Type': 'application/json'
    }
})
.then(response => {
    console.log('\n✓ Success!');
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(response.data, null, 2));
})
.catch(error => {
    console.log('\n✗ Error!');
    if (error.response) {
        console.log('Status:', error.response.status);
        console.log('Error:', JSON.stringify(error.response.data, null, 2));
    } else {
        console.log('Error:', error.message);
    }
    process.exit(1);
});

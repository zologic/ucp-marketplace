/**
 * UCP Manifest Parser
 *
 * Centralized parsing logic for UCP manifests following the new schema.
 * Validates structure and extracts relevant fields for merchant verification.
 */

/**
 * Parse and validate a UCP manifest
 *
 * @param {Object} manifest - The UCP manifest object from /.well-known/ucp
 * @returns {Object} Result object with structure:
 *   {
 *     isValid: boolean,
 *     error: string|null,
 *     data: {
 *       businessName: string,
 *       businessUrl: string,
 *       businessDescription: string,
 *       contactEmail: string,
 *       serviceBaseUrl: string,
 *       publicKey: string,
 *       signingKeyId: string,
 *       fullManifest: object
 *     }
 *   }
 */
function parseUcpManifest(manifest) {
    try {
        // Step 1: Validate business profile
        if (!manifest.business_profile || !manifest.business_profile.name || manifest.business_profile.name.trim() === '') {
            return {
                isValid: false,
                error: 'Invalid UCP manifest: missing business profile name',
                data: null
            };
        }

        // Step 2: Find shopping service
        if (!Array.isArray(manifest.services)) {
            return {
                isValid: false,
                error: 'Invalid UCP manifest: services array not found',
                data: null
            };
        }

        const shoppingService = manifest.services.find(service => service.name === 'shopping');
        if (!shoppingService) {
            return {
                isValid: false,
                error: 'Invalid UCP manifest: missing shopping service',
                data: null
            };
        }

        // Step 3: Extract REST transport base_url
        if (!Array.isArray(shoppingService.transports)) {
            return {
                isValid: false,
                error: 'Invalid UCP manifest: shopping service has no transports',
                data: null
            };
        }

        const restTransport = shoppingService.transports.find(transport => transport.type === 'rest');
        if (!restTransport || !restTransport.base_url) {
            return {
                isValid: false,
                error: 'Invalid UCP manifest: REST transport base_url not found',
                data: null
            };
        }

        // Normalize base_url: remove trailing slash
        let serviceBaseUrl = restTransport.base_url;
        if (serviceBaseUrl.endsWith('/')) {
            serviceBaseUrl = serviceBaseUrl.slice(0, -1);
        }

        // Step 4: Verify required capabilities
        if (!Array.isArray(manifest.capabilities)) {
            return {
                isValid: false,
                error: 'Invalid UCP manifest: capabilities array not found',
                data: null
            };
        }

        const requiredCapabilities = [
            'dev.ucp.shopping.products',
            'dev.ucp.shopping.checkout'
        ];

        for (const requiredCap of requiredCapabilities) {
            const capability = manifest.capabilities.find(cap => cap.name === requiredCap);

            if (!capability) {
                return {
                    isValid: false,
                    error: `Invalid UCP manifest: missing required capability ${requiredCap}`,
                    data: null
                };
            }

            // Verify the capability supports REST transport
            if (!Array.isArray(capability.transports) || !capability.transports.includes('rest')) {
                return {
                    isValid: false,
                    error: `Invalid UCP manifest: capability ${requiredCap} does not support REST transport`,
                    data: null
                };
            }
        }

        // Step 5: Extract signing key
        if (!Array.isArray(manifest.signing_keys) || manifest.signing_keys.length === 0) {
            return {
                isValid: false,
                error: 'Invalid UCP manifest: signing_keys array not found or empty',
                data: null
            };
        }

        const signingKey = manifest.signing_keys.find(key => key.use === 'sig');
        if (!signingKey || !signingKey.x || !signingKey.kid) {
            return {
                isValid: false,
                error: 'Invalid UCP manifest: no valid signing key found (must have use="sig", x, and kid fields)',
                data: null
            };
        }

        // Step 6: Extract all fields with optional fallbacks
        const businessProfile = manifest.business_profile;

        return {
            isValid: true,
            error: null,
            data: {
                businessName: businessProfile.name,
                businessUrl: businessProfile.url || '',
                businessDescription: businessProfile.description || '',
                contactEmail: businessProfile.contact?.email || '',
                serviceBaseUrl: serviceBaseUrl,
                publicKey: signingKey.x,
                signingKeyId: signingKey.kid,
                fullManifest: manifest
            }
        };

    } catch (error) {
        return {
            isValid: false,
            error: `UCP manifest parsing error: ${error.message}`,
            data: null
        };
    }
}

module.exports = {
    parseUcpManifest
};

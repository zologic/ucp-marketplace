/**
 * UCP Manifest Parser Utility
 *
 * Centralized parsing and validation for UCP (Universal Commerce Protocol) manifests.
 * This is the single source of truth for all UCP manifest operations.
 *
 * @module api/utils/ucpParser
 */

const crypto = require('crypto');

// ============================================================================
// Custom Error Classes
// ============================================================================

class UcpParseError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'UcpParseError';
    this.field = field;
  }
}

class UcpValidationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'UcpValidationError';
    this.details = details;
  }
}

class UcpKeyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UcpKeyError';
  }
}

class UrlConstructionError extends Error {
  constructor(message, baseUrl, path) {
    super(message);
    this.name = 'UrlConstructionError';
    this.baseUrl = baseUrl;
    this.path = path;
  }
}

// ============================================================================
// Main Parser Function
// ============================================================================

/**
 * Parse and validate UCP manifest
 *
 * @param {Object} manifestJson - Raw manifest JSON from /.well-known/ucp
 * @returns {Object} Parsed manifest data
 * @throws {UcpParseError} When required fields are missing
 * @throws {UcpValidationError} When validation fails
 * @throws {UcpKeyError} When public key is invalid
 */
function parseManifest(manifestJson) {
  // Validate input is an object
  if (!manifestJson || typeof manifestJson !== 'object') {
    throw new UcpParseError('Manifest must be a valid JSON object', 'root');
  }

  // Extract and validate business profile
  const businessProfile = extractBusinessProfile(manifestJson);

  // Extract and validate service configuration
  const serviceBaseUrl = extractServiceBaseUrl(manifestJson);

  // Extract and validate public key
  const publicKey = extractPublicKey(manifestJson);

  // Extract signing key ID
  const signingKeyId = extractSigningKeyId(manifestJson);

  // Extract and discover capabilities
  const capabilities = extractCapabilities(manifestJson, serviceBaseUrl);

  // Calculate manifest hash for caching
  const manifestHash = calculateManifestHash(manifestJson);

  // Extract manifest version if provided
  const manifestVersion = manifestJson.version || null;

  return {
    // Business Profile (for merchants table)
    businessProfile: {
      name: businessProfile.name,
      description: businessProfile.description,
      website: businessProfile.website
    },

    // Service Configuration (for merchants table)
    serviceBaseUrl: serviceBaseUrl,
    publicKey: publicKey,
    signingKeyId: signingKeyId,

    // Discovered Capabilities (for verification results)
    capabilities: capabilities,

    // Manifest Caching (for merchants table)
    manifestHash: manifestHash,
    manifestVersion: manifestVersion,
    rawManifest: manifestJson
  };
}

// ============================================================================
// Extraction Helper Functions
// ============================================================================

/**
 * Extract and validate business profile from manifest
 */
function extractBusinessProfile(manifest) {
  if (!manifest.business_profile || typeof manifest.business_profile !== 'object') {
    throw new UcpParseError('Missing or invalid business_profile object', 'business_profile');
  }

  const profile = manifest.business_profile;

  // Validate business name
  if (!profile.name || typeof profile.name !== 'string') {
    throw new UcpParseError('Missing or invalid business_profile.name', 'business_profile.name');
  }

  if (profile.name.length < 2 || profile.name.length > 255) {
    throw new UcpValidationError('business_profile.name must be between 2 and 255 characters', {
      field: 'business_profile.name',
      length: profile.name.length
    });
  }

  // Description is optional but should be a string if provided
  const description = profile.description || '';
  if (typeof description !== 'string') {
    throw new UcpValidationError('business_profile.description must be a string', {
      field: 'business_profile.description'
    });
  }

  // Website URL validation
  const website = profile.website || '';
  if (website && !isValidUrl(website)) {
    throw new UcpValidationError('business_profile.website must be a valid URL', {
      field: 'business_profile.website',
      value: website
    });
  }

  return {
    name: profile.name.trim(),
    description: description.trim(),
    website: website.trim()
  };
}

/**
 * Extract and validate service base URL from manifest
 */
function extractServiceBaseUrl(manifest) {
  if (!manifest.services || typeof manifest.services !== 'object') {
    throw new UcpParseError('Missing or invalid services object', 'services');
  }

  const baseUrl = manifest.services.base_url;

  if (!baseUrl || typeof baseUrl !== 'string') {
    throw new UcpParseError('Missing or invalid services.base_url', 'services.base_url');
  }

  if (!isValidUrl(baseUrl)) {
    throw new UcpValidationError('services.base_url must be a valid URL', {
      field: 'services.base_url',
      value: baseUrl
    });
  }

  // Remove trailing slash for consistency
  return baseUrl.replace(/\/$/, '');
}

/**
 * Extract and validate public key from manifest
 */
function extractPublicKey(manifest) {
  const publicKey = manifest.public_key;

  if (!publicKey || typeof publicKey !== 'string') {
    throw new UcpParseError('Missing or invalid public_key', 'public_key');
  }

  // Validate Ed25519 key format
  if (!publicKey.startsWith('ed25519:')) {
    throw new UcpKeyError('public_key must start with "ed25519:" prefix');
  }

  // Extract base64 part after prefix
  const base64Part = publicKey.substring(8);
  if (!base64Part || base64Part.length < 20) {
    throw new UcpKeyError('public_key has invalid or too short base64 data');
  }

  return publicKey;
}

/**
 * Extract signing key ID from manifest
 */
function extractSigningKeyId(manifest) {
  const signingKeyId = manifest.signing_key_id;

  if (!signingKeyId || typeof signingKeyId !== 'string' || signingKeyId.trim() === '') {
    throw new UcpParseError('Missing or invalid signing_key_id', 'signing_key_id');
  }

  return signingKeyId.trim();
}

/**
 * Extract and discover capabilities from manifest
 */
function extractCapabilities(manifest, serviceBaseUrl) {
  if (!manifest.capabilities || !Array.isArray(manifest.capabilities)) {
    throw new UcpValidationError('capabilities must be an array', {
      field: 'capabilities'
    });
  }

  if (manifest.capabilities.length === 0) {
    throw new UcpValidationError('capabilities array cannot be empty', {
      field: 'capabilities'
    });
  }

  // Standard UCP capabilities to discover
  const standardCapabilities = [
    'dev.ucp.shopping.products',
    'dev.ucp.shopping.checkout',
    'dev.ucp.shopping.search',
    'dev.ucp.shopping.webhooks'
  ];

  const discoveredCapabilities = standardCapabilities.map(capabilityName => {
    return discoverCapability(manifest.capabilities, capabilityName, serviceBaseUrl);
  });

  return discoveredCapabilities;
}

/**
 * Discover a specific capability in the manifest
 */
function discoverCapability(capabilities, capabilityName, serviceBaseUrl) {
  const capability = capabilities.find(cap => cap.name === capabilityName);

  if (!capability) {
    return {
      name: capabilityName,
      supported: false
    };
  }

  // Validate capability structure
  if (!capability.transports || !Array.isArray(capability.transports)) {
    return {
      name: capabilityName,
      supported: false
    };
  }

  // Check if REST transport is supported
  if (!capability.transports.includes('rest')) {
    return {
      name: capabilityName,
      supported: false
    };
  }

  // Validate path
  if (!capability.path || typeof capability.path !== 'string') {
    return {
      name: capabilityName,
      supported: false
    };
  }

  // Construct full endpoint URL
  const fullEndpoint = constructEndpointUrl(serviceBaseUrl, capability.path);

  return {
    name: capabilityName,
    supported: true,
    endpoint: fullEndpoint,
    path: capability.path,
    transport: 'rest'
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Validate if string is a valid URL
 */
function isValidUrl(urlString) {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (error) {
    return false;
  }
}

/**
 * Calculate SHA-256 hash of manifest for version tracking
 */
function calculateManifestHash(manifestJson) {
  // Stringify with consistent formatting (sorted keys)
  const canonical = JSON.stringify(manifestJson, Object.keys(manifestJson).sort());
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Construct full endpoint URL from base URL and capability path
 *
 * @param {string} baseUrl - Service base URL
 * @param {string} capabilityPath - Capability path
 * @returns {string} Full endpoint URL
 * @throws {UrlConstructionError} If URL construction fails
 */
function constructEndpointUrl(baseUrl, capabilityPath) {
  try {
    // Remove trailing slash from baseUrl
    const cleanBaseUrl = baseUrl.replace(/\/$/, '');

    // Ensure path starts with /
    const cleanPath = capabilityPath.startsWith('/') ? capabilityPath : '/' + capabilityPath;

    // Construct full URL
    const fullUrl = cleanBaseUrl + cleanPath;

    // Validate result is a valid URL
    if (!isValidUrl(fullUrl)) {
      throw new Error('Invalid URL result');
    }

    return fullUrl;
  } catch (error) {
    throw new UrlConstructionError(
      `Failed to construct endpoint URL: ${error.message}`,
      baseUrl,
      capabilityPath
    );
  }
}

/**
 * Verify Ed25519 signature on product data
 *
 * Note: This function returns false on any error to prevent throwing in verification contexts.
 * Use @noble/ed25519 for actual signature verification.
 *
 * @param {Object|string} data - Product data or canonical JSON string
 * @param {string} signature - Base64-encoded Ed25519 signature
 * @param {string} publicKey - Public key string (format: "ed25519:base64...")
 * @returns {boolean} True if signature is valid, false otherwise
 */
async function verifySignature(data, signature, publicKey) {
  try {
    // Validate public key format
    if (!publicKey || !publicKey.startsWith('ed25519:')) {
      console.error('[ucpParser] Invalid public key format');
      return false;
    }

    // Extract base64 public key
    const publicKeyBase64 = publicKey.substring(8);

    // Validate signature format
    if (!signature || typeof signature !== 'string') {
      console.error('[ucpParser] Invalid signature format');
      return false;
    }

    // Convert data to canonical string if it's an object
    let dataString;
    if (typeof data === 'object') {
      dataString = JSON.stringify(data, Object.keys(data).sort());
    } else {
      dataString = String(data);
    }

    // Import @noble/ed25519 dynamically
    // Note: This should be installed via npm: npm install @noble/ed25519
    const ed25519 = require('@noble/ed25519');

    // Convert strings to Uint8Array
    const messageBytes = new TextEncoder().encode(dataString);
    const publicKeyBytes = Uint8Array.from(Buffer.from(publicKeyBase64, 'base64'));
    const signatureBytes = Uint8Array.from(Buffer.from(signature, 'base64'));

    // Verify signature
    const isValid = await ed25519.verify(signatureBytes, messageBytes, publicKeyBytes);

    return isValid;
  } catch (error) {
    console.error('[ucpParser] Signature verification error:', error.message);
    return false;
  }
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Main parser
  parseManifest,

  // Utility functions
  verifySignature,
  constructEndpointUrl,
  calculateManifestHash,

  // Error classes (for error handling)
  UcpParseError,
  UcpValidationError,
  UcpKeyError,
  UrlConstructionError
};

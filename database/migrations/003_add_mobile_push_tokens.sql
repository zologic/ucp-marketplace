-- Migration: Add Mobile Push Tokens Table
-- Purpose: Prepare for future mobile app push notifications
-- Created: 2026-02-12

-- Push tokens table for mobile notifications
CREATE TABLE IF NOT EXISTS push_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_identifier VARCHAR(255) NOT NULL, -- Hashed user identifier (email hash, session ID, etc.)
    platform VARCHAR(50) NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
    token TEXT NOT NULL, -- FCM token, APNs token, or web push subscription
    device_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    active BOOLEAN DEFAULT TRUE
);

-- Indexes for efficient lookups
CREATE INDEX idx_push_tokens_user_identifier ON push_tokens(user_identifier);
CREATE INDEX idx_push_tokens_platform ON push_tokens(platform);
CREATE INDEX idx_push_tokens_active ON push_tokens(active);
CREATE INDEX idx_push_tokens_created_at ON push_tokens(created_at);

-- Unique constraint to prevent duplicate tokens
CREATE UNIQUE INDEX idx_push_tokens_token_unique ON push_tokens(token) WHERE active = TRUE;

-- Comments
COMMENT ON TABLE push_tokens IS 'Store push notification tokens for mobile apps (future use)';
COMMENT ON COLUMN push_tokens.user_identifier IS 'Hashed identifier linking token to user (session, email hash, etc.)';
COMMENT ON COLUMN push_tokens.platform IS 'Platform type: ios, android, or web';
COMMENT ON COLUMN push_tokens.token IS 'Platform-specific push notification token';
COMMENT ON COLUMN push_tokens.active IS 'Whether the token is currently active';

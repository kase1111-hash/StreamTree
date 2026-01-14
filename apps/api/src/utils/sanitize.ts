/**
 * Utility functions for sanitizing sensitive data before logging
 * SECURITY: Prevents accidental exposure of tokens, secrets, and PII in logs
 */

// Patterns that may contain sensitive data
const SENSITIVE_PATTERNS = [
  /bearer\s+[a-zA-Z0-9._-]+/gi,          // Bearer tokens
  /token["\s:=]+[a-zA-Z0-9._-]+/gi,       // Generic tokens
  /secret["\s:=]+[a-zA-Z0-9._-]+/gi,      // Secrets
  /password["\s:=]+[^\s,}]+/gi,           // Passwords
  /api[_-]?key["\s:=]+[a-zA-Z0-9._-]+/gi, // API keys
  /access[_-]?token["\s:=]+[a-zA-Z0-9._-]+/gi, // Access tokens
  /refresh[_-]?token["\s:=]+[a-zA-Z0-9._-]+/gi, // Refresh tokens
  /authorization["\s:=]+[^\s,}]+/gi,      // Authorization headers
  /client[_-]?secret["\s:=]+[a-zA-Z0-9._-]+/gi, // Client secrets
  /private[_-]?key["\s:=]+[^\s,}]+/gi,    // Private keys
];

/**
 * Sanitize error for safe logging
 * Extracts only the message from errors to prevent leaking stack traces
 * or sensitive data that may be in error properties
 */
export function sanitizeError(error: unknown): string {
  if (error instanceof Error) {
    return sanitizeString(error.message);
  }
  if (typeof error === 'string') {
    return sanitizeString(error);
  }
  return 'Unknown error';
}

/**
 * Sanitize a string by redacting sensitive patterns
 */
export function sanitizeString(str: string): string {
  let sanitized = str;
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }
  return sanitized;
}

/**
 * Sanitize an object for logging by removing sensitive fields
 * and redacting sensitive patterns in string values
 */
export function sanitizeForLogging(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeForLogging);
  }

  const sensitiveKeys = new Set([
    'password',
    'token',
    'secret',
    'apiKey',
    'api_key',
    'accessToken',
    'access_token',
    'refreshToken',
    'refresh_token',
    'authorization',
    'privateKey',
    'private_key',
    'clientSecret',
    'client_secret',
    'signature',
    'creditCard',
    'credit_card',
    'cardNumber',
    'card_number',
    'cvv',
    'ssn',
    'socialSecurityNumber',
  ]);

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (sensitiveKeys.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = sanitizeForLogging(value);
    }
  }
  return sanitized;
}

/**
 * Get a safe error message for logging
 * Use this instead of logging entire error objects
 */
export function getLogSafeError(context: string, error: unknown): string {
  return `${context}: ${sanitizeError(error)}`;
}

/**
 * Dangerous URL protocols that should never be allowed
 */
const DANGEROUS_PROTOCOLS = [
  'javascript:',
  'data:',
  'vbscript:',
  'file:',
  'ftp:',
];

/**
 * Validate that a URL is safe for use (e.g., avatar URLs, artwork URLs)
 *
 * SECURITY: This prevents:
 * - XSS via javascript: URLs
 * - Data exfiltration via data: URLs
 * - Local file access via file: URLs
 * - Protocol abuse via other dangerous schemes
 *
 * @param url - The URL to validate
 * @param options - Validation options
 * @returns Object with valid flag and optional error message
 */
export function validateSafeUrl(
  url: string,
  options: {
    allowHttp?: boolean;  // Allow http:// (default: false, only https allowed)
    maxLength?: number;   // Maximum URL length (default: 2048)
  } = {}
): { valid: boolean; error?: string } {
  const { allowHttp = false, maxLength = 2048 } = options;

  // Check for empty or whitespace-only URLs
  if (!url || !url.trim()) {
    return { valid: false, error: 'URL cannot be empty' };
  }

  // Check length
  if (url.length > maxLength) {
    return { valid: false, error: `URL exceeds maximum length of ${maxLength} characters` };
  }

  // Normalize and check for dangerous protocols
  const normalizedUrl = url.toLowerCase().trim();

  for (const protocol of DANGEROUS_PROTOCOLS) {
    if (normalizedUrl.startsWith(protocol)) {
      return { valid: false, error: 'URL uses a prohibited protocol' };
    }
  }

  // Try to parse as URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // Check protocol
  if (parsedUrl.protocol === 'https:') {
    return { valid: true };
  }

  if (parsedUrl.protocol === 'http:' && allowHttp) {
    return { valid: true };
  }

  return {
    valid: false,
    error: allowHttp
      ? 'URL must use http:// or https:// protocol'
      : 'URL must use https:// protocol'
  };
}

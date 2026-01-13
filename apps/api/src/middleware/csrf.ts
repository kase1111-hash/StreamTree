/**
 * CSRF Protection Middleware
 *
 * Since this API uses JWT bearer tokens (not cookies) for authentication,
 * traditional CSRF attacks are somewhat mitigated. However, we add an extra
 * layer of protection by requiring a custom header for state-changing requests.
 *
 * This ensures that only JavaScript-initiated requests (which require CORS approval)
 * can perform state-changing actions, not browser form submissions.
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// CSRF token generation
const CSRF_TOKEN_LENGTH = 32;
const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_COOKIE_NAME = 'csrf_token';

/**
 * Generate a cryptographically secure CSRF token
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
}

/**
 * Middleware to set CSRF token cookie for clients
 * Call this on a route like GET /api/auth/csrf-token
 */
export function setCsrfToken(req: Request, res: Response): void {
  const token = generateCsrfToken();

  // Set as HttpOnly: false so JavaScript can read it
  // Set as Secure in production
  // Set SameSite to Strict for additional protection
  const isProduction = process.env.NODE_ENV === 'production';

  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false, // JS needs to read this
    secure: isProduction,
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    path: '/',
  });

  res.json({
    success: true,
    data: { csrfToken: token },
  });
}

/**
 * Custom header CSRF protection
 *
 * This middleware requires state-changing requests (POST, PUT, PATCH, DELETE)
 * to include a custom header. This prevents CSRF attacks because:
 * 1. HTML forms cannot set custom headers
 * 2. Cross-origin JavaScript requests require CORS approval
 *
 * For API-based architectures with bearer token auth, this is often
 * more practical than traditional double-submit cookie patterns.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Skip CSRF check for safe methods (GET, HEAD, OPTIONS)
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // Skip CSRF check for webhook endpoints (they use signature verification)
  if (req.path.startsWith('/api/webhooks')) {
    return next();
  }

  // Skip CSRF check for metadata endpoints (public, read-only style)
  if (req.path.startsWith('/api/metadata')) {
    return next();
  }

  // For state-changing requests, verify either:
  // 1. The X-CSRF-Token header matches the cookie (double submit)
  // 2. The X-Requested-With header is present (AJAX indicator)
  // 3. Content-Type is application/json (can't be set by HTML forms)

  const csrfHeader = req.headers[CSRF_HEADER_NAME] as string | undefined;
  const csrfCookie = req.cookies?.[CSRF_COOKIE_NAME] as string | undefined;
  const requestedWith = req.headers['x-requested-with'] as string | undefined;
  const contentType = req.headers['content-type'] || '';

  // Option 1: Double submit cookie validation
  if (csrfHeader && csrfCookie && csrfHeader === csrfCookie) {
    return next();
  }

  // Option 2: AJAX indicator header (commonly used by frameworks)
  if (requestedWith === 'XMLHttpRequest') {
    return next();
  }

  // Option 3: JSON content type (forms can't send this without JS)
  if (contentType.includes('application/json')) {
    return next();
  }

  // If none of the above, reject the request
  // Note: In development, we may want to be more lenient
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    res.status(403).json({
      success: false,
      error: {
        message: 'CSRF validation failed',
        code: 'CSRF_ERROR',
      },
    });
    return;
  }

  // In development, log warning but allow request
  console.warn(
    `CSRF Warning: Request to ${req.method} ${req.path} missing CSRF protection. ` +
    'This would be blocked in production.'
  );
  next();
}

/**
 * Security headers middleware
 * Adds various security-related HTTP headers
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Enable XSS filter in older browsers
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Strict Transport Security (for HTTPS)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Content Security Policy for API (restrictive)
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");

  next();
}

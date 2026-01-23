# Security Policy

## Supported Versions

The following versions of StreamTree are currently supported with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

We take the security of StreamTree seriously. If you discover a security vulnerability, please report it responsibly.

### How to Report

1. **Do NOT** create a public GitHub issue for security vulnerabilities
2. Email security concerns to the maintainers directly
3. Include as much detail as possible:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### What to Expect

- **Acknowledgment**: We will acknowledge receipt of your report within 48 hours
- **Assessment**: We will assess the vulnerability and determine its severity
- **Updates**: We will keep you informed of our progress
- **Resolution**: We aim to resolve critical vulnerabilities within 7 days
- **Credit**: With your permission, we will credit you in our release notes

### Scope

The following are in scope for security reports:

- Authentication and authorization bypasses
- SQL injection, XSS, CSRF vulnerabilities
- Payment processing vulnerabilities
- Smart contract vulnerabilities
- Private data exposure
- Privilege escalation
- WebSocket security issues

### Out of Scope

- Vulnerabilities in dependencies (report to the dependency maintainers)
- Social engineering attacks
- Physical security
- Denial of service attacks
- Issues in third-party services (Stripe, Twitch, AWS)

## Security Best Practices

When contributing to StreamTree, please follow these security practices:

### Environment Variables

- Never commit `.env` files or secrets to the repository
- Use `.env.example` files for documentation
- Rotate secrets if they are ever exposed

### Authentication

- All API endpoints must validate authentication
- Use JWT tokens with appropriate expiration times
- Validate wallet signatures server-side
- Sanitize and validate all user input

### Database

- Use parameterized queries (Prisma handles this)
- Apply principle of least privilege
- Never expose internal IDs unnecessarily

### Payments

- Always validate webhook signatures
- Use idempotency keys for payment operations
- Never log sensitive payment data

### Smart Contracts

- Follow Solidity security best practices
- Get audits before mainnet deployment
- Use established patterns (OpenZeppelin)

## Security Features

StreamTree includes several security features:

- **Rate limiting** on API endpoints
- **CORS** protection with origin validation
- **CSRF** protection for state-changing operations
- **Input validation** using Zod schemas
- **Secure headers** via Helmet middleware
- **JWT** with secure token handling
- **Webhook signature verification** for Stripe and Twitch

## Acknowledgments

We thank the following individuals for responsibly disclosing security issues:

*No acknowledgments yet - be the first to help secure StreamTree!*

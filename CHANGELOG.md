# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial project structure with Turbo monorepo
- Next.js 14 frontend application
- Express backend API with TypeScript
- Prisma ORM with PostgreSQL database schema
- WebSocket support for real-time card updates
- Episode lifecycle management (draft, live, ended)
- Card minting and randomized grid generation
- Event definitions and manual triggering
- Stripe payment integration for card purchases
- Stripe Connect for streamer payouts
- Twitch OAuth authentication
- Twitch EventSub integration for automated events
- Wallet-based authentication with signature verification
- Custodial wallet fallback for non-crypto users
- Collaborator system with role-based permissions
- Revenue sharing between collaborators
- Template system for reusable event configurations
- S3 integration for artwork uploads
- Leaderboard with real-time updates
- Pattern detection (rows, columns, diagonals, blackout)
- Stream overlay component
- Gallery view for user collectibles

### Security
- Fixed CORS origin validation
- Fixed withdrawal calculation for platform fees
- Fixed JWT token expiration handling
- Fixed collaborator access control
- Fixed URL validation for webhook endpoints
- Fixed leaderboard privacy for ended episodes
- Resolved 70 TypeScript errors across codebase

## [0.1.0] - 2026-01-23

### Added
- Initial release
- Core NFTree implementation (Root → Branch → Fruit)
- Full-stack monorepo setup
- Docker Compose configuration for local development
- Comprehensive technical specification (SPEC.md)
- MIT License

[Unreleased]: https://github.com/kase1111-hash/StreamTree/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/kase1111-hash/StreamTree/releases/tag/v0.1.0

# Contributing to StreamTree

Thank you for your interest in contributing to StreamTree! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)

## Development Setup

### Prerequisites

- **Node.js** >= 18.0.0
- **npm** >= 10.0.0
- **Docker** and **Docker Compose** (for local database and Redis)
- **Git**

### Initial Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/kase1111-hash/StreamTree.git
   cd StreamTree
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Start infrastructure services**

   ```bash
   docker-compose up -d
   ```

   This starts PostgreSQL (port 5432) and Redis (port 6379).

4. **Configure environment variables**

   ```bash
   # API configuration
   cp apps/api/.env.example apps/api/.env

   # Web configuration
   cp apps/web/.env.example apps/web/.env
   ```

   Edit the `.env` files with your local settings. At minimum, update:
   - `DATABASE_URL` - Uses default Docker credentials: `postgresql://streamtree:streamtree@localhost:5432/streamtree`
   - `JWT_SECRET` - Any secure random string for local development

5. **Set up the database**

   ```bash
   npm run db:generate
   npm run db:push
   ```

6. **Start the development servers**

   ```bash
   npm run dev
   ```

   This starts:
   - API server at `http://localhost:3001`
   - Web app at `http://localhost:3000`

### Optional Services

For full functionality, you may also configure:

- **Stripe** - Payment processing (get test keys from [Stripe Dashboard](https://dashboard.stripe.com/test/apikeys))
- **AWS S3** - Artwork storage (or use local storage fallback)
- **Twitch** - Event automation (register app at [Twitch Developer Console](https://dev.twitch.tv/console))
- **WalletConnect** - Wallet connections (get project ID from [WalletConnect Cloud](https://cloud.walletconnect.com))

## Project Structure

```
StreamTree/
├── apps/
│   ├── api/          # Express backend API
│   │   ├── src/
│   │   │   ├── routes/       # API endpoints
│   │   │   ├── services/     # Business logic
│   │   │   ├── middleware/   # Auth, validation, etc.
│   │   │   └── websocket/    # Real-time updates
│   │   └── prisma/           # Database schema
│   │
│   └── web/          # Next.js frontend
│       └── src/
│           ├── app/          # Page routes
│           ├── components/   # React components
│           └── lib/          # Utilities and hooks
│
├── packages/
│   ├── shared/       # Shared types and utilities
│   ├── contracts/    # Solidity smart contracts
│   └── e2e-tests/    # Integration tests
│
└── docker-compose.yml
```

## Development Workflow

### Running Commands

This is a Turbo monorepo. Common commands:

```bash
# Start all apps in development mode
npm run dev

# Build all packages
npm run build

# Run tests
npm run test

# Lint code
npm run lint

# Database operations
npm run db:migrate    # Run migrations
npm run db:generate   # Generate Prisma client
npm run db:push       # Push schema changes
npm run db:studio     # Open Prisma Studio
```

### Working on Specific Packages

You can target specific workspaces:

```bash
# Run only the API
npm run dev --filter=@streamtree/api

# Build only the web app
npm run build --filter=@streamtree/web

# Run tests for shared package
npm run test --filter=@streamtree/shared
```

### Database Migrations

When modifying the Prisma schema (`apps/api/prisma/schema.prisma`):

```bash
# Create and apply a migration
npm run db:migrate

# For rapid prototyping (no migration file)
npm run db:push
```

## Coding Standards

### TypeScript

- Use TypeScript for all code
- Enable strict mode
- Define explicit types for function parameters and return values
- Use shared types from `@streamtree/shared` for cross-package consistency

### Code Style

- Use consistent formatting (Prettier/ESLint configured)
- Prefer named exports over default exports
- Keep functions focused and small
- Add comments for complex logic

### Commit Messages

Write clear, descriptive commit messages:

```
feat: Add collaborator revenue sharing
fix: Correct withdrawal calculation for platform fees
docs: Update API endpoint documentation
refactor: Extract card generation logic to shared package
test: Add integration tests for episode lifecycle
```

Prefixes: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `style`

## Testing

### Running Tests

```bash
# Run all tests
npm run test

# Run with coverage
npm run test -- --coverage

# Run specific test file
npm run test -- apps/api/src/routes/episodes.test.ts
```

### Test Structure

- Unit tests live alongside source files (`*.test.ts`)
- Integration tests are in `packages/e2e-tests/`
- Use descriptive test names that explain the expected behavior

### Writing Tests

```typescript
describe('Episode', () => {
  describe('launch', () => {
    it('should transition episode state to LIVE', async () => {
      // Arrange
      const episode = await createTestEpisode();

      // Act
      const result = await launchEpisode(episode.id);

      // Assert
      expect(result.status).toBe('LIVE');
    });
  });
});
```

## Submitting Changes

### Pull Request Process

1. **Create a feature branch**

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**

   - Follow the coding standards
   - Add tests for new functionality
   - Update documentation if needed

3. **Test your changes**

   ```bash
   npm run lint
   npm run test
   npm run build
   ```

4. **Commit and push**

   ```bash
   git add .
   git commit -m "feat: Description of your changes"
   git push -u origin feature/your-feature-name
   ```

5. **Open a Pull Request**

   - Fill out the PR template
   - Link any related issues
   - Request review from maintainers

### Review Guidelines

- PRs require at least one approval before merging
- Address review feedback promptly
- Keep PRs focused and reasonably sized
- Squash commits when merging if history is messy

## Questions?

If you have questions about contributing, feel free to:

- Open a discussion on GitHub
- Check existing issues for similar questions
- Review the [SPEC.md](./SPEC.md) for technical details

Thank you for contributing to StreamTree!

import { Prisma } from '@prisma/client';

// Postgres serialization_failure and deadlock_detected
const RETRYABLE_PG_CODES = new Set(['40001', '40P01']);

/**
 * Whether an error is a transient transaction conflict that is safe to retry.
 * Prisma reports these as P2034 for model queries, but as P2010 ("raw query
 * failed") with the Postgres code in meta when they come from $queryRaw, such
 * as a `SELECT ... FOR UPDATE` in a Serializable transaction.
 */
function isRetryableConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === 'P2034') return true;
  return error.code === 'P2010' && RETRYABLE_PG_CODES.has(String(error.meta?.code));
}

/**
 * Retries a callback that may fail with a transient transaction conflict.
 * This is expected when using Serializable isolation level under contention.
 */
export async function withSerializableRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      if (isRetryableConflict(error) && attempt < maxRetries) {
        await new Promise<void>((r) => setTimeout(r, 50 * Math.pow(2, attempt)));
        continue;
      }
      throw error;
    }
  }
  // Unreachable, but satisfies TypeScript
  throw new Error('Max retries exceeded');
}

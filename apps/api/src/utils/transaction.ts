import { Prisma } from '@prisma/client';

/**
 * Retries a callback that may throw a Prisma P2034 serialization failure.
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
      const isPrismaError =
        error instanceof Prisma.PrismaClientKnownRequestError;
      if (
        isPrismaError &&
        (error as Prisma.PrismaClientKnownRequestError).code === 'P2034' &&
        attempt < maxRetries
      ) {
        await new Promise<void>((r) => setTimeout(r, 50 * Math.pow(2, attempt)));
        continue;
      }
      throw error;
    }
  }
  // Unreachable, but satisfies TypeScript
  throw new Error('Max retries exceeded');
}

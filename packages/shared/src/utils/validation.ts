/**
 * Validates an episode name
 */
export function validateEpisodeName(name: string): { valid: boolean; error?: string } {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: 'Episode name is required' };
  }
  if (name.length > 200) {
    return { valid: false, error: 'Episode name must be 200 characters or less' };
  }
  return { valid: true };
}

/**
 * Validates an event name
 */
export function validateEventName(name: string): { valid: boolean; error?: string } {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: 'Event name is required' };
  }
  if (name.length > 100) {
    return { valid: false, error: 'Event name must be 100 characters or less' };
  }
  return { valid: true };
}

/**
 * Validates a username
 */
export function validateUsername(username: string): { valid: boolean; error?: string } {
  if (!username || username.trim().length === 0) {
    return { valid: false, error: 'Username is required' };
  }
  if (username.length < 3) {
    return { valid: false, error: 'Username must be at least 3 characters' };
  }
  if (username.length > 50) {
    return { valid: false, error: 'Username must be 50 characters or less' };
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return { valid: false, error: 'Username can only contain letters, numbers, underscores, and hyphens' };
  }
  return { valid: true };
}

/**
 * Validates a card price (in cents)
 */
export function validateCardPrice(price: number): { valid: boolean; error?: string } {
  if (typeof price !== 'number' || isNaN(price)) {
    return { valid: false, error: 'Price must be a number' };
  }
  if (price < 0) {
    return { valid: false, error: 'Price cannot be negative' };
  }
  if (!Number.isInteger(price)) {
    return { valid: false, error: 'Price must be in cents (whole number)' };
  }
  if (price > 100000) {
    // $1000 max
    return { valid: false, error: 'Price cannot exceed $1000' };
  }
  return { valid: true };
}

/**
 * Validates grid size
 */
export function validateGridSize(size: number): { valid: boolean; error?: string } {
  if (typeof size !== 'number' || isNaN(size)) {
    return { valid: false, error: 'Grid size must be a number' };
  }
  if (!Number.isInteger(size)) {
    return { valid: false, error: 'Grid size must be a whole number' };
  }
  if (size < 3 || size > 7) {
    return { valid: false, error: 'Grid size must be between 3 and 7' };
  }
  return { valid: true };
}

/**
 * Validates max cards
 */
export function validateMaxCards(maxCards: number | null): { valid: boolean; error?: string } {
  if (maxCards === null) {
    return { valid: true };
  }
  if (typeof maxCards !== 'number' || isNaN(maxCards)) {
    return { valid: false, error: 'Max cards must be a number or null' };
  }
  if (!Number.isInteger(maxCards)) {
    return { valid: false, error: 'Max cards must be a whole number' };
  }
  if (maxCards < 1) {
    return { valid: false, error: 'Max cards must be at least 1' };
  }
  if (maxCards > 100000) {
    return { valid: false, error: 'Max cards cannot exceed 100,000' };
  }
  return { valid: true };
}

/**
 * Validates a wallet address (Ethereum-style)
 */
export function validateWalletAddress(address: string): { valid: boolean; error?: string } {
  if (!address || address.trim().length === 0) {
    return { valid: false, error: 'Wallet address is required' };
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return { valid: false, error: 'Invalid wallet address format' };
  }
  return { valid: true };
}

/**
 * Validates a share code
 */
export function validateShareCode(code: string): { valid: boolean; error?: string } {
  if (!code || code.trim().length === 0) {
    return { valid: false, error: 'Share code is required' };
  }
  if (!/^[a-zA-Z0-9]{6,10}$/.test(code)) {
    return { valid: false, error: 'Invalid share code format' };
  }
  return { valid: true };
}

/**
 * Generates a random share code
 */
export function generateShareCode(length: number = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

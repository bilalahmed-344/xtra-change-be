/**
 * Convert a float dollar amount to cents (integer).
 */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Calculate the round-up amount for a transaction.
 * Example:
 *   $4.25 (425 cents) -> 75 cents
 *   $10.00 (1000 cents) -> 0 cents
 *
 * @param amountCents Transaction amount in cents
 * @returns Round-up amount in cents
 */
export function calculateRoundUp(amountCents: number): number {
  if (amountCents <= 0) return 0; // skip credits/refunds

  const nextDollar = Math.ceil(amountCents / 100) * 100;
  const roundUp = nextDollar - amountCents;

  return roundUp === 0 ? 0 : roundUp;
}

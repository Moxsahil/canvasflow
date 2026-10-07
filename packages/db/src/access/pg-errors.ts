/** Postgres `unique_violation`: the write lost a race for a value only one row may hold. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
  );
}

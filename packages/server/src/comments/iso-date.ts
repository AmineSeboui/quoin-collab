/** Whether `value` is a date written as `toISOString` writes one, which is how the editor dates a thread or reply. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

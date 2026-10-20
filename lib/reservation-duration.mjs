// DentWeb stores appointment minutes in an unsigned tinyint. Omission preserves defaults.
export function reservationDuration(value) {
  if (value === undefined) return undefined;
  if ((typeof value !== 'number' && typeof value !== 'string') ||
      !/^\d+$/.test(String(value)) || !Number.isInteger(Number(value)) ||
      Number(value) < 1 || Number(value) > 255) {
    throw new Error('durationMinutes must be an integer from 1 to 255');
  }
  return Number(value);
}

export function calculateBreakMinutes(grossMinutes: number) {
  if (grossMinutes > 9 * 60) return 45;
  if (grossMinutes > 6 * 60) return 30;
  return 0;
}

export function calculateNetMinutes(grossMinutes: number) {
  return Math.max(0, grossMinutes - calculateBreakMinutes(grossMinutes));
}

export function minutesBetween(start: Date, end: Date) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

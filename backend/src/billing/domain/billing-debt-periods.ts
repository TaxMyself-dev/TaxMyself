/** Calendar boundaries follow Jerusalem and retain the original day across short months. */
export function billingDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem',
    year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function nextBillingPeriod(start: string, anchorDay: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !Number.isInteger(anchorDay) || anchorDay < 1 || anchorDay > 31) {
    throw new Error('Billing anchor requires review');
  }
  const [year, month] = start.split('-').map(Number);
  const next = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(anchorDay, lastDay));
  return next.toISOString().slice(0, 10);
}

export function billingBoundary(date: string): Date {
  const target = Date.parse(`${date}T00:00:00Z`);
  let instant = target;
  const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    second: '2-digit', hourCycle: 'h23' });
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part => [part.type, part.value]));
    const local = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    instant += target - local;
  }
  return new Date(instant);
}

export function nextBillingInstant(start: Date, anchorDay: number): Date {
  const day = billingDate(start);
  const timeOfDay = start.getTime() - billingBoundary(day).getTime();
  return new Date(billingBoundary(nextBillingPeriod(day, anchorDay)).getTime() + timeOfDay);
}

// YYYY-MM-DD date in the local timezone. toISOString uses UTC and at night can give the previous day.
export function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Full weekday name and short date (e.g. "martedì 21/11"), from the YYYY-MM-DD date in the local timezone
export function formatDayAndDate(dateString: string, locale: string): string {
  const [y, m, d] = dateString.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = date.toLocaleDateString(locale, { weekday: 'long' });
  const dd = String(d).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `${weekday} ${dd}/${mm}`;
}

// Weekday name in the given language ('long' = "lunedì", 'short' = "lun"). Computed on every call, so a language change is picked up.
export function formatWeekday(date: Date, locale: string, style: 'long' | 'short'): string {
  const name = date.toLocaleDateString(locale, { weekday: style });
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// Short month name in the given language ("gen", "Jan")
export function formatMonthShort(date: Date, locale: string): string {
  const name = date.toLocaleDateString(locale, { month: 'short' }).replace(/\.$/, '');
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export interface RollingDay {
  dateString: string;
  weekdayIndex: number; // 0 = Monday ... 6 = Sunday
  dayNumber: number;
  monthIndex: number; // 0 = January ... 11 = December
}

// `count` consecutive days starting from startDate (local date) and the "dd/mm – dd/mm" range
const MONTHS: Record<'it' | 'en', string[]> = {
  it: ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};

export function rollingDays(startDate: Date, count: number, locale: 'it' | 'en' = 'it'): { days: RollingDay[]; label: string } {
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const days: RollingDay[] = [];
  for (let i = 0; i < count; i++) {
    const current = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    days.push({
      dateString: toLocalDateString(current),
      weekdayIndex: (current.getDay() + 6) % 7,
      dayNumber: current.getDate(),
      monthIndex: current.getMonth(),
    });
  }
  const fmt = (d: Date) => `${d.getDate()} ${MONTHS[locale][d.getMonth()]}`;
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + count - 1);
  return { days, label: `${fmt(start)} – ${fmt(end)}` };
}

// Data YYYY-MM-DD nel fuso locale. toISOString usa UTC e di notte può dare il giorno precedente.
export function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Giorno della settimana per esteso e data corta (es. "martedì 21/11"), dalla data YYYY-MM-DD nel fuso locale
export function formatDayAndDate(dateString: string, locale: string): string {
  const [y, m, d] = dateString.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = date.toLocaleDateString(locale, { weekday: 'long' });
  const dd = String(d).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `${weekday} ${dd}/${mm}`;
}

export interface RollingDay {
  dateString: string;
  weekdayIndex: number; // 0 = lunedì ... 6 = domenica
  dayNumber: number;
  monthIndex: number; // 0 = gennaio ... 11 = dicembre
}

// `count` giorni consecutivi a partire da startDate (data locale) e intervallo "dd/mm – dd/mm"
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

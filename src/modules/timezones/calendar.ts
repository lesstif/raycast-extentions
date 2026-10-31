export const MIN_CALENDAR_YEAR = 1900;
export const MAX_CALENDAR_YEAR = 2100;
export const MIN_CALENDAR_DATE = `${MIN_CALENDAR_YEAR}-01-01`;
export const MAX_CALENDAR_DATE = `${MAX_CALENDAR_YEAR}-12-31`;

export interface CalendarMonth {
  year: number;
  month: number;
}

export interface CalendarDay {
  date: string;
  day: number;
  weekday: string;
  isCurrentMonth: boolean;
  isSelectable: boolean;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function validMonth({ year, month }: CalendarMonth): boolean {
  return Number.isInteger(year) && year >= MIN_CALENDAR_YEAR && year <= MAX_CALENDAR_YEAR
    && Number.isInteger(month) && month >= 1 && month <= 12;
}

export function calendarMonth(date: string): CalendarMonth {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Choose a valid calendar date.");
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  if (!validMonth({ year, month }) || value.toISOString().slice(0, 10) !== date) {
    throw new Error("Choose a valid calendar date from 1900 to 2100.");
  }
  return { year, month };
}

export function monthLabel(month: CalendarMonth): string {
  if (!validMonth(month)) throw new Error("Invalid calendar month.");
  return `${MONTHS[month.month - 1]} ${month.year}`;
}

export function shiftMonth(month: CalendarMonth, amount: number): CalendarMonth | undefined {
  if (!validMonth(month) || !Number.isInteger(amount)) return undefined;
  const index = month.year * 12 + month.month - 1 + amount;
  const next = { year: Math.floor(index / 12), month: index % 12 + 1 };
  return validMonth(next) ? next : undefined;
}

export function monthDays(month: CalendarMonth): CalendarDay[] {
  if (!validMonth(month)) throw new Error("Invalid calendar month.");
  const first = new Date(Date.UTC(month.year, month.month - 1, 1));
  const start = first.getTime() - first.getUTCDay() * 86_400_000;
  const daysInMonth = new Date(Date.UTC(month.year, month.month, 0)).getUTCDate();
  const length = Math.ceil((first.getUTCDay() + daysInMonth) / 7) * 7;
  return Array.from({ length }, (_, index) => {
    const value = new Date(start + index * 86_400_000);
    return {
      date: value.toISOString().slice(0, 10),
      day: value.getUTCDate(),
      weekday: WEEKDAYS[value.getUTCDay()],
      isCurrentMonth: value.getUTCFullYear() === month.year && value.getUTCMonth() + 1 === month.month,
      isSelectable: value.getUTCFullYear() >= MIN_CALENDAR_YEAR && value.getUTCFullYear() <= MAX_CALENDAR_YEAR,
    };
  });
}

export function calendarDateLabel(date: string): string {
  calendarMonth(date);
  return new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

export function calendarSelectionSvg(date: string, dark: boolean): string {
  const { year, month } = calendarMonth(date);
  const label = `${MONTHS[month - 1].slice(0, 3)} ${Number(date.slice(-2))}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="54" viewBox="0 0 96 54">
    <rect x="2" y="2" width="92" height="50" rx="8" fill="${dark ? "#254c91" : "#e5edff"}"/>
    <g font-family="Helvetica, Arial, sans-serif" text-anchor="middle" fill="${dark ? "#ffffff" : "#153b78"}">
      <text x="48" y="26" font-size="18" font-weight="700">${label}</text>
      <text x="48" y="43" font-size="11">${year}</text>
    </g>
  </svg>`;
}

/** Date-only arithmetic and images never use the Mac's local time zone. */
export function calendarDaySvg(day: CalendarDay, selectedDate: string, today: string, dark: boolean): string {
  const selected = day.date === selectedDate;
  const isToday = day.date === today;
  const text = selected ? "#ffffff" : !day.isSelectable || !day.isCurrentMonth
    ? dark ? "#737987" : "#8b9099" : dark ? "#f0f2f7" : "#202735";
  const border = isToday ? dark ? "#53d2b6" : "#11816c" : dark ? "#414957" : "#d8dee8";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="54" viewBox="0 0 96 54">
    <rect x="2" y="2" width="92" height="50" rx="8" fill="${selected ? "#326dde" : dark ? "#252b35" : "#f4f6fa"}" stroke="${border}" stroke-width="${isToday ? 2 : 1}"/>
    <g font-family="Helvetica, Arial, sans-serif" text-anchor="middle" fill="${text}">
      <text x="48" y="14" font-size="9">${day.weekday}</text>
      <text x="48" y="40" font-size="22" font-weight="${selected || isToday ? 700 : 500}">${day.day}</text>
    </g>
  </svg>`;
}

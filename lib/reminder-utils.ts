interface RemindableVisit {
  visitDate?: string | null;
  nextVisitDate?: string | null;
}

/** Convert a stored reminder timestamp to the local calendar day it represents. */
export function toLocalDateKey(dateStr: string): string | null {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return null;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Return only days that currently have a reminder. Historical visit dates are
 * intentionally excluded because the calendar list is a reminder schedule.
 */
export function getReminderDateKeys(visits: RemindableVisit[]): Set<string> {
  const dates = new Set<string>();

  visits.forEach((visit) => {
    if (!visit.nextVisitDate) return;
    const dateKey = toLocalDateKey(visit.nextVisitDate);
    if (dateKey) dates.add(dateKey);
  });

  return dates;
}

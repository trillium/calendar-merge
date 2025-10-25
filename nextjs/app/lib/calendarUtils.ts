export interface Calendar {
  id: string;
  summary: string;
  [key: string]: unknown;
}

export async function fetchCalendars() {
  const response = await fetch('/api/calendars');
  if (!response.ok) throw new Error("Failed to load calendars");
  const data = await response.json();
  return data.calendars;
}

export async function createCalendar(summary: string) {
  const response = await fetch('/api/calendars', {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ summary }),
  });
  if (!response.ok) throw new Error("Failed to create calendar");
  return response.json();
}

export interface Calendar {
  id: string;
  summary: string;
  [key: string]: unknown;
}

export async function fetchCalendars(token: string) {
  const response = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList",
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!response.ok) throw new Error("Failed to load calendars");
  const data = await response.json();
  return data.items || [];
}

export async function createCalendar(token: string, summary: string) {
  const response = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ summary }),
    }
  );
  if (!response.ok) throw new Error("Failed to create calendar");
  return response.json();
}

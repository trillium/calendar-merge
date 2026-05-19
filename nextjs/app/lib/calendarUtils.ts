const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:13013";

export interface Calendar {
  id: string;
  summary: string;
  [key: string]: unknown;
}

export async function fetchCalendars(userId: string) {
  const response = await fetch(`${BACKEND_URL}/calendars/list?userId=${encodeURIComponent(userId)}`);
  if (!response.ok) throw new Error("Failed to load calendars");
  const data = await response.json();
  return data.calendars;
}

export async function createCalendar(summary: string) {
  const userId = localStorage.getItem("calendar_merge_userId");
  if (!userId) throw new Error("Not authenticated");
  const response = await fetch(`${BACKEND_URL}/calendars`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ userId, summary }),
  });
  if (!response.ok) throw new Error("Failed to create calendar");
  return response.json();
}

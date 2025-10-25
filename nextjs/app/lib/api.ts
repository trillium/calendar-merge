export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api";

export async function oauthCallback(code: string) {
  const response = await fetch(`${API_URL}/oauth/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, redirect_uri: window.location.origin }),
  });
  if (!response.ok) throw new Error("OAuth failed");
  return response.json();
}

export async function setupCalendarSync({
  selectedSources,
  targetCalendarId,
}: {
  selectedSources: string[];
  targetCalendarId: string;
}) {
  const response = await fetch('/api/setup', {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sourceCalendars: selectedSources,
      targetCalendar: targetCalendarId,
    }),
  });
  if (!response.ok) throw new Error("Setup failed");
  return response.json();
}

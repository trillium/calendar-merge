export async function setupCalendarSync({
  selectedSources,
  targetCalendarId,
}: {
  selectedSources: string[];
  targetCalendarId: string;
}) {
  const userId = localStorage.getItem("calendar_merge_userId");
  if (!userId) throw new Error("Not authenticated");

  const response = await fetch("/api/setup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userId,
      sourceCalendars: selectedSources,
      targetCalendar: targetCalendarId,
    }),
  });
  if (!response.ok) throw new Error("Setup failed");
  return response.json();
}

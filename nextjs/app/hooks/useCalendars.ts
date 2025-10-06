import { useState } from "react";
import { Calendar } from "../lib/calendarUtils";

export function useCalendars() {
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [loadingCalendars, setLoadingCalendars] = useState(false);

  async function loadCalendars(token: string) {
    setLoadingCalendars(true);
    try {
      const response = await fetch(
        "https://www.googleapis.com/calendar/v3/users/me/calendarList",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!response.ok) throw new Error("Failed to load calendars");
      const data = await response.json();
      setCalendars(data.items || []);
      setLoadingCalendars(false);
    } catch (error: unknown) {
      setLoadingCalendars(false);
      if (error instanceof Error) {
        throw error;
      } else {
        throw new Error("Unknown error occurred while loading calendars");
      }
    }
  }

  return { calendars, loadingCalendars, loadCalendars };
}

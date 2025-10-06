import { useState } from "react";

export function useSetupSync({
  accessToken,
  selectedSources,
  targetOption,
  targetCalendarId,
  newCalendarName,
  onSuccess,
}: {
  accessToken: string | null;
  selectedSources: string[];
  targetOption: string;
  targetCalendarId: string;
  newCalendarName: string;
  onSuccess?: (data: any) => void;
}) {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
  const [setupStatus, setSetupStatus] = useState<{ message: string; type: string } | null>(null);
  const [setupBtnDisabled, setSetupBtnDisabled] = useState<boolean>(true);

  // Validate setup button
  function validateSetupBtn() {
    const isValid =
      selectedSources.length > 0 &&
      ((targetOption === "existing" && targetCalendarId) ||
        (targetOption === "new" && newCalendarName.trim()));
    setSetupBtnDisabled(!isValid);
  }

  async function setupSync() {
    setSetupBtnDisabled(true);
    setSetupStatus({ message: "Setting up calendar sync...", type: "success" });
    try {
      let finalTargetCalendarId = targetCalendarId;
      if (targetOption === "new") {
        setSetupStatus({
          message: "Creating new calendar...",
          type: "success",
        });
        const createResponse = await fetch(
          "https://www.googleapis.com/calendar/v3/calendars",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ summary: newCalendarName.trim() }),
          }
        );
        if (!createResponse.ok) throw new Error("Failed to create calendar");
        const newCalendar = await createResponse.json();
        finalTargetCalendarId = newCalendar.id;
        setSetupStatus({
          message: `Created calendar "${newCalendar.summary}". Setting up sync...`,
          type: "success",
        });
      }
      const response = await fetch(`${API_URL}/setup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          sourceCalendars: selectedSources,
          targetCalendar: finalTargetCalendarId,
        }),
      });
      if (!response.ok) throw new Error("Setup failed");
      const data = await response.json();
      setSetupStatus({
        message: `✓ Sync configured! Watching ${data.watchesCreated} calendars.`,
        type: "success",
      });
      if (onSuccess) onSuccess(data);
    } catch (error: any) {
      setSetupStatus({
        message: "Setup failed: " + error.message,
        type: "error",
      });
      setSetupBtnDisabled(false);
    }
  }

  return {
    setupStatus,
    setupBtnDisabled,
    setSetupBtnDisabled,
    validateSetupBtn,
    setupSync,
    setSetupStatus,
  };
}

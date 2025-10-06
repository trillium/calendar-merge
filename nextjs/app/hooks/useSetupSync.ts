import { useState } from "react";
import { setupCalendarSync } from "../lib/api";
import { createCalendar } from "../lib/calendarUtils";

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
        const newCalendar = await createCalendar(accessToken!, newCalendarName.trim());
        finalTargetCalendarId = newCalendar.id;
        setSetupStatus({
          message: `Created calendar "${newCalendar.summary}". Setting up sync...`,
          type: "success",
        });
      }
      const data = await setupCalendarSync({
        accessToken: accessToken!,
        selectedSources,
        targetCalendarId: finalTargetCalendarId,
      });
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

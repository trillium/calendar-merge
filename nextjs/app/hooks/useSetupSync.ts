import { useState } from "react";
import { setupCalendarSync } from "../lib/api";
import { createCalendar } from "../lib/calendarUtils";

export function useSetupSync({
  selectedSources,
  targetOption,
  targetCalendarId,
  newCalendarName,
  onSuccess,
}: {
  selectedSources: string[];
  targetOption: string;
  targetCalendarId: string;
  newCalendarName: string;
  onSuccess?: (data: unknown) => void;
}) {
  const [setupStatus, setSetupStatus] = useState<{ message: string; type: string } | null>(null);
  const [setupBtnDisabled, setSetupBtnDisabled] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Validate setup button
  function validateSetupBtn() {
    const isValid =
      selectedSources.length > 0 &&
      ((targetOption === "existing" && targetCalendarId) ||
        (targetOption === "new" && newCalendarName.trim()));
    setSetupBtnDisabled(!isValid);
  }

  async function setupSync() {
    setIsLoading(true);
    setSetupBtnDisabled(true);
    setSetupStatus({ message: "Setting up calendar sync...", type: "success" });
    try {
      let finalTargetCalendarId = targetCalendarId;
      if (targetOption === "new") {
        setSetupStatus({
          message: "Creating new calendar...",
          type: "success",
        });
        const newCalendar = await createCalendar(newCalendarName.trim());
        finalTargetCalendarId = newCalendar.id;
        setSetupStatus({
          message: `Created calendar "${newCalendar.summary}". Setting up sync...`,
          type: "success",
        });
      }
      const data = await setupCalendarSync({
        selectedSources,
        targetCalendarId: finalTargetCalendarId,
      });
      setSetupStatus({
        message: `✓ Sync configured! Watching ${data.watchesCreated} calendars.`,
        type: "success",
      });
      setIsLoading(false);
      if (onSuccess) onSuccess(data);
    } catch (error: unknown) {
      let message = "Setup failed";
      if (error instanceof Error) {
        message += ": " + error.message;
      }
      setSetupStatus({
        message,
        type: "error",
      });
      setSetupBtnDisabled(false);
      setIsLoading(false);
    }
  }

  return {
    setupStatus,
    setupBtnDisabled,
    isLoading,
    setSetupBtnDisabled,
    validateSetupBtn,
    setupSync,
    setSetupStatus,
  };
}

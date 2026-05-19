import { useState } from "react";
import { backend } from "../lib/backend";

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
    fetch(`/api/debug?msg=setup-sync-start&sources=${selectedSources.length}&targetOption=${targetOption}&targetId=${encodeURIComponent(targetCalendarId)}&newName=${encodeURIComponent(newCalendarName)}`);
    try {
      let finalTargetCalendarId = targetCalendarId;
      if (targetOption === "new") {
        setSetupStatus({
          message: "Creating new calendar...",
          type: "success",
        });
        const userId = localStorage.getItem("calendar_merge_userId");
        if (!userId) throw new Error("Not authenticated");
        const newCalendar = await backend.createCalendar(userId, newCalendarName.trim());
        finalTargetCalendarId = newCalendar.id;
        setSetupStatus({
          message: `Created calendar "${newCalendar.summary}". Setting up sync...`,
          type: "success",
        });
      }
      const data = await backend.setupCalendarSync({
        selectedSources,
        targetCalendarId: finalTargetCalendarId,
      });
      fetch(`/api/debug?msg=setup-sync-success&watchesCreated=${data.watchesCreated}`);
      setSetupStatus({
        message: `\u2713 Sync configured! Watching ${data.watchesCreated} calendars.`,
        type: "success",
      });
      setIsLoading(false);
      if (onSuccess) onSuccess(data);
    } catch (error: unknown) {
      let message = "Setup failed";
      if (error instanceof Error) {
        message += ": " + error.message;
      }
      fetch(`/api/debug?msg=setup-sync-error&error=${encodeURIComponent(message)}`);
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

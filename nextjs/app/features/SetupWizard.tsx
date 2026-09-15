"use client";

import React, { useEffect, useState } from "react";
import { backend } from "../lib/backend";
import type { Calendar } from "../lib/backend";
import StepConnect from "../ui/StepConnect";
import StepSelectCalendars from "../ui/StepSelectCalendars";
import StepChooseTarget from "../ui/StepChooseTarget";
import Stepper from "../ui/Stepper";
import { useSetupSync } from "../hooks/useSetupSync";

interface SetupWizardProps {
  initialAuthStatus?: { message: string; type: string } | null;
  initialUserId?: string | null;
}

export default function SetupWizard({ initialAuthStatus, initialUserId }: SetupWizardProps) {
  // State — check localStorage directly for SSR-safe hydration
  const [userId, setUserId] = useState<string | null>(() => {
    if (initialUserId) return initialUserId;
    if (typeof window !== 'undefined') {
      return localStorage.getItem("calendar_merge_userId");
    }
    return null;
  });
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [targetOption, setTargetOption] = useState<string>("existing");
  const [targetCalendarId, setTargetCalendarId] = useState<string>("");
  const [newCalendarName, setNewCalendarName] = useState<string>("");
  const [step, setStep] = useState<number>(1);
  const [loadingCalendars, setLoadingCalendars] = useState<boolean>(false);
  const [authStatus, setAuthStatus] = useState<{
    message: string;
    type: string;
  } | null>(initialAuthStatus || null);

  // useSetupSync hook
  const { setupStatus, setupBtnDisabled, isLoading, validateSetupBtn, setupSync } =
    useSetupSync({
      selectedSources,
      targetOption,
      targetCalendarId,
      newCalendarName,
      onSuccess: () => {
        // Redirect to dashboard after successful setup
        setTimeout(() => {
          window.location.href = "/dashboard";
        }, 2000);
      },
    });

  // When userId becomes available (from props or localStorage), advance to step 2
  useEffect(() => {
    if (initialUserId && !userId) {
      setUserId(initialUserId);
    }
  }, [initialUserId, userId]);

  useEffect(() => {
    fetch(`/api/debug?msg=userId-effect&userId=${userId}&step=${step}`);
    if (userId && step === 1) {
      fetch(`/api/debug?msg=advancing-to-step2`);
      setStep(2);
      loadCalendars(userId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Validate setup button
  useEffect(() => {
    validateSetupBtn();
  }, [
    selectedSources,
    targetOption,
    targetCalendarId,
    newCalendarName,
    validateSetupBtn,
  ]);

  // Auto-select calendars from environment variables (for testing)
  useEffect(() => {
    if (calendars.length > 0 && selectedSources.length === 0) {
      const testPickedCalendars = process.env.NEXT_PUBLIC_TEST_PICKED_CALENDARS;
      const testTargetCalendar = process.env.NEXT_PUBLIC_TEST_TARGET_CALENDAR;

      // Auto-select source calendars
      if (testPickedCalendars) {
        const pickedNames = testPickedCalendars.split(',').map(s => s.trim());
        const matchingIds = calendars
          .filter((cal) => pickedNames.includes(cal.summary))
          .map((cal) => cal.id);

        if (matchingIds.length > 0) {
          setSelectedSources(matchingIds);
        }
      }

      // Auto-select target calendar
      if (testTargetCalendar) {
        const targetCal = calendars.find(
          (cal) => cal.summary === testTargetCalendar
        );
        if (targetCal) {
          setTargetCalendarId(targetCal.id);
        }
      }
    }
  }, [calendars, selectedSources.length]);

  async function startOAuth() {
    try {
      const data = await backend.startAuth();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (err) {
      console.error("Failed to start OAuth:", err);
      setAuthStatus({ message: "Failed to connect to backend", type: "error" });
    }
  }

  async function loadCalendars(uid?: string) {
    const activeUserId = uid || userId;
    fetch(`/api/debug?msg=loadCalendars&uid=${activeUserId}`);
    if (!activeUserId) return;
    setLoadingCalendars(true);
    try {
      const items = await backend.fetchCalendars(activeUserId);
      fetch(`/api/debug?msg=calendars-loaded&count=${items?.length}`);
      setCalendars(items);
      setLoadingCalendars(false);
    } catch (error: unknown) {
      let message = "Failed to load calendars";
      if (error instanceof Error) {
        message += ": " + error.message;
      }
      fetch(`/api/debug?msg=calendars-error&error=${encodeURIComponent(message)}`);
      setAuthStatus({
        message,
        type: "error",
      });
      setLoadingCalendars(false);
    }
  }

  function handleCalendarSelection(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    const cal = calendars.find(c => c.id === value);
    const action = e.target.checked ? "selected" : "deselected";
    fetch(`/api/debug?msg=source-calendar-${action}&id=${encodeURIComponent(value)}&name=${encodeURIComponent(cal?.summary || "")}`);
    setSelectedSources((prev) =>
      e.target.checked ? [...prev, value] : prev.filter((id) => id !== value)
    );
  }

  function handleTargetOptionChange(e: React.ChangeEvent<HTMLInputElement>) {
    fetch(`/api/debug?msg=target-option&value=${e.target.value}`);
    setTargetOption(e.target.value);
    if (e.target.value === "existing") {
      setNewCalendarName("");
    } else {
      setTargetCalendarId("");
    }
  }

  function handleTargetSelection(e: React.ChangeEvent<HTMLSelectElement>) {
    const cal = calendars.find(c => c.id === e.target.value);
    fetch(`/api/debug?msg=target-calendar-selected&id=${encodeURIComponent(e.target.value)}&name=${encodeURIComponent(cal?.summary || "")}`);
    setTargetCalendarId(e.target.value);
  }

  function handleNewCalendarNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    setNewCalendarName(e.target.value);
  }

  // Step navigation handlers
  function handleNext() {
    const next = Math.min(step + 1, 3);
    fetch(`/api/debug?msg=step-nav&from=${step}&to=${next}&sources=${selectedSources.length}`);
    setStep(next);
  }
  function handleBack() {
    const prev = Math.max(step - 1, 1);
    fetch(`/api/debug?msg=step-nav&from=${step}&to=${prev}`);
    setStep(prev);
  }

  // UI rendering
  return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-2xl w-full p-10 sm:p-12">
        <h1 className="text-gray-800 dark:text-gray-100 text-3xl font-bold mb-4">
          📅 Calendar Merge Service
        </h1>
        <p className="text-gray-600 dark:text-gray-300 mb-10 text-lg">
          Sync multiple Google Calendars into one master calendar
        </p>

        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-6 mb-8 shadow-md min-h-[500px]">
          {/* Step 1: Connect Google */}
          {step === 1 && (
            <Stepper
              onNext={handleNext}
              disableBack
              backLabel="Back"
              nextLabel="Next"
            >
              <StepConnect onConnect={startOAuth} authStatus={authStatus} />
            </Stepper>
          )}

          {/* Step 2: Select Calendars */}
          {step === 2 && (
            <Stepper
              onNext={handleNext}
              onBack={handleBack}
              backLabel="Back"
              nextLabel="Next"
            >
              <StepSelectCalendars
                calendars={calendars}
                selectedSources={selectedSources}
                onChange={handleCalendarSelection}
                loading={loadingCalendars}
              />
            </Stepper>
          )}

          {/* Step 3: Choose Target */}
          {step === 3 && (
            <Stepper
              onBack={handleBack}
              backLabel="Back"
              disableNext
              nextLabel="Next"
            >
              <StepChooseTarget
                calendars={calendars}
                targetOption={targetOption}
                targetCalendarId={targetCalendarId}
                newCalendarName={newCalendarName}
                setupBtnDisabled={setupBtnDisabled}
                isLoading={isLoading}
                setupStatus={setupStatus}
                onTargetOptionChange={handleTargetOptionChange}
                onTargetSelection={handleTargetSelection}
                onNewCalendarNameChange={handleNewCalendarNameChange}
                onSetupSync={setupSync}
              />
            </Stepper>
          )}
        </div>

        {/* Step Indicator */}
        <div className="flex gap-2 justify-center mt-8">
          <div
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
              step >= 1 ? "bg-indigo-600" : "bg-gray-300 dark:bg-gray-600"
            }`}
          />
          <div
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
              step >= 2 ? "bg-indigo-600" : "bg-gray-300 dark:bg-gray-600"
            }`}
          />
          <div
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
              step >= 3 ? "bg-indigo-600" : "bg-gray-300 dark:bg-gray-600"
            }`}
          />
        </div>
      </div>
  );
}

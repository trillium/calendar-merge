"use client";

import React, { useEffect, useState } from "react";
import { fetchCalendars } from "../lib/calendarUtils";
import StepConnect from "../ui/StepConnect";
import StepSelectCalendars from "../ui/StepSelectCalendars";
import StepChooseTarget from "../ui/StepChooseTarget";
import Stepper from "../ui/Stepper";
import { useSetupSync } from "../hooks/useSetupSync";

interface SetupWizardProps {
  initialAuthStatus?: { message: string; type: string } | null;
}

export default function SetupWizard({ initialAuthStatus }: SetupWizardProps) {
  // State
  const [, setUserId] = useState<string | null>(null);
  const [calendars, setCalendars] = useState<
    import("../lib/calendarUtils").Calendar[]
  >([]);
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

  // Check session on mount
  useEffect(() => {
    checkSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkSession() {
    // Check session status
    try {
      const res = await fetch("/api/session");
      if (res.ok) {
        const data = await res.json();
        setUserId(data.userId);
        setStep(2);
        await loadCalendars();
      }
    } catch (err) {
      console.error("Session check failed:", err);
    }
  }

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

  function startOAuth() {
    window.location.href = "/api/oauth/start";
  }

  async function loadCalendars() {
    setLoadingCalendars(true);
    try {
      const items = await fetchCalendars();
      setCalendars(items);
      setLoadingCalendars(false);
    } catch (error: unknown) {
      let message = "Failed to load calendars";
      if (error instanceof Error) {
        message += ": " + error.message;
      }
      setAuthStatus({
        message,
        type: "error",
      });
      setLoadingCalendars(false);
    }
  }

  function handleCalendarSelection(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setSelectedSources((prev) =>
      e.target.checked ? [...prev, value] : prev.filter((id) => id !== value)
    );
  }

  function handleTargetOptionChange(e: React.ChangeEvent<HTMLInputElement>) {
    setTargetOption(e.target.value);
    if (e.target.value === "existing") {
      setNewCalendarName("");
    } else {
      setTargetCalendarId("");
    }
  }

  function handleTargetSelection(e: React.ChangeEvent<HTMLSelectElement>) {
    setTargetCalendarId(e.target.value);
  }

  function handleNewCalendarNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    setNewCalendarName(e.target.value);
  }

  // Step navigation handlers
  function handleNext() {
    setStep((prev) => Math.min(prev + 1, 3));
  }
  function handleBack() {
    setStep((prev) => Math.max(prev - 1, 1));
  }

  // UI rendering
  return (
    <div className="flex items-center justify-center min-h-screen p-6">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-xl w-full p-10 sm:p-12">
        <h1 className="text-gray-800 dark:text-gray-100 text-3xl font-bold mb-4">
          📅 Calendar Merge Service
        </h1>
        <p className="text-gray-600 dark:text-gray-300 mb-10 text-lg">
          Sync multiple Google Calendars into one master calendar
        </p>

        {/* Step 1: Connect Google */}
        {step === 1 && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-6 mb-8 shadow-md">
            <Stepper
              onNext={handleNext}
              disableBack
              backLabel="Back"
              nextLabel="Next"
            >
              <StepConnect onConnect={startOAuth} authStatus={authStatus} />
            </Stepper>
          </div>
        )}

        {/* Step 2: Select Calendars */}
        {step === 2 && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-6 mb-8 shadow-md">
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
          </div>
        )}

        {/* Step 3: Choose Target */}
        {step === 3 && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-6 mb-4 shadow-md">
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
          </div>
        )}

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
    </div>
  );
}

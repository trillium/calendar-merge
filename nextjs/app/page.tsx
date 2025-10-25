"use client";

import React, { useEffect, useState } from "react";
import { API_URL } from "./lib/api";
import { fetchCalendars } from "./lib/calendarUtils";
import StepConnect from "./ui/StepConnect";
import StepSelectCalendars from "./ui/StepSelectCalendars";
import StepChooseTarget from "./ui/StepChooseTarget";
import Stepper from "./ui/Stepper";
import { useSetupSync } from "./hooks/useSetupSync";

export default function Home() {
  // State
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [calendars, setCalendars] = useState<
    import("./lib/calendarUtils").Calendar[]
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
  } | null>(null);
  // useSetupSync hook
  const { setupStatus, setupBtnDisabled, validateSetupBtn, setupSync } =
    useSetupSync({
      accessToken,
      selectedSources,
      targetOption,
      targetCalendarId,
      newCalendarName,
    });

  // OAuth callback handling
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const accessToken = params.get("access_token");
    const error = params.get("error");

    if (error) {
      let message = "Authentication failed";
      if (error === "oauth_failed") {
        message = "OAuth authentication failed";
      } else if (error === "no_code") {
        message = "No authorization code received";
      } else {
        message = `Authentication error: ${error}`;
      }
      setAuthStatus({ message, type: "error" });
      // Clean up URL
      window.history.replaceState({}, document.title, "/");
    } else if (accessToken) {
      // Handle successful OAuth callback
      setAccessToken(accessToken);
      localStorage.setItem("access_token", accessToken);
      setAuthStatus({ message: "Successfully connected!", type: "success" });
      setStep(2);
      loadCalendars(accessToken);
      // Clean up URL
      window.history.replaceState({}, document.title, "/");
    } else {
      // Check for stored token
      const storedToken = localStorage.getItem("access_token");
      if (storedToken) {
        setAccessToken(storedToken);
        setStep(2);
        loadCalendars(storedToken);
      }
    }
  }, []);

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
    window.location.href = `${API_URL}/oauth/start?redirect_uri=${encodeURIComponent(
      `${window.location.origin}/api/oauth/callback`
    )}`;
  }

  async function loadCalendars(token: string) {
    setLoadingCalendars(true);
    try {
      const items = await fetchCalendars(token);
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
    if (e.target.checked && selectedSources.length === 0) {
      setStep(3);
    } else if (!e.target.checked && selectedSources.length === 1) {
      setStep(2);
    }
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
        <h1 className="text-gray-800 dark:text-gray-100 mb-4 text-3xl font-bold">
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
                setupStatus={setupStatus}
                onTargetOptionChange={handleTargetOptionChange}
                onTargetSelection={handleTargetSelection}
                onNewCalendarNameChange={handleNewCalendarNameChange}
                onSetupSync={setupSync}
              />
            </Stepper>
          </div>
        )}
      </div>
    </div>
  );
}

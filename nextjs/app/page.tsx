"use client";

import React, { useEffect, useState } from "react";
import { API_URL, oauthCallback } from "./lib/api";
import { fetchCalendars } from "./lib/calendarUtils";
import CalendarList from "./ui/CalendarList";
import Stepper from "./ui/Stepper";
import StatusMessage from "./ui/StatusMessage";
import ConnectButton from "./ui/ConnectButton";

export default function Home() {
  // State
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [calendars, setCalendars] = useState<any[]>([]);
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
  const {
    setupStatus,
    setupBtnDisabled,
    setSetupBtnDisabled,
    validateSetupBtn,
    setupSync,
    setSetupStatus,
  } = useSetupSync({
    accessToken,
    selectedSources,
    targetOption,
    targetCalendarId,
    newCalendarName,
  });

  // OAuth callback handling
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) {
      handleOAuthCallback(code);
    } else {
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
  }, [selectedSources, targetOption, targetCalendarId, newCalendarName, validateSetupBtn]);

  function startOAuth() {
    window.location.href = `${API_URL}/oauth/start?redirect_uri=${encodeURIComponent(
      window.location.origin
    )}`;
  }

  async function handleOAuthCallback(code: string) {
    try {
      const data = await oauthCallback(code);
      setAccessToken(data.access_token);
      localStorage.setItem("access_token", data.access_token);
      setAuthStatus({ message: "Successfully connected!", type: "success" });
      window.history.replaceState({}, document.title, "/");
      setStep(2);
      loadCalendars(data.access_token);
    } catch (error: any) {
      setAuthStatus({
        message: "Authentication failed: " + error.message,
        type: "error",
      });
    }
  }

  async function loadCalendars(token: string) {
    setLoadingCalendars(true);
    try {
      const items = await fetchCalendars(token);
      setCalendars(items);
      setLoadingCalendars(false);
    } catch (error: any) {
      setAuthStatus({
        message: "Failed to load calendars: " + error.message,
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
    } catch (error: any) {
      setSetupStatus({
        message: "Setup failed: " + error.message,
        type: "error",
      });
      setSetupBtnDisabled(false);
    }
  }

  // UI rendering
  return (
    <div className="container">
      <h1>📅 Calendar Merge Service</h1>
      <p className="subtitle">
        Sync multiple Google Calendars into one master calendar
      </p>

      {/* Step 1: Connect Google */}
      {step === 1 && (
        <Stepper step={1}>
          <h2>Step 1: Connect Your Google Account</h2>
          <p>Grant access to your Google Calendars to enable syncing.</p>
          <ConnectButton onClick={startOAuth} />
          {authStatus && <StatusMessage message={authStatus.message} type={authStatus.type} />}
        </Stepper>
      )}

      {/* Step 2: Select Calendars */}
      {step === 2 && (
        <Stepper step={2}>
          <h2>Step 2: Select Source Calendars</h2>
          <p>Choose which calendars you want to merge.</p>
          {loadingCalendars ? (
            <div className="loading" id="loadingCalendars">
              Loading your calendars...
            </div>
          ) : (
            <CalendarList calendars={calendars} selected={selectedSources} onChange={handleCalendarSelection} />
          )}
        </Stepper>
      )}

      {/* Step 3: Choose Target */}
      {step === 3 && (
        <Stepper step={3}>
          <h2>Step 3: Choose Target Calendar</h2>
          <p>Select where merged events should appear.</p>

          <div style={{ marginBottom: "15px" }}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="targetOption"
                value="existing"
                checked={targetOption === "existing"}
                onChange={handleTargetOptionChange}
                style={{ marginRight: "8px" }}
              />
              <span>Use existing calendar</span>
            </label>
          </div>

          {targetOption === "existing" && (
            <select
              id="targetCalendar"
              style={{ marginBottom: "15px" }}
              value={targetCalendarId}
              onChange={handleTargetSelection}
            >
              <option value="">Select target calendar...</option>
              {calendars.map((cal) => (
                <option key={cal.id} value={cal.id}>
                  {cal.summary}
                </option>
              ))}
            </select>
          )}

          <div style={{ marginBottom: "15px" }}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="targetOption"
                value="new"
                checked={targetOption === "new"}
                onChange={handleTargetOptionChange}
                style={{ marginRight: "8px" }}
              />
              <span>Create new calendar</span>
            </label>
          </div>

          {targetOption === "new" && (
            <input
              type="text"
              id="newCalendarName"
              placeholder="Enter new calendar name"
              value={newCalendarName}
              onChange={handleNewCalendarNameChange}
              style={{
                width: "100%",
                padding: "10px",
                border: "1px solid #ddd",
                borderRadius: "6px",
                marginBottom: "15px",
              }}
            />
          )}

          <button
            className="btn"
            id="setupBtn"
            disabled={setupBtnDisabled}
            onClick={setupSync}
          >
            Start Syncing
          </button>
          {setupStatus && <StatusMessage message={setupStatus.message} type={setupStatus.type} />}
        </Stepper>
      )}
    </div>
  );
}

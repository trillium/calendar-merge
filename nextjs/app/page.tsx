"use client";

import React, { useEffect, useState } from "react";
import SetupWizard from "./features/SetupWizard";

export default function Home() {
  const [authStatus, setAuthStatus] = useState<{
    message: string;
    type: string;
  } | null>(null);
  const [initialUserId, setInitialUserId] = useState<string | null>(null);

  // Handle OAuth callback on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get("success");
    const error = params.get("error");
    const userId = params.get("userId");

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
      window.history.replaceState({}, document.title, "/");
      return;
    }

    if (success && userId) {
      localStorage.setItem("calendar_merge_userId", userId);
      setInitialUserId(userId);
      setAuthStatus({ message: "Successfully connected!", type: "success" });
      window.history.replaceState({}, document.title, "/");
    } else {
      // Check localStorage for existing session
      const storedUserId = localStorage.getItem("calendar_merge_userId");
      if (storedUserId) {
        setInitialUserId(storedUserId);
      }
    }
  }, []);

  return <SetupWizard initialAuthStatus={authStatus} initialUserId={initialUserId} />;
}

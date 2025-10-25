"use client";

import React, { useEffect, useState } from "react";
import SetupWizard from "./features/SetupWizard";

export default function Home() {
  const [authStatus, setAuthStatus] = useState<{
    message: string;
    type: string;
  } | null>(null);

  // Handle OAuth callback on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get("success");
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
      window.history.replaceState({}, document.title, "/");
      return;
    }

    if (success) {
      setAuthStatus({ message: "Successfully connected!", type: "success" });
      window.history.replaceState({}, document.title, "/");
    }
  }, []);

  return <SetupWizard initialAuthStatus={authStatus} />;
}

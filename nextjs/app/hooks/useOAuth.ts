import { useEffect, useState } from "react";

export function useOAuth({
  onToken,
  onStep,
  onCalendarsLoad
}: {
  onToken: (token: string) => void;
  onStep: (step: number) => void;
  onCalendarsLoad: (token: string) => void;
}) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) {
      // The actual callback handler should be passed in or handled in a utility
      // This hook just detects and triggers
      onStep(2);
      // The caller should handle the actual OAuth callback logic
    } else {
      const storedToken = localStorage.getItem("access_token");
      if (storedToken) {
        onToken(storedToken);
        onStep(2);
        onCalendarsLoad(storedToken);
      }
    }
  }, [onToken, onStep, onCalendarsLoad]);
}

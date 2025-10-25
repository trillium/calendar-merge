"use client";
import React from "react";
import ConnectButton from "./ConnectButton";
import StatusMessage from "./StatusMessage";

export type AuthStatus = {
  message: string;
  type: string;
} | null;

type StepConnectProps = {
  onConnect: () => void;
  authStatus: AuthStatus;
};

export default function StepConnect({ onConnect, authStatus }: StepConnectProps) {
  return (
    <>
      <h2 className="text-indigo-500 text-xl mb-3 font-semibold">
        Step 1: Connect Your Google Account
      </h2>
      <p className="text-gray-600 dark:text-gray-400 leading-relaxed mb-4">
        Grant access to your Google Calendars to enable syncing.
      </p>
      <ConnectButton onClick={onConnect} />
      {authStatus && (
        <StatusMessage message={authStatus.message} type={authStatus.type} />
      )}
    </>
  );
}

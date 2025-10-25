"use client";
import React from "react";

type ConnectButtonProps = {
  onClick: () => void;
  disabled?: boolean;
};

export default function ConnectButton({
  onClick,
  disabled,
}: ConnectButtonProps) {
  return (
    <button
      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-lg shadow-md transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
      id="connectBtn"
      onClick={onClick}
      disabled={disabled}
    >
      Connect Google Calendar
    </button>
  );
}

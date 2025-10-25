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
      className="btn flex-1"
      id="connectBtn"
      onClick={onClick}
      disabled={disabled}
    >
      Connect Google Calendar
    </button>
  );
}

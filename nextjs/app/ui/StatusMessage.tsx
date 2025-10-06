"use client";
import React from "react";

type StatusMessageProps = {
  message: string;
  type: string; // e.g. 'success' | 'error'
};

export default function StatusMessage({ message, type }: StatusMessageProps) {
  return <div className={`status ${type}`}>{message}</div>;
}

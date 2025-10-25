"use client";
import React from "react";
import StatusMessage from "./StatusMessage";

export type Calendar = {
  id: string;
  summary: string;
};

export type SetupStatus = {
  message: string;
  type: string;
} | null;

type StepChooseTargetProps = {
  calendars: Calendar[];
  targetOption: string;
  targetCalendarId: string;
  newCalendarName: string;
  setupBtnDisabled: boolean;
  setupStatus: SetupStatus;
  onTargetOptionChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onTargetSelection: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  onNewCalendarNameChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSetupSync: () => void;
};

export default function StepChooseTarget({
  calendars,
  targetOption,
  targetCalendarId,
  newCalendarName,
  setupBtnDisabled,
  setupStatus,
  onTargetOptionChange,
  onTargetSelection,
  onNewCalendarNameChange,
  onSetupSync,
}: StepChooseTargetProps) {
  return (
    <>
      <h2 className="text-indigo-500 text-xl mb-3 font-semibold">
        Step 3: Choose Target Calendar
      </h2>
      <p className="text-gray-600 dark:text-gray-400 leading-relaxed mb-4">
        Select where merged events should appear.
      </p>

      <div className="mb-4">
        <label className="flex items-center cursor-pointer">
          <input
            type="radio"
            name="targetOption"
            value="existing"
            checked={targetOption === "existing"}
            onChange={onTargetOptionChange}
            className="mr-2"
          />
          <span className="text-gray-700 dark:text-gray-300">
            Use existing calendar
          </span>
        </label>
      </div>

      {targetOption === "existing" && (
        <select
          id="targetCalendar"
          className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md text-sm mb-4 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
          value={targetCalendarId}
          onChange={onTargetSelection}
        >
          <option value="">Select target calendar...</option>
          {calendars.map((cal) => (
            <option key={cal.id} value={cal.id}>
              {cal.summary}
            </option>
          ))}
        </select>
      )}

      <div className="mb-4">
        <label className="flex items-center cursor-pointer">
          <input
            type="radio"
            name="targetOption"
            value="new"
            checked={targetOption === "new"}
            onChange={onTargetOptionChange}
            className="mr-2"
          />
          <span className="text-gray-700 dark:text-gray-300">
            Create new calendar
          </span>
        </label>
      </div>

      {targetOption === "new" && (
        <input
          type="text"
          id="newCalendarName"
          placeholder="Enter new calendar name"
          value={newCalendarName}
          onChange={onNewCalendarNameChange}
          className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md mb-4 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 placeholder-gray-500 dark:placeholder-gray-400"
        />
      )}

      <button
        className="bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white border-0 px-6 py-3 rounded-md text-base cursor-pointer transition-colors w-full font-semibold"
        id="setupBtn"
        disabled={setupBtnDisabled}
        onClick={onSetupSync}
      >
        Start Syncing
      </button>
      {setupStatus && (
        <StatusMessage message={setupStatus.message} type={setupStatus.type} />
      )}
    </>
  );
}

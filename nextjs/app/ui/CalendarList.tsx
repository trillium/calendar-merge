"use client";
import React from "react";

type Calendar = { id: string; summary: string };
type CalendarListProps = {
  calendars?: Calendar[];
  selected: string[];
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

export default function CalendarList({
  calendars,
  selected,
  onChange,
}: CalendarListProps) {
  const safeCalendars = Array.isArray(calendars) ? calendars : [];
  return (
    <div className="mt-4" id="calendarList">
      {safeCalendars.length === 0 ? (
        <div className="text-gray-500">No calendars found.</div>
      ) : (
        safeCalendars.map((cal) => {
          const isChecked = selected.includes(cal.id);
          return (
            <label
              htmlFor={`cal-${cal.id}`}
              className={`flex items-center p-3 border rounded-md mb-3 cursor-pointer transition-colors ${
                isChecked
                  ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 dark:border-indigo-400"
                  : "border-gray-200 bg-white dark:bg-gray-800 dark:border-gray-600"
              }`}
              key={cal.id}
            >
              <input
                type="checkbox"
                id={`cal-${cal.id}`}
                value={cal.id}
                checked={isChecked}
                onChange={onChange}
                className="mr-3"
              />
              <span
                className={`${
                  isChecked
                    ? "text-indigo-700 dark:text-indigo-300 font-medium"
                    : "text-gray-700 dark:text-gray-300"
                }`}
              >
                {cal.summary}
              </span>
            </label>
          );
        })
      )}
    </div>
  );
}

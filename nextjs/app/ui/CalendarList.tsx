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
        safeCalendars.map((cal) => (
          <div
            className="flex items-center p-3 border border-gray-200 rounded-md mb-3 bg-white dark:bg-gray-800 dark:border-gray-600"
            key={cal.id}
          >
            <input
              type="checkbox"
              id={`cal-${cal.id}`}
              value={cal.id}
              checked={selected.includes(cal.id)}
              onChange={onChange}
              className="mr-3"
            />
            <label
              htmlFor={`cal-${cal.id}`}
              className="text-gray-700 dark:text-gray-300 cursor-pointer"
            >
              {cal.summary}
            </label>
          </div>
        ))
      )}
    </div>
  );
}

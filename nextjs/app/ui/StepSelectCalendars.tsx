"use client";
import React from "react";
import CalendarList from "./CalendarList";

export type Calendar = {
  id: string;
  summary: string;
};

type StepSelectCalendarsProps = {
  calendars: Calendar[];
  selectedSources: string[];
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  loading: boolean;
};

export default function StepSelectCalendars({
  calendars,
  selectedSources,
  onChange,
  loading,
}: StepSelectCalendarsProps) {
  return (
    <>
      <h2 className="text-indigo-500 text-xl mb-3 font-semibold">
        Step 2: Select Source Calendars
      </h2>
      <p className="text-gray-600 dark:text-gray-400 leading-relaxed mb-4">
        Choose which calendars you want to merge.
      </p>
      {loading ? (
        <div
          className="text-center text-indigo-500 font-semibold"
          id="loadingCalendars"
        >
          Loading your calendars...
        </div>
      ) : (
        <CalendarList
          calendars={calendars}
          selected={selectedSources}
          onChange={onChange}
        />
      )}
    </>
  );
}

"use client";
import React from "react";

type Calendar = { id: string; summary: string };
type CalendarListProps = {
  calendars: Calendar[];
  selected: string[];
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

export default function CalendarList({ calendars, selected, onChange }: CalendarListProps) {
  return (
    <div className="calendar-list" id="calendarList">
      {calendars.map((cal) => (
        <div className="calendar-item" key={cal.id}>
          <input
            type="checkbox"
            id={`cal-${cal.id}`}
            value={cal.id}
            checked={selected.includes(cal.id)}
            onChange={onChange}
          />
          <label htmlFor={`cal-${cal.id}`}>{cal.summary}</label>
        </div>
      ))}
    </div>
  );
}

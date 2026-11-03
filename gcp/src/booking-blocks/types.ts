/**
 * Booking-blocks types.
 *
 * A booking email (Airbnb Services) is turned into a BookingSignal; signals
 * are folded in time order into Appointments; the planner compares
 * Appointments with the calendar and produces PlanItems.
 */

export type SignalKind = 'booked' | 'canceled' | 'rescheduled' | 'extended';

export interface BookingSignal {
  kind: SignalKind;
  /** Gmail message id (provenance only) */
  messageId: string;
  /** When the email was sent (epoch ms) — the order signals are applied in */
  sentAt: number;
  guest: string;
  service: string;
  /** Start of the booking this signal talks about (epoch ms) */
  start: number;
  /** booked: end of the booked window, from the email (epoch ms) */
  end?: number;
  /** booked: platform confirmation code */
  code?: string;
  /** extended: minutes added, undefined when the email does not say */
  extraMinutes?: number;
}

export interface Appointment {
  /** Stable identity: confirmation code */
  key: string;
  guest: string;
  service: string;
  start: number;
  /** Booked end, before extensions */
  baseEnd: number;
  extraMinutes: number;
  status: 'active' | 'canceled';
  /** Things a human must look at; the planner never acts on these guesses */
  review: string[];
}

export interface CalendarEvent {
  id: string;
  summary: string;
  start: number;
  end: number;
  /** extendedProperties.private.bookingBlockKey when this tool created it */
  blockKey?: string;
}

export type PlanAction = 'ok' | 'add' | 'update' | 'delete' | 'review';

export interface PlanItem {
  action: PlanAction;
  appointment: Appointment;
  /** Full window the appointment needs (base + extensions) */
  required: { start: number; end: number };
  /** Calendar events (not ours) that already cover part of the window */
  covering: CalendarEvent[];
  /** The block this tool owns for the appointment today, if any */
  existingBlock?: CalendarEvent;
  /** The block that should exist after the plan; absent for ok/delete/review */
  proposed?: { start: number; end: number };
  note?: string;
}

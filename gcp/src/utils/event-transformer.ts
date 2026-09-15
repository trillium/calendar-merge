/**
 * Event transformation utilities
 * Handles event data transformation and special event detection
 */

/**
 * Check if an event is an Airbnb event
 * Airbnb events need special handling (add __EVENT__ marker)
 */
export function isAirbnbEvent(event: any): boolean {
  return (
    event.summary?.toLowerCase().includes('airbnb') ||
    event.organizer?.email?.toLowerCase().includes('airbnb') ||
    event.creator?.email?.toLowerCase().includes('airbnb') ||
    event.attendees?.some((attendee: any) => attendee.email?.toLowerCase().includes('airbnb'))
  );
}

/**
 * Transform event data for syncing to target calendar
 * Adds calendar prefix, busy status, and special markers
 */
export function transformEventData(sourceEvent: any, sourceCalendarId: string): any {
  const calendarName = sourceCalendarId.split('@')[0];
  const transparency = sourceEvent.transparency || 'opaque';
  const busyStatus = transparency === 'transparent' ? 'free' : 'busy';

  // Check if this is an Airbnb event and modify description
  let description = sourceEvent.description || '';
  if (isAirbnbEvent(sourceEvent)) {
    description = description ? `__EVENT__\n\n${description}` : '__EVENT__';
  }

  return {
    summary: `[${calendarName}] ${sourceEvent.summary || '(No title)'} - ${busyStatus}`,
    description,
    start: sourceEvent.start,
    end: sourceEvent.end,
    location: sourceEvent.location,
    status: sourceEvent.status,
    transparency,
    visibility: 'private',
  };
}

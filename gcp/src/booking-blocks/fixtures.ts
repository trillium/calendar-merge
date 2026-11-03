/**
 * Synthetic booking emails shaped like the real platform's, with invented
 * people and addresses. Never paste real emails here: the repo is public.
 */

import { RawEmail } from './parser';
import { zonedToEpoch } from './time';

const PAD = ' ͏ ͏ ͏ ͏ ͏ ͏ ͏ ͏ ͏';
const FOOTER = 'Get the app.\r\nhttps://example.test/app\r\nExample Platform Inc., 1 Example St.';

export const at = (month: number, day: number, hour: number, minute = 0, year = 2030) => zonedToEpoch(year, month - 1, day, hour, minute);

export function bookedEmail(o: { id?: string; guest?: string; service?: string; code?: string; when: string; sentAt: number }): RawEmail {
  const guest = o.guest ?? 'Pat';
  const service = o.service ?? '60m Massage';
  return {
    id: o.id ?? `booked-${o.code ?? 'AAAA1111'}`,
    subject: `Confirmed: ${guest} booked a massage for March 4`,
    sentAt: o.sentAt,
    body: [
      PAD,
      `${guest.toUpperCase()} BOOKED A MASSAGE FOR MARCH 4`,
      'Send them a message to confirm all the details.',
      `https://example.test/users/1?src=avatar`,
      `${service.toUpperCase()}`,
      'Hosted by Casey',
      'DATE AND TIME',
      o.when,
      'GUEST  1 adult, private group',
      'LOCATION  1 Example Street, Testville',
      'CONFIRMATION CODE',
      o.code ?? 'AAAA1111',
      `EARNINGS  ${service} x 1 guest  $100.00  Service fee  -$15.00  TOTAL (USD)  $85.00`,
      FOOTER,
    ].join('\r\n'),
  };
}

const reservationCard = (title: string, service: string, dayText: string, time: string) =>
  [PAD, title, '', service, 'Hosted by Casey', `${dayText}  ${time} · 1 guest`, FOOTER].join('\r\n');

export function canceledEmail(o: { id?: string; guest?: string; service?: string; dayText: string; time: string; sentAt: number; byHost?: boolean }): RawEmail {
  const guest = o.guest ?? 'Pat';
  const service = o.service ?? '60m Massage';
  return {
    id: o.id ?? 'canceled-1',
    subject: o.byHost ? `${guest}’s reservation was canceled` : `${guest} canceled their reservation: ${service}`,
    sentAt: o.sentAt,
    body: reservationCard(`${guest.toUpperCase()} CANCELED THEIR RESERVATION\r\nCANCELED RESERVATION`, service, o.dayText, o.time),
  };
}

export function rescheduledEmail(o: { id?: string; guest?: string; service?: string; dayText: string; time: string; sentAt: number }): RawEmail {
  const guest = o.guest ?? 'Pat';
  const service = o.service ?? '60m Massage';
  return {
    id: o.id ?? 'rescheduled-1',
    subject: `${guest} rescheduled their reservation: ${service}`,
    sentAt: o.sentAt,
    body: reservationCard(`${guest.toUpperCase()} RESCHEDULED THEIR RESERVATION\r\nUPDATED RESERVATION`, service, o.dayText, o.time),
  };
}

export function extendedEmail(o: { id?: string; guest?: string; service?: string; requestTitle: string; dayText: string; time: string; sentAt: number }): RawEmail {
  const guest = o.guest ?? 'Pat';
  const service = o.service ?? '60m Massage';
  return {
    id: o.id ?? 'extended-1',
    subject: `${guest} accepted your payment request for ${o.requestTitle}`,
    sentAt: o.sentAt,
    body: [PAD, `${guest.toUpperCase()} ACCEPTED YOUR PAYMENT REQUEST`, 'https://example.test/thread/1', o.requestTitle, service, `${o.dayText}  ${o.time} · 1 guest`, FOOTER].join('\r\n'),
  };
}

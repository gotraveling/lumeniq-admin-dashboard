/**
 * Legacy bookings list — retired.
 *
 * Booking management lives in /console/bookings. This page was still
 * reachable by URL after being dropped from the admin menu, and its
 * "Resend email" control sent to the guest with no confirmation step,
 * so anyone who found the old link could email a live client by
 * accident. It now redirects.
 */
import { redirect } from 'next/navigation';

export default function LegacyBookingsPage() {
  redirect('/console/bookings');
}

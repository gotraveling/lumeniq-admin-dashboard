/**
 * Legacy booking detail — retired. See ../page.tsx.
 */
import { redirect } from 'next/navigation';

export default function LegacyBookingDetailPage() {
  redirect('/console/bookings');
}

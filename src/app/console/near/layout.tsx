/**
 * Tab title for this screen. The page is a client component and cannot export
 * metadata, so the title lives in a layout beside it.
 */
export const metadata = { title: 'Near a place' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

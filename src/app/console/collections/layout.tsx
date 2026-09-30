/**
 * Tab title for this screen.
 *
 * The page itself is a client component and cannot export metadata, so
 * the title lives in a layout beside it. Without these every console
 * tab read "FirstClass Console", which is useless once three are open.
 */
export const metadata = { title: 'Collections' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

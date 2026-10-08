import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mogul Asset & Tax Operations Dashboard',
  description: 'Property portfolio and tax operations overview.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import '@cloudscape-design/global-styles/index.css';
import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppProviders } from '@/components/AppProviders';
import { themeBootScript } from '@/lib/theme';

export const metadata: Metadata = {
  title: 'Route 53 Console',
  description: 'A local clone of the Amazon Route 53 console',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}

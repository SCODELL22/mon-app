import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ippon — Pipeline Commercial',
  description: 'Pipeline commercial de l’agence',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}

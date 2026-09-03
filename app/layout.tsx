import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Matchday — What’s worth watching?',
  description: 'A focused daily shortlist of the best football games across Europe.',
  openGraph: {
    title: 'Matchday — What’s worth watching?',
    description: 'Today and tomorrow across Europe.',
    images: [{ url: '/og.png', width: 1731, height: 909, alt: 'Matchday football shortlist' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Matchday — What’s worth watching?',
    description: 'Today and tomorrow across Europe.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}

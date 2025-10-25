import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NRK Nedlaster',
  description: 'Last ned videoer fra NRK med yt-dlp og ffmpeg',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="no" className="dark">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}


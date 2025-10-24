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
    <html lang="no">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const darkMode = localStorage.getItem('darkMode') === 'true';
                if (darkMode) {
                  document.documentElement.classList.add('dark');
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}


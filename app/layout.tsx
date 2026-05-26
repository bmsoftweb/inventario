import type {Metadata, Viewport} from 'next';
import './globals.css';
import { Jost } from 'next/font/google';

const jost = Jost({ 
  subsets: ['latin'],
  weight: ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
  variable: '--font-jost',
});

export const metadata: Metadata = {
  title: 'Controle de Estoque Mobile',
  description: 'Aplicativo PWA para contagem de estoque',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="pt-BR" className={jost.variable}>
      <body className={jost.className} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}

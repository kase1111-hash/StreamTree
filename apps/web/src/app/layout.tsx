import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { WalletProvider } from '@/lib/wallet-provider';
import { Navbar } from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'StreamTree - Interactive Stream Bingo',
  description: 'Create interactive bingo games for your stream audience',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <WalletProvider>
          <AuthProvider>
            <div className="min-h-screen flex flex-col">
              <Navbar />
              <main className="flex-1">{children}</main>
            </div>
          </AuthProvider>
        </WalletProvider>
      </body>
    </html>
  );
}

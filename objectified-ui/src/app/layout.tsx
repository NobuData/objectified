import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "@radix-ui/themes/styles.css";
import SessionWrapper from "@/app/components/auth/SessionWrapper";
import ThemeRegistry from "@/app/components/theme/ThemeRegistry";
import { DialogProvider } from "@/app/components/providers/DialogProvider";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { Theme as RadixTheme } from "@radix-ui/themes";

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: "Objectified",
  description: "Objectified Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="antialiased">
        <NextThemesProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          storageKey="theme"
        >
          <RadixTheme
            accentColor="indigo"
            grayColor="slate"
            panelBackground="solid"
            radius="medium"
            scaling="100%"
          >
            <ThemeRegistry>
              <SessionWrapper>
                <DialogProvider>
                  {children}
                </DialogProvider>
              </SessionWrapper>
            </ThemeRegistry>
          </RadixTheme>
        </NextThemesProvider>
      </body>
    </html>
  );
}


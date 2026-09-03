import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { TRPCReactProvider } from "@/trpc/client";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Clipping marketplace",
  description: "Brands post paid clipping campaigns, creators submit clips.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TRPCReactProvider>
            <div className="flex min-h-dvh flex-col">
              <SiteHeader />
              <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
                {children}
              </main>
            </div>
            <Toaster richColors closeButton />
          </TRPCReactProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Atkinson_Hyperlegible, Plus_Jakarta_Sans } from "next/font/google";
import { AppHeader } from "@/components/app-header";
import { getServerUser } from "@/lib/auth/server-session";
import { serverKeyAvailable } from "@/lib/gemini/client";
import { AiProvider } from "@/components/ai-provider";
import "./globals.css";

const body = Atkinson_Hyperlegible({ variable: "--font-atkinson", subsets: ["latin"], weight: ["400", "700"] });
const display = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: { default: "InTune", template: "%s · InTune" },
  description: "Private circles where you say it your way, check the wording, and approve every message before it is sent.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f4ef" },
    { media: "(prefers-color-scheme: dark)", color: "#151b19" },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const signedIn = (await getServerUser()) !== null;
  return (
    <html lang="en" className={`${body.variable} ${display.variable} h-full`}>
      <body className="min-h-full flex flex-col antialiased">
        <a href="#main" className="sr-only-focusable fixed left-3 top-3 z-50 rounded-md bg-teal px-4 py-2 text-teal-ink">
          Skip to content
        </a>
        <AiProvider serverAi={serverKeyAvailable()}>
          <AppHeader />
          <main id="main" className={signedIn ? "flex-1 pb-16 md:pb-0 md:pl-[76px] xl:pl-[244px]" : "flex-1"}>
            {children}
          </main>
        </AiProvider>
      </body>
    </html>
  );
}

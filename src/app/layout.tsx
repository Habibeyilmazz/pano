import type { Metadata, Viewport } from "next";
import { Onest } from "next/font/google";
import { ThemeFallback, Toaster } from "@/components/client";
import { I18nProvider } from "@/lib/i18n/client";
import { getI18n } from "@/lib/i18n/server";
import { getCtx } from "@/lib/session";
import "./globals.css";

const onest = Onest({ subsets: ["latin", "latin-ext"], variable: "--font-onest", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: { default: "pano", template: "%s · pano" }, description: m.meta.description };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f5f2" },
    { media: "(prefers-color-scheme: dark)", color: "#121816" },
  ],
};

// Resolves "system" before first paint so dark-mode users never see a white flash.
const themeScript = `(function(){var d=document.documentElement;if(d.dataset.theme==="system"){d.dataset.theme=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}})()`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [{ locale }, ctx] = await Promise.all([getI18n(), getCtx()]);
  return (
    <html lang={locale} data-theme={ctx?.theme ?? "system"} className={onest.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh font-sans antialiased">
        <ThemeFallback />
        <I18nProvider locale={locale}>
          <Toaster>{children}</Toaster>
        </I18nProvider>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import {
  Cairo,
  Geist,
  Geist_Mono,
  Inter,
} from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { SonnerToaster } from "@/components/localdock/sonner-toaster";
import { I18nProvider } from "@/lib/localdock/i18n/provider";
import { ThemePackProvider } from "@/lib/localdock/i18n/themes";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Arabic companion to Geist — Next self-hosts it at build time (zero runtime
// requests). Its variable instance feeds `--font-cairo`, which globals.css
// splices into the sans stack whenever <html lang="ar">.
const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Russian companion — Inter's Cyrillic is the gold standard for UI text.
// Spliced into the sans stack by globals.css while <html lang="ru">.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
  display: "swap",
});

// CJK & Hindi font variables mapping directly to high-quality system font fallbacks
const notoSc = { variable: "--font-noto-sc" };
const notoJp = { variable: "--font-noto-jp" };
const notoDeva = { variable: "--font-noto-deva" };

export const metadata: Metadata = {
  title: "LocalDock — Your Personal Local Cloud",
  description:
    "Turn your computer into a private personal cloud for your local network. No cloud. No accounts. Your files never leave your home.",
  applicationName: "LocalDock",
  icons: {
    icon: [
      {
        url:
          "data:image/svg+xml," +
          encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="4" y="4" width="56" height="56" rx="16" fill="#0D9488"/><path d="M20 40V26h6v14h10v6H20Z" fill="white"/><rect x="38" y="18" width="6" height="14" rx="2" fill="white" opacity="0.85"/></svg>`
          ),
        type: "image/svg+xml",
      },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F7F9" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0E14" },
  ],
};

/**
 * Runs before first paint: restores the saved language (with <html lang/dir>
 * so CSS direction + the per-script font apply from byte zero) and theme pack.
 * Mirrors the exact keys the i18n/theme providers read.
 */
const PREFS_BOOTSTRAP = `(() => {
  try {
    const d = document.documentElement;
    const lang = localStorage.getItem("localdock.lang");
    const LOCALES = ["en","ar","es","fr","de","pt","ru","zh","hi","ja"];
    if (lang && LOCALES.indexOf(lang) !== -1) {
      d.lang = lang;
      if (lang === "ar") d.dir = "rtl";
    }
    const pack = localStorage.getItem("localdock.themePack");
    if (pack && pack !== "teal" && /^(ocean|amethyst|sunset)$/.test(pack)) d.setAttribute("data-theme", pack);
  } catch {}
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${cairo.variable} ${geistSans.variable} ${geistMono.variable} ${inter.variable} ${notoSc.variable} ${notoJp.variable} ${notoDeva.variable}`}
    >
      <body className="antialiased bg-background text-foreground">
        <script dangerouslySetInnerHTML={{ __html: PREFS_BOOTSTRAP }} />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <I18nProvider>
            <ThemePackProvider>
              {children}
              <SonnerToaster />
            </ThemePackProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

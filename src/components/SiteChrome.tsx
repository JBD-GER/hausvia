"use client";

import { usePathname } from "next/navigation";
import { CookieBanner } from "@/components/CookieBanner";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { MobileStickyCTA } from "@/components/MobileStickyCTA";

const appPrefixes = ["/admin", "/app", "/portal"];
const authPrefixes = ["/login", "/forgot-password", "/reset-password", "/onboarding", "/set-password", "/auth"];

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hidePublicChrome = [...appPrefixes, ...authPrefixes].some((prefix) => matchesPrefix(pathname, prefix));

  if (hidePublicChrome) {
    return <div className="flex-1">{children}</div>;
  }

  return (
    <>
      <Header />
      <div className="flex-1 pb-16 md:pb-0">{children}</div>
      <Footer />
      <MobileStickyCTA />
      <CookieBanner />
    </>
  );
}

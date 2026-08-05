import Image from "next/image";
import Link from "next/link";
import { ASSETS } from "@/lib/site";

export function Logo({ compact = false, href = "/" }: { compact?: boolean; href?: string }) {
  if (compact) {
    return (
      <Link href={href} className="inline-flex items-center gap-3" aria-label="Hausvia Startseite">
        <Image
          src={ASSETS.mark}
          alt="Hausvia Bildmarke"
          width={44}
          height={44}
          preload
          className="h-11 w-11"
        />
      </Link>
    );
  }

  return (
    <Link href={href} className="inline-flex items-center" aria-label="Hausvia Startseite">
      <Image
        src={ASSETS.logo}
        alt="Hausvia"
        width={177}
        height={40}
        preload
        className="w-auto"
        style={{ height: "2rem", width: "auto" }}
      />
    </Link>
  );
}

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
          priority
          className="h-11 w-11"
        />
      </Link>
    );
  }

  return (
    <Link href={href} className="inline-flex items-center gap-2.5" aria-label="Hausvia Startseite">
      <Image
        src={ASSETS.mark}
        alt="Hausvia Bildmarke"
        width={46}
        height={46}
        priority
        className="h-10 w-10 sm:h-11 sm:w-11"
      />
      <span className="flex flex-col leading-none">
        <span className="text-lg font-extrabold tracking-normal text-brand sm:text-xl">Hausvia</span>
        <span className="mt-1 text-[8px] font-bold uppercase tracking-[0.18em] text-slate-500 sm:text-[9px]">
          Hausmeisterservice
        </span>
      </span>
    </Link>
  );
}

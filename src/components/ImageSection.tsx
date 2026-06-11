import Image from "next/image";
import { CheckCircle2 } from "lucide-react";

export function ImageSection({
  title,
  text,
  image,
  imageAlt,
  points,
  reverse = false,
}: {
  title: string;
  text: string;
  image: string;
  imageAlt: string;
  points: string[];
  reverse?: boolean;
}) {
  return (
    <section className="bg-white">
      <div
        className={`mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:px-8 ${
          reverse ? "lg:[&>*:first-child]:order-2" : ""
        }`}
      >
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100 shadow-sm">
          <Image
            src={image}
            alt={imageAlt}
            width={900}
            height={700}
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="aspect-[4/3] w-full object-cover"
          />
        </div>
        <div>
          <h2 className="text-3xl font-extrabold leading-tight text-slate-950">{title}</h2>
          <p className="mt-4 text-base leading-7 text-slate-700">{text}</p>
          <ul className="mt-6 grid gap-3">
            {points.map((point) => (
              <li key={point} className="flex gap-3 text-sm font-semibold text-slate-750">
                <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 flex-none text-green-700" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";
import { blogCategories, type BlogPost } from "@/lib/site";

export function BlogCard({ post }: { post: BlogPost }) {
  const category = blogCategories.find((item) => item.slug === post.category);

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md">
      <Link href={`/ratgeber/${post.slug}`} className="block overflow-hidden">
        <Image
          src={post.image}
          alt={post.imageAlt}
          width={900}
          height={506}
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="aspect-video w-full object-cover transition duration-300 group-hover:scale-[1.02]"
        />
      </Link>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-3 text-xs font-bold uppercase tracking-wide text-slate-500">
          <Link href={`/ratgeber/kategorie/${post.category}`} className="text-brand hover:text-brand-dark">
            {category?.label ?? "Ratgeber"}
          </Link>
          <span className="inline-flex items-center gap-1">
            <Clock aria-hidden="true" className="h-3.5 w-3.5" />
            {post.readTime}
          </span>
        </div>
        <h2 className="mt-3 text-xl font-extrabold leading-snug text-slate-950">
          <Link href={`/ratgeber/${post.slug}`} className="hover:text-brand">
            {post.h1}
          </Link>
        </h2>
        <p className="mt-3 flex-1 text-sm leading-7 text-slate-650">{post.excerpt}</p>
        <Link
          href={`/ratgeber/${post.slug}`}
          className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-brand"
        >
          Ratgeber zu {category?.label ?? "Hausmeisterservice"} lesen
          <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </div>
    </article>
  );
}

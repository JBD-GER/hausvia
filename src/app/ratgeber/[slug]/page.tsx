import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogPostView } from "@/components/BlogPostView";
import { blogPosts, findBlogPost } from "@/lib/site";
import { metadataForPage } from "@/lib/seo";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = findBlogPost(slug);

  if (!post) return {};

  return metadataForPage({
    title: post.title,
    description: post.description,
    path: `/ratgeber/${post.slug}`,
    image: post.image,
    imageAlt: post.imageAlt,
    keywords: [post.h1, post.title, "Hausvia Ratgeber"],
  });
}

export default async function RatgeberPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = findBlogPost(slug);

  if (!post) {
    notFound();
  }

  return <BlogPostView post={post} />;
}

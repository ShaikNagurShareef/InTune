import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <h1 className="font-display text-4xl font-semibold">Not available</h1>
      <p className="mt-3 text-lg text-ink-2">This page doesn’t exist, or you don’t have access to it.</p>
      <Link href="/circles" className="mt-6 inline-flex min-h-11 items-center font-bold text-teal underline underline-offset-4">Go to your circles</Link>
    </div>
  );
}

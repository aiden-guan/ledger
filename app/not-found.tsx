import Link from "next/link";
import { Logo } from "@/components/layout/app-header";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <Logo />
      <h1 className="display mt-8 text-[30px]">This page does not exist.</h1>
      <p className="mt-2 text-sm text-muted-foreground">The finding may belong to an investigation that was reset.</p>
      <Link href="/" className="mt-6 text-sm font-medium underline underline-offset-4">
        Back to overview
      </Link>
    </main>
  );
}

"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <p className="text-[13px] font-medium uppercase tracking-wider text-negative">System error</p>
      <h1 className="mt-3 text-xl font-semibold">Something went wrong loading this page.</h1>
      <p className="mt-2 text-sm text-muted-foreground">Your data is unchanged. Try again, and check that the database is reachable if this persists.</p>
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}

"use client";

import { RouteErrorFallback } from '@/components/RouteErrorFallback';

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <RouteErrorFallback error={error} label="Global application error" />
      </body>
    </html>
  );
}
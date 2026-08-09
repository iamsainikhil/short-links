"use client";

import { RouteErrorFallback } from '@/components/RouteErrorFallback';

export default function RouteErrorBoundary({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorFallback error={error} label="Unhandled route error" />;
}
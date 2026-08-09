"use client";

import { useEffect } from 'react';
import ErrorPage from '@/views/Error';

export function RouteErrorFallback({
  error,
  label,
}: {
  error: Error & { digest?: string };
  label: string;
}) {
  useEffect(() => {
    console.error(`${label}:`, error);
  }, [error, label]);

  return <ErrorPage reason="page_error" />;
}
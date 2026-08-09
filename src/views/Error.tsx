"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Lottie from 'lottie-react';
import { Icon } from '@iconify/react';
import { Button } from '@/components/ui/button';

type ErrorReason =
  | 'page_not_found'
  | 'page_error'
  | 'link_not_found'
  | 'link_disabled'
  | 'link_invalid'
  | 'link_error';

const errorContent: Record<ErrorReason, { title: string; description: string }> = {
  page_not_found: {
    title: 'Page not found',
    description: "This page doesn't exist, or the link you used is broken or outdated.",
  },
  page_error: {
    title: 'Something went wrong',
    description: "We couldn't load this page. Please try again or head back home.",
  },
  link_not_found: {
    title: 'Link not found',
    description: "This short link doesn't exist or may have been removed.",
  },
  link_disabled: {
    title: 'Link disabled',
    description: 'This short link has been deactivated and is no longer forwarding anywhere.',
  },
  link_invalid: {
    title: 'Invalid short link',
    description: 'This short link appears to be malformed or points to a blocked destination.',
  },
  link_error: {
    title: 'Something went wrong',
    description: "We couldn't process this redirect. Please try again later.",
  },
};

export default function Error({ reason }: { reason?: string }) {
  const normalizedReason = (reason as ErrorReason) || 'page_error';
  const content = errorContent[normalizedReason] ?? errorContent.page_error;

  const [animationData, setAnimationData] = useState<object | null>(null);

  useEffect(() => {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
    fetch(`${basePath}/404-error.json`)
      .then((r) => r.json())
      .then(setAnimationData)
      .catch(() => {
        // Animation failed to load — the page still works without it.
      });
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {animationData && (
        <div className="absolute inset-0 overflow-hidden">
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 'max(100vw, 100vh)',
              height: 'max(100vw, 100vh)',
            }}
          >
            <Lottie animationData={animationData} loop autoplay style={{ width: '100%', height: '100%' }} />
          </div>
        </div>
      )}

      {/* Overlay content */}
      <div className="relative flex min-h-screen flex-col items-center justify-end gap-4 px-4 pb-16 text-center">
        <div className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-background/80 px-8 py-6 shadow-xl backdrop-blur-md">
          <div className="space-y-1">
            <h1 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">
              {content.title}
            </h1>
            <p className="text-sm text-muted-foreground">{content.description}</p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild className="rounded-full">
              <Link href="/">
                <Icon icon="lucide:home" className="h-4 w-4" />
                Go home
              </Link>
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => window.history.back()}
            >
              <Icon icon="lucide:refresh-cw" className="h-4 w-4" />
              Go back
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
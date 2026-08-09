"use client";

import { useEffect } from 'react';

const RECOVERY_KEY = 'qr_canvas_runtime_recovery_done';

const shouldRecover = (message: string) => {
  const value = message.toLowerCase();
  return (
    value.includes("reading 'call'") ||
    value.includes('chunkloaderror') ||
    value.includes('loading chunk') ||
    value.includes('failed to fetch dynamically imported module')
  );
};

export function RuntimeRecovery() {
  useEffect(() => {
    const attemptRecovery = () => {
      if (sessionStorage.getItem(RECOVERY_KEY) === '1') return;
      sessionStorage.setItem(RECOVERY_KEY, '1');
      window.location.reload();
    };

    const onError = (event: ErrorEvent) => {
      const message = event.message || event.error?.message || '';
      if (shouldRecover(message)) {
        attemptRecovery();
      }
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        typeof reason === 'string'
          ? reason
          : reason?.message || reason?.toString?.() || '';

      if (shouldRecover(message)) {
        attemptRecovery();
      }
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);

  return null;
}

export const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

const LINK_REASON_MAP: Record<string, string> = {
  not_found: 'link_not_found',
  disabled: 'link_disabled',
  invalid: 'link_invalid',
  error: 'link_error',
};

export const resolveLinkErrorReason = (
  reason: string | string[] | undefined | null,
): string => {
  const value = Array.isArray(reason) ? reason[0] : reason;
  return (value && LINK_REASON_MAP[value]) || 'link_error';
};
import { formatDistanceToNow } from 'date-fns';

export const timeAgo = (value: string | null) => {
  if (!value) return 'Never';
  return formatDistanceToNow(new Date(value), { addSuffix: true });
};

export const referrerHost = (referrer: string): string => {
  if (!referrer) return '';
  try {
    return new URL(referrer).hostname || '';
  } catch {
    return referrer.slice(0, 40);
  }
};
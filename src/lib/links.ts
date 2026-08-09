export interface ShortLinkStats {
  clickCount: number;
  uniqueVisitors: number;
  lastClickAt: string | null;
}

export interface ShortLink {
  slug: string;
  ownerUid: string;
  url: string;
  displayUrl: string;
  description: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  movedTo?: string | null;
  stats: ShortLinkStats;
}

export interface NewShortLinkInput {
  slug: string;
  url: string;
  description?: string;
}

export interface ClickEvent {
  id: string;
  slug: string;
  timestamp: string;
  visitorId: string;
  ipHash: string;
  userAgent: string;
  referrer: string;
  country: string;
  region: string;
  city: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
}

const SLUG_PATTERN = /^[a-z0-9-]+$/;

// Slugs that collide with app routes, reserved internals, or public paths.
// _-prefixed slugs are also reserved (_owner, _system, …).
export const RESERVED_SLUGS = new Set([
  'api',
  'admin',
  'auth',
  'dashboard',
  'login',
  'logout',
  'link',
  'link-error',
  'redirect',
  'redirect-error',
  'error',
  'err',
  'www',
  'l',
  'seed',
  'privacy',
  'terms',
  'about',
  'manifest',
  'robots',
  'favicon',
  'sitemap',
]);

export const isValidSlugFormat = (value: string) => {
  const trimmed = value.trim().toLowerCase();
  return trimmed.length >= 3 && trimmed.length <= 50 && SLUG_PATTERN.test(trimmed);
};

export const isReservedSlug = (value: string) => {
  const trimmed = value.trim().toLowerCase();
  return RESERVED_SLUGS.has(trimmed) || trimmed.startsWith('_');
};

/**
 * Validates a slug for the create/edit form. Returns a human-readable error
 * message, or `null` if the slug is acceptable.
 */
export const validateSlug = (value: string): string | null => {
  const trimmed = value.trim().toLowerCase();

  if (!trimmed) {
    return 'Slug is required.';
  }

  if (!SLUG_PATTERN.test(trimmed)) {
    return 'Slug may only contain lowercase letters, numbers, and dashes.';
  }

  if (!isValidSlugFormat(trimmed)) {
    return 'Slug must be between 3 and 50 characters.';
  }

  if (isReservedSlug(trimmed)) {
    return 'That slug is reserved and cannot be used.';
  }

  return null;
};

/**
 * Normalizes the short-code character set with a fully random alphanumeric
 * slug for the "generate slug" button.
 */
export const generateSlug = () => {
  return Math.random().toString(36).slice(2, 10);
};

const hasScheme = (value: string) => /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value);

/**
 * Normalizes a destination URL. Prepends https:// when no scheme is given,
 * rejects non-http(s) protocols (javascript:, data:, file:, …).
 */
export const normalizeUrl = (value: string): string => {
  const trimmed = (value || '').trim();
  if (!trimmed) {
    throw new Error('A destination URL is required.');
  }

  const candidate = hasScheme(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('That destination is not a valid URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http:// and https:// destinations are allowed.');
  }

  return parsed.toString();
};

/**
 * Detect destinations that point back through this app's own /l/ short links,
 * which would cause a redirect loop.
 */
export const isSelfReferentialUrl = (value: string, origin: string, basePath = '') => {
  const lower = value.trim().toLowerCase();
  if (!lower) return false;

  try {
    const parsed = new URL(lower);
    const cleanOrigin = origin.replace(/^https?:\/\//i, '').replace(/\/$/, '');
    const host = cleanOrigin.split('/')[0];

    if (parsed.hostname.toLowerCase() !== host.toLowerCase()) {
      return false;
    }

    const normalizedBase = `${basePath.replace(/\/+$/, '')}/`;
    const path = parsed.pathname.toLowerCase();
    return path === `${normalizedBase}l` || path.startsWith(`${normalizedBase}l/`);
  } catch {
    return false;
  }
};

export const buildShortLinkUrl = (slug: string, origin?: string) => {
  const base = (origin || process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '');
  const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/+$/, '');
  return `${base}${basePath}/l/${slug}`;
};

const hasProtocol = (value: string) => /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value);

export const formatDestinationSummary = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return 'No destination';

  try {
    const normalized = hasProtocol(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(normalized);
    const host = parsed.hostname.replace(/^www\./i, '');
    const path = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname.replace(/\/$/, '') : '';
    const shortPath = path.length > 18 ? `${path.slice(0, 18)}...` : path;

    if (!shortPath) return host;
    return `${host}${shortPath.startsWith('/') ? '' : '/'}${shortPath}`;
  } catch {
    return trimmed.length > 40 ? `${trimmed.slice(0, 37)}...` : trimmed;
  }
};
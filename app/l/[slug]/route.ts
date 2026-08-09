import crypto from 'crypto';

import { FieldValue } from 'firebase-admin/firestore';
import { NextRequest, NextResponse } from 'next/server';

import { getAdminDb } from '@/lib/firebaseAdmin';
import { isSelfReferentialUrl, normalizeUrl } from '@/lib/links';

export const dynamic = 'force-dynamic';

const BOT_UA_RE =
  /bot|crawler|spider|slurp|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegram\/|curl\/|wget\/|python-requests|go-http-client|java\/|headlesschrome|prerender|lighthouse|pagespeed|googleimageproxy|adsbot/i;

const isBot = (ua: string) => BOT_UA_RE.test(ua);

const normalizeIp = (rawIp: string) => {
  if (!rawIp) return 'unknown';
  if (rawIp.includes(':')) {
    return rawIp.split(':').slice(0, 4).join(':');
  }

  const parts = rawIp.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }

  return rawIp;
};

const hashIp = (ip: string) => {
  const salt = process.env.SCAN_IP_HASH_SALT || 'fallback-salt';
  return crypto.createHmac('sha256', salt).update(ip).digest('hex');
};

const getRequestOrigin = (request: NextRequest) => {
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwardedHost || request.headers.get('host')?.split(',')[0]?.trim();

  if (forwardedProto && host) {
    return `${forwardedProto}://${host}`;
  }

  return request.nextUrl.origin;
};

const buildErrorRedirect = (request: NextRequest, reason: string) => {
  const basePath = request.nextUrl.basePath;
  return new URL(`${basePath}/link-error?reason=${reason}`, getRequestOrigin(request)).toString();
};

const extractUtmParams = (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  return {
    utm_source: params.get('utm_source') || '',
    utm_medium: params.get('utm_medium') || '',
    utm_campaign: params.get('utm_campaign') || '',
    utm_term: params.get('utm_term') || '',
    utm_content: params.get('utm_content') || '',
  };
};

const redirectWithNoStore = (location: string, status = 302) => {
  return NextResponse.redirect(location, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
};

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } },
) {
  const slug = (params.slug || '').trim().toLowerCase();
  if (!slug) {
    return redirectWithNoStore(buildErrorRedirect(request, 'invalid'));
  }

  try {
    const db = getAdminDb();
    const linkRef = db.collection('links').doc(slug);
    const linkDoc = await linkRef.get();

    if (!linkDoc.exists) {
      return redirectWithNoStore(buildErrorRedirect(request, 'not_found'));
    }

    const linkData = linkDoc.data() as {
      url: string;
      active?: boolean;
      movedTo?: string;
    };

    // Renamed links: forward to the new slug in a single hop. The click is
    // logged when the new `/l/<slug>` is hit, so it is not recorded here.
    if (linkData.movedTo) {
      if (linkData.movedTo === slug) {
        return redirectWithNoStore(buildErrorRedirect(request, 'invalid'));
      }
      const basePath = request.nextUrl.basePath;
      const query = request.nextUrl.search;
      const target = new URL(`${basePath}/l/${linkData.movedTo}${query}`, getRequestOrigin(request));
      return redirectWithNoStore(target.toString());
    }

    if (linkData.active === false) {
      return redirectWithNoStore(buildErrorRedirect(request, 'disabled'));
    }

    let destination: string;
    try {
      destination = normalizeUrl(linkData.url || '');
    } catch {
      return redirectWithNoStore(buildErrorRedirect(request, 'invalid'));
    }

    // Prevent infinite redirect loops: reject destinations that route back
    // through this app's own `/l/` short links or non-HTTP protocols.
    const basePath = request.nextUrl.basePath;
    if (isSelfReferentialUrl(destination, getRequestOrigin(request), basePath)) {
      return redirectWithNoStore(buildErrorRedirect(request, 'invalid'));
    }

    const userAgent = request.headers.get('user-agent') || '';
    if (isBot(userAgent)) {
      // Skip click tracking for bots – they don't represent real user
      // engagement and would inflate click counts with crawler traffic.
      return redirectWithNoStore(destination);
    }

    const response = redirectWithNoStore(destination);

    const now = new Date().toISOString();
    const visitorId = request.cookies.get('visitor_id')?.value || crypto.randomUUID();
    if (!request.cookies.get('visitor_id')?.value) {
      response.cookies.set('visitor_id', visitorId, {
        httpOnly: true,
        sameSite: 'lax',
        secure: true,
        maxAge: 31536000,
        path: '/',
      });
    }

    const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
    const ipHash = hashIp(normalizeIp(forwardedFor));

    // Helper to get first present header from a list of candidates
    const getHeader = (request: NextRequest, ...names: string[]) => {
      for (const name of names) {
        const value = request.headers.get(name);
        if (value) return value;
      }
      return '';
    };

    const referrer = getHeader(request, 'referer', 'referrer', 'origin') || 'unknown';
    const country = getHeader(request, 'x-vercel-ip-country', 'cf-ipcountry', 'x-forwarded-for') || 'unknown';
    const region = getHeader(request, 'x-vercel-ip-country-region', 'cf-ipregion') || 'unknown';
    const city = getHeader(request, 'x-vercel-ip-city', 'cf-city') || 'unknown';
    const utmParams = extractUtmParams(request);

    try {
      const clicksRef = db.collection('links').doc(slug).collection('clicks');
      const existingVisitor = await clicksRef.where('visitorId', '==', visitorId).limit(1).get();
      const isNewUniqueVisitor = existingVisitor.empty;

      const clickRef = clicksRef.doc();
      await clickRef.set({
        id: clickRef.id,
        slug,
        timestamp: now,
        visitorId,
        ipHash,
        userAgent,
        referrer,
        country,
        region,
        city,
        ...utmParams,
      });

      const statsUpdate: Record<string, unknown> = {
        clickCount: FieldValue.increment(1),
        lastClickAt: now,
      };
      if (isNewUniqueVisitor) {
        statsUpdate.uniqueVisitors = FieldValue.increment(1);
      }

      await linkRef.set(
        {
          updatedAt: now,
          stats: statsUpdate,
        },
        { merge: true },
      );
    } catch (error) {
      console.error('Short link click tracking failed', {
        slug,
        visitorId,
        error,
      });
    }

    return response;
  } catch (error) {
    console.error('Short link redirect lookup failed', {
      slug,
      method: request.method,
      host: request.headers.get('x-forwarded-host') || request.headers.get('host') || 'unknown',
      error: error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : String(error),
    });
    return redirectWithNoStore(buildErrorRedirect(request, 'error'));
  }
}
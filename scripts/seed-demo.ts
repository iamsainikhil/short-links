/**
 * `npm run seed-demo`
 *
 * Upserts the `links/{slug}` documents described in `src/config/exampleLinks.ts`
 * so the public example redirects (`/l/<slug>`) resolve on a fresh deploy.
 *
 * Requires Firebase Admin credentials (`FIREBASE_*`, see .env.example) and the
 * owner UID. The owner UID is read from `app_config/private` if it already
 * exists (set on the first Google sign-in), or from `FIREBASE_OWNER_UID`.
 */
import 'dotenv/config';

import { EXAMPLE_LINKS } from '../src/config/exampleLinks';
import { isReservedSlug, isValidSlugFormat, normalizeUrl } from '../src/lib/links';
import { getAdminDb } from '../src/lib/firebaseAdmin';

if (
  !process.env.FIREBASE_PROJECT_ID ||
  !process.env.FIREBASE_CLIENT_EMAIL ||
  !process.env.FIREBASE_PRIVATE_KEY
) {
  console.error(
    'Missing Firebase Admin env vars. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY',
  );
  process.exit(1);
}

const db = getAdminDb();

async function resolveOwnerUid() {
  const fromEnv = process.env.FIREBASE_OWNER_UID;
  if (fromEnv) return fromEnv;

  const ownerDoc = await db.collection('app_config').doc('private').get();
  const ownerUid = ownerDoc.exists ? ownerDoc.data()?.ownerUid : null;
  if (!ownerUid) {
    throw new Error(
      'No owner found. Sign in once via the dashboard to boot the owner (`app_config/private`), or set FIREBASE_OWNER_UID.',
    );
  }
  return String(ownerUid);
}

async function main() {
  const ownerUid = await resolveOwnerUid();
  console.log(`Owner: ${ownerUid}`);

  let created = 0;
  let updated = 0;

  for (const example of EXAMPLE_LINKS) {
    const slug = example.slug.trim().toLowerCase();

    if (!isValidSlugFormat(slug) || isReservedSlug(slug)) {
      console.warn(`  skip ${slug}: not a valid, allowed slug`);
      continue;
    }

    let url;
    try {
      url = normalizeUrl(example.destinationUrl);
    } catch (error) {
      console.warn(`  skip ${slug}: ${error instanceof Error ? error.message : error}`);
      continue;
    }

    const ref = db.collection('links').doc(slug);
    const existing = await ref.get();
    const now = new Date().toISOString();

    const payload = {
      slug,
      ownerUid,
      url,
      displayUrl: url,
      description: example.description,
      active: true,
      createdAt: existing.exists ? (existing.data()?.createdAt ?? now) : now,
      updatedAt: now,
      stats: existing.exists ? (existing.data()?.stats ?? null) : null,
    };
    if (!payload.stats) {
      payload.stats = { clickCount: 0, uniqueVisitors: 0, lastClickAt: null };
    }

    await ref.set(payload);
    if (existing.exists) {
      updated += 1;
    } else {
      created += 1;
    }
    console.log(`  ${existing.exists ? 'updated' : 'created'} /${slug} → ${url}`);
  }

  console.log(`\nDone. ${created} created, ${updated} updated. Example redirects are live at /l/<slug>.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
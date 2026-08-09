import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  writeBatch,
  setDoc,
} from 'firebase/firestore';

import { firestore } from '@/integrations/firebase/client';
import {
  ClickEvent,
  NewShortLinkInput,
  ShortLink,
  generateSlug,
  normalizeUrl,
  validateSlug,
} from '@/lib/links';

const requireFirestore = () => {
  if (!firestore) {
    throw new Error('Firebase is not configured. Please set NEXT_PUBLIC_FIREBASE_* env vars and restart.');
  }

  return firestore;
};

const linksCollectionSafe = () => collection(requireFirestore(), 'links');
const linkDocSafe = (slug: string) => doc(requireFirestore(), 'links', slug);
const clicksCollectionSafe = (slug: string) => collection(requireFirestore(), 'links', slug, 'clicks');

const nowIso = () => new Date().toISOString();

export const buildLinkDocument = ({
  slug,
  ownerUid,
  url,
  description,
  active = true,
}: {
  slug: string;
  ownerUid: string;
  url: string;
  description?: string;
  active?: boolean;
}): ShortLink => {
  const normalized = normalizeUrl(url);
  const timestamp = nowIso();

  return {
    slug,
    ownerUid,
    url: normalized,
    displayUrl: normalized,
    description: (description || '').trim(),
    active,
    createdAt: timestamp,
    updatedAt: timestamp,
    stats: {
      clickCount: 0,
      uniqueVisitors: 0,
      lastClickAt: null,
    },
  };
};

export const slugExists = async (slug: string) => {
  const document = await getDoc(linkDocSafe(slug.trim().toLowerCase()));
  return document.exists();
};

export const generateUniqueSlug = async () => {
  for (let attempts = 0; attempts < 8; attempts += 1) {
    const candidate = generateSlug();
    if (!(await slugExists(candidate))) {
      return candidate;
    }
  }

  throw new Error('Could not allocate a unique slug, please try again.');
};

export const createLinkForOwner = async (
  ownerUid: string,
  input: NewShortLinkInput,
): Promise<ShortLink> => {
  const slug = input.slug.trim().toLowerCase();

  const slugError = validateSlug(slug);
  if (slugError) {
    throw new Error(slugError);
  }

  if (await slugExists(slug)) {
    throw new Error('That slug is already in use, pick another one.');
  }

  const document = buildLinkDocument({
    slug,
    ownerUid,
    url: input.url,
    description: input.description,
  });

  await setDoc(linkDocSafe(slug), document);
  return document;
};

export const updateLinkForOwner = async ({
  slug,
  url,
  description,
}: {
  slug: string;
  url: string;
  description: string;
}): Promise<ShortLink> => {
  const current = await getDoc(linkDocSafe(slug));
  if (!current.exists()) {
    throw new Error('This link no longer exists.');
  }

  const existing = current.data() as ShortLink;
  const normalized = normalizeUrl(url);
  const updated: ShortLink = {
    ...existing,
    url: normalized,
    displayUrl: normalized,
    description: description.trim(),
    updatedAt: nowIso(),
  };

  await setDoc(linkDocSafe(slug), updated);
  return updated;
};

export const renameLinkForOwner = async ({
  slug,
  newSlug,
}: {
  slug: string;
  newSlug: string;
}): Promise<void> => {
  const renamed = newSlug.trim().toLowerCase();

  const slugError = validateSlug(renamed);
  if (slugError) {
    throw new Error(slugError);
  }

  if (renamed === slug) {
    throw new Error('That is the same slug.');
  }

  if (await slugExists(renamed)) {
    throw new Error('That slug is already in use, pick another one.');
  }

  const current = await getDoc(linkDocSafe(slug));
  if (!current.exists()) {
    throw new Error('This link no longer exists.');
  }

  const existing = current.data() as ShortLink;
  const moved: ShortLink = {
    ...existing,
    slug: renamed,
    updatedAt: nowIso(),
  };
  delete (moved as { movedTo?: string | null }).movedTo;

  await setDoc(linkDocSafe(renamed), moved);

  // Old slug marks where it moved so the redirect handler can 302 it.
  await setDoc(linkDocSafe(slug), {
    slug,
    ownerUid: existing.ownerUid,
    movedTo: renamed,
    updatedAt: nowIso(),
  });
};

export const setLinkActiveForOwner = async (slug: string, active: boolean) => {
  await setDoc(
    linkDocSafe(slug),
    {
      active,
      updatedAt: nowIso(),
    },
    { merge: true },
  );
};

const deleteClicksForLink = async (slug: string) => {
  const snapshot = await getDocs(clicksCollectionSafe(slug));
  if (snapshot.empty) return;

  const db = requireFirestore();
  const docs = snapshot.docs;
  const batchSize = 400;

  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = writeBatch(db);
    const chunk = docs.slice(i, i + batchSize);
    chunk.forEach((clickDoc) => batch.delete(clickDoc.ref));
    await batch.commit();
  }
};

export const deleteLinkForOwner = async (slug: string) => {
  await deleteClicksForLink(slug);
  await deleteDoc(linkDocSafe(slug));
};

export const subscribeToOwnerLinks = (
  onData: (items: ShortLink[]) => void,
  onError?: (error: Error) => void,
) => {
  const linksQuery = query(linksCollectionSafe(), orderBy('createdAt', 'desc'), limit(300));

  return onSnapshot(
    linksQuery,
    (snapshot) => {
      const items = snapshot.docs.map((entry) => entry.data() as ShortLink);
      onData(items);
    },
    (error) => {
      if (onError) onError(error);
    },
  );
};

export const fetchClickEvents = async (slug: string, maxCount = 500): Promise<ClickEvent[]> => {
  const clicksQuery = query(clicksCollectionSafe(slug), orderBy('timestamp', 'desc'), limit(maxCount));
  const snapshot = await getDocs(clicksQuery);
  return snapshot.docs.map((d) => d.data() as ClickEvent);
};
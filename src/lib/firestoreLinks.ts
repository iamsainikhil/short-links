import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  writeBatch,
  setDoc,
} from 'firebase/firestore';

import { firestore } from '@/integrations/firebase/client';
import {
  ClickEvent,
  LinkFolder,
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
const foldersCollectionSafe = () => collection(requireFirestore(), 'folders');
const folderDocSafe = (folderId: string) => doc(requireFirestore(), 'folders', folderId);

const nowIso = () => new Date().toISOString();

export const buildLinkDocument = ({
  slug,
  ownerUid,
  url,
  description,
  active = true,
  folderIds = [],
}: {
  slug: string;
  ownerUid: string;
  url: string;
  description?: string;
  active?: boolean;
  folderIds?: string[];
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
    folderIds: normalizeFolderIds(folderIds),
  };
};

export const slugExists = async (slug: string) => {
  const document = await getDoc(linkDocSafe(slug.trim().toLowerCase()));
  return document.exists();
};

const normalizeFolderIds = (ids: string[] | undefined) => {
  return Array.from(
    new Set(
      (ids || []).filter(
        (id): id is string => typeof id === 'string' && Boolean(id.trim()),
      ),
    ),
  ).sort();
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
    folderIds: input.folderIds,
  });

  await setDoc(linkDocSafe(slug), document);
  return document;
};

export const updateLinkForOwner = async ({
  slug,
  url,
  description,
  folderIds,
}: {
  slug: string;
  url: string;
  description: string;
  folderIds?: string[];
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
    folderIds:
      folderIds === undefined ? (existing.folderIds || []) : normalizeFolderIds(folderIds),
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

export const setLinkFoldersForOwner = async (
  slug: string,
  folderIds: string[],
): Promise<void> => {
  const normalized = normalizeFolderIds(folderIds);

  if (normalized.length === 0) {
    await setDoc(
      linkDocSafe(slug),
      { folderIds: [], updatedAt: nowIso() },
      { merge: true },
    );
    return;
  }

  const current = await getDoc(linkDocSafe(slug));
  if (!current.exists()) {
    throw new Error('This link no longer exists.');
  }

  await setDoc(
    linkDocSafe(slug),
    {
      folderIds: normalized,
      updatedAt: nowIso(),
    },
    { merge: true },
  );
};

export const subscribeToOwnerFolders = (
  onData: (items: LinkFolder[]) => void,
  onError?: (error: Error) => void,
) => {
  const foldersQuery = query(foldersCollectionSafe(), orderBy('name', 'asc'));

  return onSnapshot(
    foldersQuery,
    (snapshot) => {
      const items = snapshot.docs.map((entry) => {
        const folder = entry.data() as LinkFolder;
        return { ...folder, id: entry.id };
      });
      onData(items);
    },
    (error) => {
      if (onError) onError(error);
    },
  );
};

export const createFolderForOwner = async (
  ownerUid: string,
  name: string,
): Promise<LinkFolder> => {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Folder name is required.');
  }
  if (trimmed.length > 40) {
    throw new Error('Folder names can be at most 40 characters.');
  }

  const timestamp = nowIso();
  const folder: LinkFolder = {
    id: '',
    ownerUid,
    name: trimmed,
    createdAt: timestamp,
    updatedAt: timestamp,
    sortOrder: Date.now(),
  };

  const ref = await addDoc(foldersCollectionSafe(), {
    ownerUid,
    name: trimmed,
    createdAt: timestamp,
    updatedAt: timestamp,
    sortOrder: Date.now(),
  });

  return {
    ...folder,
    id: ref.id,
    updatedAt: nowIso(),
  };
};

export const reorderFoldersForOwner = async (
  updates: Record<string, number>,
): Promise<void> => {
  const entries = Object.entries(updates);
  if (entries.length === 0) return;

  const db = requireFirestore();
  const batch = writeBatch(db);
  for (const [folderId, sortOrder] of entries) {
    batch.update(folderDocSafe(folderId), {
      sortOrder,
      updatedAt: nowIso(),
    });
  }
  await batch.commit();
};

export const renameFolderForOwner = async (
  folderId: string,
  name: string,
): Promise<void> => {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Folder name is required.');
  }
  if (trimmed.length > 40) {
    throw new Error('Folder names can be at most 40 characters.');
  }

  await setDoc(
    folderDocSafe(folderId),
    {
      name: trimmed,
      updatedAt: nowIso(),
    },
    { merge: true },
  );
};

export const deleteFolderForOwner = async (folderId: string): Promise<void> => {
  await deleteDoc(folderDocSafe(folderId));

  const snapshot = await getDocs(
    query(linksCollectionSafe(), where('folderIds', 'array-contains', folderId)),
  );
  if (snapshot.empty) return;

  const db = requireFirestore();
  const batchSize = 400;

  for (let i = 0; i < snapshot.docs.length; i += batchSize) {
    const batch = writeBatch(db);
    const chunk = snapshot.docs.slice(i, i + batchSize);
    chunk.forEach((linkDoc) => {
      const folderIds = ((linkDoc.data().folderIds as string[]) || []).filter(
        (id) => id !== folderId,
      );
      batch.update(linkDoc.ref, { folderIds, updatedAt: nowIso() });
    });
    await batch.commit();
  }
};

const chunk = <T,>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

export const setLinksFoldersForOwner = async (
  slugs: string[],
  folderIds: string[],
): Promise<void> => {
  const db = requireFirestore();
  const normalized = normalizeFolderIds(folderIds);

  const chunks = chunk(slugs, 400);
  for (const group of chunks) {
    const batch = writeBatch(db);
    group.forEach((slug) => {
      batch.update(linkDocSafe(slug), {
        folderIds: normalized,
        updatedAt: nowIso(),
      });
    });
    await batch.commit();
  }
};

export const setLinksActiveForOwner = async (
  slugs: string[],
  active: boolean,
): Promise<void> => {
  const db = requireFirestore();
  const chunks = chunk(slugs, 400);
  for (const group of chunks) {
    const batch = writeBatch(db);
    group.forEach((slug) => {
      batch.update(linkDocSafe(slug), {
        active,
        updatedAt: nowIso(),
      });
    });
    await batch.commit();
  }
};

export const deleteLinksForOwner = async (slugs: string[]): Promise<void> => {
  for (const slug of slugs) {
    await deleteClicksForLink(slug);
  }

  const db = requireFirestore();
  const chunks = chunk(slugs, 400);
  for (const group of chunks) {
    const batch = writeBatch(db);
    group.forEach((slug) => batch.delete(linkDocSafe(slug)));
    await batch.commit();
  }
};

export const fetchClickEvents = async (slug: string, maxCount = 500): Promise<ClickEvent[]> => {
  const clicksQuery = query(clicksCollectionSafe(slug), orderBy('timestamp', 'desc'), limit(maxCount));
  const snapshot = await getDocs(clicksQuery);
  return snapshot.docs.map((d) => d.data() as ClickEvent);
};
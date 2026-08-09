import { User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

import { firestore } from '@/integrations/firebase/client';

export const privateModeEnabled = process.env.NEXT_PUBLIC_PRIVATE_MODE === 'true';

export type PrivateOwnerAccessResult = {
  allowed: boolean;
  ownerConfigured: boolean;
  reason: string | null;
  detail: string | null;
};

export async function verifyPrivateOwnerAccess(user: User): Promise<PrivateOwnerAccessResult> {
  if (!firestore) {
    return {
      allowed: false,
      ownerConfigured: true,
      reason: 'firebase-not-configured',
      detail: 'Firestore client is not configured for this deployment.',
    };
  }

  try {
    const ownerDocRef = doc(firestore, 'app_config', 'private');
    const ownerDoc = await getDoc(ownerDocRef);

    if (!ownerDoc.exists()) {
      await setDoc(ownerDocRef, {
        ownerUid: user.uid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      return {
        allowed: true,
        ownerConfigured: true,
        reason: null,
        detail: null,
      };
    }

    const ownerData = ownerDoc.data();
    const ownerUid = typeof ownerData?.ownerUid === 'string' ? ownerData.ownerUid : '';

    if (!ownerUid) {
      return {
        allowed: false,
        ownerConfigured: false,
        reason: 'owner-doc-invalid',
        detail: 'app_config/private exists but ownerUid is missing.',
      };
    }

    if (ownerUid && ownerUid !== user.uid) {
      return {
        allowed: false,
        ownerConfigured: true,
        reason: 'owner-uid-mismatch',
        detail: null,
      };
    }

    return {
      allowed: true,
      ownerConfigured: true,
      reason: null,
      detail: null,
    };
  } catch (error) {
    return {
      allowed: false,
      ownerConfigured: true,
      reason: 'owner-config-read-failed',
      detail: error instanceof Error ? error.message : 'Unknown Firestore error',
    };
  }
}
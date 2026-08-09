import { firebaseAuth } from '@/integrations/firebase/client';

export const getCurrentOwnerUid = () => {
  if (!firebaseAuth) return null;

  return firebaseAuth.currentUser?.uid ?? null;
};
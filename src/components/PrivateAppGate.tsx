import { PropsWithChildren, useCallback, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { Icon } from '@iconify/react';

import {
  firebaseAuth,
  googleProvider,
  isFirebaseConfigured,
  missingFirebaseClientEnv,
} from '@/integrations/firebase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useToast } from '@/hooks/use-toast';
import { errorMessage } from '@/lib/errors';
import { privateModeEnabled, verifyPrivateOwnerAccess } from '@/lib/privateOwner';

const PRIVATE_MODE = privateModeEnabled;
const GITHUB_REPO = 'https://github.com/iamsainikhil/short-links';

function GateHeader() {
  return (
    <div className="fixed left-0 right-0 top-0 z-50 flex items-center justify-between border-b border-border bg-card px-5 py-4">
      <a href="/" className="flex items-center gap-3">
        <img src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/logo.svg`} alt="Short Links" className="h-12 w-12 rounded-xl" />
        <div>
          <h1 className="font-heading text-xl font-bold text-foreground">Short Links</h1>
          <p className="hidden text-sm text-muted-foreground sm:block">URL shortener with click analytics</p>
        </div>
      </a>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <a
          href={GITHUB_REPO}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <Icon icon="line-md:github" height="2em" />
        </a>
      </div>
    </div>
  );
}

function GateFooter() {
  return (
    <div className="absolute bottom-0 left-0 right-0 border-t border-border/30 px-4 py-3">
      <p className="text-center text-xs text-muted-foreground">
        This is a private deployment.{' '}
        <a
          href={GITHUB_REPO}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 transition-colors hover:text-foreground"
        >
          Fork on GitHub
        </a>{' '}
        to self-host with your own owner account.
      </p>
    </div>
  );
}

function formatPrivateReason(reason: string | null) {
  if (!reason) return null;

  const reasonMap: Record<string, string> = {
    'firebase-not-configured': 'Firebase client configuration is missing for this deployment.',
    'owner-doc-invalid': 'Owner lock document is malformed. Recreate app_config/private with ownerUid.',
    'owner-uid-mismatch': 'This Firebase project is already locked to another owner account.',
    'owner-config-read-failed': 'Private owner verification failed while reading Firestore.',
  };

  return reasonMap[reason] ?? `Private mode check failed: ${reason}`;
}

function PrivateAccessSetupError({
  reason,
  detail,
}: {
  reason: string | null;
  detail: string | null;
}) {
  const missing = missingFirebaseClientEnv.join(', ');
  const reasonText = formatPrivateReason(reason);

  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      <GateHeader />
      <main className="flex flex-1 items-center justify-center p-4 pt-20">
        <Card className="w-full max-w-xl border-destructive/40">
          <CardHeader className="text-center">
            <CardTitle className="font-heading text-2xl">Private mode needs setup</CardTitle>
            <CardDescription>
              Set Firebase client env vars.
            </CardDescription>
          </CardHeader>
          {reasonText ? (
            <CardContent className="text-center text-sm text-destructive">
              {reasonText}
              {detail ? (
                <p className="mt-2 break-words text-xs text-muted-foreground">Detail: {detail}</p>
              ) : null}
            </CardContent>
          ) : null}
          {missing ? (
            <CardContent className="text-center text-sm text-muted-foreground">
              Missing: {missing}
            </CardContent>
          ) : null}
          <CardContent className="text-center">
            <p className="text-xs text-muted-foreground">
              See the{' '}
              <a
                href={GITHUB_REPO}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 transition-colors hover:text-foreground"
              >
                GitHub repo
              </a>{' '}
              for setup instructions.
            </p>
          </CardContent>
        </Card>
      </main>
      <GateFooter />
    </div>
  );
}

function AccessDenied({
  onSignOut,
  reason,
  detail,
}: {
  onSignOut: () => Promise<void>;
  reason: string | null;
  detail: string | null;
}) {
  const reasonText = formatPrivateReason(reason);

  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      <GateHeader />
      <main className="flex flex-1 items-center justify-center p-4 pt-20">
        <Card className="w-full max-w-xl border-destructive/40">
          <CardHeader className="text-center">
            <CardTitle className="font-heading text-2xl">Access denied</CardTitle>
            <CardDescription>
              This deployment is restricted to one owner account.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            {reasonText ? (
              <p className="text-center text-xs text-destructive">
                {reasonText}
                {detail ? (
                  <span className="mt-1 block break-words text-muted-foreground">Detail: {detail}</span>
                ) : null}
              </p>
            ) : null}
            <Button variant="outline" className="rounded-full" onClick={onSignOut}>
              <Icon icon="line-md:logout" className="h-4 w-4" />
              Sign out
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Want your own instance?{' '}
              <a
                href={GITHUB_REPO}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 transition-colors hover:text-foreground"
              >
                Self-host on GitHub
              </a>
              .
            </p>
          </CardContent>
        </Card>
      </main>
      <GateFooter />
    </div>
  );
}

function PrivateSignIn({
  signingIn,
  onSignIn,
}: {
  signingIn: boolean;
  onSignIn: () => Promise<void>;
}) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background">
      <GateHeader />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 20% 20%, rgba(37,99,235,0.10), transparent 45%), radial-gradient(circle at 80% 80%, rgba(34,197,94,0.10), transparent 45%)',
        }}
      />
      <main className="relative z-10 flex flex-1 items-center justify-center p-4 pt-20">
        <Card className="w-full max-w-xl border-border/70 bg-card/95 backdrop-blur">
          <CardHeader className="items-center text-center">
            <div className="mb-2 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary">
              <Icon icon="solar:lock-outline" className="h-5 w-5 text-foreground" />
            </div>
            <CardTitle className="font-heading text-3xl">Dashboard</CardTitle>
            <CardDescription>
              Sign in with Google using your owner account.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <Button onClick={onSignIn} className="h-11 w-full max-w-xs rounded-full" disabled={signingIn}>
              {signingIn ? (
                <>
                  <Icon icon="bx:loader-circle" className="h-4 w-4 animate-spin" />
                  Signing in
                </>
              ) : (
                <>
                  <Icon icon="solar:shield-check-outline" className="h-4 w-4" />
                  Continue with Google
                </>
              )}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Access is restricted to the owner account of this Firebase project.
            </p>
          </CardContent>
        </Card>
      </main>
      <GateFooter />
    </div>
  );
}

export function PrivateAppGate({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(PRIVATE_MODE);
  const [signingIn, setSigningIn] = useState(false);
  const [ownerConfigured, setOwnerConfigured] = useState(true);
  const [ownerAllowed, setOwnerAllowed] = useState(false);
  const [ownerCheckReason, setOwnerCheckReason] = useState<string | null>(null);
  const [ownerCheckDetail, setOwnerCheckDetail] = useState<string | null>(null);
  const { toast } = useToast();

  const verifyOwnerAccess = useCallback(async (nextUser: User) => {
    const result = await verifyPrivateOwnerAccess(nextUser);
    setOwnerConfigured(result.ownerConfigured);
    setOwnerAllowed(result.allowed);
    setOwnerCheckReason(result.reason);
    setOwnerCheckDetail(result.detail);

    if (!result.allowed && result.reason === 'owner-uid-mismatch') {
      await signOut(firebaseAuth);
      setUser(null);
      toast({
        title: 'Owner mismatch',
        description: 'This Firebase project is already locked to another owner account.',
        variant: 'destructive',
      });
    }
  }, [toast]);

  useEffect(() => {
    if (!PRIVATE_MODE) return;

    if (!firebaseAuth) {
      setChecking(false);
      return;
    }

    const timeout = window.setTimeout(() => {
      setChecking(false);
    }, 7000);

    const unsubscribe = onAuthStateChanged(firebaseAuth, async (nextUser) => {
      window.clearTimeout(timeout);
      setUser(nextUser);

      if (!nextUser) {
        setOwnerAllowed(false);
        setOwnerCheckReason(null);
        setOwnerCheckDetail(null);
        setChecking(false);
        return;
      }

      setChecking(true);
      await verifyOwnerAccess(nextUser);
      setChecking(false);
    });

    return () => {
      window.clearTimeout(timeout);
      unsubscribe();
    };
  }, [verifyOwnerAccess]);

  const handleSignIn = async () => {
    if (!firebaseAuth || !googleProvider) {
      toast({
        title: 'Firebase not configured',
        description: 'Set Firebase client environment variables and restart dev server.',
        variant: 'destructive',
      });
      return;
    }

    setSigningIn(true);
    try {
      const result = await signInWithPopup(firebaseAuth, googleProvider);
      setUser(result.user);
      setChecking(true);
      await verifyOwnerAccess(result.user);
    } catch (error) {
      const description = errorMessage(error, 'Google sign-in failed');
      toast({
        title: 'Sign-in failed',
        description,
        variant: 'destructive',
      });
    } finally {
      setChecking(false);
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    if (!firebaseAuth) return;

    await signOut(firebaseAuth);
    setUser(null);
  };

  if (!PRIVATE_MODE) {
    return <>{children}</>;
  }

  if (!ownerConfigured || !isFirebaseConfigured) {
    return <PrivateAccessSetupError reason={ownerCheckReason} detail={ownerCheckDetail} />;
  }

  if (checking) {
    return (
      <div className="relative flex min-h-screen flex-col bg-background">
        <GateHeader />
        <main className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-center text-sm text-muted-foreground">
            <Icon icon="bx:loader-circle" className="h-4 w-4 animate-spin" />
            Checking private access
          </div>
        </main>
        <GateFooter />
      </div>
    );
  }

  if (!user) {
    return <PrivateSignIn signingIn={signingIn} onSignIn={handleSignIn} />;
  }

  if (!ownerAllowed) {
    return <AccessDenied onSignOut={handleSignOut} reason={ownerCheckReason} detail={ownerCheckDetail} />;
  }

  return <>{children}</>;
}
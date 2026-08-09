"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { onAuthStateChanged } from "firebase/auth";
import { firebaseAuth, isFirebaseConfigured } from "@/integrations/firebase/client";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import Typewriter from "@/components/fancy/text/typewriter";
import { EXAMPLE_LINKS, LANDING_CONFIG } from "@/config/exampleLinks";
import { buildShortLinkUrl } from "@/lib/links";
import { useToast } from "@/hooks/use-toast";

const GITHUB_REPO = "https://github.com/iamsainikhil/short-links";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <img
            src={`${basePath}/logo.svg`}
            alt=""
            className="h-10 w-10 rounded-xl"
          />
          <div className="flex flex-col">
            <span className="font-heading text-lg font-bold leading-tight text-foreground">
              Short Links
            </span>
            <span className="text-xs text-muted-foreground">
              URL shortener with click analytics
            </span>
          </div>
        </Link>
        <nav className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild variant="outline" className="rounded-full">
            <Link href="/dashboard">
              <Icon icon="lucide:layout-dashboard" className="h-4 w-4" />
              Dashboard
            </Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}

function ExampleLinkCard({
  slug,
  title,
  description,
}: {
  slug: string;
  title: string;
  description: string;
}) {
  const { toast } = useToast();
  const shortUrl = buildShortLinkUrl(slug);

  const copyShortUrl = useCallback(
    async (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      try {
        await navigator.clipboard.writeText(shortUrl);
        toast({
          title: "Copied",
          description: `${shortUrl} copied to clipboard.`,
        });
      } catch {
        toast({
          title: "Copy failed",
          description: "Could not copy the short link.",
          variant: "destructive",
        });
      }
    },
    [shortUrl, toast],
  );

  return (
    <a
      href={`${basePath}/l/${slug}`}
      className="group flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-paper transition-all duration-200 hover:-translate-y-0.5 hover:shadow-paper-lg"
    >
      <div className="flex items-start justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-highlight text-highlight-foreground">
          <Icon icon="lucide:link-2" className="h-5 w-5" />
        </div>
        <button
          onClick={copyShortUrl}
          className="rounded-full p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-secondary hover:text-foreground group-hover:opacity-100"
          title="Copy short link"
        >
          <Icon icon="lucide:copy" className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <h3 className="font-heading text-lg font-bold text-foreground">
          {title}
        </h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-3">
        <code className="truncate rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
          {shortUrl}
        </code>
        <span className="flex items-center gap-1 text-xs font-medium text-primary">
          Visit
          <Icon
            icon="lucide:arrow-right"
            className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
          />
        </span>
      </div>
    </a>
  );
}

export default function Landing() {
  const [checkingAuth, setCheckingAuth] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (!isFirebaseConfigured || !firebaseAuth) {
      setCheckingAuth(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      if (user) {
        // Don't redirect if we're already on the dashboard or if explicitly requested to show landing
        if (window.location.pathname !== '/dashboard' && !window.location.search.includes('showLanding=true')) {
          window.location.href = "/dashboard";
        } else {
          setCheckingAuth(false);
        }
      } else {
        setCheckingAuth(false);
      }
    });

    return () => unsubscribe();
  }, [toast]);

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-center">
          <Icon icon="bx:loader-circle" className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Checking authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-screen flex-col bg-background"
      style={{
        background:
          "radial-gradient(circle at 20% 15%, rgba(37,99,235,0.10), transparent 45%), radial-gradient(circle at 80% 85%, rgba(34,197,94,0.08), transparent 45%)",
      }}
    >
      <SiteHeader />

      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0" />
          <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center px-4 pb-16 pt-16 text-center sm:px-6 sm:pt-24">
            <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <Icon icon="lucide:lock" className="h-3 w-3" />
              Private by default · Fork to self-host
            </span>
<h1 className="font-heading text-4xl font-bold tracking-tight text-foreground sm:text-6xl">
              <span className="sr-only">{LANDING_CONFIG.title}</span>
              <span
                aria-hidden="true"
                className="inline-flex items-baseline gap-1 whitespace-nowrap"
              >
                <span className="shrink-0">{LANDING_CONFIG.title}</span>
                <span className="relative inline-block">
                  <span className="invisible whitespace-nowrap">
                    {LANDING_CONFIG.names.reduce(
                      (a, b) => (b.length > a.length ? b : a),
                      "",
                    )}
                  </span>
                  <span className="absolute inset-y-0 left-2">
                    <Typewriter
                      as="span"
                      text={LANDING_CONFIG.names}
                      speed={70}
                      initialDelay={500}
                      waitTime={1500}
                      deleteSpeed={40}
                      cursorChar="_"
                      className="whitespace-nowrap"
                    />
                  </span>
                </span>
              </span>
            </h1>
            <p className="mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
              {LANDING_CONFIG.description}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg" className="rounded-full">
                <Link href="/dashboard">
                  <Icon icon="lucide:layout-dashboard" className="h-4 w-4" />
                  Open dashboard
                </Link>
              </Button>
              <a href={GITHUB_REPO} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="lg" className="rounded-full">
                  <Icon icon="line-md:github" height="1.4em" />
                  Fork this project
                </Button>
              </a>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <h2 className="font-heading text-2xl font-bold text-foreground">
                Example links
              </h2>
              <p className="text-sm text-muted-foreground">
                Short links to a few of my projects and profiles. They redirect instantly and each
                click is tracked.
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {EXAMPLE_LINKS.map((link) => (
              <ExampleLinkCard
                key={link.slug}
                slug={link.slug}
                title={link.title}
                description={link.description}
              />
            ))}
          </div>
        </section>

        <section>
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-4 px-4 py-16 text-center sm:px-6">
            <h2 className="font-heading text-3xl font-bold text-foreground">
              Fork it, make it yours
            </h2>
            <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
              Fork the repository, wire up your own
              Firebase project and Vercel env vars, and the first Google sign-in
              becomes the owner. Unlimited URL shortening, short links management,
              click analytics and no monthly subscription.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <a href={GITHUB_REPO} target="_blank" rel="noopener noreferrer">
                <Button className="rounded-full">
                  <Icon icon="line-md:github" height="1.4em" />
                  Fork on GitHub
                </Button>
              </a>
              <a
                href={`${GITHUB_REPO}#self-host`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="ghost" className="rounded-full">
                  Read the setup guide
                  <Icon icon="lucide:arrow-right" className="h-4 w-4" />
                </Button>
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="py-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-center gap-3 px-4 text-center text-xs text-muted-foreground sm:flex-row sm:px-6 sm:text-left">
          <p>
            © {new Date().getFullYear()} {LANDING_CONFIG.name}
          </p>
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="flex gap-1 items-center transition-colors hover:text-foreground"
            >
              <Icon icon="lucide:layout-dashboard" className="h-4 w-4" />
              <span>Dashboard</span>
            </Link>
            <a
              href={GITHUB_REPO}
              target="_blank"
              rel="noopener noreferrer"
              className="flex gap-0 items-center transition-colors hover:text-foreground"
            >
              <Icon icon="line-md:github" height="1.6em" />
              <span className="ml-1">Repository</span>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { signOut } from "firebase/auth";
import { firebaseAuth } from "@/integrations/firebase/client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { ClickChart, ChartDay } from "@/components/ClickChart";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getCurrentOwnerUid } from "@/lib/authOwner";
import {
  ClickEvent,
  ShortLink,
  buildShortLinkUrl,
  formatDestinationSummary,
  normalizeUrl,
  validateSlug,
} from "@/lib/links";
import {
  createLinkForOwner,
  deleteLinkForOwner,
  fetchClickEvents,
  generateUniqueSlug,
  renameLinkForOwner,
  setLinkActiveForOwner,
  subscribeToOwnerLinks,
  updateLinkForOwner,
} from "@/lib/firestoreLinks";
import { errorMessage } from "@/lib/errors";
import { referrerHost, timeAgo } from "@/lib/format";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const copyText = async (value: string) => {
  await navigator.clipboard.writeText(value);
};

function DestructiveConfirmDialog({
  trigger,
  title,
  description,
  actionLabel,
  onConfirm,
}: {
  trigger: React.ReactElement;
  title: string;
  description: React.ReactNode;
  actionLabel: string;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent className="max-w-[44rem] rounded-[28px] border-border/70 bg-background px-6 py-7 text-center text-foreground shadow-2xl sm:px-8 sm:py-8">
        <AlertDialogHeader className="items-center space-y-5 sm:text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <Icon icon="lucide:trash-2" className="h-10 w-10" />
          </div>
          <AlertDialogTitle className="text-2xl font-semibold tracking-tight text-foreground">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="max-w-2xl text-base leading-7 text-muted-foreground">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-2 gap-3 border-t border-border pt-5 sm:justify-center sm:space-x-0">
          <AlertDialogCancel className="mt-0 h-12 rounded-full border-border/70 px-8 text-base font-medium text-foreground hover:bg-secondary hover:text-secondary-foreground">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            className="h-12 rounded-full px-8 text-base font-medium"
            onClick={onConfirm}
          >
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const buildChartDays = (
  events: ClickEvent[],
  chartRange: 7 | 30,
): ChartDay[] => {
  const days: ChartDay[] = [];
  for (let i = chartRange - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const label =
      chartRange === 7
        ? d.toLocaleDateString("en-US", { weekday: "short" })
        : i % 5 === 0
          ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
          : "";
    days.push({ label, date: dateStr, count: 0 });
  }
  for (const e of events) {
    const dateStr = e.timestamp.slice(0, 10);
    const day = days.find((d) => d.date === dateStr);
    if (day) day.count++;
  }
  return days;
};

const countBy = (events: ClickEvent[], pick: (e: ClickEvent) => string) => {
  const counts: Record<string, number> = {};
  for (const e of events) {
    const key = pick(e) || "(unknown)";
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
};

function AnalyticsContent({
  link,
  events,
}: {
  link: ShortLink;
  events: ClickEvent[];
}) {
  const [chartRange, setChartRange] = useState<7 | 30>(7);
  const [page, setPage] = useState(0);
  const pageSize = 50;

  useEffect(() => {
    setPage(0);
  }, [events]);

  const uniqueVisitors = useMemo(
    () => new Set(events.map((e) => e.visitorId)).size,
    [events],
  );

  const topCountries = useMemo(
    () =>
      countBy(events, (e) =>
        e.country && e.country !== "unknown" ? e.country : "(unknown)",
      ),
    [events],
  );
  const topRegions = useMemo(
    () =>
      countBy(events, (e) =>
        e.region && e.region !== "unknown"
          ? `${e.country}/${e.region}`
          : "(unknown)",
      ),
    [events],
  );
  const topReferrers = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of events) {
      const host = referrerHost(e.referrer) || "(direct)";
      counts[host] = (counts[host] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [events]);
  const topUtmSources = useMemo(
    () => countBy(events, (e) => e.utm_source || "(none)"),
    [events],
  );

  const chartDays = useMemo(
    () => buildChartDays(events, chartRange),
    [events, chartRange],
  );

  const downloadCsv = () => {
    const headers = [
      "Timestamp",
      "Country",
      "Region",
      "City",
      "Referrer",
      "IP (hashed)",
      "User Agent",
      "UTM Source",
      "UTM Medium",
      "UTM Campaign",
      "UTM Term",
      "UTM Content",
    ];
    const rows = events.map((e) => [
      e.timestamp,
      e.country,
      e.region,
      e.city,
      e.referrer,
      e.ipHash,
      e.userAgent,
      e.utm_source ?? "",
      e.utm_medium ?? "",
      e.utm_campaign ?? "",
      e.utm_term ?? "",
      e.utm_content ?? "",
    ]);
    const csv = [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${link.slug}-clicks.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const totalPages = Math.max(1, Math.ceil(events.length / pageSize));
  const pageEvents = events.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total clicks</CardDescription>
            <CardTitle className="text-2xl">{link.stats.clickCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Unique visitors</CardDescription>
            <CardTitle className="text-2xl">{uniqueVisitors}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Last clicked</CardDescription>
            <CardTitle className="truncate text-2xl">
              {timeAgo(link.stats.lastClickAt)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">
            Clicks over time
          </p>
          <div className="flex rounded-full border border-border text-xs">
            {([7, 30] as const).map((r) => (
              <button
                key={r}
                onClick={() => setChartRange(r)}
                className={`px-3 py-1 first:rounded-l-full last:rounded-r-full transition-colors ${
                  chartRange === r
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {r}d
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-muted/30 p-2">
          <ClickChart days={chartDays} />
        </div>
      </div>

      {events.length === 0 ? (
        <p className="py-2 text-center text-sm text-muted-foreground">
          No click events recorded yet.
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Breakdown label="Top countries" rows={topCountries} />
            <Breakdown label="Top regions" rows={topRegions} />
            <Breakdown label="Top referrers" rows={topReferrers} />
            <Breakdown label="Top UTM sources" rows={topUtmSources} />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Recent events</p>
            <div className="max-h-80 overflow-y-auto rounded-xl border border-border">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="sticky top-0 bg-muted/80 text-muted-foreground backdrop-blur">
                  <tr>
                    <th className="px-3 py-2 font-medium">Time</th>
                    <th className="px-3 py-2 font-medium">Country</th>
                    <th className="px-3 py-2 font-medium">Region</th>
                    <th className="px-3 py-2 font-medium">City</th>
                    <th className="px-3 py-2 font-medium">Referrer</th>
                    <th className="px-3 py-2 font-medium">UTM</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pageEvents.map((e) => (
                    <tr key={e.id} className="align-top">
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                        {timeAgo(e.timestamp)}
                      </td>
                      <td className="px-3 py-2">{e.country || "—"}</td>
                      <td className="px-3 py-2">{e.region || "—"}</td>
                      <td className="px-3 py-2">{e.city || "—"}</td>
                      <td
                        className="max-w-[180px] truncate px-3 py-2 text-muted-foreground"
                        title={e.referrer}
                      >
                        {referrerHost(e.referrer) || "direct"}
                      </td>
                      <td
                        className="max-w-[160px] truncate px-3 py-2 text-muted-foreground"
                        title={e.utm_source}
                      >
                        {e.utm_source || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Page {page + 1} of {totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    <Icon icon="lucide:chevron-left" className="h-3.5 w-3.5" />
                    Prev
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    disabled={page >= totalPages - 1}
                    onClick={() =>
                      setPage((p) => Math.min(totalPages - 1, p + 1))
                    }
                  >
                    Next
                    <Icon icon="lucide:chevron-right" className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          <Button
            variant="outline"
            className="w-full rounded-full"
            onClick={downloadCsv}
          >
            <Icon icon="lucide:download" className="h-4 w-4" />
            Download CSV
          </Button>
        </>
      )}
    </div>
  );
}

function Breakdown({
  label,
  rows,
}: {
  label: string;
  rows: [string, number][];
}) {
  const max = rows[0]?.[1] ?? 1;
  return (
    <div>
      <p className="mb-3 text-sm font-medium text-foreground">{label}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No data yet.</p>
      ) : (
        <div className="space-y-2">
          {rows.map(([key, count]) => (
            <div key={key} className="flex items-center gap-2 text-sm">
              <span className="w-32 truncate text-muted-foreground" title={key}>
                {key}
              </span>
              <div className="flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-primary/60"
                  style={{ width: `${Math.round((count / max) * 100)}%` }}
                />
              </div>
              <span className="w-5 text-right font-medium tabular-nums">
                {count}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateLinkDialog({
  open,
  onOpenChange,
  ownerUid,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ownerUid: string;
}) {
  const { toast } = useToast();
  const [slug, setSlug] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSlug("");
      setUrl("");
      setDescription("");
      setSlugError(null);
    }
  }, [open]);

  const generate = async () => {
    try {
      const candidate = await generateUniqueSlug();
      setSlug(candidate);
      setSlugError(null);
    } catch (error) {
      toast({
        title: "Could not generate slug",
        description: errorMessage(error, "Failed to generate a unique slug."),
        variant: "destructive",
      });
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const slugCheck = validateSlug(slug);
    if (slugCheck) {
      setSlugError(slugCheck);
      return;
    }
    setSlugError(null);

    try {
      normalizeUrl(url);
    } catch (error) {
      toast({
        title: "Invalid destination",
        description: errorMessage(error, "That destination is not valid."),
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const created = await createLinkForOwner(ownerUid, {
        slug,
        url,
        description,
      });
      toast({
        title: "Link created",
        description: `${buildShortLinkUrl(created.slug)} is now live.`,
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Could not create link",
        description: errorMessage(error, "Create failed."),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create a short link</DialogTitle>
          <DialogDescription>
            Pick a slug and a destination. Anyone who visits{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              {basePath}/l/&lt;slug&gt;
            </code>{" "}
            will be redirected and the click will be logged.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="create-slug">Slug</Label>
            <div className="flex gap-2">
              <Input
                id="create-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                placeholder="my-project"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={generate}
              >
                <Icon icon="lucide:wand-2" className="h-4 w-4" />
                Generate
              </Button>
            </div>
            {slugError && (
              <p className="text-xs text-destructive">{slugError}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="create-url">Destination URL</Label>
            <Input
              id="create-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/my-page"
            />
            <p className="text-xs text-muted-foreground">
              https:// is added automatically. Only http(s) destinations are
              allowed.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="create-description">Description (optional)</Label>
            <Textarea
              id="create-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this link for?"
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" className="rounded-full" disabled={saving}>
              {saving ? (
                <>
                  <Icon
                    icon="bx:loader-circle"
                    className="h-4 w-4 animate-spin"
                  />
                  Creating
                </>
              ) : (
                <>
                  <Icon icon="lucide:plus" className="h-4 w-4" />
                  Create link
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditLinkDialog({
  link,
  open,
  onOpenChange,
}: {
  link: ShortLink | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [saving, setSaving] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);

  useEffect(() => {
    if (link) {
      setUrl(link.url);
      setDescription(link.description);
      setNewSlug(link.slug);
      setSlugError(null);
    }
  }, [link]);

  const save = async () => {
    if (!link) return;

    setSaving(true);
    try {
      await updateLinkForOwner({ slug: link.slug, url, description });
      toast({
        title: "Link updated",
        description: "Changes are live immediately.",
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Could not update link",
        description: errorMessage(error, "Update failed."),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const rename = async () => {
    if (!link) return;
    const check = validateSlug(newSlug);
    if (check) {
      setSlugError(check);
      return;
    }
    setSlugError(null);

    setRenaming(true);
    try {
      await renameLinkForOwner({ slug: link.slug, newSlug });
      toast({
        title: "Link renamed",
        description: `The old slug now forwards to /l/${newSlug}.`,
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Could not rename link",
        description: errorMessage(error, "Rename failed."),
        variant: "destructive",
      });
    } finally {
      setRenaming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon icon="lucide:edit-3" className="h-4 w-4" />
            {link ? `/${link.slug}` : "Edit link"}
          </DialogTitle>
          <DialogDescription>
            Destination changes apply to the next click — no caching involved.
          </DialogDescription>
        </DialogHeader>
        {link ? (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="edit-url">Destination URL</Label>
              <Input
                id="edit-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>

            <Button
              className="w-full rounded-full"
              onClick={save}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Icon
                    icon="bx:loader-circle"
                    className="h-4 w-4 animate-spin"
                  />
                  Saving
                </>
              ) : (
                <>
                  <Icon icon="lucide:save" className="h-4 w-4" />
                  Save changes
                </>
              )}
            </Button>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="edit-slug">Rename slug</Label>
              <div className="flex gap-2">
                <Input
                  id="edit-slug"
                  value={newSlug}
                  onChange={(e) => setNewSlug(e.target.value.toLowerCase())}
                  placeholder="new-slug"
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  className="rounded-full"
                  onClick={rename}
                  disabled={renaming || newSlug === link.slug}
                >
                  {renaming ? (
                    <Icon
                      icon="bx:loader-circle"
                      className="h-4 w-4 animate-spin"
                    />
                  ) : (
                    <Icon icon="lucide:arrow-right-left" className="h-4 w-4" />
                  )}
                  Rename
                </Button>
              </div>
              {slugError && (
                <p className="text-xs text-destructive">{slugError}</p>
              )}
              <p className="text-xs text-muted-foreground">
                The old slug will keep forwarding to the new one. Clicks are
                counted on the new slug.
              </p>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function LinksDashboard() {
  const [links, setLinks] = useState<ShortLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<ShortLink | null>(null);
  const [analyticsLink, setAnalyticsLink] = useState<ShortLink | null>(null);
  const [clickEvents, setClickEvents] = useState<ClickEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const { toast } = useToast();
  const ownerUid = useMemo(() => getCurrentOwnerUid(), []);
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut(firebaseAuth);
      toast({ title: "Signed out", description: "You have been logged out." });
    } catch {
      toast({
        title: "Logout failed",
        description: "Could not log out. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSigningOut(false);
    }
  };

  useEffect(() => {
    if (!ownerUid) {
      setLoading(false);
      return;
    }

    const unsubscribe = subscribeToOwnerLinks(
      (items) => {
        setLinks(items);
        setLoading(false);
      },
      (error) => {
        setLoading(false);
        toast({
          title: "Could not load dashboard",
          description: error.message,
          variant: "destructive",
        });
      },
    );

    return () => unsubscribe();
  }, [ownerUid, toast]);

  const filteredLinks = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return links;

    return links.filter(
      (link) =>
        link.slug.toLowerCase().includes(term) ||
        link.url.toLowerCase().includes(term) ||
        link.description.toLowerCase().includes(term),
    );
  }, [query, links]);

  const totalClicks = useMemo(
    () => links.reduce((count, link) => count + link.stats.clickCount, 0),
    [links],
  );

  const openAnalytics = async (link: ShortLink) => {
    setAnalyticsLink(link);
    setEventsLoading(true);
    setClickEvents([]);
    try {
      const events = await fetchClickEvents(link.slug);
      setClickEvents(events);
    } catch (error) {
      toast({
        title: "Could not load analytics",
        description: errorMessage(error, "Failed to fetch click events"),
        variant: "destructive",
      });
    } finally {
      setEventsLoading(false);
    }
  };

  const copyShortLink = async (slug: string) => {
    try {
      const origin =
        typeof window !== "undefined" ? window.location.origin : undefined;
      await copyText(buildShortLinkUrl(slug, origin));
      toast({
        title: "Copied",
        description: "Short link copied to clipboard.",
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Could not copy the short link.",
        variant: "destructive",
      });
    }
  };

  const toggleActive = async (link: ShortLink, active: boolean) => {
    setLinks((prev) =>
      prev.map((l) => (l.slug === link.slug ? { ...l, active } : l)),
    );
    try {
      await setLinkActiveForOwner(link.slug, active);
    } catch (error) {
      setLinks((prev) => prev.map((l) => (l.slug === link.slug ? link : l)));
      toast({
        title: "Could not update link",
        description: errorMessage(error, "Toggle failed."),
        variant: "destructive",
      });
    }
  };

  const removeLink = async (link: ShortLink) => {
    try {
      await deleteLinkForOwner(link.slug);
      toast({
        title: "Link removed",
        description: `${link.slug} is no longer active.`,
      });
    } catch (error) {
      toast({
        title: "Could not remove link",
        description: errorMessage(error, "Delete failed."),
        variant: "destructive",
      });
    }
  };

  if (!ownerUid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Icon
              icon="lucide:cloud-off"
              className="h-8 w-8 text-muted-foreground"
            />
            <h2 className="font-heading text-xl font-bold text-foreground">
              Firebase not configured
            </h2>
            <p className="text-sm text-muted-foreground">
              Set the NEXT_PUBLIC_FIREBASE_* environment variables and restart
              the dev server.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pt-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Dashboard
            </p>
            <h1 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">
              Short Links
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ThemeToggle />
            <Button asChild variant="outline" className="rounded-full">
              <Link
                href="/?showLanding=true"
                className="inline-flex items-center gap-2"
              >
                <Icon icon="lucide:home" className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
              onClick={handleSignOut}
              disabled={signingOut}
            >
              {signingOut ? (
                <Icon
                  icon="bx:loader-circle"
                  className="h-4 w-4 animate-spin"
                />
              ) : (
                <Icon icon="lucide:log-out" className="h-4 w-4" />
              )}
            </Button>
            <Button
              className="rounded-full"
              onClick={() => setCreateOpen(true)}
            >
              <Icon icon="lucide:plus" className="h-4 w-4" />
              Shorten link
            </Button>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total links</CardDescription>
              <CardTitle className="text-3xl">{links.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total clicks</CardDescription>
              <CardTitle className="text-3xl">{totalClicks}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Search results</CardDescription>
              <CardTitle className="text-3xl">{filteredLinks.length}</CardTitle>
            </CardHeader>
          </Card>
        </section>

        <section className="relative">
          <Icon
            icon="lucide:search"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by slug, destination, or description"
            className="h-11 rounded-full pl-9"
          />
        </section>

        {loading ? (
          <Card>
            <CardContent className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Icon icon="bx:loader-circle" className="h-4 w-4 animate-spin" />
              Loading links
            </CardContent>
          </Card>
        ) : filteredLinks.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="rounded-full bg-secondary p-3">
                <Icon
                  icon="lucide:link-2"
                  className="h-6 w-6 text-muted-foreground"
                />
              </div>
              <h2 className="font-heading text-xl font-bold text-foreground">
                No short links yet
              </h2>
              <p className="max-w-md text-sm text-muted-foreground">
                Create your first short link and it will appear here with full
                click analytics.
              </p>
              <Button
                className="rounded-full"
                onClick={() => setCreateOpen(true)}
              >
                <Icon icon="lucide:plus" className="h-4 w-4" />
                Create first link
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Slug</th>
                    <th className="px-4 py-3 font-medium">Destination</th>
                    <th className="px-4 py-3 text-right font-medium">Clicks</th>
                    <th className="px-4 py-3 text-right font-medium">Unique</th>
                    <th className="px-4 py-3 font-medium">Last click</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3 font-medium">Active</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredLinks.map((link) => {
                    const moved = Boolean(link.movedTo);
                    return (
                      <tr
                        key={link.slug}
                        className="transition-colors hover:bg-muted/30"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                moved
                                  ? "secondary"
                                  : link.active
                                    ? "default"
                                    : "outline"
                              }
                            >
                              /{link.slug}
                            </Badge>
                            {moved && (
                              <span
                                className="text-xs text-muted-foreground"
                                title={`Moved to /${link.movedTo}`}
                              >
                                <Icon
                                  icon="lucide:arrow-right"
                                  className="h-3 w-3"
                                />
                              </span>
                            )}
                          </div>
                        </td>
                        <td
                          className="max-w-[220px] truncate px-4 py-3 text-muted-foreground"
                          title={link.url}
                        >
                          {formatDestinationSummary(link.url)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">
                          {link.stats.clickCount}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                          {link.stats.uniqueVisitors}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {timeAgo(link.stats.lastClickAt)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {timeAgo(link.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <Switch
                            checked={link.active}
                            disabled={moved}
                            onCheckedChange={(value) =>
                              toggleActive(link, value)
                            }
                            aria-label={`Toggle ${link.slug}`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="rounded-full"
                              title="Copy short link"
                              onClick={() => copyShortLink(link.slug)}
                            >
                              <Icon icon="lucide:copy" className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="rounded-full"
                              title="Analytics"
                              onClick={() => openAnalytics(link)}
                            >
                              <Icon
                                icon="lucide:bar-chart-2"
                                className="h-4 w-4"
                              />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="rounded-full"
                              title="Open destination"
                              onClick={() =>
                                window.open(
                                  link.url,
                                  "_blank",
                                  "noopener,noreferrer",
                                )
                              }
                            >
                              <Icon
                                icon="lucide:external-link"
                                className="h-4 w-4"
                              />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="rounded-full"
                              title="Edit"
                              onClick={() => setEditingLink(link)}
                            >
                              <Icon icon="lucide:edit-3" className="h-4 w-4" />
                            </Button>
                            <DestructiveConfirmDialog
                              trigger={
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="rounded-full text-destructive"
                                  title="Delete"
                                >
                                  <Icon
                                    icon="lucide:trash-2"
                                    className="h-4 w-4"
                                  />
                                </Button>
                              }
                              title={`Delete /${link.slug}?`}
                              description="This will permanently delete the link and all of its click analytics. The short URL will stop working immediately."
                              actionLabel="Yes, delete"
                              onConfirm={() => removeLink(link)}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      <CreateLinkDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        ownerUid={ownerUid}
      />

      <EditLinkDialog
        link={editingLink}
        open={editingLink !== null}
        onOpenChange={(open) => {
          if (!open) setEditingLink(null);
        }}
      />

      <Dialog
        open={analyticsLink !== null}
        onOpenChange={(open) => {
          if (!open) setAnalyticsLink(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon icon="lucide:bar-chart-2" className="h-4 w-4" />/
              {analyticsLink?.slug}
            </DialogTitle>
            <DialogDescription>
              Click analytics from tracking events
            </DialogDescription>
          </DialogHeader>
          {eventsLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Icon icon="bx:loader-circle" className="h-5 w-5 animate-spin" />
              Loading click events…
            </div>
          ) : analyticsLink ? (
            <AnalyticsContent link={analyticsLink} events={clickEvents} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

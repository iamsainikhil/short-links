"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { ClickChart, ChartDay } from "@/components/ClickChart";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getCurrentOwnerUid } from "@/lib/authOwner";
import {
  ClickEvent,
  LinkFolder,
  ShortLink,
  buildShortLinkUrl,
  formatDestinationSummary,
  normalizeUrl,
  validateSlug,
} from "@/lib/links";
import {
  createFolderForOwner,
  createLinkForOwner,
  deleteFolderForOwner,
  deleteLinkForOwner,
  deleteLinksForOwner,
  fetchClickEvents,
  generateUniqueSlug,
  renameLinkForOwner,
  reorderFoldersForOwner,
  setLinkActiveForOwner,
  setLinksActiveForOwner,
  setLinksFoldersForOwner,
  subscribeToOwnerFolders,
  subscribeToOwnerLinks,
  updateLinkForOwner,
} from "@/lib/firestoreLinks";
import { errorMessage } from "@/lib/errors";
import { referrerHost, timeAgo } from "@/lib/format";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const PAGE_SIZE = 10;

const UNCATEGORIZED_KEY = "__uncategorized__";

interface LinkGroup {
  key: string;
  folder?: LinkFolder;
  title: string;
  icon: string;
  links: ShortLink[];
}

type GroupItem =
  | { kind: "group"; group: LinkGroup }
  | { kind: "link"; group: LinkGroup; link: ShortLink };

type SortKey = "createdAt" | "slug" | "clickCount" | "uniqueVisitors";
type StatusFilter = "all" | "active" | "inactive";

const DEFAULT_SORT_DIR: Record<SortKey, "asc" | "desc"> = {
  createdAt: "desc",
  slug: "asc",
  clickCount: "desc",
  uniqueVisitors: "desc",
};

const compareLinks = (
  a: ShortLink,
  b: ShortLink,
  sortBy: SortKey,
  sortDir: "asc" | "desc",
) => {
  const mult = sortDir === "asc" ? 1 : -1;
  if (sortBy === "slug") {
    return a.slug.localeCompare(b.slug) * mult;
  }
  const av =
    sortBy === "createdAt"
      ? Date.parse(a.createdAt)
      : sortBy === "clickCount"
        ? a.stats.clickCount
        : a.stats.uniqueVisitors;
  const bv =
    sortBy === "createdAt"
      ? Date.parse(b.createdAt)
      : sortBy === "clickCount"
        ? b.stats.clickCount
        : b.stats.uniqueVisitors;
  if (av < bv) return -1 * mult;
  if (av > bv) return 1 * mult;
  return 0;
};

const copyText = async (value: string) => {
  await navigator.clipboard.writeText(value);
};

function DestructiveConfirmDialog({
  trigger,
  open,
  onOpenChange,
  title,
  description,
  actionLabel,
  onConfirm,
}: {
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  actionLabel: string;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger> : null}
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

interface LinkRowActionHandlers {
  onCopy: () => void;
  onAnalytics: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function LinkSlugBadge({ link }: { link: ShortLink }) {
  const moved = Boolean(link.movedTo);
  return (
    <>
      <Badge
        variant={moved ? "secondary" : link.active ? "default" : "outline"}
        className="max-w-[10rem] truncate"
        title={link.slug}
      >
        /{link.slug}
      </Badge>
      {moved && (
        <span
          className="text-xs text-muted-foreground"
          title={`Moved to /${link.movedTo}`}
        >
          <Icon icon="lucide:arrow-right" className="h-3 w-3" />
        </span>
      )}
    </>
  );
}

function FolderBadges({
  link,
  folders,
  hideFolderId,
}: {
  link: ShortLink;
  folders: LinkFolder[];
  hideFolderId?: string;
}) {
  const names = useMemo(() => {
    const byId = new Map(folders.map((f) => [f.id, f.name]));
    return (link.folderIds ?? [])
      .filter((id) => id && id !== hideFolderId && byId.has(id))
      .map((id) => byId.get(id) as string);
  }, [link.folderIds, folders, hideFolderId]);

  if (names.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  const joined = names.join(", ");
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 text-[13px] text-muted-foreground"
      title={joined}
    >
      <Icon icon="lucide:folder" className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 truncate">{joined}</span>
    </span>
  );
}

function FolderPicker({
  folders,
  value,
  onChange,
  ownerUid,
}: {
  folders: LinkFolder[];
  value: string[];
  onChange: (ids: string[]) => void;
  ownerUid: string;
}) {
  const { toast } = useToast();
  const [folderQuery, setFolderQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const term = folderQuery.trim().toLowerCase();
  const matches = folders.filter((folder) =>
    folder.name.toLowerCase().includes(term),
  );

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  };

  const submitCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = createName.trim();
    if (!trimmed) {
      setCreateError("Folder name is required.");
      return;
    }

    setCreating(true);
    try {
      const created = await createFolderForOwner(ownerUid, trimmed);
      onChange([...value, created.id]);
      setCreateOpen(false);
      setCreateName("");
      setCreateError(null);
      setFolderQuery("");
      toast({
        title: "Folder created",
        description: `${created.name} is ready for links.`,
      });
    } catch (error) {
      toast({
        title: "Could not create folder",
        description: errorMessage(error, "Folder creation failed."),
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-2">
      {folders.length > 0 ? (
        <>
          <div className="relative">
            <Icon
              icon="lucide:search"
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={folderQuery}
              onChange={(event) => setFolderQuery(event.target.value)}
              placeholder="Filter folders"
              autoFocus
              className="h-9 rounded-lg pl-8"
            />
          </div>
          <ul className="max-h-52 space-y-0.5 overflow-y-auto rounded-xl border border-border p-1.5">
            {matches.map((folder) => (
              <li key={folder.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-secondary">
                  <input
                    type="checkbox"
                    checked={value.includes(folder.id)}
                    onChange={() => toggle(folder.id)}
                    className="h-4 w-4 shrink-0 accent-primary"
                  />
                  <Icon icon="lucide:folder" className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 truncate">{folder.name}</span>
                </label>
              </li>
            ))}
            {matches.length === 0 && (
              <li className="px-2 py-6 text-center text-xs text-muted-foreground">
                No folders match your filter.
              </li>
            )}
          </ul>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          No folders yet — create one below to organize your links.
        </p>
      )}

      <div className="rounded-xl border border-dashed border-border p-1.5">
        {createOpen ? (
          <form
            onSubmit={submitCreate}
            className="flex items-center gap-2"
          >
            <div className="min-w-0 flex-1">
              <Input
                value={createName}
                onChange={(event) => {
                  setCreateName(event.target.value);
                  setCreateError(null);
                }}
                placeholder="Folder name"
                autoFocus
                className="h-8 rounded-lg"
              />
              {createError && (
                <p className="mt-1 text-xs text-destructive">{createError}</p>
              )}
            </div>
            <Button
              type="submit"
              size="sm"
              className="rounded-full"
              disabled={creating}
            >
              {creating ? (
                <Icon
                  icon="bx:loader-circle"
                  className="h-4 w-4 animate-spin"
                />
              ) : (
                <Icon icon="lucide:plus" className="h-4 w-4" />
              )}
              Create
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-8 w-8 rounded-full p-0"
              onClick={() => {
                setCreateOpen(false);
                setCreateName("");
                setCreateError(null);
              }}
              aria-label="Cancel creating folder"
            >
              <Icon icon="lucide:x" className="h-4 w-4" />
            </Button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            <Icon
              icon="lucide:folder-plus"
              className="h-4 w-4 text-muted-foreground"
            />
            New folder
          </button>
        )}
      </div>

      {folders.length > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {value.length} selected ·{" "}
            {folders.length - value.length} available
          </span>
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="font-medium text-foreground underline underline-offset-2 transition-colors hover:text-primary"
            >
              Clear (move to Uncategorized)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PaginationControls({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground">
      <span>
        Page {page + 1} of {totalPages}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="rounded-full"
          disabled={page === 0}
          onClick={() => onPageChange(Math.max(0, page - 1))}
        >
          <Icon icon="lucide:chevron-left" className="h-3.5 w-3.5" />
          Prev
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full"
          disabled={page >= totalPages - 1}
          onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
        >
          Next
          <Icon icon="lucide:chevron-right" className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function LinkActiveSwitch({
  link,
  onToggle,
}: {
  link: ShortLink;
  onToggle: (link: ShortLink, active: boolean) => void;
}) {
  const moved = Boolean(link.movedTo);
  return (
    <Switch
      checked={link.active}
      disabled={moved}
      onCheckedChange={(value) => onToggle(link, value)}
      aria-label={`Toggle ${link.slug}`}
    />
  );
}

function LinkRowActions({
  link,
  onCopy,
  onAnalytics,
  onEdit,
  onDelete,
}: {
  link: ShortLink;
} & LinkRowActionHandlers) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="rounded-full"
        title="Copy short link"
        onClick={onCopy}
      >
        <Icon icon="lucide:copy" className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="rounded-full"
        title="Analytics"
        onClick={onAnalytics}
      >
        <Icon icon="lucide:bar-chart-2" className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="rounded-full"
        title="Open destination"
        onClick={() => window.open(link.url, "_blank", "noopener,noreferrer")}
      >
        <Icon icon="lucide:external-link" className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="rounded-full"
        title="Edit"
        onClick={onEdit}
      >
        <Icon icon="lucide:edit-3" className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="rounded-full text-destructive"
        title="Delete"
        onClick={onDelete}
      >
        <Icon icon="lucide:trash-2" className="h-4 w-4" />
      </Button>
    </div>
  );
}

function RowActionMenu({
  link,
  onCopy,
  onAnalytics,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  link: ShortLink;
  onToggleActive: (link: ShortLink, active: boolean) => void;
} & LinkRowActionHandlers) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          title="Actions"
          aria-label={`Actions for /${link.slug}`}
        >
          <Icon icon="lucide:ellipsis-vertical" className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onSelect={() => onToggleActive(link, !link.active)}>
          <Icon
            icon={link.active ? "lucide:power-off" : "lucide:power"}
            className="h-4 w-4"
          />
          {link.active ? "Deactivate" : "Activate"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onCopy}>
          <Icon icon="lucide:copy" className="h-4 w-4" />
          Copy short link
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onAnalytics}>
          <Icon icon="lucide:bar-chart-2" className="h-4 w-4" />
          Analytics
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() =>
            window.open(link.url, "_blank", "noopener,noreferrer")
          }
        >
          <Icon icon="lucide:external-link" className="h-4 w-4" />
          Open destination
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onEdit}>
          <Icon icon="lucide:edit-3" className="h-4 w-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Icon icon="lucide:trash-2" className="h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
      <div className="grid gap-3 sm:grid-cols-3">
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
            <div className="hidden max-h-80 overflow-x-auto rounded-xl border border-border sm:block">
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
            <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-xl border border-border sm:hidden">
              {pageEvents.map((e) => (
                <li key={e.id} className="flex flex-col gap-1 p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="whitespace-nowrap font-medium text-foreground">
                      {timeAgo(e.timestamp)}
                    </span>
                    <span
                      className="min-w-0 truncate text-muted-foreground"
                      title={e.referrer}
                    >
                      {referrerHost(e.referrer) || "direct"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-muted-foreground">
                    <span className="min-w-0 truncate">
                      {[e.country, e.region, e.city]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </span>
                    <span
                      className="min-w-0 truncate"
                      title={e.utm_source}
                    >
                      {e.utm_source || "—"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
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

function CreateFolderDialog({
  open,
  onOpenChange,
  ownerUid,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ownerUid: string;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setName("");
      setFolderError(null);
    }
  }, [open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setFolderError("Folder name is required.");
      return;
    }

    setSaving(true);
    try {
      await createFolderForOwner(ownerUid, trimmed);
      toast({
        title: "Folder created",
        description: `${trimmed} is ready for links.`,
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Could not create folder",
        description: errorMessage(error, "Folder creation failed."),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon icon="lucide:folder-plus" className="h-4 w-4" />
            Create a folder
          </DialogTitle>
          <DialogDescription>
            Folders organize links. A link can belong to one or more folders.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="create-folder-name">Folder name</Label>
            <Input
              id="create-folder-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Marketing"
              autoFocus
            />
            {folderError && (
              <p className="text-xs text-destructive">{folderError}</p>
            )}
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
                  Create folder
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BulkFolderDialog({
  open,
  onOpenChange,
  folders,
  count,
  onApply,
  ownerUid,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: LinkFolder[];
  count: number;
  onApply: (folderIds: string[]) => Promise<void>;
  ownerUid: string;
}) {
  const { toast } = useToast();
  const [folderIds, setFolderIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setFolderIds([]);
    }
  }, [open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    try {
      await onApply(folderIds);
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Could not update links",
        description: errorMessage(error, "Bulk update failed."),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon icon="lucide:folder-move" className="h-4 w-4" />
            Move {count} link{count === 1 ? "" : "s"} to folders
          </DialogTitle>
          <DialogDescription>
            Choosing folders replaces the current folder membership for all
            selected links. A link can belong to multiple folders.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Folders</Label>
            <FolderPicker
              folders={folders}
              value={folderIds}
              onChange={setFolderIds}
              ownerUid={ownerUid}
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
                  Moving
                </>
              ) : (
                <>
                  <Icon icon="lucide:folder-move" className="h-4 w-4" />
                  Move links
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateLinkDialog({
  open,
  onOpenChange,
  ownerUid,
  folders,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ownerUid: string;
  folders: LinkFolder[];
}) {
  const { toast } = useToast();
  const [slug, setSlug] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [folderIds, setFolderIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSlug("");
      setUrl("");
      setDescription("");
      setFolderIds([]);
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
        folderIds,
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

          <div className="space-y-2">
            <Label>Folders</Label>
            <FolderPicker
              folders={folders}
              value={folderIds}
              onChange={setFolderIds}
              ownerUid={ownerUid}
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
  folders,
  ownerUid,
}: {
  link: ShortLink | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: LinkFolder[];
  ownerUid: string;
}) {
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [folderIds, setFolderIds] = useState<string[]>([]);
  const [newSlug, setNewSlug] = useState("");
  const [saving, setSaving] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);

  useEffect(() => {
    if (link) {
      setUrl(link.url);
      setDescription(link.description);
      setFolderIds(link.folderIds ?? []);
      setNewSlug(link.slug);
      setSlugError(null);
    }
  }, [link]);

  const save = async () => {
    if (!link) return;

    setSaving(true);
    try {
      await updateLinkForOwner({
        slug: link.slug,
        url,
        description,
        folderIds,
      });
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

            <div className="space-y-2">
              <Label>Folders</Label>
              <FolderPicker
                folders={folders}
                value={folderIds}
                onChange={setFolderIds}
                ownerUid={ownerUid}
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
  const [deletingLink, setDeletingLink] = useState<ShortLink | null>(null);
  const [analyticsLink, setAnalyticsLink] = useState<ShortLink | null>(null);
  const [clickEvents, setClickEvents] = useState<ClickEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const { toast } = useToast();
  const ownerUid = useMemo(() => getCurrentOwnerUid(), []);
  const [signingOut, setSigningOut] = useState(false);
  const [folders, setFolders] = useState<LinkFolder[]>([]);
  const [folderCreateOpen, setFolderCreateOpen] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<LinkFolder | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [bulkFolderOpen, setBulkFolderOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const selectAllRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (!ownerUid) return;

    const unsubscribe = subscribeToOwnerFolders(
      (items) => setFolders(items),
      (error) => {
        toast({
          title: "Could not load folders",
          description: error.message,
          variant: "destructive",
        });
      },
    );

    return () => unsubscribe();
  }, [ownerUid, toast]);

  useEffect(() => {
    setPage(0);
  }, [query, statusFilter, sortBy, sortDir]);

  const orderedFolders = useMemo(() => {
    return [...folders].sort(
      (a, b) =>
        (a.sortOrder ?? Number.MAX_SAFE_INTEGER) -
          (b.sortOrder ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name),
    );
  }, [folders]);

  const groups = useMemo(() => {
    const term = query.trim().toLowerCase();
    const folderById = new Map(orderedFolders.map((folder) => [folder.id, folder]));
    const matches = (link: ShortLink) =>
      (!term ||
        link.slug.toLowerCase().includes(term) ||
        link.url.toLowerCase().includes(term) ||
        link.description.toLowerCase().includes(term)) &&
      (statusFilter === "all" ||
        (statusFilter === "active" && link.active) ||
        (statusFilter === "inactive" && !link.active));

    const folderGroups: LinkGroup[] = orderedFolders.map((folder) => ({
      key: folder.id,
      folder,
      title: folder.name,
      icon: "lucide:folder",
      links: [],
    }));
    const groupByKey = new Map(folderGroups.map((group) => [group.key, group]));
    const uncategorized: LinkGroup = {
      key: UNCATEGORIZED_KEY,
      title: "Uncategorized",
      icon: "lucide:inbox",
      links: [],
    };

    for (const link of links) {
      if (!matches(link)) continue;
      const memberIds = (link.folderIds ?? []).filter((id) =>
        folderById.has(id),
      );
      if (memberIds.length === 0) {
        uncategorized.links.push(link);
      } else {
        for (const id of memberIds) {
          groupByKey.get(id)?.links.push(link);
        }
      }
    }

    const sortGroup = (group: LinkGroup) =>
      group.links.sort((a, b) => compareLinks(a, b, sortBy, sortDir));
    folderGroups.forEach(sortGroup);
    sortGroup(uncategorized);

    const result = folderGroups;
    if (uncategorized.links.length > 0) result.push(uncategorized);
    return result;
  }, [links, orderedFolders, query, statusFilter, sortBy, sortDir]);

  const groupItems = useMemo(() => {
    const items: GroupItem[] = [];
    for (const group of groups) {
      items.push({ kind: "group", group });
      if (collapsed.has(group.key)) continue;
      for (const link of group.links) {
        items.push({ kind: "link", group, link });
      }
    }
    return items;
  }, [groups, collapsed]);

  const totalLinks = useMemo(
    () => groupItems.reduce((count, item) => count + (item.kind === "link" ? 1 : 0), 0),
    [groupItems],
  );

  const linkRanges = useMemo(() => {
    const ranges: ({ start: number; end: number } | null)[] = [];
    let running = 0;
    for (const item of groupItems) {
      if (item.kind === "group") {
        ranges.push({ start: running, end: running });
      } else {
        running += 1;
        const last = ranges[ranges.length - 1];
        if (last) last.end = running;
        ranges.push(null);
      }
    }
    return ranges;
  }, [groupItems]);

  const totalPages = Math.max(1, Math.ceil(totalLinks / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = useMemo(() => {
    if (groupItems.length === 0) return groupItems;
    const startLink = safePage * PAGE_SIZE;
    const endLink = Math.min(totalLinks, startLink + PAGE_SIZE);
    if (startLink >= endLink) return [];

    const result: GroupItem[] = [];
    let linkIndex = 0;
    for (let i = 0; i < groupItems.length; i += 1) {
      const item = groupItems[i];
      if (item.kind === "group") {
        const range = linkRanges[i];
        if (range && range.start === range.end) {
          const groupPage =
            totalLinks === 0
              ? 0
              : Math.min(
                  Math.floor(range.start / PAGE_SIZE),
                  totalPages - 1,
                );
          if (safePage === groupPage) result.push(item);
        } else if (range && range.start < endLink && range.end > startLink) {
          result.push(item);
        }
      } else {
        if (linkIndex >= startLink && linkIndex < endLink) {
          result.push(item);
        }
        linkIndex += 1;
      }
    }
    return result;
  }, [groupItems, linkRanges, safePage, totalLinks, totalPages]);

  const pageSlugs = useMemo(
    () =>
      pageItems
        .filter((item): item is Extract<GroupItem, { kind: "link" }> => item.kind === "link")
        .map((item) => item.link.slug),
    [pageItems],
  );

  const visibleMatches = useMemo(
    () => groups.reduce((count, group) => count + group.links.length, 0),
    [groups],
  );

  const allPageSelected = pageSlugs.length > 0 && pageSlugs.every((s) => selected.has(s));
  const somePageSelected =
    pageSlugs.some((s) => selected.has(s)) && !allPageSelected;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = somePageSelected;
    }
  }, [somePageSelected]);

  const allSelectedActive = useMemo(() => {
    const slugs = new Set(selected);
    const matches = links.filter((link) => slugs.has(link.slug));
    return matches.length > 0 && matches.every((link) => link.active);
  }, [selected, links]);

  const toggleSelected = (slug: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const toggleSelectAllOnPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const slug of pageSlugs) {
        if (allPageSelected) next.delete(slug);
        else next.add(slug);
      }
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const groupSlugs = (group: LinkGroup) => group.links.map((link) => link.slug);

  const groupAllSelected = (group: LinkGroup) => {
    const slugs = groupSlugs(group);
    return slugs.length > 0 && slugs.every((slug) => selected.has(slug));
  };

  const groupSomeSelected = (group: LinkGroup) => {
    const slugs = groupSlugs(group);
    return (
      slugs.length > 0 &&
      !groupAllSelected(group) &&
      slugs.some((slug) => selected.has(slug))
    );
  };

  const toggleGroupSelection = (group: LinkGroup) => {
    const slugs = groupSlugs(group);
    if (slugs.length === 0) return;
    const selectAll = !groupAllSelected(group);

    setSelected((prev) => {
      const next = new Set(prev);
      for (const slug of slugs) {
        if (selectAll) next.add(slug);
        else next.delete(slug);
      }
      return next;
    });
  };

  const toggleCollapsed = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

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

  const removeFolder = async (folder: LinkFolder) => {
    try {
      await deleteFolderForOwner(folder.id);
      toast({
        title: "Folder removed",
        description: `${folder.name} was deleted. Links inside it are kept.`,
      });
    } catch (error) {
      toast({
        title: "Could not remove folder",
        description: errorMessage(error, "Delete failed."),
        variant: "destructive",
      });
    } finally {
      setFolderToDelete(null);
    }
  };

  const moveFolder = async (folder: LinkFolder, dir: -1 | 1) => {
    const ordered = orderedFolders;
    const idx = ordered.findIndex((f) => f.id === folder.id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= ordered.length) return;

    const a = ordered[idx];
    const b = ordered[target];
    const aOrder = a.sortOrder ?? idx;
    const bOrder = b.sortOrder ?? target;

    setFolders((prev) =>
      prev.map((f) =>
        f.id === a.id
          ? { ...f, sortOrder: bOrder }
          : f.id === b.id
            ? { ...f, sortOrder: aOrder }
            : f,
      ),
    );

    try {
      await reorderFoldersForOwner({ [a.id]: bOrder, [b.id]: aOrder });
    } catch (error) {
      setFolders((prev) =>
        prev.map((f) => (f.id === a.id ? { ...a } : f.id === b.id ? { ...b } : f)),
      );
      toast({
        title: "Could not reorder folders",
        description: errorMessage(error, "Reorder failed."),
        variant: "destructive",
      });
    }
  };

  const bulkSetActive = async (active: boolean) => {
    const slugs = Array.from(selected);
    if (slugs.length === 0) return;

    try {
      await setLinksActiveForOwner(slugs, active);
      toast({
        title: active ? "Links activated" : "Links deactivated",
        description: `${slugs.length} link${slugs.length === 1 ? "" : "s"} updated.`,
      });
      clearSelection();
    } catch (error) {
      toast({
        title: "Could not update links",
        description: errorMessage(error, "Bulk update failed."),
        variant: "destructive",
      });
    }
  };

  const applyBulkFolders = async (folderIds: string[]) => {
    const slugs = Array.from(selected);
    if (slugs.length === 0) return;

    await setLinksFoldersForOwner(slugs, folderIds);
    toast({
      title: "Links organized",
      description: `${slugs.length} link${slugs.length === 1 ? "" : "s"} moved to the selected folders.`,
    });
    clearSelection();
  };

  const bulkDelete = async () => {
    const slugs = Array.from(selected);
    if (slugs.length === 0) {
      setBulkDeleteOpen(false);
      return;
    }

    try {
      await deleteLinksForOwner(slugs);
      toast({
        title: "Links removed",
        description: `${slugs.length} link${slugs.length === 1 ? "" : "s"} deleted.`,
      });
      clearSelection();
    } catch (error) {
      toast({
        title: "Could not remove links",
        description: errorMessage(error, "Bulk delete failed."),
        variant: "destructive",
      });
    } finally {
      setBulkDeleteOpen(false);
    }
  };

  const getRowActions = (link: ShortLink): LinkRowActionHandlers => ({
    onCopy: () => copyShortLink(link.slug),
    onAnalytics: () => openAnalytics(link),
    onEdit: () => setEditingLink(link),
    onDelete: () => setDeletingLink(link),
  });

  const isFirstFolder = (folder: LinkFolder) =>
    orderedFolders.findIndex((f) => f.id === folder.id) <= 0;
  const isLastFolder = (folder: LinkFolder) =>
    orderedFolders.findIndex((f) => f.id === folder.id) >=
    orderedFolders.length - 1;

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
              <CardTitle className="text-3xl">{visibleMatches}</CardTitle>
            </CardHeader>
          </Card>
        </section>

        <section className="flex items-center gap-2">
          <div className="relative flex-1">
            <Icon
              icon="lucide:search"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by slug, destination, or description"
              className="h-11 w-full rounded-full pl-9"
            />
          </div>
          <Button
            variant="outline"
            className="shrink-0 rounded-full"
            onClick={() => setFolderCreateOpen(true)}
          >
            <Icon icon="lucide:folder-plus" className="h-4 w-4" />
            New folder
          </Button>
        </section>

        <section className="flex flex-wrap items-center gap-2">
          <div className="ml-auto flex items-center rounded-full border border-border">
            {(["all", "active", "inactive"] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setStatusFilter(filter)}
                className={`px-3 py-1.5 text-sm first:rounded-l-full last:rounded-r-full transition-colors ${
                  statusFilter === filter
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {filter === "all" ? "All" : filter === "active" ? "Active" : "Inactive"}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 rounded-full border border-border bg-card py-1.5 pl-3 pr-1.5 text-xs text-muted-foreground">
            Sort by
            <select
              value={sortBy}
              onChange={(event) => {
                const key = event.target.value as SortKey;
                setSortBy(key);
                setSortDir(DEFAULT_SORT_DIR[key]);
              }}
              className="bg-transparent text-sm text-foreground outline-none"
            >
              <option value="createdAt">Newest</option>
              <option value="slug">Slug</option>
              <option value="clickCount">Most clicks</option>
              <option value="uniqueVisitors">Most unique</option>
            </select>
          </label>
          <Button
            variant="outline"
            size="icon"
            className="rounded-full"
            title={sortDir === "asc" ? "Ascending order" : "Descending order"}
            onClick={() => setSortDir((dir) => (dir === "asc" ? "desc" : "asc"))}
          >
            <Icon
              icon={
                sortDir === "asc"
                  ? "lucide:arrow-up-narrow-wide"
                  : "lucide:arrow-down-wide-narrow"
              }
              className="h-4 w-4"
            />
          </Button>
        </section>

        {selected.size > 0 && (
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3">
            <span className="text-sm font-medium text-foreground">
              {selected.size} selected
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full"
                onClick={clearSelection}
              >
                Clear
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => setBulkFolderOpen(true)}
              >
                <Icon icon="lucide:folder-move" className="h-4 w-4" />
                Folders…
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => bulkSetActive(!allSelectedActive)}
              >
                <Icon
                  icon={
                    allSelectedActive ? "lucide:power-off" : "lucide:power"
                  }
                  className="h-4 w-4"
                />
                {allSelectedActive ? "Deactivate" : "Activate"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full text-destructive"
                onClick={() => setBulkDeleteOpen(true)}
              >
                <Icon icon="lucide:trash-2" className="h-4 w-4" />
                Delete
              </Button>
            </div>
          </section>
        )}

        {loading ? (
          <Card>
            <CardContent className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Icon icon="bx:loader-circle" className="h-4 w-4 animate-spin" />
              Loading links
            </CardContent>
          </Card>
        ) : groups.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="rounded-full bg-secondary p-3">
                <Icon
                  icon="lucide:folder-open"
                  className="h-6 w-6 text-muted-foreground"
                />
              </div>
              <h2 className="font-heading text-xl font-bold text-foreground">
                {links.length === 0
                  ? "No short links yet"
                  : "No matching links"}
              </h2>
              <p className="max-w-md text-sm text-muted-foreground">
                {links.length === 0
                  ? "Create your first short link and it will appear here with full click analytics."
                  : "Try a different search."}
              </p>
              <Button
                className="rounded-full"
                onClick={() => setCreateOpen(true)}
              >
                <Icon icon="lucide:plus" className="h-4 w-4" />
                {links.length === 0 ? "Create first link" : "Shorten link"}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                  <tr className="group">
                    <th className="px-4 py-3">
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        checked={allPageSelected}
                        onChange={toggleSelectAllOnPage}
                        aria-label="Select all links on this page"
                        className={`h-4 w-4 accent-primary transition-opacity ${
                          allPageSelected || somePageSelected
                            ? "opacity-100"
                            : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                        }`}
                      />
                    </th>
                    <th className="px-4 py-3 font-medium">Slug</th>
                    <th className="px-4 py-3 font-medium">Destination</th>
                    <th className="px-4 py-3 font-medium">Also in</th>
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
                <tbody>
                  {pageItems.map((item) =>
                    item.kind === "group" ? (
                      <tr
                        key={`group-${item.group.key}`}
                        className="group border-y border-border bg-muted/20"
                      >
                        <td colSpan={10} className="px-4 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <input
                                ref={(el) => {
                                  if (el) el.indeterminate = groupSomeSelected(item.group);
                                }}
                                type="checkbox"
                                checked={groupAllSelected(item.group)}
                                onChange={() => toggleGroupSelection(item.group)}
                                disabled={item.group.links.length === 0}
                                aria-label={`Select all links in ${item.group.title}`}
                                className={`h-4 w-4 accent-primary transition-opacity disabled:opacity-30 ${
                                  groupSomeSelected(item.group) ||
                                  groupAllSelected(item.group)
                                    ? "opacity-100"
                                    : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                                }`}
                              />
                              <button
                                onClick={() => toggleCollapsed(item.group.key)}
                                className="group inline-flex items-center gap-2 text-sm font-semibold text-foreground"
                                aria-expanded={!collapsed.has(item.group.key)}
                              >
                                <Icon
                                  icon={
                                    collapsed.has(item.group.key)
                                      ? "lucide:chevron-right"
                                      : "lucide:chevron-down"
                                  }
                                  className="h-4 w-4 text-muted-foreground transition-transform"
                                />
                                <Icon
                                  icon={item.group.icon}
                                  className="h-4 w-4 text-muted-foreground"
                                />
                                {item.group.title}
                                <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                                  {item.group.links.length}
                                </span>
                                {item.group.folder &&
                                  item.group.links.length === 0 && (
                                    <span className="text-xs font-normal text-muted-foreground">
                                      No links yet
                                    </span>
                                  )}
                              </button>
                            </div>
                            {item.group.folder ? (
                              <div className="flex items-center gap-1">
                                <button
                                  aria-label={`Move folder ${item.group.folder.name} up`}
                                  title="Move folder up"
                                  disabled={isFirstFolder(item.group.folder)}
                                  onClick={() =>
                                    moveFolder(item.group.folder, -1)
                                  }
                                  className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                                >
                                  <Icon
                                    icon="lucide:arrow-up"
                                    className="h-4 w-4"
                                  />
                                </button>
                                <button
                                  aria-label={`Move folder ${item.group.folder.name} down`}
                                  title="Move folder down"
                                  disabled={isLastFolder(item.group.folder)}
                                  onClick={() => moveFolder(item.group.folder, 1)}
                                  className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                                >
                                  <Icon
                                    icon="lucide:arrow-down"
                                    className="h-4 w-4"
                                  />
                                </button>
                                <button
                                  aria-label={`Delete folder ${item.group.folder.name}`}
                                  title="Delete folder"
                                  onClick={() =>
                                    setFolderToDelete(item.group.folder)
                                  }
                                  className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                                >
                                  <Icon
                                    icon="lucide:trash-2"
                                    className="h-4 w-4"
                                  />
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr
                        key={`${item.group.key}-${item.link.slug}`}
                        className={`group transition-colors ${
                          selected.has(item.link.slug)
                            ? "bg-muted/40"
                            : "hover:bg-muted/30"
                        }`}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selected.has(item.link.slug)}
                            onChange={() => toggleSelected(item.link.slug)}
                            aria-label={`Select /${item.link.slug}`}
                            className={`h-4 w-4 accent-primary transition-opacity ${
                              selected.has(item.link.slug)
                                ? "opacity-100"
                                : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                            }`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <LinkSlugBadge link={item.link} />
                          </div>
                        </td>
                        <td
                          className="max-w-[200px] truncate px-4 py-3 text-muted-foreground"
                          title={item.link.url}
                        >
                          {formatDestinationSummary(item.link.url)}
                        </td>
                        <td className="max-w-[160px] px-4 py-3">
                          <FolderBadges
                            link={item.link}
                            folders={folders}
                            hideFolderId={item.group.folder?.id}
                          />
                        </td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">
                          {item.link.stats.clickCount}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                          {item.link.stats.uniqueVisitors}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {timeAgo(item.link.stats.lastClickAt)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {timeAgo(item.link.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <LinkActiveSwitch
                            link={item.link}
                            onToggle={toggleActive}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <LinkRowActions
                            link={item.link}
                            {...getRowActions(item.link)}
                          />
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-border lg:hidden">
              {pageItems.map((item) =>
                item.kind === "group" ? (
                  <li
                    key={`group-${item.group.key}`}
                    className="flex items-center justify-between gap-2 bg-muted/20 px-4 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <input
                        ref={(el) => {
                          if (el) el.indeterminate = groupSomeSelected(item.group);
                        }}
                        type="checkbox"
                        checked={groupAllSelected(item.group)}
                        onChange={() => toggleGroupSelection(item.group)}
                        disabled={item.group.links.length === 0}
                        aria-label={`Select all links in ${item.group.title}`}
                        className="h-4 w-4 shrink-0 accent-primary disabled:opacity-30"
                      />
                      <button
                        onClick={() => toggleCollapsed(item.group.key)}
                        className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground"
                      >
                        <Icon
                          icon={
                            collapsed.has(item.group.key)
                              ? "lucide:chevron-right"
                              : "lucide:chevron-down"
                          }
                          className="h-4 w-4 text-muted-foreground"
                        />
                        <Icon
                          icon={item.group.icon}
                          className="h-4 w-4 shrink-0 text-muted-foreground"
                        />
                        <span className="min-w-0 truncate">
                          {item.group.title}
                        </span>
                        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                          {item.group.links.length}
                        </span>
                        {item.group.folder &&
                          item.group.links.length === 0 && (
                            <span className="shrink-0 text-xs font-normal text-muted-foreground">
                              No links yet
                            </span>
                          )}
                      </button>
                    </div>
                    {item.group.folder ? (
                      <div className="flex items-center gap-1">
                        <button
                          aria-label={`Move folder ${item.group.folder.name} up`}
                          title="Move folder up"
                          disabled={isFirstFolder(item.group.folder)}
                          onClick={() => moveFolder(item.group.folder, -1)}
                          className="rounded-full p-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                        >
                          <Icon icon="lucide:arrow-up" className="h-4 w-4" />
                        </button>
                        <button
                          aria-label={`Move folder ${item.group.folder.name} down`}
                          title="Move folder down"
                          disabled={isLastFolder(item.group.folder)}
                          onClick={() => moveFolder(item.group.folder, 1)}
                          className="rounded-full p-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                        >
                          <Icon icon="lucide:arrow-down" className="h-4 w-4" />
                        </button>
                        <button
                          aria-label={`Delete folder ${item.group.folder.name}`}
                          title="Delete folder"
                          onClick={() => setFolderToDelete(item.group.folder)}
                          className="rounded-full p-1.5 text-muted-foreground transition-colors hover:text-destructive"
                        >
                          <Icon icon="lucide:trash-2" className="h-4 w-4" />
                        </button>
                      </div>
                    ) : null}
                  </li>
                ) : (
                  <li
                    key={`${item.group.key}-${item.link.slug}`}
                    className={`flex items-center gap-2 px-4 py-3 ${
                      selected.has(item.link.slug) ? "bg-muted/40" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(item.link.slug)}
                      onChange={() => toggleSelected(item.link.slug)}
                      aria-label={`Select /${item.link.slug}`}
                      className="h-4 w-4 shrink-0 accent-primary"
                    />
                    <LinkSlugBadge link={item.link} />
                    <span
                      className="min-w-0 flex-1 truncate text-sm text-muted-foreground"
                      title={item.link.url}
                    >
                      {formatDestinationSummary(item.link.url)}
                    </span>
                    {(item.link.folderIds ?? []).some(
                      (id) => id !== item.group.folder?.id,
                    ) ? (
                      <span className="max-w-[5rem] sm:max-w-[10rem]">
                        <FolderBadges
                          link={item.link}
                          folders={folders}
                          hideFolderId={item.group.folder?.id}
                        />
                      </span>
                    ) : null}
                    <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                      {item.link.stats.clickCount} clicks ·{" "}
                      {timeAgo(item.link.stats.lastClickAt)}
                    </span>
                    <RowActionMenu
                      link={item.link}
                      {...getRowActions(item.link)}
                      onToggleActive={toggleActive}
                    />
                  </li>
                ),
              )}
            </ul>
            {totalPages > 1 && (
              <PaginationControls
                page={safePage}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            )}
          </Card>
        )}
      </div>

      <CreateLinkDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        ownerUid={ownerUid}
        folders={orderedFolders}
      />

      <EditLinkDialog
        link={editingLink}
        open={editingLink !== null}
        onOpenChange={(open) => {
          if (!open) setEditingLink(null);
        }}
        folders={orderedFolders}
        ownerUid={ownerUid}
      />

      <DestructiveConfirmDialog
        open={deletingLink !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingLink(null);
        }}
        title={`Delete /${deletingLink?.slug ?? ""}?`}
        description="This will permanently delete the link and all of its click analytics. The short URL will stop working immediately."
        actionLabel="Yes, delete"
        onConfirm={() => {
          if (deletingLink) {
            void removeLink(deletingLink);
          }
        }}
      />

      <CreateFolderDialog
        open={folderCreateOpen}
        onOpenChange={setFolderCreateOpen}
        ownerUid={ownerUid}
      />

      <DestructiveConfirmDialog
        open={folderToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setFolderToDelete(null);
        }}
        title={`Delete "${folderToDelete?.name ?? ""}"?`}
        description="This deletes the folder. The links inside it are kept and will move to Uncategorized."
        actionLabel="Yes, delete"
        onConfirm={() => {
          if (folderToDelete) {
            void removeFolder(folderToDelete);
          }
        }}
      />

      <BulkFolderDialog
        open={bulkFolderOpen}
        onOpenChange={setBulkFolderOpen}
        folders={orderedFolders}
        count={selected.size}
        onApply={applyBulkFolders}
        ownerUid={ownerUid}
      />

      <DestructiveConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={`Delete ${selected.size} link${selected.size === 1 ? "" : "s"}?`}
        description="This will permanently delete the selected links and all of their click analytics. The short URLs will stop working immediately."
        actionLabel="Yes, delete all"
        onConfirm={() => {
          void bulkDelete();
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

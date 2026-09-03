import Link from "next/link";
import { getServerCaller } from "@/trpc/server";
import { CAMPAIGN_STATUSES, PAGE_SIZE, PLATFORM_LABELS } from "@/lib/constants";
import { formatCents } from "@/lib/payout";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CampaignStatusBadge } from "@/components/status-badge";
import { CampaignFilters } from "@/components/admin/campaign-filters";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function readStatus(value: unknown) {
  return CAMPAIGN_STATUSES.find((status) => status === value);
}

export default async function AdminCampaignsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const search =
    typeof params.search === "string" && params.search.trim()
      ? params.search.trim()
      : undefined;
  const status = readStatus(params.status);

  const caller = await getServerCaller();
  const result = await caller.campaign.list({
    page,
    pageSize: PAGE_SIZE,
    search,
    status,
  });

  const buildHref = (nextPage: number) => {
    const query = new URLSearchParams();
    if (search) query.set("search", search);
    if (status) query.set("status", status);
    if (nextPage > 1) query.set("page", String(nextPage));
    const suffix = query.toString();
    return suffix ? `/admin/campaigns?${suffix}` : "/admin/campaigns";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Campaigns</h1>
          <p className="text-muted-foreground text-sm">
            {result.total} campaign{result.total === 1 ? "" : "s"}
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/campaigns/new">New campaign</Link>
        </Button>
      </div>

      <CampaignFilters />

      <div className="rounded-md border">
        <Table>
          <caption className="sr-only">
            Campaigns, page {result.page} of {result.pageCount}
          </caption>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Platforms</TableHead>
              <TableHead className="text-right">Payout / 1k</TableHead>
              <TableHead className="text-right">Budget</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Pending</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-muted-foreground h-24 text-center"
                >
                  No campaigns match these filters.
                </TableCell>
              </TableRow>
            ) : (
              result.items.map((campaign) => (
                <TableRow key={campaign.id}>
                  <TableCell>
                    <Link
                      href={`/admin/campaigns/${campaign.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {campaign.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {campaign.platforms.map((platform) => (
                        <Badge key={platform} variant="outline">
                          {PLATFORM_LABELS[platform]}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCents(campaign.payoutPer1kViews)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCents(campaign.totalBudget)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(campaign.startsAt)} – {formatDate(campaign.endsAt)}
                  </TableCell>
                  <TableCell>
                    <CampaignStatusBadge status={campaign.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {campaign.pendingCount}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <nav
        className="flex items-center justify-between"
        aria-label="Pagination"
      >
        <p className="text-muted-foreground text-sm">
          Page {result.page} of {result.pageCount}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            asChild={result.page > 1}
            disabled={result.page <= 1}
          >
            {result.page > 1 ? (
              <Link href={buildHref(result.page - 1)}>Previous</Link>
            ) : (
              <span>Previous</span>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            asChild={result.page < result.pageCount}
            disabled={result.page >= result.pageCount}
          >
            {result.page < result.pageCount ? (
              <Link href={buildHref(result.page + 1)}>Next</Link>
            ) : (
              <span>Next</span>
            )}
          </Button>
        </div>
      </nav>
    </div>
  );
}

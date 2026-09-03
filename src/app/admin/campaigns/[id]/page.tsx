import Link from "next/link";
import { getServerCaller } from "@/trpc/server";
import { PLATFORM_LABELS } from "@/lib/constants";
import { formatCents } from "@/lib/payout";
import { formatDate, formatNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CampaignStatusBadge } from "@/components/status-badge";
import { DailyViewsChart } from "@/components/admin/daily-views-chart";
import { ReviewQueue } from "@/components/admin/review-queue";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const caller = await getServerCaller();
  const { campaign, budget, counts, dailyViews } =
    await caller.campaign.overview({ id });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{campaign.title}</h1>
            <CampaignStatusBadge status={campaign.status} />
          </div>
          <p className="text-muted-foreground text-sm">
            {formatDate(campaign.startsAt)} – {formatDate(campaign.endsAt)} ·{" "}
            {formatCents(campaign.payoutPer1kViews)} per 1,000 views
          </p>
          <div className="flex flex-wrap gap-1">
            {campaign.platforms.map((platform) => (
              <Badge key={platform} variant="outline">
                {PLATFORM_LABELS[platform]}
              </Badge>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/admin/campaigns">Back to list</Link>
          </Button>
          <Button asChild>
            <Link href={`/admin/campaigns/${campaign.id}/edit`}>Edit</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
          <CardDescription>
            Spend is the sum of approved earnings, capped at the total budget.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Approved views"
              value={formatNumber(budget.approvedViews)}
            />
            <Stat label="Budget spent" value={formatCents(budget.spent)} />
            <Stat label="Budget left" value={formatCents(budget.left)} />
            <Stat
              label="Total budget"
              value={formatCents(budget.totalBudget)}
            />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daily views</CardTitle>
          <CardDescription>
            New views per day across the campaign period. Days without a metric
            row show as zero.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DailyViewsChart data={dailyViews} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Review queue</CardTitle>
          <CardDescription>
            {counts.pending} pending · {counts.approved} approved ·{" "}
            {counts.rejected} rejected
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReviewQueue
            campaignId={campaign.id}
            payoutPer1kViews={campaign.payoutPer1kViews}
          />
        </CardContent>
      </Card>
    </div>
  );
}

import { getCurrentUser } from "@/server/auth";
import { getServerCaller } from "@/trpc/server";
import { PLATFORM_LABELS } from "@/lib/constants";
import { formatCents } from "@/lib/payout";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SubmitClipDialog } from "@/components/creator/submit-clip-dialog";

export default async function BrowseCampaignsPage() {
  const user = await getCurrentUser();

  if (user?.role !== "creator") {
    return (
      <Alert variant="destructive">
        <AlertTitle>Creators only</AlertTitle>
        <AlertDescription>
          Switch to a creator user from the header to browse campaigns.
        </AlertDescription>
      </Alert>
    );
  }

  const caller = await getServerCaller();
  const campaigns = await caller.campaign.listActive();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Active campaigns</h1>
        <p className="text-muted-foreground text-sm">
          Submit a clip and earn per 1,000 views, up to the campaign budget.
        </p>
      </div>

      {campaigns.length === 0 ? (
        <Alert>
          <AlertTitle>Nothing active right now</AlertTitle>
          <AlertDescription>
            Check back once a brand activates a campaign.
          </AlertDescription>
        </Alert>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {campaigns.map((campaign) => (
            <li key={campaign.id}>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>{campaign.title}</CardTitle>
                  <CardDescription>
                    {formatDate(campaign.startsAt)} –{" "}
                    {formatDate(campaign.endsAt)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-lg font-semibold tabular-nums">
                    {formatCents(campaign.payoutPer1kViews)}
                    <span className="text-muted-foreground text-sm font-normal">
                      {" "}
                      per 1,000 views
                    </span>
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {campaign.platforms.map((platform) => (
                      <Badge key={platform} variant="outline">
                        {PLATFORM_LABELS[platform]}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
                <CardFooter>
                  <SubmitClipDialog
                    campaignId={campaign.id}
                    campaignTitle={campaign.title}
                    platforms={campaign.platforms}
                  />
                </CardFooter>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

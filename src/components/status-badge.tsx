import { Badge } from "@/components/ui/badge";
import type { CampaignStatus, SubmissionStatus } from "@/server/db/schema";

type Variant = React.ComponentProps<typeof Badge>["variant"];

const CAMPAIGN_VARIANT: Record<CampaignStatus, Variant> = {
  draft: "outline",
  active: "default",
  paused: "secondary",
  completed: "secondary",
};

const SUBMISSION_VARIANT: Record<SubmissionStatus, Variant> = {
  pending: "outline",
  approved: "default",
  rejected: "destructive",
  paid: "secondary",
};

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <Badge variant={CAMPAIGN_VARIANT[status]} className="capitalize">
      {status}
    </Badge>
  );
}

export function SubmissionStatusBadge({
  status,
}: {
  status: SubmissionStatus;
}) {
  return (
    <Badge variant={SUBMISSION_VARIANT[status]} className="capitalize">
      {status}
    </Badge>
  );
}

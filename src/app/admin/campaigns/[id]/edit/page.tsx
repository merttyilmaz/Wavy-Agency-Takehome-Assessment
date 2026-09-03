import { getServerCaller } from "@/trpc/server";
import { CampaignForm } from "@/components/admin/campaign-form";

export default async function EditCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const caller = await getServerCaller();
  const campaign = await caller.campaign.byId({ id });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Edit campaign</h1>
      <CampaignForm
        campaignId={campaign.id}
        defaultValues={{
          title: campaign.title,
          platforms: campaign.platforms,
          payoutPer1kViews: campaign.payoutPer1kViews,
          totalBudget: campaign.totalBudget,
          status: campaign.status,
          startsAt: campaign.startsAt,
          endsAt: campaign.endsAt,
        }}
      />
    </div>
  );
}

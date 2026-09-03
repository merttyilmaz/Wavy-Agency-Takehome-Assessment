import { CampaignForm } from "@/components/admin/campaign-form";

const DAY_MS = 24 * 60 * 60 * 1000;

export default function NewCampaignPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">New campaign</h1>
      <CampaignForm
        defaultValues={{
          title: "",
          platforms: ["tiktok"],
          payoutPer1kViews: 250,
          totalBudget: 100_000,
          status: "draft",
          startsAt: new Date(),
          endsAt: new Date(Date.now() + 30 * DAY_MS),
        }}
      />
    </div>
  );
}

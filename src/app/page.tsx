import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default async function HomePage() {
  const user = await getCurrentUser();

  if (user?.role === "admin") redirect("/admin/campaigns");
  if (user?.role === "creator") redirect("/campaigns");

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Clipping marketplace</h1>
        <p className="text-muted-foreground">
          Brands post paid clipping campaigns, creators submit short-form clips
          and get paid per 1,000 views.
        </p>
      </div>

      <Alert>
        <AlertTitle>Pick a user to continue</AlertTitle>
        <AlertDescription>
          There is no login. Use the user switcher in the header to sign in as an
          admin or a creator. Admins manage campaigns and review submissions;
          creators browse{" "}
          <Link href="/campaigns" className="underline underline-offset-4">
            active campaigns
          </Link>{" "}
          and submit clips.
        </AlertDescription>
      </Alert>
    </div>
  );
}

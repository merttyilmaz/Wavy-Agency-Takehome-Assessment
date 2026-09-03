import { getCurrentUser } from "@/server/auth";
import { getServerCaller } from "@/trpc/server";
import { PLATFORM_LABELS } from "@/lib/constants";
import { formatCents } from "@/lib/payout";
import { formatDate, formatNumber } from "@/lib/format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SubmissionStatusBadge } from "@/components/status-badge";

export default async function MySubmissionsPage() {
  const user = await getCurrentUser();

  if (user?.role !== "creator") {
    return (
      <Alert variant="destructive">
        <AlertTitle>Creators only</AlertTitle>
        <AlertDescription>
          Switch to a creator user from the header to see your submissions.
        </AlertDescription>
      </Alert>
    );
  }

  const caller = await getServerCaller();
  const submissions = await caller.submission.mine();

  const totalEarnings = submissions.reduce(
    (sum, row) => sum + row.estimatedEarnings,
    0,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">My submissions</h1>
        <p className="text-muted-foreground text-sm">
          {submissions.length} submission{submissions.length === 1 ? "" : "s"} ·{" "}
          {formatCents(totalEarnings)} estimated earnings
        </p>
      </div>

      <div className="rounded-md border">
        <Table>
          <caption className="sr-only">Your clip submissions</caption>
          <TableHeader>
            <TableRow>
              <TableHead>Campaign</TableHead>
              <TableHead>Post</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Views</TableHead>
              <TableHead className="text-right">Est. earnings</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {submissions.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-muted-foreground h-24 text-center"
                >
                  You have not submitted a clip yet.
                </TableCell>
              </TableRow>
            ) : (
              submissions.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">
                    {row.campaignTitle}
                  </TableCell>
                  <TableCell className="max-w-[20rem]">
                    <a
                      href={row.postUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="block truncate underline-offset-4 hover:underline"
                    >
                      {row.postUrl}
                    </a>
                  </TableCell>
                  <TableCell>{PLATFORM_LABELS[row.platform]}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(row.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <SubmissionStatusBadge status={row.status} />
                      {row.rejectionReason ? (
                        <p className="text-muted-foreground max-w-[18rem] text-xs">
                          {row.rejectionReason}
                        </p>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(row.views)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCents(row.estimatedEarnings)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-muted-foreground text-sm">
        Earnings are <code>floor(views / 1000) × payout per 1,000 views</code>{" "}
        on the most recent metric row, and only accrue once a submission is
        approved.
      </p>
    </div>
  );
}

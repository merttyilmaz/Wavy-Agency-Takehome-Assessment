"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { TRPCClientErrorLike } from "@trpc/client";
import { useTRPC } from "@/trpc/client";
import type { AppRouter } from "@/server/trpc/root";
import { PLATFORM_LABELS } from "@/lib/constants";
import { formatNumber } from "@/lib/format";
import { formatCents } from "@/lib/payout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const MIN_REASON = 5;

function appCodeOf(error: TRPCClientErrorLike<AppRouter>): string | null {
  const data = error.data as { appCode?: string | null } | undefined;
  return data?.appCode ?? null;
}

export function ReviewQueue({
  campaignId,
  payoutPer1kViews,
}: {
  campaignId: string;
  payoutPer1kViews: number;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [budgetError, setBudgetError] = useState<string | null>(null);

  const queueOptions = trpc.submission.reviewQueue.queryOptions({
    campaignId,
    status: "pending",
  });
  const queue = useQuery(queueOptions);

  async function refresh() {
    await queryClient.invalidateQueries();
    router.refresh();
  }

  const approve = useMutation(
    trpc.submission.approve.mutationOptions({
      onSuccess: async (result) => {
        setBudgetError(null);
        toast.success(
          result.campaignCompleted
            ? "Approved. The budget is now spent and the campaign is completed."
            : `Approved. ${formatCents(result.budgetLeft)} left in budget.`,
        );
        await refresh();
      },
      onError: async (error) => {
        const code = appCodeOf(error);
        // The typed error the UI acts on: show it inline instead of a toast,
        // and refresh so the reviewer sees the budget that caused it.
        if (code === "BUDGET_EXCEEDED") setBudgetError(error.message);
        else toast.error(error.message);
        await refresh();
      },
    }),
  );

  const reject = useMutation(
    trpc.submission.reject.mutationOptions({
      onSuccess: async () => {
        setRejecting(null);
        setReason("");
        toast.success("Submission rejected");
        await refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  if (queue.isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (queue.error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Could not load the review queue</AlertTitle>
        <AlertDescription>{queue.error.message}</AlertDescription>
      </Alert>
    );
  }

  const rows = queue.data ?? [];

  return (
    <div className="space-y-4">
      {budgetError ? (
        <Alert variant="destructive">
          <AlertTitle>Budget exceeded</AlertTitle>
          <AlertDescription>{budgetError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="rounded-md border">
        <Table>
          <caption className="sr-only">Pending submissions</caption>
          <TableHeader>
            <TableRow>
              <TableHead>Creator</TableHead>
              <TableHead>Post</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead className="text-right">Views</TableHead>
              <TableHead className="text-right">Would cost</TableHead>
              <TableHead className="text-right">Review</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-muted-foreground h-24 text-center"
                >
                  Nothing waiting for review.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.creatorEmail}</TableCell>
                  <TableCell className="max-w-[22rem]">
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
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(row.views)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCents(
                      Math.floor(row.views / 1000) * payoutPer1kViews,
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        disabled={approve.isPending}
                        onClick={() =>
                          approve.mutate({ submissionId: row.id })
                        }
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRejecting(row.id);
                          setReason("");
                        }}
                      >
                        Reject
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={rejecting !== null}
        onOpenChange={(open) => !open && setRejecting(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject submission</DialogTitle>
            <DialogDescription>
              A reason is required and is shown to the creator.
            </DialogDescription>
          </DialogHeader>

          <label htmlFor="rejection-reason" className="text-sm font-medium">
            Reason
          </label>
          <Textarea
            id="rejection-reason"
            value={reason}
            rows={4}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Clip does not show the product."
          />
          <p className="text-muted-foreground text-xs">
            At least {MIN_REASON} characters.
          </p>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={reason.trim().length < MIN_REASON || reject.isPending}
              onClick={() =>
                rejecting &&
                reject.mutate({
                  submissionId: rejecting,
                  reason: reason.trim(),
                })
              }
            >
              {reject.isPending ? "Rejecting…" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

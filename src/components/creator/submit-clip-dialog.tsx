"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createSubmissionSchema,
  type CreateSubmissionInput,
} from "@/lib/validation/submission";
import { PLATFORM_LABELS } from "@/lib/constants";
import { isPostUrlForPlatform } from "@/lib/post-url";
import type { Platform } from "@/server/db/schema";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";

const PLATFORM_HINTS: Record<Platform, string> = {
  tiktok: "https://www.tiktok.com/@handle/video/7300000000000000000",
  instagram: "https://www.instagram.com/reel/Cabc12345",
  youtube: "https://www.youtube.com/shorts/abc123def",
};

export function SubmitClipDialog({
  campaignId,
  campaignTitle,
  platforms,
}: {
  campaignId: string;
  campaignTitle: string;
  platforms: Platform[];
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const form = useForm<CreateSubmissionInput>({
    resolver: standardSchemaResolver(createSubmissionSchema),
    defaultValues: {
      campaignId,
      platform: platforms[0],
      postUrl: "",
    },
  });

  const platform = form.watch("platform");

  const create = useMutation(
    trpc.submission.create.mutationOptions({
      onSuccess: async () => {
        toast.success("Clip submitted. It is now waiting for review.");
        setOpen(false);
        form.reset({ campaignId, platform: platforms[0], postUrl: "" });
        await queryClient.invalidateQueries();
        router.refresh();
      },
      onError: (error) => {
        // The URL rules live on the server too; surface them on the field the
        // creator can actually fix.
        const data = error.data as { appCode?: string | null } | undefined;
        if (
          data?.appCode === "INVALID_POST_URL" ||
          data?.appCode === "DUPLICATE_SUBMISSION"
        ) {
          form.setError("postUrl", { message: error.message });
        } else if (data?.appCode === "PLATFORM_NOT_ALLOWED") {
          form.setError("platform", { message: error.message });
        } else {
          toast.error(error.message);
        }
      },
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Submit a clip</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit a clip</DialogTitle>
          <DialogDescription>{campaignTitle}</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit((values) => create.mutate(values))}
          noValidate
        >
          <FieldGroup>
            <Controller
              control={form.control}
              name="platform"
              render={({ field, fieldState }) => (
                <Field data-invalid={!!fieldState.error}>
                  <FieldLabel htmlFor="platform">Platform</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="platform">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {platforms.map((value) => (
                        <SelectItem key={value} value={value}>
                          {PLATFORM_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            <Field data-invalid={!!form.formState.errors.postUrl}>
              <FieldLabel htmlFor="postUrl">Post URL</FieldLabel>
              <Input
                id="postUrl"
                type="url"
                autoComplete="off"
                aria-invalid={!!form.formState.errors.postUrl}
                placeholder={PLATFORM_HINTS[platform]}
                {...form.register("postUrl", {
                  validate: (value) =>
                    isPostUrlForPlatform(value, platform) ||
                    `That does not look like a ${PLATFORM_LABELS[platform]} post URL.`,
                })}
              />
              <FieldDescription>
                Example: {PLATFORM_HINTS[platform]}
              </FieldDescription>
              <FieldError errors={[form.formState.errors.postUrl]} />
            </Field>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? "Submitting…" : "Submit"}
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}

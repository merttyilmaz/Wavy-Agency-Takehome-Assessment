"use client";

import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  campaignInputSchema,
  type CampaignValues,
} from "@/lib/validation/campaign";
import { CAMPAIGN_STATUSES, PLATFORMS, PLATFORM_LABELS } from "@/lib/constants";
import { toDateInputValue } from "@/lib/format";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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

type Props = {
  campaignId?: string;
  defaultValues: CampaignValues;
};

/**
 * `campaignInputSchema` is the same object the tRPC procedure parses. Zod 4
 * implements the Standard Schema spec, so react-hook-form validates through
 * `standardSchemaResolver` against exactly that schema.
 */
export function CampaignForm({ campaignId, defaultValues }: Props) {
  const trpc = useTRPC();
  const router = useRouter();

  const form = useForm<CampaignValues>({
    resolver: standardSchemaResolver(campaignInputSchema),
    defaultValues,
  });

  const create = useMutation(trpc.campaign.create.mutationOptions());
  const update = useMutation(trpc.campaign.update.mutationOptions());
  const pending = create.isPending || update.isPending;

  async function onSubmit(values: CampaignValues) {
    try {
      const campaign = campaignId
        ? await update.mutateAsync({ id: campaignId, data: values })
        : await create.mutateAsync(values);

      toast.success(campaignId ? "Campaign updated" : "Campaign created");
      router.push(`/admin/campaigns/${campaign.id}`);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Something went wrong",
      );
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FieldGroup className="max-w-2xl">
        <Field data-invalid={!!form.formState.errors.title}>
          <FieldLabel htmlFor="title">Title</FieldLabel>
          <Input
            id="title"
            aria-invalid={!!form.formState.errors.title}
            {...form.register("title")}
          />
          <FieldError errors={[form.formState.errors.title]} />
        </Field>

        <Controller
          control={form.control}
          name="platforms"
          render={({ field, fieldState }) => (
            <Field data-invalid={!!fieldState.error}>
              <FieldLabel asChild>
                <legend>Platforms</legend>
              </FieldLabel>
              <div className="flex flex-wrap gap-4">
                {PLATFORMS.map((platform) => {
                  const checked = field.value?.includes(platform) ?? false;
                  return (
                    <label
                      key={platform}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(next) =>
                          field.onChange(
                            next
                              ? [...(field.value ?? []), platform]
                              : (field.value ?? []).filter(
                                  (value) => value !== platform,
                                ),
                          )
                        }
                      />
                      {PLATFORM_LABELS[platform]}
                    </label>
                  );
                })}
              </div>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />

        <div className="grid gap-6 sm:grid-cols-2">
          <Field data-invalid={!!form.formState.errors.payoutPer1kViews}>
            <FieldLabel htmlFor="payoutPer1kViews">
              Payout per 1,000 views (cents)
            </FieldLabel>
            <Input
              id="payoutPer1kViews"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              aria-invalid={!!form.formState.errors.payoutPer1kViews}
              {...form.register("payoutPer1kViews", { valueAsNumber: true })}
            />
            <FieldDescription>250 = $2.50 per 1,000 views.</FieldDescription>
            <FieldError errors={[form.formState.errors.payoutPer1kViews]} />
          </Field>

          <Field data-invalid={!!form.formState.errors.totalBudget}>
            <FieldLabel htmlFor="totalBudget">Total budget (cents)</FieldLabel>
            <Input
              id="totalBudget"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              aria-invalid={!!form.formState.errors.totalBudget}
              {...form.register("totalBudget", { valueAsNumber: true })}
            />
            <FieldDescription>500000 = $5,000.00.</FieldDescription>
            <FieldError errors={[form.formState.errors.totalBudget]} />
          </Field>
        </div>

        <div className="grid gap-6 sm:grid-cols-3">
          <Controller
            control={form.control}
            name="status"
            render={({ field, fieldState }) => (
              <Field data-invalid={!!fieldState.error}>
                <FieldLabel htmlFor="status">Status</FieldLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CAMPAIGN_STATUSES.map((value) => (
                      <SelectItem
                        key={value}
                        value={value}
                        className="capitalize"
                      >
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          <Controller
            control={form.control}
            name="startsAt"
            render={({ field, fieldState }) => (
              <Field data-invalid={!!fieldState.error}>
                <FieldLabel htmlFor="startsAt">Starts at</FieldLabel>
                <Input
                  id="startsAt"
                  type="date"
                  value={field.value ? toDateInputValue(field.value) : ""}
                  onChange={(event) =>
                    field.onChange(new Date(`${event.target.value}T00:00:00Z`))
                  }
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          <Controller
            control={form.control}
            name="endsAt"
            render={({ field, fieldState }) => (
              <Field data-invalid={!!fieldState.error}>
                <FieldLabel htmlFor="endsAt">Ends at</FieldLabel>
                <Input
                  id="endsAt"
                  type="date"
                  value={field.value ? toDateInputValue(field.value) : ""}
                  onChange={(event) =>
                    field.onChange(new Date(`${event.target.value}T00:00:00Z`))
                  }
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        </div>

        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : campaignId ? "Save changes" : "Create campaign"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

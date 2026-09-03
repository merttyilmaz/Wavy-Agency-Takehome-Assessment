"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { CAMPAIGN_STATUSES } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "all";

/**
 * Filters live in the URL so the list is shareable and the server component
 * can read them directly. Search is debounced to avoid a query per keystroke.
 */
export function CampaignFilters() {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [search, setSearch] = useState(params.get("search") ?? "");
  const status = params.get("status") ?? ALL;

  useEffect(() => {
    const current = params.get("search") ?? "";
    if (search === current) return;

    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (search) next.set("search", search);
      else next.delete("search");
      next.delete("page");
      startTransition(() => router.replace(`/admin/campaigns?${next}`));
    }, 300);

    return () => clearTimeout(timer);
  }, [search, params, router]);

  function onStatusChange(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === ALL) next.delete("status");
    else next.set("status", value);
    next.delete("page");
    startTransition(() => router.replace(`/admin/campaigns?${next}`));
  }

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="campaign-search">Search title</Label>
        <Input
          id="campaign-search"
          value={search}
          placeholder="Summer drop…"
          className="w-64"
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="campaign-status">Status</Label>
        <Select value={status} onValueChange={onStatusChange}>
          <SelectTrigger id="campaign-status" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {CAMPAIGN_STATUSES.map((value) => (
              <SelectItem key={value} value={value} className="capitalize">
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p
        className="text-muted-foreground pb-2 text-sm"
        role="status"
        aria-live="polite"
      >
        {isPending ? "Updating…" : ""}
      </p>
    </div>
  );
}

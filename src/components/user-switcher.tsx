"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { UserIcon } from "lucide-react";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

/** Dev-only identity switcher. There is no login; see NOTES.md. */
export function UserSwitcher() {
  const trpc = useTRPC();

  const me = useQuery(trpc.user.me.queryOptions());
  const users = useQuery(trpc.user.list.queryOptions());

  const switchTo = useMutation(
    trpc.user.switchTo.mutationOptions({
      // Identity decides the whole shell (which nav, which pages are allowed),
      // so this does a full navigation rather than a client-side refresh, and
      // lets "/" route to the right landing page for the new role.
      onSuccess: () => window.location.assign("/"),
    }),
  );

  const label = me.data ? me.data.email : "Not signed in";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <UserIcon className="size-4" aria-hidden />
          <span className="max-w-[14ch] truncate">{label}</span>
          {me.data ? (
            <Badge variant="secondary" className="capitalize">
              {me.data.role}
            </Badge>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Switch user (dev only)</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {users.data?.map((user) => (
          <DropdownMenuItem
            key={user.id}
            disabled={switchTo.isPending || user.id === me.data?.id}
            onSelect={() => switchTo.mutate({ userId: user.id })}
          >
            <span className="flex-1 truncate">{user.email}</span>
            <Badge variant="outline" className="capitalize">
              {user.role}
            </Badge>
          </DropdownMenuItem>
        ))}
        {users.isLoading ? (
          <DropdownMenuItem disabled>Loading…</DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

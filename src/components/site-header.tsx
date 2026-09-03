import Link from "next/link";
import { getCurrentUser } from "@/server/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserSwitcher } from "@/components/user-switcher";

export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3">
        <Link href="/" className="font-semibold">
          Clipping marketplace
        </Link>

        <nav className="flex items-center gap-1 text-sm" aria-label="Main">
          {user?.role === "admin" ? (
            <Link
              href="/admin/campaigns"
              className="rounded-md px-3 py-1.5 hover:bg-accent"
            >
              Campaigns
            </Link>
          ) : null}
          {user?.role === "creator" ? (
            <>
              <Link
                href="/campaigns"
                className="rounded-md px-3 py-1.5 hover:bg-accent"
              >
                Browse
              </Link>
              <Link
                href="/submissions"
                className="rounded-md px-3 py-1.5 hover:bg-accent"
              >
                My submissions
              </Link>
            </>
          ) : null}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <UserSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

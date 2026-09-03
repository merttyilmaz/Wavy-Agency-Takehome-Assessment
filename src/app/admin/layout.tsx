import { getCurrentUser } from "@/server/auth";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * A layout guard is convenience only — the procedures themselves reject
 * non-admins, so nothing here is load-bearing for security.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (user?.role !== "admin") {
    return (
      <Alert variant="destructive">
        <AlertTitle>Admins only</AlertTitle>
        <AlertDescription>
          Switch to an admin user from the header to open this area.
        </AlertDescription>
      </Alert>
    );
  }

  return <>{children}</>;
}

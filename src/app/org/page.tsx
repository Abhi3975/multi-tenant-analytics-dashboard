import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions";
import type { Role } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface TeamRow {
  role: Role;
  teams: {
    id: string;
    name: string;
    organizations: { name: string } | null;
  } | null;
}

export default async function OrgPage() {
  const user = await requireUser();
  const supabase = createClient();

  const { data } = await supabase
    .from("memberships")
    .select("role, teams(id, name, organizations(name))")
    .eq("user_id", user.id)
    .order("role");

  const memberships = (data ?? []) as unknown as TeamRow[];

  return (
    <div className="mx-auto max-w-3xl p-6">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your teams</h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
        <form action={signOut}>
          <Button variant="outline" size="sm" type="submit">
            Sign out
          </Button>
        </form>
      </header>

      {memberships.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You don&apos;t belong to any teams yet.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {memberships.map(({ role, teams }) =>
            teams ? (
              <Link key={teams.id} href={`/org/${teams.id}`} className="block">
                <Card className="transition-colors hover:bg-accent">
                  <CardHeader className="flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-base">{teams.name}</CardTitle>
                    <Badge variant="secondary" className="capitalize">
                      {role}
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {teams.organizations?.name ?? "Organization"}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}

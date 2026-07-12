"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { removeMember, updateMemberRole } from "./actions";
import type { Role } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function MemberRow({
  teamId,
  userId,
  email,
  role,
  isSelf,
}: {
  teamId: string;
  userId: string;
  email: string;
  role: Role;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onRoleChange(newRole: string) {
    const fd = new FormData();
    fd.set("teamId", teamId);
    fd.set("userId", userId);
    fd.set("role", newRole);
    startTransition(async () => {
      await updateMemberRole(fd);
      router.refresh();
    });
  }

  function onRemove() {
    const fd = new FormData();
    fd.set("teamId", teamId);
    fd.set("userId", userId);
    startTransition(async () => {
      await removeMember(fd);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-between rounded-lg border px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-sm">{email}</span>
        {isSelf && <Badge variant="secondary">you</Badge>}
      </div>
      <div className="flex items-center gap-2">
        {isSelf ? (
          <Badge variant="outline" className="capitalize">
            {role}
          </Badge>
        ) : (
          <>
            <select
              value={role}
              disabled={pending}
              onChange={(e) => onRoleChange(e.target.value)}
              className="h-8 rounded-md border bg-background px-2 text-sm capitalize"
              aria-label={`Role for ${email}`}
            >
              <option value="admin">admin</option>
              <option value="editor">editor</option>
              <option value="viewer">viewer</option>
            </select>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={onRemove}
              className="text-destructive"
            >
              Remove
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

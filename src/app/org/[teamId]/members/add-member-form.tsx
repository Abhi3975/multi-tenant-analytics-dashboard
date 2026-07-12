"use client";

import { UserPlus } from "lucide-react";

import { addMember } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export function AddMemberForm({ teamId }: { teamId: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <form action={addMember} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="teamId" value={teamId} />
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              Existing user email
            </label>
            <Input
              name="email"
              type="email"
              placeholder="teammate@example.com"
              className="h-8 w-64"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Role</label>
            <select
              name="role"
              defaultValue="viewer"
              className="h-8 rounded-md border bg-background px-2 text-sm"
            >
              <option value="admin">admin</option>
              <option value="editor">editor</option>
              <option value="viewer">viewer</option>
            </select>
          </div>
          <Button size="sm" type="submit">
            <UserPlus className="mr-1" /> Add member
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

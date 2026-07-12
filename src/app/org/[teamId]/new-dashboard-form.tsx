"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { createDashboard } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function NewDashboardForm({ teamId }: { teamId: string }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1" /> New Dashboard
      </Button>
    );
  }

  return (
    <form action={createDashboard} className="flex items-center gap-2">
      <input type="hidden" name="teamId" value={teamId} />
      <Input
        name="name"
        placeholder="Dashboard name"
        autoFocus
        className="h-9 w-56"
      />
      <Button size="sm" type="submit">
        Create
      </Button>
      <Button
        size="sm"
        variant="ghost"
        type="button"
        onClick={() => setOpen(false)}
      >
        Cancel
      </Button>
    </form>
  );
}

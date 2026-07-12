"use client";

import { useState } from "react";
import { FolderPlus } from "lucide-react";

import { createProject } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function NewProjectForm({ teamId }: { teamId: string }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <FolderPlus className="mr-1" /> New Project
      </Button>
    );
  }

  return (
    <form action={createProject} className="flex items-center gap-2">
      <input type="hidden" name="teamId" value={teamId} />
      <Input
        name="name"
        placeholder="Project name"
        autoFocus
        className="h-8 w-52"
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

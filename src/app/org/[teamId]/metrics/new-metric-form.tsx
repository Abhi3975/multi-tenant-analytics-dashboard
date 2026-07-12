"use client";

import { createMetricDefinition } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export function NewMetricForm({ teamId }: { teamId: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <form
          action={createMetricDefinition}
          className="flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="teamId" value={teamId} />
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Key</label>
            <Input name="key" placeholder="signups" className="h-8 w-36" required />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Label</label>
            <Input name="label" placeholder="Signups" className="h-8 w-40" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Unit</label>
            <Input name="unit" placeholder="optional" className="h-8 w-28" />
          </div>
          <Button size="sm" type="submit">
            Add metric
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

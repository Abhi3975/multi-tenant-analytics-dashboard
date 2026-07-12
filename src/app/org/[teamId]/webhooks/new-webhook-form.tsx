"use client";

import { createWebhook } from "./actions";
import { WEBHOOK_EVENTS } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export function NewWebhookForm({ teamId }: { teamId: string }) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <form action={createWebhook} className="space-y-3">
          <input type="hidden" name="teamId" value={teamId} />
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Payload URL</label>
            <Input
              name="url"
              type="url"
              placeholder="https://example.com/hooks/analytics"
              required
            />
          </div>
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Events</span>
            <div className="grid grid-cols-2 gap-1">
              {WEBHOOK_EVENTS.map((ev) => (
                <label key={ev} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="events"
                    value={ev}
                    defaultChecked
                    className="size-3.5"
                  />
                  <code className="text-xs">{ev}</code>
                </label>
              ))}
            </div>
          </div>
          <Button size="sm" type="submit">
            Add webhook
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

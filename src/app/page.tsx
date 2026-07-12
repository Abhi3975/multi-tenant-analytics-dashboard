import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Multi-Tenant Analytics Dashboard
        </h1>
        <p className="max-w-md text-muted-foreground">
          Hierarchical, real-time collaborative analytics. Project foundation is
          set up — features come next.
        </p>
      </div>
      <div className="flex gap-3">
        <Button>Get started</Button>
        <Button variant="outline">Documentation</Button>
      </div>
    </main>
  );
}

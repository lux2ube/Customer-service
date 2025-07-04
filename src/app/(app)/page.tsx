import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Rocket } from "lucide-react";

export default async function HomePage() {
    return (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm">
            <div className="flex flex-col items-center gap-4 text-center">
                <Rocket className="h-16 w-16 text-primary" />
                <h1 className="text-3xl font-bold tracking-tight">
                    Let's Build Something Awesome
                </h1>
                <p className="text-muted-foreground max-w-md">
                    This is your new starting point. Tell me what you want to create, and we'll build it together, step by step.
                </p>
            </div>
      </div>
    );
}

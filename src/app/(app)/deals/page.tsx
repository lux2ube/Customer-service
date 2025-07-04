import { PageHeader } from "@/components/page-header";

export default function DealsPage() {
    return (
        <>
            <PageHeader 
                title="Deals / Opportunities"
                description="Track sales deals by stage and value."
            />
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm h-full">
                <div className="flex flex-col items-center gap-1 text-center">
                    <h3 className="text-2xl font-bold tracking-tight">
                        Deals module is under construction.
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        Come back soon to manage your sales pipeline.
                    </p>
                </div>
            </div>
        </>
    );
}

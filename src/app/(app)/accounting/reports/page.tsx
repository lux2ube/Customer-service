import { PageHeader } from "@/components/page-header";

export default function ReportsPage() {
    return (
        <>
            <PageHeader 
                title="Reports / Analytics"
                description="Visual insights and KPIs for your accounting data."
            />
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm h-full">
                <div className="flex flex-col items-center gap-1 text-center">
                    <h3 className="text-2xl font-bold tracking-tight">
                        Reporting module is under construction.
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        Come back soon to see your financial analytics.
                    </p>
                </div>
            </div>
        </>
    );
}

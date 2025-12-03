
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { 
    AreaChart, 
    BookCopy, 
    BookText, 
    LineChart, 
    List, 
    Scale, 
    Users 
} from "lucide-react";
import Link from "next/link";

const financialStatements = [
    {
        title: "Income Statement",
        description: "Shows revenue, expenses, and net earnings over a period, indicating overall financial performance.",
        icon: <LineChart className="h-6 w-6 text-muted-foreground" />,
        href: "/reports/income-statement",
    },
    {
        title: "Balance Sheet",
        description: "Displays your company's assets, liabilities, and equity at a single point in time, showing overall financial health.",
        icon: <Scale className="h-6 w-6 text-muted-foreground" />,
        href: "/reports/balance-sheet",
    },
    {
        title: "Trial Balance",
        description: "Summarizes all account increases and decreases to verify the ledger is balanced.",
        icon: <BookCopy className="h-6 w-6 text-muted-foreground" />,
        href: "/reports/trial-balance",
    },
    {
        title: "Cash Flow Statement",
        description: "Tracks cash inflows and outflows, giving insight into liquidity and cash management over a period.",
        icon: <AreaChart className="h-6 w-6 text-muted-foreground" />,
        href: "/reports/cash-flow",
    },
];

const clientReports = [
    {
        title: "Client Balance Summary",
        description: "Shows total received, paid, and outstanding balances for each client.",
        icon: <Users className="h-6 w-6 text-muted-foreground" />,
        href: "/reports/client-balance-summary",
    },
    {
        title: "Client Balance Detail",
        description: "Shows all transactions for a client with running balance before/after each entry.",
        icon: <List className="h-6 w-6 text-muted-foreground" />,
        href: "/reports/client-balance-detail",
    },
];

const detailedReports = [
    {
        title: "Account Balances",
        description: "Lists all accounts and their balances, including increases, decreases, and net movement.",
        icon: <List className="h-6 w-6 text-muted-foreground" />,
        href: "/reports/account-balances",
    },
    {
        title: "Account Transactions",
        description: "View detailed transaction history for any account with running balances.",
        icon: <BookText className="h-6 w-6 text-muted-foreground" />,
        href: "/reports/account-transactions",
    },
];

const ReportCard = ({ report }: { report: { title: string, description: string, icon: React.ReactNode, href?: string } }) => {
    const cardContent = (
        <Card className="transition-shadow duration-300 h-full hover:shadow-lg data-[disabled=true]:opacity-50 data-[disabled=true]:cursor-not-allowed data-[disabled=true]:hover:shadow-sm" data-disabled={!report.href}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base font-medium">{report.title}</CardTitle>
                {report.icon}
            </CardHeader>
            <CardContent>
                <CardDescription>{report.description}</CardDescription>
            </CardContent>
        </Card>
    );

    if (report.href) {
        return <Link href={report.href}>{cardContent}</Link>;
    }

    return cardContent;
};


export default function ReportsPage() {
    return (
        <>
            <PageHeader 
                title="Reports"
                description="Generate and view key insights into your business operations."
            />
            <div className="space-y-12">
                <section>
                    <h2 className="text-xl font-semibold tracking-tight mb-4">Financial Statements</h2>
                    <p className="text-sm text-muted-foreground mb-6">Key financial statements that provide an overview of your company's financial health and performance.</p>
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                        {financialStatements.map((report) => <ReportCard key={report.title} report={report} />)}
                    </div>
                </section>

                <section>
                    <h2 className="text-xl font-semibold tracking-tight mb-4">Client Reports</h2>
                     <p className="text-sm text-muted-foreground mb-6">Reports that provide detailed information on your company's client transactions and balances.</p>
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {clientReports.map((report) => <ReportCard key={report.title} report={report} />)}
                    </div>
                </section>

                <section>
                    <h2 className="text-xl font-semibold tracking-tight mb-4">Detailed Reports</h2>
                    <p className="text-sm text-muted-foreground mb-6">Detailed reports that provide a comprehensive view of your company's financial transactions and account balances.</p>
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {detailedReports.map((report) => <ReportCard key={report.title} report={report} />)}
                    </div>
                </section>
            </div>
        </>
    );
}

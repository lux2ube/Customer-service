
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { 
    AreaChart, 
    BookCopy, 
    BookText, 
    Building2, 
    CalendarClock, 
    Gauge, 
    History, 
    Hourglass, 
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
        description: "Displays your company’s assets, liabilities, and equity at a single point in time, showing overall financial health and stability.",
        icon: <Scale className="h-6 w-6 text-muted-foreground" />,
    },
    {
        title: "Cash Flow Statement",
        description: "Tracks cash inflows and outflows, giving insight into liquidity and cash management over a period.",
        icon: <AreaChart className="h-6 w-6 text-muted-foreground" />,
    },
];

const clientReports = [
    {
        title: "Accounts Receivable Aging",
        description: "Lists outstanding receivables by client, showing how long invoices have been unpaid.",
        icon: <Hourglass className="h-6 w-6 text-muted-foreground" />,
    },
    {
        title: "Client Balance Summary",
        description: "Shows total invoiced amounts, payments received, and outstanding balances for each client, helping identify top clients and opportunities for growth.",
        icon: <Users className="h-6 w-6 text-muted-foreground" />,
    },
    {
        title: "Client Payment Performance",
        description: "Analyzes payment behavior showing average days to pay, on-time payment rates, and late payment patterns for each client.",
        icon: <Gauge className="h-6 w-6 text-muted-foreground" />,
    },
];

const vendorReports = [
     {
        title: "Accounts Payable Aging",
        description: "Lists outstanding payables by vendor, showing how long invoices have been unpaid.",
        icon: <CalendarClock className="h-6 w-6 text-muted-foreground" />,
    },
    {
        title: "Vendor Balance Summary",
        description: "Shows total billed amounts, payments made, and outstanding balances for each vendor, helping track payment obligations and vendor relationships.",
        icon: <Building2 className="h-6 w-6 text-muted-foreground" />,
    },
    {
        title: "Vendor Payment Performance",
        description: "Analyzes payment behavior showing average days to pay, on-time payment rates, and late payment patterns for each vendor.",
        icon: <History className="h-6 w-6 text-muted-foreground" />,
    },
];

const detailedReports = [
    {
        title: "Account Balances",
        description: "Lists all accounts and their balances, including starting, debit, credit, net movement, and ending balances.",
        icon: <List className="h-6 w-6 text-muted-foreground" />,
    },
    {
        title: "Trial Balance",
        description: "Summarizes all account debits and credits on a specific date to verify the ledger is balanced.",
        icon: <BookCopy className="h-6 w-6 text-muted-foreground" />,
    },
    {
        title: "Account Transactions",
        description: "A record of all transactions, essential for monitoring and reconciling financial activity in the ledger.",
        icon: <BookText className="h-6 w-6 text-muted-foreground" />,
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
                    <p className="text-sm text-muted-foreground mb-6">Key financial statements that provide an overview of your company’s financial health and performance.</p>
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {financialStatements.map((report) => <ReportCard key={report.title} report={report} />)}
                    </div>
                </section>

                <section>
                    <h2 className="text-xl font-semibold tracking-tight mb-4">Client Reports</h2>
                     <p className="text-sm text-muted-foreground mb-6">Reports that provide detailed information on your company’s client transactions and balances.</p>
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {clientReports.map((report) => <ReportCard key={report.title} report={report} />)}
                    </div>
                </section>
                
                <section>
                    <h2 className="text-xl font-semibold tracking-tight mb-4">Vendor Reports</h2>
                    <p className="text-sm text-muted-foreground mb-6">Reports that provide detailed information on your company’s vendor transactions and balances.</p>
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {vendorReports.map((report) => <ReportCard key={report.title} report={report} />)}
                    </div>
                </section>

                <section>
                    <h2 className="text-xl font-semibold tracking-tight mb-4">Detailed Reports</h2>
                    <p className="text-sm text-muted-foreground mb-6">Detailed reports that provide a comprehensive view of your company’s financial transactions and account balances.</p>
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {detailedReports.map((report) => <ReportCard key={report.title} report={report} />)}
                    </div>
                </section>
            </div>
        </>
    );
}

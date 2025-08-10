
import { PageHeader } from "@/components/page-header";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, FilePlus2, DollarSign, Send, ArrowDownToLine, ArrowUpFromLine, Repeat } from "lucide-react";
import Link from "next/link";

const financialRecords = [
    { title: "USDT – Manual Receipt", href: "/financial-records/usdt-manual-receipt", icon: <ArrowDownToLine className="h-5 w-5 text-green-500" /> },
    { title: "USDT – Manual Payment", href: "/financial-records/usdt-manual-payment", icon: <ArrowUpFromLine className="h-5 w-5 text-red-500" /> },
    { title: "Cash – Manual Receipt", href: "/cash-receipts/add", icon: <ArrowDownToLine className="h-5 w-5 text-green-500" /> },
    { title: "Cash – Manual Payment", href: "/cash-payments/add", icon: <ArrowUpFromLine className="h-5 w-5 text-red-500" /> },
];

const operations = [
     { title: "USDT Auto Payment (Sender Wallet)", href: "/wallet", icon: <Send className="h-5 w-5 text-blue-500" /> },
];

const transactions = [
    { title: "Deposit (Client Buys USDT)", href: "/transactions/add?type=Deposit", icon: <DollarSign className="h-5 w-5 text-primary" /> },
    { title: "Withdraw (Client Sells USDT)", href: "/transactions/add?type=Withdraw", icon: <DollarSign className="h-5 w-5 text-primary" /> },
    { title: "Internal Transfer", href: "/accounting/journal/new", icon: <Repeat className="h-5 w-5 text-gray-500" /> },
];


function WorkflowCard({ title, href, icon }: { title: string, href: string, icon: React.ReactNode }) {
    return (
        <Link href={href} className="block">
            <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted transition-colors">
                <div className="flex items-center gap-4">
                    {icon}
                    <span className="font-medium">{title}</span>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
        </Link>
    )
}

export default function ModernPage() {
    return (
        <div className="space-y-8">
            <PageHeader
                title="Modern Operations Hub"
                description="Quick access to all financial workflows and transaction forms."
            />
            <Accordion type="multiple" defaultValue={["item-1", "item-2", "item-3"]} className="w-full space-y-6">
                <AccordionItem value="item-1" className="border-none">
                     <Card>
                        <AccordionTrigger className="px-6 py-4 border-b">
                            <CardHeader className="p-0 text-left">
                                <CardTitle className="text-xl">Financial Records</CardTitle>
                                <CardDescription>Recording all inflows and outflows of funds.</CardDescription>
                            </CardHeader>
                        </AccordionTrigger>
                        <AccordionContent className="p-6 pt-2">
                           <div className="grid md:grid-cols-2 gap-4">
                                {financialRecords.map(item => <WorkflowCard key={item.href} {...item} />)}
                           </div>
                        </AccordionContent>
                    </Card>
                </AccordionItem>
                 <AccordionItem value="item-2" className="border-none">
                     <Card>
                        <AccordionTrigger className="px-6 py-4 border-b">
                            <CardHeader className="p-0 text-left">
                                <CardTitle className="text-xl">Operations</CardTitle>
                                <CardDescription>Executing payments and transfers.</CardDescription>
                            </CardHeader>
                        </AccordionTrigger>
                        <AccordionContent className="p-6 pt-2">
                            <div className="grid md:grid-cols-2 gap-4">
                                {operations.map(item => <WorkflowCard key={item.href} {...item} />)}
                            </div>
                        </AccordionContent>
                    </Card>
                </AccordionItem>
                 <AccordionItem value="item-3" className="border-none">
                     <Card>
                        <AccordionTrigger className="px-6 py-4 border-b">
                           <CardHeader className="p-0 text-left">
                                <CardTitle className="text-xl">Transactions (Buying & Selling)</CardTitle>
                                <CardDescription>Core buy/sell transactions and internal fund movements.</CardDescription>
                            </CardHeader>
                        </AccordionTrigger>
                        <AccordionContent className="p-6 pt-2">
                             <div className="grid md:grid-cols-2 gap-4">
                                {transactions.map(item => <WorkflowCard key={item.href} {...item} />)}
                            </div>
                        </AccordionContent>
                    </Card>
                </AccordionItem>
            </Accordion>
        </div>
    );
}

    
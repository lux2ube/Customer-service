import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
    return (
        <>
            <PageHeader 
                title="Settings"
                description="Manage currencies, exchange rates, fees, and other system preferences."
            />
            <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Exchange Rates</CardTitle>
                        <CardDescription>Set the conversion rates relative to USD.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-4">
                            <Label htmlFor="yer-usd" className="w-20">YER / USD</Label>
                            <Input id="yer-usd" defaultValue="0.0016" />
                        </div>
                        <div className="flex items-center gap-4">
                            <Label htmlFor="sar-usd" className="w-20">SAR / USD</Label>
                            <Input id="sar-usd" defaultValue="0.2666" />
                        </div>
                        <div className="flex items-center gap-4">
                            <Label htmlFor="usdt-usd" className="w-20">USDT / USD</Label>
                            <Input id="usdt-usd" defaultValue="1.00" disabled />
                        </div>
                         <Button>Save Rates</Button>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle>Transaction Fees</CardTitle>
                        <CardDescription>Configure the fees for deposits and withdrawals.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-4">
                            <Label htmlFor="deposit-fee" className="w-40">Deposit Fee (%)</Label>
                            <Input id="deposit-fee" type="number" defaultValue="2" />
                        </div>
                        <div className="flex items-center gap-4">
                            <Label htmlFor="withdraw-fee" className="w-40">Withdraw Fee (Fixed USD)</Label>
                            <Input id="withdraw-fee" type="number" defaultValue="5" />
                        </div>
                        <Button>Save Fees</Button>
                    </CardContent>
                </Card>
            </div>
        </>
    );
}

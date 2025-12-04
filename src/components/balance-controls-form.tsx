'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar } from './ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { CalendarIcon, Save, AlertCircle, CheckCircle } from 'lucide-react';
import { updateAccountBalanceSnapshot, type BalanceControlState } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import type { Account } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';

function SaveButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            <Save className="mr-2 h-4 w-4" />
            {pending ? 'Saving...' : 'Save Changes'}
        </Button>
    );
}

interface BalanceControlsFormProps {
    accounts: Account[];
}

export function BalanceControlsForm({ accounts }: BalanceControlsFormProps) {
    const { toast } = useToast();
    const [state, formAction] = useActionState<BalanceControlState, FormData>(updateAccountBalanceSnapshot, undefined);
    
    const [selectedAccountId, setSelectedAccountId] = React.useState<string>('');
    const [selectedAccount, setSelectedAccount] = React.useState<Account | null>(null);
    const [liveAccount, setLiveAccount] = React.useState<Account | null>(null);
    const [closingDate, setClosingDate] = React.useState<Date>(new Date());
    const [closingBalance, setClosingBalance] = React.useState<string>('');
    const [openingBalance, setOpeningBalance] = React.useState<string>('');
    
    React.useEffect(() => {
        if (!selectedAccountId) {
            setLiveAccount(null);
            return;
        }
        
        const accountRef = ref(db, `accounts/${selectedAccountId}`);
        const unsub = onValue(accountRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                setLiveAccount({ id: selectedAccountId, ...data });
            }
        });
        
        return () => unsub();
    }, [selectedAccountId]);
    
    React.useEffect(() => {
        if (state?.success) {
            toast({
                title: 'Success',
                description: state.message,
            });
        } else if (state?.error) {
            toast({
                title: 'Error',
                description: state.message,
                variant: 'destructive',
            });
        }
    }, [state, toast]);
    
    const handleAccountSelect = (accountId: string) => {
        setSelectedAccountId(accountId);
        const account = accounts.find(a => a.id === accountId);
        setSelectedAccount(account || null);
        
        if (account) {
            setClosingBalance(account.closingBalance?.toString() || account.balance?.toString() || '0');
            setOpeningBalance(account.openingBalance?.toString() || account.balance?.toString() || '0');
            if (account.lastClosingDate) {
                setClosingDate(new Date(account.lastClosingDate));
            } else {
                setClosingDate(new Date());
            }
        }
    };

    const handleSameAsClosing = () => {
        setOpeningBalance(closingBalance);
    };
    
    return (
        <form action={formAction}>
            <input type="hidden" name="accountId" value={selectedAccountId} />
            <input type="hidden" name="closingDate" value={closingDate.toISOString()} />
            
            <Card className="mb-6">
                <CardHeader>
                    <CardTitle>Select Account</CardTitle>
                    <CardDescription>Choose an account to set its closing and opening balances.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Select value={selectedAccountId} onValueChange={handleAccountSelect}>
                        <SelectTrigger>
                            <SelectValue placeholder="Select an account..." />
                        </SelectTrigger>
                        <SelectContent>
                            {accounts.map(account => (
                                <SelectItem key={account.id} value={account.id}>
                                    {account.id} - {account.name} {account.currency ? `(${account.currency})` : ''}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </CardContent>
            </Card>
            
            {liveAccount && (
                <Card className="mb-6 bg-muted/50">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg">Current Account Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span className="text-muted-foreground">Account:</span>
                                <p className="font-medium">{liveAccount.id} - {liveAccount.name}</p>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Type:</span>
                                <p className="font-medium">{liveAccount.type}</p>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Current Balance:</span>
                                <p className="font-medium text-lg">{liveAccount.balance?.toLocaleString() ?? 0}</p>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Last Balance Update:</span>
                                <p className="font-medium">
                                    {liveAccount.lastBalanceUpdate 
                                        ? format(new Date(liveAccount.lastBalanceUpdate), 'MMM d, yyyy HH:mm')
                                        : 'Never'}
                                </p>
                            </div>
                            {liveAccount.closingBalance !== undefined && (
                                <div>
                                    <span className="text-muted-foreground">Previous Closing Balance:</span>
                                    <p className="font-medium">{liveAccount.closingBalance.toLocaleString()}</p>
                                </div>
                            )}
                            {liveAccount.lastClosingDate && (
                                <div>
                                    <span className="text-muted-foreground">Previous Closing Date:</span>
                                    <p className="font-medium">
                                        {format(new Date(liveAccount.lastClosingDate), 'MMM d, yyyy')}
                                    </p>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}
            
            {selectedAccountId && (
                <Card>
                    <CardHeader>
                        <CardTitle>Set New Balances</CardTitle>
                        <CardDescription>
                            Set the closing balance for the ended period and the opening balance for the new period.
                            The current balance will be updated to match the opening balance.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="closingDate">Closing Date</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        className={cn(
                                            "w-full justify-start text-left font-normal",
                                            !closingDate && "text-muted-foreground"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {closingDate ? format(closingDate, "PPP") : "Pick a date"}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar
                                        mode="single"
                                        selected={closingDate}
                                        onSelect={(date) => date && setClosingDate(date)}
                                        initialFocus
                                    />
                                </PopoverContent>
                            </Popover>
                            <p className="text-xs text-muted-foreground">
                                The date when the previous period ended.
                            </p>
                        </div>
                        
                        <div className="space-y-2">
                            <Label htmlFor="closingBalance">Closing Balance</Label>
                            <Input
                                id="closingBalance"
                                name="closingBalance"
                                type="number"
                                step="0.01"
                                value={closingBalance}
                                onChange={(e) => setClosingBalance(e.target.value)}
                                placeholder="Enter closing balance..."
                            />
                            <p className="text-xs text-muted-foreground">
                                The final balance at the end of the previous period.
                            </p>
                        </div>
                        
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="openingBalance">Opening Balance</Label>
                                <Button 
                                    type="button" 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={handleSameAsClosing}
                                >
                                    Same as Closing
                                </Button>
                            </div>
                            <Input
                                id="openingBalance"
                                name="openingBalance"
                                type="number"
                                step="0.01"
                                value={openingBalance}
                                onChange={(e) => setOpeningBalance(e.target.value)}
                                placeholder="Enter opening balance..."
                            />
                            <p className="text-xs text-muted-foreground">
                                The starting balance for the new period. This will become the current balance.
                            </p>
                        </div>
                        
                        {state?.message && (
                            <div className={cn(
                                "flex items-center gap-2 p-3 rounded-lg text-sm",
                                state.error ? "bg-destructive/10 text-destructive" : "bg-green-500/10 text-green-700"
                            )}>
                                {state.error ? (
                                    <AlertCircle className="h-4 w-4" />
                                ) : (
                                    <CheckCircle className="h-4 w-4" />
                                )}
                                {state.message}
                            </div>
                        )}
                    </CardContent>
                    <CardFooter className="flex justify-end">
                        <SaveButton />
                    </CardFooter>
                </Card>
            )}
        </form>
    );
}

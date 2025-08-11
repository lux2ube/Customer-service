

'use client';

import * as React from 'react';
import { useFormStatus } from 'react-dom';
import { useActionState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import type { Account, ServiceProvider, BankFormulaField, CryptoFormulaField } from '@/lib/types';
import { createServiceProvider, type ServiceProviderFormState } from '@/lib/actions/service-provider';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from './ui/badge';
import { useRouter } from 'next/navigation';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { Checkbox } from './ui/checkbox';

function SubmitButton({ isEditing }: { isEditing: boolean }) {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            {pending ? 'Saving...' : <><Save className="mr-2 h-4 w-4" />{isEditing ? 'Save Changes' : 'Create Provider'}</>}
        </Button>
    );
}

function AccountMultiSelect({ accounts, selectedAccountIds, onSelectionChange }: { accounts: Account[], selectedAccountIds: string[], onSelectionChange: (ids: string[]) => void }) {
    const [open, setOpen] = React.useState(false);

    const handleSelect = (accountId: string) => {
        const newSelection = selectedAccountIds.includes(accountId)
            ? selectedAccountIds.filter(id => id !== accountId)
            : [...selectedAccountIds, accountId];
        onSelectionChange(newSelection);
    };
    
    const selectedCount = selectedAccountIds.length;
    const selectedAccounts = accounts.filter(acc => selectedAccountIds.includes(acc.id));

    return (
        <div className="space-y-2">
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                        {selectedCount > 0 ? `${selectedCount} account(s) selected` : "Select accounts..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                    <Command>
                        <CommandInput placeholder="Search accounts..." />
                        <CommandList>
                            <CommandEmpty>No accounts found.</CommandEmpty>
                            <CommandGroup>
                                {accounts.map(account => (
                                    <CommandItem
                                        key={account.id}
                                        value={`${account.name} ${account.id} ${account.currency}`}
                                        onSelect={() => handleSelect(account.id)}
                                    >
                                        <Check className={cn("mr-2 h-4 w-4", selectedAccountIds.includes(account.id) ? "opacity-100" : "opacity-0")} />
                                        <span>{account.name} ({account.id})</span>
                                        <span className="ml-auto text-muted-foreground">{account.currency}</span>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
             <div className="space-x-1">
                {selectedAccounts.map(account => (
                    <Badge key={account.id} variant="secondary" className="gap-1">
                        {account.name}
                        <button type="button" onClick={() => handleSelect(account.id)} className="rounded-full hover:bg-muted-foreground/20 p-0.5">
                            <X className="h-3 w-3" />
                        </button>
                    </Badge>
                ))}
            </div>
        </div>
    );
}

const bankFormulaOptions: BankFormulaField[] = ['Client Name', 'Phone Number', 'ID'];
const cryptoFormulaOptions: CryptoFormulaField[] = ['Address', 'ID'];

export function ServiceProviderForm({ provider, accounts }: { provider?: ServiceProvider, accounts: Account[] }) {
    const { toast } = useToast();
    const router = useRouter();
    const actionWithId = createServiceProvider.bind(null, provider?.id || null);
    const [state, formAction] = useActionState<ServiceProviderFormState, FormData>(actionWithId, undefined);

    const [formData, setFormData] = React.useState({
        name: provider?.name || '',
        type: provider?.type || 'Bank',
        accountIds: provider?.accountIds || [],
        bankFormula: provider?.bankFormula || [],
        cryptoFormula: provider?.cryptoFormula || [],
    });

    React.useEffect(() => {
        if (state?.message && state.errors) {
            toast({ variant: 'destructive', title: 'Error Saving Provider', description: state.message });
        }
        if (state?.success === false && !state.errors) {
             toast({ variant: 'destructive', title: 'Error Saving Provider', description: state.message });
        }
    }, [state, toast]);

    const handleBankFormulaChange = (field: BankFormulaField, checked: boolean) => {
        setFormData(prev => ({
            ...prev,
            bankFormula: checked 
                ? [...prev.bankFormula, field]
                : prev.bankFormula.filter(f => f !== field)
        }));
    };
    
    const handleCryptoFormulaChange = (field: CryptoFormulaField, checked: boolean) => {
        setFormData(prev => ({
            ...prev,
            cryptoFormula: checked
                ? [...prev.cryptoFormula, field]
                : prev.cryptoFormula.filter(f => f !== field)
        }));
    };

    return (
        <form action={formAction} className="space-y-4">
             <input type="hidden" name="bankFormula" value={JSON.stringify(formData.bankFormula)} />
             <input type="hidden" name="cryptoFormula" value={JSON.stringify(formData.cryptoFormula)} />

            <Card>
                <CardHeader>
                    <CardTitle>{provider ? 'Edit' : 'New'} Service Provider</CardTitle>
                    <CardDescription>Group Chart of Accounts records and define payment formulas.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="name">Provider Name</Label>
                        <Input
                            id="name"
                            name="name"
                            placeholder="e.g., Al-Amal Bank"
                            value={formData.name}
                            onChange={(e) => setFormData(prev => ({...prev, name: e.target.value}))}
                            required
                        />
                        {state?.errors?.name && <p className="text-sm text-destructive">{state.errors.name[0]}</p>}
                    </div>

                    <div className="space-y-2">
                        <Label>Provider Type</Label>
                        <RadioGroup
                            name="type"
                            value={formData.type}
                            onValueChange={(value) => setFormData(prev => ({...prev, type: value as any}))}
                            className="flex items-center gap-4 pt-2"
                        >
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="Bank" id="type-bank" />
                                <Label htmlFor="type-bank" className="font-normal">Bank</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="Crypto" id="type-crypto" />
                                <Label htmlFor="type-crypto" className="font-normal">Crypto Service</Label>
                            </div>
                        </RadioGroup>
                         {state?.errors?.type && <p className="text-sm text-destructive">{state.errors.type[0]}</p>}
                    </div>

                    <div className="space-y-2">
                        <Label>Linked Accounts</Label>
                        <AccountMultiSelect
                            accounts={accounts}
                            selectedAccountIds={formData.accountIds}
                            onSelectionChange={(ids) => setFormData(prev => ({...prev, accountIds: ids}))}
                        />
                         {formData.accountIds.map(id => <input key={id} type="hidden" name="accountIds" value={id} />)}
                         {state?.errors?.accountIds && <p className="text-sm text-destructive">{state.errors.accountIds[0]}</p>}
                    </div>
                    
                    <div className="space-y-2">
                        <Label>Payment Formula</Label>
                        <Card className="p-4 bg-muted/50">
                             {formData.type === 'Bank' ? (
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    {bankFormulaOptions.map(field => (
                                        <div key={field} className="flex items-center space-x-2">
                                            <Checkbox
                                                id={`bank_formula_${field}`}
                                                checked={formData.bankFormula.includes(field)}
                                                onCheckedChange={(checked) => handleBankFormulaChange(field, !!checked)}
                                            />
                                            <Label htmlFor={`bank_formula_${field}`} className="font-normal text-sm">{field}</Label>
                                        </div>
                                    ))}
                                </div>
                             ) : (
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                     {cryptoFormulaOptions.map(field => (
                                        <div key={field} className="flex items-center space-x-2">
                                            <Checkbox
                                                id={`crypto_formula_${field}`}
                                                checked={formData.cryptoFormula.includes(field)}
                                                onCheckedChange={(checked) => handleCryptoFormulaChange(field, !!checked)}
                                            />
                                            <Label htmlFor={`crypto_formula_${field}`} className="font-normal text-sm">{field}</Label>
                                        </div>
                                    ))}
                                </div>
                             )}
                        </Card>
                        <p className="text-xs text-muted-foreground">Define which fields are required for payments through this provider.</p>
                    </div>

                </CardContent>
                 <CardFooter className="flex justify-end">
                    <SubmitButton isEditing={!!provider} />
                </CardFooter>
            </Card>

            <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="item-1">
                    <AccordionTrigger>Optional: Rate & Fee Overrides</AccordionTrigger>
                    <AccordionContent>
                       <div className="space-y-6 p-1">
                            <Card className="bg-muted/30">
                                <CardHeader>
                                    <CardTitle className="text-base">Fiat Rate Overrides</CardTitle>
                                    <CardDescription className="text-xs">Set custom client buy/sell rates for this provider only. Leave blank to use global rates.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                     <div>
                                        <h4 className="font-semibold text-sm mb-2">YER to USD</h4>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="space-y-1">
                                                <Label className="text-xs">Client Buy</Label>
                                                <Input name="fiatRates_YER_clientBuy" type="number" step="any" placeholder="e.g., 538" defaultValue={provider?.fiatRates?.YER?.clientBuy} />
                                            </div>
                                             <div className="space-y-1">
                                                <Label className="text-xs">Client Sell</Label>
                                                <Input name="fiatRates_YER_clientSell" type="number" step="any" placeholder="e.g., 533" defaultValue={provider?.fiatRates?.YER?.clientSell}/>
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-sm mb-2">SAR to USD</h4>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="space-y-1">
                                                <Label className="text-xs">Client Buy</Label>
                                                <Input name="fiatRates_SAR_clientBuy" type="number" step="any" placeholder="e.g., 3.75" defaultValue={provider?.fiatRates?.SAR?.clientBuy}/>
                                            </div>
                                             <div className="space-y-1">
                                                <Label className="text-xs">Client Sell</Label>
                                                <Input name="fiatRates_SAR_clientSell" type="number" step="any" placeholder="e.g., 3.75" defaultValue={provider?.fiatRates?.SAR?.clientSell}/>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="bg-muted/30">
                                <CardHeader>
                                    <CardTitle className="text-base">Crypto Fee Overrides</CardTitle>
                                     <CardDescription className="text-xs">Set custom USDT fees for this provider only. Leave blank to use global fees.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                     <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="buy_fee_percent">Buy Fee (%)</Label>
                                            <Input id="buy_fee_percent" name="cryptoFees_buy_fee_percent" type="number" step="any" defaultValue={provider?.cryptoFees?.buy_fee_percent} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="sell_fee_percent">Sell Fee (%)</Label>
                                            <Input id="sell_fee_percent" name="cryptoFees_sell_fee_percent" type="number" step="any" defaultValue={provider?.cryptoFees?.sell_fee_percent} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="minimum_buy_fee">Min. Buy Fee (USD)</Label>
                                            <Input id="minimum_buy_fee" name="cryptoFees_minimum_buy_fee" type="number" step="any" defaultValue={provider?.cryptoFees?.minimum_buy_fee} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="minimum_sell_fee">Min. Sell Fee (USD)</Label>
                                            <Input id="minimum_sell_fee" name="cryptoFees_minimum_sell_fee" type="number" step="any" defaultValue={provider?.cryptoFees?.minimum_sell_fee} />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                       </div>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        </form>
    );
}

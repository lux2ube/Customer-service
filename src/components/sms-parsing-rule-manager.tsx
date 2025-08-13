
'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableRow, TableHeader, TableHead } from '@/components/ui/table';
import { Save, Trash2, TestTube2, AlertCircle } from 'lucide-react';
import { useFormStatus } from 'react-dom';
import { createSmsParsingRule, deleteSmsParsingRule, type ParsingRuleFormState } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import type { SmsParsingRule, ParsedSms } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { format } from 'date-fns';
import { Textarea } from './ui/textarea';
import { parseSmsWithCustomRules } from '@/lib/custom-sms-parser';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            {pending ? 'Adding...' : <><Save className="mr-2 h-4 w-4" />Save New Rule</>}
        </Button>
    );
}

export function SmsParsingRuleManager({ initialRules }: { initialRules: SmsParsingRule[] }) {
    const { toast } = useToast();
    const formRef = React.useRef<HTMLFormElement>(null);

    const [rules, setRules] = React.useState<SmsParsingRule[]>(initialRules);
    const [itemToDelete, setItemToDelete] = React.useState<SmsParsingRule | null>(null);
    const [state, setState] = React.useState<ParsingRuleFormState>();

    // Form state for testing
    const [ruleName, setRuleName] = React.useState('');
    const [type, setType] = React.useState<'credit' | 'debit'>();
    const [sampleSms, setSampleSms] = React.useState('');
    const [amountStartsAfter, setAmountStartsAfter] = React.useState('');
    const [amountEndsBefore, setAmountEndsBefore] = React.useState('');
    const [personStartsAfter, setPersonStartsAfter] = React.useState('');
    const [personEndsBefore, setPersonEndsBefore] = React.useState('');
    const [testResult, setTestResult] = React.useState<ParsedSms | { error: string } | null>(null);
    

    React.useEffect(() => {
        const rulesRef = ref(db, 'sms_parsing_rules/');
        const unsubscribe = onValue(rulesRef, (snapshot) => {
            const data = snapshot.val();
            const list: SmsParsingRule[] = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) : [];
            setRules(list);
        });

        return () => unsubscribe();
    }, []);
    
    React.useEffect(() => {
        if (!state) return;
        if (state.message && state.errors) {
            toast({ variant: 'destructive', title: 'Error', description: state.message });
        } else if (state.message) { // For non-validation errors
             toast({ variant: 'destructive', title: 'Error', description: state.message });
        } else {
             toast({ title: 'Success', description: 'New parsing rule saved.' });
             formRef.current?.reset();
             setRuleName('');
             setType(undefined);
             setAmountStartsAfter('');
             setAmountEndsBefore('');
             setPersonStartsAfter('');
             setPersonEndsBefore('');
             setTestResult(null);
             setSampleSms('');
        }
    }, [state, toast]);

    const handleFormAction = async (formData: FormData) => {
        const result = await createSmsParsingRule(undefined, formData);
        setState(result);
    };

    const handleDeleteClick = (item: SmsParsingRule) => {
        setItemToDelete(item);
    };

    const handleDeleteConfirm = async () => {
        if (itemToDelete) {
            const result = await deleteSmsParsingRule(itemToDelete.id);
            if (result?.message) {
                toast({ variant: 'destructive', title: 'Error', description: result.message });
            } else {
                toast({ title: 'Success', description: 'Rule deleted.' });
            }
            setItemToDelete(null);
        }
    };
    
    const handleTestRule = () => {
        if (!sampleSms || !type) {
            setTestResult({ error: "Sample SMS and Transaction Type are required to run a test." });
            return;
        }

        const testRule: SmsParsingRule = {
            id: 'test',
            name: ruleName,
            type,
            amountStartsAfter,
            amountEndsBefore,
            personStartsAfter,
            personEndsBefore,
            createdAt: ''
        };

        const result = parseSmsWithCustomRules(sampleSms, [testRule]);
        setTestResult(result || { error: "Rule did not match the sample SMS or failed to extract data." });
    };

    return (
        <div className="space-y-4">
            <Card>
                <form action={handleFormAction} ref={formRef}>
                    <CardHeader>
                        <CardTitle>Add New Parsing Rule</CardTitle>
                        <CardDescription>Define markers to extract data from a new SMS format. All markers are required.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Rule Name</Label>
                                <Input id="name" name="name" placeholder="e.g., Al-Amal Bank Deposit V2" required value={ruleName} onChange={e => setRuleName(e.target.value)} dir="rtl" />
                                {state?.errors?.name && <p className="text-sm text-destructive">{state.errors.name[0]}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="type">Transaction Type</Label>
                                <Select name="type" required value={type} onValueChange={(v) => setType(v as any)}>
                                    <SelectTrigger><SelectValue placeholder="Select type..." /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="credit">Credit (Deposit)</SelectItem>
                                        <SelectItem value="debit">Debit (Withdraw)</SelectItem>
                                    </SelectContent>
                                </Select>
                                {state?.errors?.type && <p className="text-sm text-destructive">{state.errors.type[0]}</p>}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="sampleSms">Sample SMS</Label>
                            <Textarea id="sampleSms" placeholder="Paste an example of the SMS message here..." value={sampleSms} onChange={e => setSampleSms(e.target.value)} dir="rtl" />
                        </div>
                        
                        <div className="border p-4 rounded-md space-y-4 bg-muted/50">
                            <h4 className="font-semibold text-sm">Amount Extraction</h4>
                             <div className="grid md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="amountStartsAfter">Amount Starts After</Label>
                                    <Input id="amountStartsAfter" name="amountStartsAfter" placeholder="e.g., تم تحويل" required value={amountStartsAfter} onChange={e => setAmountStartsAfter(e.target.value)} dir="rtl" />
                                    {state?.errors?.amountStartsAfter && <p className="text-sm text-destructive">{state.errors.amountStartsAfter[0]}</p>}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="amountEndsBefore">Amount Ends Before</Label>
                                    <Input id="amountEndsBefore" name="amountEndsBefore" placeholder="e.g., لحساب" required value={amountEndsBefore} onChange={e => setAmountEndsBefore(e.target.value)} dir="rtl" />
                                    {state?.errors?.amountEndsBefore && <p className="text-sm text-destructive">{state.errors.amountEndsBefore[0]}</p>}
                                </div>
                            </div>
                        </div>

                         <div className="border p-4 rounded-md space-y-4 bg-muted/50">
                            <h4 className="font-semibold text-sm">Person Extraction</h4>
                             <div className="grid md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="personStartsAfter">Person Starts After</Label>
                                    <Input id="personStartsAfter" name="personStartsAfter" placeholder="e.g., لحساب" required value={personStartsAfter} onChange={e => setPersonStartsAfter(e.target.value)} dir="rtl" />
                                    {state?.errors?.personStartsAfter && <p className="text-sm text-destructive">{state.errors.personStartsAfter[0]}</p>}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="personEndsBefore">Person Ends Before (Optional)</Label>
                                    <Input id="personEndsBefore" name="personEndsBefore" placeholder="e.g., رصيدك" value={personEndsBefore} onChange={e => setPersonEndsBefore(e.target.value)} dir="rtl" />
                                </div>
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter className="flex justify-between items-start flex-col sm:flex-row sm:items-center">
                        <div className="flex-1 mb-4 sm:mb-0">
                           {testResult && (
                                <Card className="bg-background w-full">
                                    <CardHeader className="p-3">
                                        <CardTitle className="text-sm">Test Result</CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-3 pt-0">
                                        {'error' in testResult ? (
                                            <div className="flex items-center gap-2 text-destructive">
                                                <AlertCircle className="h-4 w-4" />
                                                <p className="text-xs">{testResult.error}</p>
                                            </div>
                                        ) : (
                                            <div className="font-mono text-xs space-y-1">
                                                <p key="type">Type: <span className="font-semibold">{testResult.type}</span></p>
                                                <p key="amount">Amount: <span className="font-semibold">{testResult.amount}</span></p>
                                                <p key="person">Person: <span className="font-semibold">{testResult.person}</span></p>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                         <div className="flex gap-2">
                            <Button type="button" variant="outline" onClick={handleTestRule}><TestTube2 className="mr-2 h-4 w-4"/> Test Rule</Button>
                            <SubmitButton />
                         </div>
                    </CardFooter>
                </form>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Custom Parsing Rules</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Created</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rules.length > 0 ? (
                                    rules.map(item => (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-medium">{item.name}</TableCell>
                                            <TableCell className="capitalize">{item.type}</TableCell>
                                            <TableCell>{item.createdAt && !isNaN(new Date(item.createdAt).getTime()) ? format(new Date(item.createdAt), 'PPP') : 'N/A'}</TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(item)}>
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow><TableCell colSpan={4} className="h-24 text-center">No custom rules created yet.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <AlertDialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete the parsing rule "{itemToDelete?.name}". This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteConfirm}>Continue</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

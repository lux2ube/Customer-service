'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { manageSmsParser, type SmsParserFormState } from '@/lib/actions';
import type { Account, SmsParser } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Save, Trash2, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

function SubmitButton({ isEditing }: { isEditing: boolean }) {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {pending ? 'Saving...' : (isEditing ? 'Save Changes' : 'Create Parser')}
        </Button>
    );
}

export function SmsParserForm({ parser, accounts, onSuccess }: { parser?: SmsParser; accounts: Account[]; onSuccess: () => void; }) {
    const { toast } = useToast();
    const action = manageSmsParser.bind(null, parser?.id || null);
    const [state, formAction] = useActionState<SmsParserFormState, FormData>(action, undefined);
    
    const [identitySource, setIdentitySource] = React.useState(parser?.identity_source || 'phone_number');

    React.useEffect(() => {
        if (state?.message) {
            toast({
                title: state.success ? 'Success' : 'Error',
                description: state.message,
                variant: state.success ? 'default' : 'destructive',
            });
        }
        if (state?.success) {
            onSuccess();
        }
    }, [state, toast, onSuccess]);

    return (
        <form action={formAction} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="account_id">Account</Label>
                    <Select name="account_id" defaultValue={parser?.account_id} required>
                        <SelectTrigger><SelectValue placeholder="Select an account..." /></SelectTrigger>
                        <SelectContent>
                            {accounts.map(acc => (
                                <SelectItem key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {state?.errors?.account_id && <p className="text-sm text-destructive">{state.errors.account_id[0]}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="identity_source">Client Identity Source</Label>
                    <Select name="identity_source" value={identitySource} onValueChange={setIdentitySource} required>
                        <SelectTrigger><SelectValue placeholder="Select a source..." /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="phone_number">Sender's Phone Number</SelectItem>
                            <SelectItem value="first_last_name">First and Last Name in SMS</SelectItem>
                            <SelectItem value="first_second_name">First and Second Name in SMS</SelectItem>
                            <SelectItem value="partial_name">Part of Full Name in SMS</SelectItem>
                        </SelectContent>
                    </Select>
                    {state?.errors?.identity_source && <p className="text-sm text-destructive">{state.errors.identity_source[0]}</p>}
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="deposit_example">Deposit Example SMS</Label>
                <Textarea id="deposit_example" name="deposit_example" defaultValue={parser?.deposit_example} placeholder="Paste an example of a deposit SMS message here." required />
                {state?.errors?.deposit_example && <p className="text-sm text-destructive">{state.errors.deposit_example[0]}</p>}
            </div>

            <div className="space-y-2">
                <Label htmlFor="withdraw_example">Withdrawal Example SMS</Label>
                <Textarea id="withdraw_example" name="withdraw_example" defaultValue={parser?.withdraw_example} placeholder="Paste an example of a withdrawal SMS message here." required />
                {state?.errors?.withdraw_example && <p className="text-sm text-destructive">{state.errors.withdraw_example[0]}</p>}
            </div>
            
            <div className="flex items-center space-x-2">
                <Switch id="active" name="active" defaultChecked={parser?.active ?? true} />
                <Label htmlFor="active">Parser is Active</Label>
            </div>

            <div className="flex justify-between items-center pt-4">
                <div>
                    {parser && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button type="button" variant="destructive">
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This will permanently delete the SMS parser. This action cannot be undone.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction asChild>
                                        <Button
                                            type="submit"
                                            name="intent"
                                            value="delete"
                                            variant="destructive"
                                            formAction={formAction}
                                        >
                                            Continue
                                        </Button>
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}
                </div>
                <SubmitButton isEditing={!!parser} />
            </div>
        </form>
    );
}

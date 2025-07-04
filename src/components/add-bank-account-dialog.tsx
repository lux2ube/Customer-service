'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "./ui/button";
import { saveBankAccount, type FormState } from "@/lib/actions";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { PlusCircle } from "lucide-react";
import React from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useToast } from "@/hooks/use-toast";
import type { BankAccount } from "@/lib/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

interface AddBankAccountDialogProps {
  bankAccount?: BankAccount | null;
  children?: React.ReactNode;
}

function SubmitButton({ isEditing }: { isEditing: boolean }) {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            {pending ? (isEditing ? 'Saving...' : 'Adding...') : (isEditing ? 'Save Changes' : 'Add Account')}
        </Button>
    )
}

export function AddBankAccountDialog({ bankAccount = null, children }: AddBankAccountDialogProps) {
    const [open, setOpen] = React.useState(false);
    const isEditing = !!bankAccount;
    const { toast } = useToast();

    const formAction = async (prevState: FormState, formData: FormData) => {
        const result = await saveBankAccount(bankAccount?.id || null, prevState, formData);
        if (result?.message && !result.errors) {
            setOpen(false); // Close dialog on success
            toast({
                title: isEditing ? 'Account Updated' : 'Account Added',
                description: result.message,
            });
        }
        return result;
    };
    
    const [state, dispatch] = useFormState<FormState, FormData>(formAction, undefined);

    React.useEffect(() => {
        if (state?.message && state.errors) {
             toast({
                variant: 'destructive',
                title: 'Error',
                description: state.message,
            });
        }
    }, [state, toast]);

    const Trigger = children ? <div onClick={() => setOpen(true)} className="w-full">{children}</div> : <Button><PlusCircle className="mr-2 h-4 w-4" /> Add Bank Account</Button>;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {Trigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form action={dispatch}>
            <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit Bank Account' : 'Add New Bank Account'}</DialogTitle>
            <DialogDescription>
                {isEditing ? "Update the details of this bank account." : "Fill in the details for the new bank account."}
            </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="space-y-2">
                    <Label htmlFor="name">Account Name</Label>
                    <Input id="name" name="name" defaultValue={bankAccount?.name} aria-describedby="name-error" />
                    {state?.errors?.name && <p id="name-error" className="text-sm text-destructive">{state.errors.name[0]}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="currency">Currency</Label>
                    <Select name="currency" defaultValue={bankAccount?.currency}>
                        <SelectTrigger id="currency" aria-describedby="currency-error">
                            <SelectValue placeholder="Select a currency" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="YER">YER</SelectItem>
                            <SelectItem value="SAR">SAR</SelectItem>
                            <SelectItem value="USD">USD</SelectItem>
                        </SelectContent>
                    </Select>
                     {state?.errors?.currency && <p id="currency-error" className="text-sm text-destructive">{state.errors.currency[0]}</p>}
                </div>
            </div>
            <DialogFooter>
                <SubmitButton isEditing={isEditing} />
            </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

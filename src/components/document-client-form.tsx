'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, UserPlus } from 'lucide-react';
import { createClient } from '@/lib/actions/client';
import { getClientsByName } from '@/lib/actions/client';
import { useToast } from '@/hooks/use-toast';
import type { Client } from '@/lib/types';

export interface DocumentClientFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  extractedData: Record<string, any>;
  documentType: string;
}

export function DocumentClientForm({
  open,
  onOpenChange,
  extractedData,
  documentType,
}: DocumentClientFormProps) {
  const { toast } = useToast();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [loading, setLoading] = React.useState(false);
  const [duplicateClients, setDuplicateClients] = React.useState<Client[]>([]);
  const [showDuplicateDialog, setShowDuplicateDialog] = React.useState(false);
  const [formData, setFormData] = React.useState({
    name: '',
    phone: '',
    verification_status: 'Pending',
  });

  // Pre-fill form with extracted data
  React.useEffect(() => {
    if (open && extractedData) {
      const name = extractedData.fullName || extractedData.name || '';
      const phone = documentType === 'passport' 
        ? extractedData.phoneNumber || ''
        : extractedData.phone || '';
      
      setFormData({
        name,
        phone,
        verification_status: 'Pending',
      });
    }
  }, [open, extractedData, documentType]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, name: e.target.value }));
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, phone: e.target.value }));
  };

  const checkForDuplicates = async () => {
    if (!formData.name.trim()) {
      toast({ 
        variant: 'destructive', 
        title: 'Error', 
        description: 'Please enter a name' 
      });
      return;
    }

    setLoading(true);
    try {
      const existing = await getClientsByName(formData.name);
      if (existing.length > 0) {
        setDuplicateClients(existing);
        setShowDuplicateDialog(true);
      } else {
        // No duplicates, create the client
        await submitForm();
      }
    } catch (error) {
      toast({ 
        variant: 'destructive', 
        title: 'Error', 
        description: 'Failed to check for existing clients' 
      });
    } finally {
      setLoading(false);
    }
  };

  const submitForm = async (forceCreate: boolean = false) => {
    if (!formRef.current) return;

    setLoading(true);
    try {
      const fData = new FormData(formRef.current);
      fData.set('name', formData.name);
      fData.set('phone', formData.phone);
      fData.set('verification_status', formData.verification_status);

      const result = await createClient(null, fData);

      if (result?.success) {
        toast({ 
          title: 'Success', 
          description: 'Client created successfully' 
        });
        onOpenChange(false);
        setDuplicateClients([]);
        setShowDuplicateDialog(false);
      } else {
        toast({ 
          variant: 'destructive', 
          title: 'Error', 
          description: result?.message || 'Failed to create client' 
        });
      }
    } catch (error) {
      toast({ 
        variant: 'destructive', 
        title: 'Error', 
        description: 'An unexpected error occurred' 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Create New Client
            </DialogTitle>
            <DialogDescription>
              Add a new client with details extracted from the document
            </DialogDescription>
          </DialogHeader>

          <form ref={formRef} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name *</Label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleNameChange}
                placeholder="Enter client name"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number *</Label>
              <Input
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={handlePhoneChange}
                placeholder="Enter phone number"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="verification_status">Status</Label>
              <select
                id="verification_status"
                name="verification_status"
                value={formData.verification_status}
                onChange={(e) => setFormData(prev => ({ ...prev, verification_status: e.target.value }))}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="Pending">Pending</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>

            {/* Hidden field for phone array */}
            <input type="hidden" name="phone" value={formData.phone} />
          </form>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={checkForDuplicates} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Checking...
                </>
              ) : (
                'Create Client'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Dialog */}
      <AlertDialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Client Already Exists</AlertDialogTitle>
            <AlertDialogDescription>
              A client with the name "{formData.name}" already exists. What would you like to do?
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2 max-h-48 overflow-y-auto">
            {duplicateClients.map(client => (
              <div key={client.id} className="p-3 border rounded bg-gray-50">
                <p className="font-medium">{client.name}</p>
                <p className="text-sm text-gray-600">
                  {Array.isArray(client.phone) ? client.phone.join(', ') : client.phone}
                </p>
              </div>
            ))}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDuplicateDialog(false)}>
              Go Back & Edit
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowDuplicateDialog(false);
                submitForm(true);
              }}
            >
              Create New Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

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
  documentType: 'yemeni_id_front' | 'yemeni_id_back' | 'passport' | 'unknown';
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
  const [mode, setMode] = React.useState<'create' | 'add-to-existing'>('create');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchResults, setSearchResults] = React.useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = React.useState<string | null>(null);
  const [formData, setFormData] = React.useState<Record<string, string>>({
    name: '',
    phone: '',
    verification_status: 'Pending',
    dateOfBirth: '',
    placeOfBirth: '',
    bloodGroup: '',
    idNumber: '',
    dateOfIssue: '',
    dateOfExpiry: '',
    placeOfIssue: '',
    passportNumber: '',
  });

  // Pre-fill form with extracted data
  React.useEffect(() => {
    if (open && extractedData) {
      let name = '';

      if (documentType === 'passport') {
        name = extractedData.fullName || '';
      } else if (documentType === 'yemeni_id_front' || documentType === 'yemeni_id_back') {
        name = extractedData.name || '';
      }
      
      setFormData(prev => ({
        ...prev,
        name,
        dateOfBirth: extractedData.dateOfBirth || '',
        placeOfBirth: extractedData.placeOfBirth || '',
        bloodGroup: extractedData.bloodGroup || '',
        idNumber: extractedData.idNumber || '',
        dateOfIssue: extractedData.dateOfIssue || '',
        dateOfExpiry: extractedData.dateOfExpiry || '',
        placeOfIssue: extractedData.placeOfIssue || '',
        passportNumber: extractedData.passportNumber || '',
      }));
    }
  }, [open, extractedData, documentType]);

  const handleFieldChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    
    try {
      const results = await getClientsByName(query);
      setSearchResults(results);
    } catch (error) {
      toast({ 
        variant: 'destructive', 
        title: 'Error', 
        description: 'Failed to search clients' 
      });
    }
  };

  const handleAddToExisting = async () => {
    if (!selectedClientId) {
      toast({ 
        variant: 'destructive', 
        title: 'Error', 
        description: 'Please select a client' 
      });
      return;
    }

    setLoading(true);
    try {
      const fData = new FormData();
      
      // Add all document fields
      Object.entries(formData).forEach(([key, value]) => {
        if (value && key !== 'phone' && key !== 'verification_status') {
          fData.set(key, String(value));
        }
      });

      // Add the client ID and set to add mode
      fData.set('clientId', selectedClientId);
      fData.set('mode', 'add-to-existing');

      const result = await createClient(null, fData);

      if (result?.success) {
        toast({ 
          title: 'Success', 
          description: 'Document data added to client successfully' 
        });
        onOpenChange(false);
        setMode('create');
        setSearchQuery('');
        setSearchResults([]);
        setSelectedClientId(null);
      } else {
        toast({ 
          variant: 'destructive', 
          title: 'Error', 
          description: result?.message || 'Failed to add document data' 
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

      // Add all document fields from form state
      Object.entries(formData).forEach(([key, value]) => {
        if (value && key !== 'name' && key !== 'phone' && key !== 'verification_status') {
          fData.set(key, String(value));
        }
      });

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

          {/* Mode Toggle */}
          <div className="flex gap-2 mb-4">
            <Button 
              type="button"
              variant={mode === 'create' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setMode('create');
                setSearchQuery('');
                setSearchResults([]);
                setSelectedClientId(null);
              }}
            >
              Create New
            </Button>
            <Button 
              type="button"
              variant={mode === 'add-to-existing' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('add-to-existing')}
            >
              Add to Existing
            </Button>
          </div>

          {/* Add to Existing Mode */}
          {mode === 'add-to-existing' && (
            <div className="space-y-3 mb-4 p-3 border rounded bg-blue-50">
              <div className="space-y-2">
                <Label htmlFor="search">Search for Client</Label>
                <Input
                  id="search"
                  placeholder="Type client name to search..."
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                />
              </div>
              
              {searchResults.length > 0 && (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {searchResults.map(client => (
                    <div
                      key={client.id}
                      onClick={() => setSelectedClientId(client.id)}
                      className={`p-2 border rounded cursor-pointer transition ${
                        selectedClientId === client.id
                          ? 'bg-blue-100 border-blue-500'
                          : 'bg-white hover:bg-gray-50'
                      }`}
                    >
                      <p className="font-medium text-sm">{client.name}</p>
                      <p className="text-xs text-gray-600">
                        {Array.isArray(client.phone) ? client.phone.join(', ') : client.phone}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              
              {searchQuery.trim().length >= 2 && searchResults.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-2">No clients found</p>
              )}
            </div>
          )}

          <form ref={formRef} className="space-y-4 max-h-96 overflow-y-auto pr-4">
            {/* Only show name field when creating new */}
            {mode === 'create' && (
              <div className="space-y-2">
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={(e) => handleFieldChange('name', e.target.value)}
                  placeholder="Enter client name"
                  required
                />
              </div>
            )}
            
            {/* Only show phone when creating new */}
            {mode === 'create' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number *</Label>
                  <Input
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={(e) => handleFieldChange('phone', e.target.value)}
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
                    onChange={(e) => handleFieldChange('verification_status', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-sm"
                  >
                    <option value="Pending">Pending</option>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </>
            )}

            {/* Document Fields - shown based on document type */}
            {(documentType === 'yemeni_id_front' || documentType === 'passport') && (
              <>
                <hr className="my-3" />
                <h3 className="text-sm font-semibold">Personal Information</h3>
                
                {formData.dateOfBirth && (
                  <div className="space-y-2">
                    <Label htmlFor="dateOfBirth">Date of Birth</Label>
                    <Input
                      id="dateOfBirth"
                      name="dateOfBirth"
                      value={formData.dateOfBirth}
                      onChange={(e) => handleFieldChange('dateOfBirth', e.target.value)}
                    />
                  </div>
                )}

                {formData.placeOfBirth && (
                  <div className="space-y-2">
                    <Label htmlFor="placeOfBirth">Place of Birth</Label>
                    <Input
                      id="placeOfBirth"
                      name="placeOfBirth"
                      value={formData.placeOfBirth}
                      onChange={(e) => handleFieldChange('placeOfBirth', e.target.value)}
                    />
                  </div>
                )}

                {formData.bloodGroup && (
                  <div className="space-y-2">
                    <Label htmlFor="bloodGroup">Blood Group</Label>
                    <Input
                      id="bloodGroup"
                      name="bloodGroup"
                      value={formData.bloodGroup}
                      onChange={(e) => handleFieldChange('bloodGroup', e.target.value)}
                    />
                  </div>
                )}

                {formData.idNumber && documentType === 'yemeni_id_front' && (
                  <div className="space-y-2">
                    <Label htmlFor="idNumber">ID Number</Label>
                    <Input
                      id="idNumber"
                      name="idNumber"
                      value={formData.idNumber}
                      onChange={(e) => handleFieldChange('idNumber', e.target.value)}
                    />
                  </div>
                )}

                {formData.passportNumber && documentType === 'passport' && (
                  <div className="space-y-2">
                    <Label htmlFor="passportNumber">Passport Number</Label>
                    <Input
                      id="passportNumber"
                      name="passportNumber"
                      value={formData.passportNumber}
                      onChange={(e) => handleFieldChange('passportNumber', e.target.value)}
                    />
                  </div>
                )}
              </>
            )}

            {(documentType === 'yemeni_id_back' || documentType === 'passport') && (
              <>
                <hr className="my-3" />
                <h3 className="text-sm font-semibold">Document Details</h3>
                
                {formData.dateOfIssue && (
                  <div className="space-y-2">
                    <Label htmlFor="dateOfIssue">Date of Issue</Label>
                    <Input
                      id="dateOfIssue"
                      name="dateOfIssue"
                      value={formData.dateOfIssue}
                      onChange={(e) => handleFieldChange('dateOfIssue', e.target.value)}
                    />
                  </div>
                )}

                {formData.dateOfExpiry && (
                  <div className="space-y-2">
                    <Label htmlFor="dateOfExpiry">Date of Expiry</Label>
                    <Input
                      id="dateOfExpiry"
                      name="dateOfExpiry"
                      value={formData.dateOfExpiry}
                      onChange={(e) => handleFieldChange('dateOfExpiry', e.target.value)}
                    />
                  </div>
                )}

                {formData.placeOfIssue && (
                  <div className="space-y-2">
                    <Label htmlFor="placeOfIssue">Place of Issue</Label>
                    <Input
                      id="placeOfIssue"
                      name="placeOfIssue"
                      value={formData.placeOfIssue}
                      onChange={(e) => handleFieldChange('placeOfIssue', e.target.value)}
                    />
                  </div>
                )}
              </>
            )}

            {/* Hidden fields for FormData */}
            <input type="hidden" name="phone" value={formData.phone} />
            <input type="hidden" name="dateOfBirth" value={formData.dateOfBirth} />
            <input type="hidden" name="placeOfBirth" value={formData.placeOfBirth} />
            <input type="hidden" name="bloodGroup" value={formData.bloodGroup} />
            <input type="hidden" name="idNumber" value={formData.idNumber} />
            <input type="hidden" name="dateOfIssue" value={formData.dateOfIssue} />
            <input type="hidden" name="dateOfExpiry" value={formData.dateOfExpiry} />
            <input type="hidden" name="placeOfIssue" value={formData.placeOfIssue} />
            <input type="hidden" name="passportNumber" value={formData.passportNumber} />
          </form>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            {mode === 'create' && (
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
            )}
            {mode === 'add-to-existing' && (
              <Button onClick={handleAddToExisting} disabled={loading || !selectedClientId}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  'Add to Client'
                )}
              </Button>
            )}
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

'use client';

import * as React from 'react';
import type { Client, ServiceProvider, ClientServiceProvider } from '@/lib/types';

interface ProviderAutoFillState {
  providerId: string | null;
  providerName: string | null;
  providerType: 'Bank' | 'Crypto' | null;
  formulaFields: string[];
  fieldValues: Record<string, string>;
  hasSavedDetails: boolean;
}

interface UseProviderAutoFillReturn {
  state: ProviderAutoFillState;
  updateField: (key: string, value: string) => void;
  getRecipientDetails: () => string;
  isReady: boolean;
  hasFormulaFields: boolean;
  refreshClient: (updatedClient: Client) => void;
}

export function useProviderAutoFill(
  client: Client | null,
  accountId: string,
  serviceProviders: ServiceProvider[]
): UseProviderAutoFillReturn {
  const [clientData, setClientData] = React.useState<Client | null>(client);
  
  const editCacheRef = React.useRef<Record<string, Record<string, string>>>({});
  
  const [state, setState] = React.useState<ProviderAutoFillState>({
    providerId: null,
    providerName: null,
    providerType: null,
    formulaFields: [],
    fieldValues: {},
    hasSavedDetails: false,
  });

  React.useEffect(() => {
    if (client?.id !== clientData?.id) {
      setClientData(client);
      editCacheRef.current = {};
    }
  }, [client?.id]);

  React.useEffect(() => {
    if (!accountId || serviceProviders.length === 0) {
      setState({
        providerId: null,
        providerName: null,
        providerType: null,
        formulaFields: [],
        fieldValues: {},
        hasSavedDetails: false,
      });
      return;
    }

    const provider = serviceProviders.find(sp => sp.accountIds.includes(accountId));
    
    if (!provider) {
      setState({
        providerId: null,
        providerName: null,
        providerType: null,
        formulaFields: [],
        fieldValues: {},
        hasSavedDetails: false,
      });
      return;
    }

    const formulaFields = provider.type === 'Crypto' 
      ? (provider.cryptoFormula || [])
      : (provider.bankFormula || []);

    const cachedEdits = editCacheRef.current[provider.id];
    
    let fieldValues: Record<string, string> = {};
    let hasSavedDetails = false;

    if (cachedEdits && Object.keys(cachedEdits).length > 0) {
      fieldValues = { ...cachedEdits };
      hasSavedDetails = false;
    } else if (clientData?.serviceProviders && clientData.serviceProviders.length > 0) {
      const savedProvider = clientData.serviceProviders.find(
        (sp: ClientServiceProvider) => sp.providerId === provider.id
      );
      
      if (savedProvider?.details) {
        fieldValues = { ...savedProvider.details };
        hasSavedDetails = Object.keys(fieldValues).length > 0;
        editCacheRef.current[provider.id] = { ...fieldValues };
      }
    }

    setState({
      providerId: provider.id,
      providerName: provider.name,
      providerType: provider.type,
      formulaFields,
      fieldValues,
      hasSavedDetails,
    });
  }, [clientData?.id, clientData?.serviceProviders, accountId, serviceProviders]);

  const updateField = React.useCallback((key: string, value: string) => {
    setState(prev => {
      const newFieldValues = {
        ...prev.fieldValues,
        [key]: value,
      };
      
      if (prev.providerId) {
        editCacheRef.current[prev.providerId] = { ...newFieldValues };
      }
      
      return {
        ...prev,
        fieldValues: newFieldValues,
        hasSavedDetails: false,
      };
    });
  }, []);

  const getRecipientDetails = React.useCallback(() => {
    return JSON.stringify(state.fieldValues);
  }, [state.fieldValues]);

  const refreshClient = React.useCallback((updatedClient: Client) => {
    setClientData(updatedClient);
    editCacheRef.current = {};
  }, []);

  const isReady = state.providerId !== null;
  const hasFormulaFields = state.formulaFields.length > 0;

  return {
    state,
    updateField,
    getRecipientDetails,
    isReady,
    hasFormulaFields,
    refreshClient,
  };
}

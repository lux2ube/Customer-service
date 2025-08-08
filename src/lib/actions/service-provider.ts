
'use server';

import { z } from 'zod';
import { db } from '../firebase';
import { push, ref, set, update, get, remove } from 'firebase/database';
import { revalidatePath } from 'next/cache';
import { stripUndefined, logAction } from './helpers';
import { redirect } from 'next/navigation';

export type ServiceProviderFormState =
  | {
      errors?: {
        name?: string[];
        type?: string[];
        accountIds?: string[];
      };
      message?: string;
      success?: boolean;
    }
  | undefined;

const ServiceProviderSchema = z.object({
  name: z.string().min(1, { message: 'Provider name is required.' }),
  type: z.enum(['Bank', 'Crypto']),
  accountIds: z.array(z.string()).min(1, { message: 'At least one account must be selected.' }),
  
  // Optional Fiat Rate Overrides
  fiatRates_YER_clientBuy: z.coerce.number().optional(),
  fiatRates_YER_clientSell: z.coerce.number().optional(),
  fiatRates_SAR_clientBuy: z.coerce.number().optional(),
  fiatRates_SAR_clientSell: z.coerce.number().optional(),

  // Optional Crypto Fee Overrides
  cryptoFees_buy_fee_percent: z.coerce.number().optional(),
  cryptoFees_sell_fee_percent: z.coerce.number().optional(),
  cryptoFees_minimum_buy_fee: z.coerce.number().optional(),
  cryptoFees_minimum_sell_fee: z.coerce.number().optional(),
});

export async function createServiceProvider(providerId: string | null, prevState: ServiceProviderFormState, formData: FormData) {
    const dataToValidate = Object.fromEntries(formData.entries());
    
    const validatedFields = ServiceProviderSchema.safeParse(dataToValidate);

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Failed to save service provider. Please check the fields.',
        };
    }
    
    const { 
        name, type, accountIds,
        fiatRates_YER_clientBuy, fiatRates_YER_clientSell,
        fiatRates_SAR_clientBuy, fiatRates_SAR_clientSell,
        cryptoFees_buy_fee_percent, cryptoFees_sell_fee_percent,
        cryptoFees_minimum_buy_fee, cryptoFees_minimum_sell_fee
    } = validatedFields.data;
    
    const data: any = { name, type, accountIds };

    // Construct fiatRates override object if any fields are present
    const yerRates = { clientBuy: fiatRates_YER_clientBuy, clientSell: fiatRates_YER_clientSell };
    const sarRates = { clientBuy: fiatRates_SAR_clientBuy, clientSell: fiatRates_SAR_clientSell };
    const fiatOverrides: any = {};
    if (Object.values(yerRates).some(v => v !== undefined)) fiatOverrides.YER = stripUndefined(yerRates);
    if (Object.values(sarRates).some(v => v !== undefined)) fiatOverrides.SAR = stripUndefined(sarRates);
    if (Object.keys(fiatOverrides).length > 0) data.fiatRates = fiatOverrides;

    // Construct cryptoFees override object if any fields are present
    const cryptoOverrides = {
        buy_fee_percent: cryptoFees_buy_fee_percent,
        sell_fee_percent: cryptoFees_sell_fee_percent,
        minimum_buy_fee: cryptoFees_minimum_buy_fee,
        minimum_sell_fee: cryptoFees_minimum_sell_fee,
    };
    if (Object.values(cryptoOverrides).some(v => v !== undefined)) data.cryptoFees = stripUndefined(cryptoOverrides);

    const isEditing = !!providerId;
    
    try {
        if (isEditing) {
            const providerRef = ref(db, `service_providers/${providerId}`);
            await update(providerRef, data);
        } else {
            const newProviderRef = push(ref(db, 'service_providers'));
            await set(newProviderRef, {
                ...data,
                createdAt: new Date().toISOString(),
            });
        }
        
        await logAction(
            isEditing ? 'update_service_provider' : 'create_service_provider',
            { type: 'service_provider', id: providerId || 'new', name: data.name },
            data
        );

    } catch (error) {
        return { message: 'Database Error: Failed to save service provider.' }
    }
    
    revalidatePath('/service-providers');
    redirect('/service-providers');
}

export async function deleteServiceProvider(providerId: string) {
    if (!providerId) {
        return { message: 'Invalid provider ID.' };
    }
    try {
        const providerRef = ref(db, `service_providers/${providerId}`);
        const snapshot = await get(providerRef);
        if (!snapshot.exists()) {
            return { message: 'Service Provider not found.' };
        }
        const providerData = snapshot.val();
        await remove(providerRef);

        await logAction(
            'delete_service_provider',
            { type: 'service_provider', id: providerId, name: providerData.name },
            { deletedData: providerData }
        );

        revalidatePath('/service-providers');
        return { success: true };
    } catch (error) {
        return { message: 'Database Error: Failed to delete service provider.' };
    }
}

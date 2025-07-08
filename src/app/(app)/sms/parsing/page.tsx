
import { PageHeader } from "@/components/page-header";
import { SmsParsingRuleManager } from "@/components/sms-parsing-rule-manager";
import { Suspense } from "react";
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { SmsParsingRule } from '@/lib/types';

async function getParsingRules(): Promise<SmsParsingRule[]> {
    const rulesRef = ref(db, 'sms_parsing_rules');
    const snapshot = await get(rulesRef);
    if (snapshot.exists()) {
        const data = snapshot.val();
        return Object.keys(data).map(key => ({ id: key, ...data[key] }));
    }
    return [];
}

export default async function SmsParsingPage() {
    const rules = await getParsingRules();

    return (
        <>
            <PageHeader
                title="SMS Parsing Rules"
                description="Create and manage dynamic rules to parse incoming SMS messages."
            />
            <Suspense fallback={<div>Loading...</div>}>
                <SmsParsingRuleManager initialRules={rules} />
            </Suspense>
        </>
    );
}


'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TransactionFlag } from '@/lib/types';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';

interface LabelSelectorProps {
    labels: TransactionFlag[];
    selectedLabels: string[];
    onLabelChange: (id: string) => void;
}

export function LabelSelector({ labels, selectedLabels, onLabelChange }: LabelSelectorProps) {
    const [showAll, setShowAll] = React.useState(false);
    const visibleLabels = showAll ? labels : labels.slice(0, 5);

    if (labels.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                No labels configured. <Link href="/labels" className="text-primary underline">Manage Labels</Link>
            </p>
        );
    }

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
                {visibleLabels.map(label => (
                    <Button
                        key={label.id}
                        type="button"
                        variant={selectedLabels.includes(label.id) ? 'default' : 'outline'}
                        onClick={() => onLabelChange(label.id)}
                        className={cn("text-xs h-7", selectedLabels.includes(label.id) && 'text-white')}
                        style={selectedLabels.includes(label.id) ? { backgroundColor: label.color, borderColor: label.color } : { borderColor: label.color, color: label.color }}
                    >
                        {label.name}
                    </Button>
                ))}
            </div>
            {labels.length > 5 && (
                <Button type="button" variant="link" size="sm" className="p-0 h-auto" onClick={() => setShowAll(!showAll)}>
                    {showAll ? 'Show Less' : 'Show More'} <ChevronDown className={cn('ml-1 h-4 w-4 transition-transform', showAll && 'rotate-180')} />
                </Button>
            )}
        </div>
    );
}

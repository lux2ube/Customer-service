
'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TransactionFlag } from '@/lib/types';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';

interface LabelSelectorProps {
    labels: TransactionFlag[];
    selectedLabels: string[];
    onLabelChange: (id: string) => void;
}

export function LabelSelector({ labels, selectedLabels, onLabelChange }: LabelSelectorProps) {
    if (labels.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                No labels configured. <Link href="/labels" className="text-primary underline">Manage Labels</Link>
            </p>
        );
    }

    const selectedLabelsData = labels.filter(label => selectedLabels.includes(label.id));

    return (
        <div className="space-y-2">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                        <span>Select Labels ({selectedLabels.length})</span>
                        <ChevronDown className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width]">
                    {labels.map(label => (
                        <DropdownMenuItem
                            key={label.id}
                            onSelect={(e) => e.preventDefault()} // Prevent closing on click
                        >
                            <div className="flex items-center space-x-2 w-full" onClick={() => onLabelChange(label.id)}>
                                <Checkbox
                                    id={`label-${label.id}`}
                                    checked={selectedLabels.includes(label.id)}
                                    readOnly // The parent div handles the click
                                />
                                <label htmlFor={`label-${label.id}`} className="flex-1 cursor-pointer flex items-center gap-2">
                                     <span className="h-3 w-3 rounded-full" style={{ backgroundColor: label.color }} />
                                     {label.name}
                                </label>
                            </div>
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>

             {selectedLabelsData.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                    {selectedLabelsData.map(label => (
                        <div key={label.id} className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs" style={{ backgroundColor: `${label.color}20` }}>
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: label.color }} />
                            {label.name}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

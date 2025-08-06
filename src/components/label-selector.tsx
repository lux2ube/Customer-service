

'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TransactionFlag } from '@/lib/types';

interface LabelSelectorProps {
    allLabels: TransactionFlag[];
    selectedLabels: string[];
    onSelectionChange: (selectedIds: string[]) => void;
}

export function LabelSelector({ allLabels, selectedLabels, onSelectionChange }: LabelSelectorProps) {
    const [open, setOpen] = React.useState(false);

    const handleSelect = (labelId: string) => {
        const newSelection = selectedLabels.includes(labelId)
            ? selectedLabels.filter(id => id !== labelId)
            : [...selectedLabels, labelId];
        onSelectionChange(newSelection);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between"
                >
                    <span className="truncate">
                        {selectedLabels.length > 0
                            ? selectedLabels.map(id => allLabels.find(l => l.id === id)?.name).join(', ')
                            : 'Select labels...'}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                    <CommandInput placeholder="Search labels..." />
                    <CommandList>
                        <CommandEmpty>No labels found.</CommandEmpty>
                        <CommandGroup>
                            {allLabels.map(label => (
                                <CommandItem
                                    key={label.id}
                                    value={label.name}
                                    onSelect={() => handleSelect(label.id)}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4",
                                            selectedLabels.includes(label.id) ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    <span
                                        className="h-4 w-4 rounded-full mr-2"
                                        style={{ backgroundColor: label.color }}
                                    ></span>
                                    {label.name}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

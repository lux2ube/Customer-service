'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { X, Plus } from 'lucide-react';

interface LabelManagerProps {
  initialLabels: Label[];
}

export function LabelManager({ initialLabels }: LabelManagerProps) {
  const [labels, setLabels] = useState<Label[]>(initialLabels);
  const [newLabel, setNewLabel] = useState('');

  const addLabel = () => {
    if (newLabel.trim() === '') return;
    const newLabelObject: Label = {
      id: `l${labels.length + 1}`,
      name: newLabel,
      color: `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`,
    };
    setLabels([...labels, newLabelObject]);
    setNewLabel('');
  };

  const removeLabel = (id: string) => {
    setLabels(labels.filter(label => label.id !== id));
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex gap-2 mb-6">
          <Input
            placeholder="New label name..."
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addLabel()}
          />
          <Button onClick={addLabel}>
            <Plus className="h-4 w-4 mr-2" />
            Add Label
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {labels.length > 0 ? (
            labels.map(label => (
              <Badge
                key={label.id}
                style={{ backgroundColor: label.color, color: '#000' }}
                className="py-1 px-3 text-sm"
              >
                {label.name}
                <button
                  onClick={() => removeLabel(label.id)}
                  className="ml-2 rounded-full p-0.5 hover:bg-black/10"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))
          ) : (
            <p className="text-sm text-muted-foreground w-full text-center py-4">
              No labels created yet. Add one above to get started.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

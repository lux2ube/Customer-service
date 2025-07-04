'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Wand2 } from 'lucide-react';
import { Customer, Label } from '@/lib/types';
import { getAiSuggestions } from '@/lib/actions';
import { Skeleton } from './ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Badge } from './ui/badge';

interface AiSuggestionsProps {
  customer: Customer;
  availableLabels: Label[];
}

interface SuggestionResult {
  suggestedLabels: string[];
  reasoning: string;
}

export function AiSuggestions({ customer, availableLabels }: AiSuggestionsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<SuggestionResult | null>(null);
  const { toast } = useToast();

  const handleSuggest = async () => {
    setIsLoading(true);
    setResult(null);
    const response = await getAiSuggestions(customer, availableLabels);
    if (response.success && response.data) {
      setResult(response.data);
    } else {
      toast({
        variant: "destructive",
        title: "AI Suggestion Failed",
        description: response.error,
      });
    }
    setIsLoading(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Suggestions</CardTitle>
        <CardDescription>
          Get AI-powered label suggestions based on the customer's profile.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Button onClick={handleSuggest} disabled={isLoading} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
            <Wand2 className="mr-2 h-4 w-4" />
            {isLoading ? 'Thinking...' : 'Suggest Labels'}
          </Button>
          {isLoading && (
            <div className="space-y-2 pt-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          )}
          {result && (
            <div className="space-y-4 pt-2 text-sm">
                <div>
                    <h4 className="font-semibold mb-2">Suggested Labels:</h4>
                    <div className="flex flex-wrap gap-2">
                        {result.suggestedLabels.map(label => (
                            <Badge key={label} variant="secondary">{label}</Badge>
                        ))}
                    </div>
                </div>
              <div>
                <h4 className="font-semibold mb-2">Reasoning:</h4>
                <p className="text-muted-foreground whitespace-pre-wrap">{result.reasoning}</p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

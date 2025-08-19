'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { type VariantProps } from 'class-variance-authority';
import { buttonVariants } from './ui/button';
import { cn } from '@/lib/utils';

interface ExportJsonButtonProps {
  data: any;
  filename: string;
  variant?: VariantProps<typeof buttonVariants>['variant'];
  children?: React.ReactNode;
}

export function ExportJsonButton({ data, filename, variant = "outline", children, ...props }: ExportJsonButtonProps) {
  
  const downloadJson = () => {
    if (!data) {
        alert("No data available to export.");
        return;
    }

    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(data, null, 2)
    )}`;
    
    const link = document.createElement('a');
    link.href = jsonString;
    link.download = filename;
    link.click();
    link.remove();
  };

  return (
    <Button 
        variant={variant} 
        onClick={downloadJson} 
        disabled={!data}
        className={cn(buttonVariants({ variant }), props.className)}
    >
      {children}
    </Button>
  );
}

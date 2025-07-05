'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { FileDown } from 'lucide-react';

interface ExportButtonProps<T> {
  data: T[];
  filename: string;
  // Optional headers to map object keys to user-friendly column names
  headers?: Record<keyof T, string>;
  variant?: 'outline' | 'default' | 'secondary' | 'ghost' | 'link' | 'destructive';
}

export function ExportButton<T extends Record<string, any>>({ data, filename, headers, variant = "outline" }: ExportButtonProps<T>) {
  
  const convertToCSV = (objArray: T[]) => {
    if (!objArray || objArray.length === 0) {
      return '';
    }

    const array = typeof objArray !== 'object' ? JSON.parse(objArray) : objArray;
    let str = '';
    let row = '';
    
    const columnHeaders = headers ? Object.values(headers) : Object.keys(array[0]);
    row = columnHeaders.join(',');
    str += row + '\r\n';

    for (let i = 0; i < array.length; i++) {
      let line = '';
      const keys = headers ? Object.keys(headers) : Object.keys(array[i]);

      for (const key of keys) {
        if (line !== '') line += ',';
        
        let value = array[i][key as keyof T];
        // Handle nested objects and arrays by stringifying them
        if (typeof value === 'object' && value !== null) {
            value = JSON.stringify(value).replace(/"/g, '""');
        }
        // Escape commas and quotes
        if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
            value = `"${value.replace(/"/g, '""')}"`;
        }

        line += value;
      }
      str += line + '\r\n';
    }
    return str;
  };

  const downloadCSV = () => {
    const csvData = convertToCSV(data);
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `${filename}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <Button variant={variant} onClick={downloadCSV} disabled={!data || data.length === 0}>
      <FileDown className="mr-2 h-4 w-4" />
      Export
    </Button>
  );
}

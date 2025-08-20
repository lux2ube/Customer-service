
'use client';

import * as React from 'react';

/**
 * A hook to enable keyboard shortcuts for forms.
 * - Ctrl+S / Cmd+S: Submits the form.
 * - Enter: Moves focus to the next input element instead of submitting.
 * @param formRef A React ref to the form element.
 */
export function useFormHotkeys(formRef: React.RefObject<HTMLFormElement>) {
  React.useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // --- Ctrl+S or Cmd+S to submit ---
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        // Find the submit button and click it
        const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]');
        submitButton?.click();
      }

      // --- Enter key to move to the next field ---
      if (event.key === 'Enter') {
        const target = event.target as HTMLElement;
        
        // Don't interfere with buttons, textareas, or specific elements
        if (target.tagName === 'BUTTON' || target.tagName === 'TEXTAREA' || target.closest('[data-radix-collection-item]')) {
          return;
        }
        
        event.preventDefault();

        const focusableElements = Array.from(
          form.querySelectorAll<HTMLElement>(
            'input:not([type=hidden]):not(:disabled), button:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'
          )
        );

        const currentIndex = focusableElements.indexOf(target);
        const nextElement = focusableElements[currentIndex + 1];

        if (nextElement) {
          nextElement.focus();
        } else {
          // If at the last element, click the submit button
          const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]');
          submitButton?.click();
        }
      }
    };

    form.addEventListener('keydown', handleKeyDown);

    return () => {
      form.removeEventListener('keydown', handleKeyDown);
    };
  }, [formRef]);
}

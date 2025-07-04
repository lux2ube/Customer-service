import { Rocket } from 'lucide-react';
import type { SVGProps } from 'react';

export function Logo(props: SVGProps<SVGSVGElement>) {
  return (
    <div className="flex items-center gap-2" >
        <Rocket className="h-6 w-6 text-sidebar-primary" />
        <span className="text-lg font-semibold text-sidebar-primary-foreground group-data-[collapsible=icon]:hidden">Pro CRM</span>
    </div>
  );
}

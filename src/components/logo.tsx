import { Briefcase } from 'lucide-react';
import type { SVGProps } from 'react';

export function Logo(props: SVGProps<SVGSVGElement>) {
  return (
    <div className="flex items-center gap-2" >
        <Briefcase className="h-6 w-6 text-sidebar-primary" />
        <span className="text-lg font-semibold text-sidebar-primary-foreground group-data-[collapsible=icon]:hidden">Customer Central</span>
    </div>
  );
}

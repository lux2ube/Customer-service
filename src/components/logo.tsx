import { CoinCashLogo } from './coincash-logo';
import type { SVGProps } from 'react';

export function Logo(props: SVGProps<SVGSVGElement>) {
  return (
    <div className="flex items-center gap-2" >
        <CoinCashLogo className="h-8 w-8 text-sidebar-primary" />
        <span className="text-lg font-semibold text-sidebar-primary-foreground group-data-[collapsible=icon]:hidden">كوين كاش</span>
    </div>
  );
}

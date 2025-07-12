import Image from 'next/image';
import type { SVGProps } from 'react';

export function Logo(props: SVGProps<SVGSVGElement>) {
  return (
    <div className="flex items-center gap-2" >
        <Image src="https://ycoincash.com/wp-content/uploads/2024/10/cropped-20240215_022836-150x150.jpg" alt="Coin Cash Logo" width={32} height={32} className="h-8 w-8" />
        <span className="text-lg font-semibold text-sidebar-primary-foreground group-data-[collapsible=icon]:hidden">كوين كاش</span>
    </div>
  );
}

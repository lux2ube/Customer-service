import Image from 'next/image';
import { cn } from '@/lib/utils';

export function CoinCashLogo({ className }: { className?: string }) {
  return (
    <Image 
      src="https://ycoincash.com/wp-content/uploads/2024/10/cropped-20240215_022836-150x150.jpg"
      alt="Coin Cash Logo"
      width={40}
      height={40}
      className={cn("rounded-full", className)}
    />
  );
}

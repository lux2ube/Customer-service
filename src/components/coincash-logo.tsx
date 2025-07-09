import { SVGProps } from "react";
import { cn } from "@/lib/utils";

export function CoinCashLogo({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg 
      viewBox="0 0 100 100" 
      className={cn("w-24 h-24", className)}
      {...props}
    >
      <g transform="translate(0, -5)">
        <path d="M85.3,26.6C82.8,17.2,74.7,10,65,10C51,10,40,21,40,35" fill="none" stroke="#d49a3b" strokeWidth="5" strokeLinecap="round"/>
        <path d="M14.7,73.4C17.2,82.8,25.3,90,35,90C49,90,60,79,60,65" fill="none" stroke="#d49a3b" strokeWidth="5" strokeLinecap="round"/>
        
        <circle cx="88" cy="24" r="5" fill="#d49a3b" />
        <circle cx="12" cy="76" r="5" fill="#d49a3b" />

        <circle cx="50" cy="50" r="22" fill="#0A2540" />

        <text x="50" y="58" fontFamily="Arial, 'Helvetica Neue', Helvetica, sans-serif" fontSize="24" fill="white" textAnchor="middle" fontWeight="bold">C</text>
        <line x1="50" y1="44" x2="50" y2="62" stroke="white" strokeWidth="2.5" />
      </g>
    </svg>
  );
}

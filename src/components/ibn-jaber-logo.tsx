import { SVGProps } from "react";
import { cn } from "@/lib/utils";

export function IbnJaberLogo({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg 
      viewBox="0 0 100 65" 
      className={cn("w-[100px] h-[65px]", className)}
      {...props}
    >
        <defs>
            <linearGradient id="gold_gradient_bj" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style={{stopColor: '#FFC107'}} />
                <stop offset="100%" style={{stopColor: '#FFA000'}} />
            </linearGradient>
        </defs>
        
        {/* Globe shape */}
        <circle cx="32" cy="32" r="30" fill="white" stroke="#0033CC" strokeWidth="2" />
        <ellipse cx="32" cy="32" rx="14" ry="30" fill="none" stroke="#0033CC" strokeWidth="1.5" />
        <ellipse cx="32" cy="32" rx="30" ry="14" fill="none" stroke="#0033CC" strokeWidth="1.5" />
        
        {/* Text BJ */}
        <text x="32" y="42" fontFamily="'Arial Black', Gadget, sans-serif" fontSize="32" fill="#0033CC" textAnchor="middle" >
            <tspan dx="-8">B</tspan>
            <tspan fill="url(#gold_gradient_bj)" stroke="#444" strokeWidth="0.5">J</tspan>
        </text>
        
        {/* Arrow */}
        <path d="M 60 18 L 90 18 L 90 10 L 100 22 L 90 34 L 90 26 L 60 26 Z" fill="url(#gold_gradient_bj)" stroke="#0033CC" strokeWidth="1.5" />
    </svg>
  );
}

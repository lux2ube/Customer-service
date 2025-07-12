import { SVGProps } from "react";
import { cn } from "@/lib/utils";

export function JaibLogo({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg 
      viewBox="0 0 100 100" 
      className={cn("w-24 h-24", className)}
      {...props}
      fill="none" 
      stroke="currentColor" 
      strokeWidth="4" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
        <path d="M25 30V20a5 5 0 0 1 5-5h40a5 5 0 0 1 5 5v10" stroke="#0A2540" />
        <path d="M25 30H75V75a10 10 0 0 1-10 10H35a10 10 0 0 1-10-10V30z" stroke="#0A2540" />
        <path d="M60 45H75" stroke="#E53E3E" />
    </svg>
  );
}

import { SVGProps } from "react";
import { cn } from "@/lib/utils";

// This is a new logo component created to match the design of the invoice image.
// It is named "JaibLogo" as a generic name for a wallet/pocket service.
export function JaibLogo({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg 
      viewBox="0 0 100 40" 
      className={cn("w-24 h-10", className)}
      {...props}
    >
      <path d="M95,20 A40,15 0 0,0 5,20" fill="none" stroke="#00008B" strokeWidth="2"/>
      <ellipse cx="50" cy="20" rx="45" ry="15" fill="#FFFFFF" stroke="#00008B" strokeWidth="2" />
      <text x="50" y="27" fontFamily="Arial, sans-serif" fontSize="14" fill="#00008B" textAnchor="middle" fontWeight="bold">OR</text>
      <text x="50" y="18" fontFamily="Arial, sans-serif" fontSize="8" fill="#00008B" textAnchor="middle">للسيارات</text>
    </svg>
  );
}

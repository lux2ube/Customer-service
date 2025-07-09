import { SVGProps } from "react";
import { cn } from "@/lib/utils";

export function IbnJaberLogo({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg 
      viewBox="0 0 50 50" 
      className={cn("w-12 h-12 text-white bg-white/20 rounded-full p-1", className)}
      {...props}
    >
      <text 
        x="50%" 
        y="50%" 
        dy=".3em" 
        textAnchor="middle" 
        fontSize="24" 
        fontWeight="bold"
        fill="currentColor"
        fontFamily="Amiri, serif"
      >
        إ ج
      </text>
    </svg>
  );
}

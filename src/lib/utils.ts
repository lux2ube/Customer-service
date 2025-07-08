import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function normalizeArabic(text: string): string {
    if (!text) return '';
    // Remove diacritics, normalize Alef variants, Teh Marbuta, and Alef Maqsura
    return text
        .replace(/[\u064B-\u0652]/g, "") // Tashkeel
        .replace(/[أإآ]/g, "ا")
        .replace(/ة/g, "ه")
        .replace(/ى/g, "ي")
        .replace(/ظ/g, "ض") // Handle visual confusion between ظ and ض
        .trim();
}

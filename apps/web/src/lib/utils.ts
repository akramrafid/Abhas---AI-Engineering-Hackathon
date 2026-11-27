import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Standard shadcn/ui class-merging helper backed by clsx + tailwind-merge. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

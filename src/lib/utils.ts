import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
export function formatChildDisplayName(childName: string, parentName?: string | null, pNo?: string | null) {
  if (parentName && pNo) {
    return `${childName} (${parentName} • ${pNo})`;
  }

  if (parentName) {
    return `${childName} (${parentName})`;
  }

  if (pNo) {
    return `${childName} (${pNo})`;
  }

  return childName;
}

import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// shadcn-svelte's helpers: components import them from `$lib/utils`.

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// biome-ignore lint/suspicious/noExplicitAny: shadcn-svelte's own helper types
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, 'child'> : T
// biome-ignore lint/suspicious/noExplicitAny: shadcn-svelte's own helper types
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, 'children'> : T
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null }

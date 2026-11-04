import CookingPot from '@lucide/svelte/icons/cooking-pot';
import House from '@lucide/svelte/icons/house';
import Scale from '@lucide/svelte/icons/scale';
import Settings from '@lucide/svelte/icons/settings';
import type { IconComponent } from '#lib/components/ui/types.ts';

export type NavItem = { href: string; label: string; icon: IconComponent };

/** The primary destinations, in display order. Shared by the tab bar and the sidebar. */
export const navItems: NavItem[] = [
	{ href: '/', label: 'Today', icon: House },
	{ href: '/recipes', label: 'Recipes', icon: CookingPot },
	{ href: '/weight', label: 'Weight', icon: Scale },
	{ href: '/settings', label: 'Settings', icon: Settings }
];

/** `/` is active only on exactly `/`; every other item is active on its own path and anything beneath it. */
export function isActive(href: string, pathname: string): boolean {
	if (href === '/') return pathname === '/';
	return pathname === href || pathname.startsWith(`${href}/`);
}

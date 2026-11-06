<script lang="ts">
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import type { LogEntry } from '#lib/server/db/schema.ts';
	import { IconButton } from '#lib/components/ui/index.ts';
	import { SWIPE_DISTANCE_PX, swipeDirection } from './swipe.ts';

	type Props = {
		entry: LogEntry;
		/** Tap on the row. */
		onedit: (entry: LogEntry) => void;
		/** Swipe left past the threshold. The row menu has its own delete, so touch is not the only way. */
		ondelete: (entry: LogEntry) => void;
		/** The "more" button. */
		onmenu: (entry: LogEntry) => void;
	};

	let { entry, onedit, ondelete, onmenu }: Props = $props();

	// A drag starts after this much sideways travel, so taps and small finger wobble stay taps.
	const DRAG_START_PX = 8;
	const MAX_DRAG_PX = SWIPE_DISTANCE_PX * 1.5;

	const title = $derived(entry.label ?? 'Quick add');
	const detail = $derived.by(() => {
		const { amount, unit } = entry;
		if (amount === null || unit === null) return 'Quick add';
		const plural = (unit === 'serving' || unit === 'portion') && amount !== 1 ? 's' : '';
		return `${Math.round(amount * 10) / 10} ${unit}${plural}`;
	});
	const macros = $derived(
		`P ${Math.round(entry.protein)} · C ${Math.round(entry.carbs)} · F ${Math.round(entry.fat)}`
	);

	let offset = $state(0);
	let dragging = $state(false);
	let tracking = false;
	let startX = 0;
	let startY = 0;
	let suppressClick = false;

	function reset() {
		tracking = false;
		dragging = false;
		offset = 0;
	}

	function down(event: PointerEvent) {
		// Touch and pen only: on a desktop a mouse drag selects text, and there are buttons for everything.
		if (event.pointerType === 'mouse') return;
		tracking = true;
		startX = event.clientX;
		startY = event.clientY;
	}

	function move(event: PointerEvent) {
		if (!tracking) return;
		const dx = event.clientX - startX;
		const dy = event.clientY - startY;
		if (!dragging) {
			if (Math.abs(dx) < DRAG_START_PX || Math.abs(dx) < Math.abs(dy)) return;
			dragging = true;
		}
		// Only leftwards: a rightward drag is the day switcher's swipe.
		offset = Math.max(-MAX_DRAG_PX, Math.min(0, dx));
	}

	function up(event: PointerEvent) {
		if (!tracking) return;
		const wasDragging = dragging;
		const direction = swipeDirection(event.clientX - startX, event.clientY - startY);
		reset();
		if (!wasDragging) return;
		// The click that follows a drag must not open the editor.
		suppressClick = true;
		setTimeout(() => (suppressClick = false));
		if (direction === 'left') ondelete(entry);
	}
</script>

<li class="relative overflow-hidden bg-surface" data-swipe-row>
	<div class="absolute inset-0 flex items-center justify-end bg-danger/10 pr-6" aria-hidden="true">
		<Trash2 size={20} class="text-danger" />
	</div>
	<div
		class={[
			'relative flex min-h-14 touch-pan-y items-center gap-1 bg-surface pl-4',
			!dragging && 'transition-transform duration-200 ease-out'
		]}
		style:transform={offset === 0 ? undefined : `translateX(${offset}px)`}
		onpointerdown={down}
		onpointermove={move}
		onpointerup={up}
		onpointercancel={reset}
		role="presentation"
	>
		<button
			type="button"
			class="flex min-h-14 min-w-0 flex-1 cursor-pointer items-center gap-3 py-2 text-left focus-visible:-outline-offset-2"
			onclick={() => {
				if (!suppressClick) onedit(entry);
			}}
		>
			<span class="flex min-w-0 flex-1 flex-col">
				<span class="truncate text-base text-text">{title}</span>
				<span class="truncate text-sm text-text-muted">{detail} · {macros}</span>
			</span>
			<span class="shrink-0 text-base font-medium text-text tabular-nums">
				{Math.round(entry.kcal)} kcal
			</span>
		</button>
		<IconButton label="More actions for {title}" icon={Ellipsis} onclick={() => onmenu(entry)} />
	</div>
</li>

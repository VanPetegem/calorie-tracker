<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { addDays } from '#lib/domain/dates.ts';
	import { IconButton } from '#lib/components/ui/index.ts';

	type Props = {
		/** The day shown, `YYYY-MM-DD`. */
		date: string;
		/** Today in the settings timezone. The day after it is the last one you can go to. */
		today: string;
		onselect: (date: string) => void;
	};

	let { date, today, onselect }: Props = $props();

	const atLimit = $derived(date >= addDays(today, 1));

	const weekday = new Intl.DateTimeFormat('en-GB', {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		timeZone: 'UTC'
	});

	const label = $derived.by(() => {
		if (date === today) return 'Today';
		if (date === addDays(today, -1)) return 'Yesterday';
		if (date === addDays(today, 1)) return 'Tomorrow';
		return weekday.format(new Date(`${date}T00:00:00Z`));
	});
</script>

<div class="flex flex-col gap-1">
	<div class="flex items-center justify-between gap-2">
		<IconButton
			label="Previous day"
			icon={ChevronLeft}
			variant="secondary"
			onclick={() => onselect(addDays(date, -1))}
		/>
		<h1 class="min-w-0 truncate text-3xl font-semibold tracking-tight text-text">{label}</h1>
		<IconButton
			label="Next day"
			icon={ChevronRight}
			variant="secondary"
			disabled={atLimit}
			onclick={() => onselect(addDays(date, 1))}
		/>
	</div>
	{#if atLimit}
		<p class="text-center text-sm text-text-muted">You can log up to tomorrow.</p>
	{/if}
</div>

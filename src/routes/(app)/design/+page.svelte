<script lang="ts">
	import { onMount } from 'svelte';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import Settings from '@lucide/svelte/icons/settings';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import UtensilsCrossed from '@lucide/svelte/icons/utensils-crossed';
	import {
		Badge,
		Button,
		Card,
		EmptyState,
		IconButton,
		Input,
		ListItem,
		MacroBar,
		NumberInput,
		ProgressBar,
		SegmentedControl,
		Sheet,
		Skeleton
	} from '#lib/components/ui/index.ts';
	import { toasts, withUndo } from '#lib/stores/toasts.svelte.ts';
	import {
		getThemePreference,
		setThemePreference,
		type ThemePreference
	} from '#lib/design/theme.ts';
	import { themes, type ColorToken } from '#lib/design/tokens.ts';
	import DateSwitcher from '#lib/components/log/DateSwitcher.svelte';
	import DayHero from '#lib/components/log/DayHero.svelte';
	import EntryRow from '#lib/components/log/EntryRow.svelte';
	import type { LogEntry } from '#lib/server/db/schema.ts';
	import Sidebar from '#lib/components/shell/Sidebar.svelte';
	import TabBar from '#lib/components/shell/TabBar.svelte';
	import Section from './Section.svelte';

	const colorTokens = Object.keys(themes.dark) as ColorToken[];

	const typeScale = [
		{ name: 'text-xs', px: 11, cls: 'text-xs' },
		{ name: 'text-sm', px: 13, cls: 'text-sm' },
		{ name: 'text-base', px: 15, cls: 'text-base' },
		{ name: 'text-lg', px: 18, cls: 'text-lg' },
		{ name: 'text-2xl', px: 22, cls: 'text-2xl' },
		{ name: 'text-3xl', px: 28, cls: 'text-3xl' },
		{ name: 'text-4xl', px: 36, cls: 'text-4xl' },
		{ name: 'text-5xl', px: 48, cls: 'text-5xl' }
	];

	const spacing = [
		{ name: '1', px: 4, cls: 'w-1' },
		{ name: '2', px: 8, cls: 'w-2' },
		{ name: '3', px: 12, cls: 'w-3' },
		{ name: '4', px: 16, cls: 'w-4' },
		{ name: '6', px: 24, cls: 'w-6' },
		{ name: '8', px: 32, cls: 'w-8' },
		{ name: '12', px: 48, cls: 'w-12' },
		{ name: '16', px: 64, cls: 'w-16' }
	];

	const radii = [
		{ name: 'rounded-sm', px: '6 px', cls: 'rounded-sm' },
		{ name: 'rounded-md', px: '10 px', cls: 'rounded-md' },
		{ name: 'rounded-lg', px: '16 px', cls: 'rounded-lg' },
		{ name: 'rounded-full', px: 'pill', cls: 'rounded-full' }
	];

	const shadows = [
		{ name: 'shadow-sm', cls: 'shadow-sm' },
		{ name: 'shadow-md', cls: 'shadow-md' },
		{ name: 'shadow-lg', cls: 'shadow-lg' }
	];

	const sizes = ['sm', 'md', 'lg'] as const;
	const variants = ['primary', 'secondary', 'ghost', 'destructive'] as const;
	const tones = ['neutral', 'brand', 'success', 'warning', 'danger'] as const;

	let themePref = $state<ThemePreference>('system');
	onMount(() => {
		themePref = getThemePreference();
	});

	let range = $state<'day' | 'week' | 'month'>('week');
	let nameText = $state('');
	let filled = $state('Maria Keller');
	let email = $state('maria@');
	let disabledText = $state('Locked value');
	let weight = $state<number | null>(null);
	let kcal = $state<number | null>(2400);
	let parentError = $state<number | null>(null);
	let clicks = $state(0);
	let loading = $state(false);

	let sheetOpen = $state(false);
	let longSheetOpen = $state(false);

	const initialMeals = [
		{ id: 'oats', name: 'Oats with banana', kcal: 480 },
		{ id: 'rice', name: 'Chicken and rice', kcal: 720 },
		{ id: 'shake', name: 'Protein shake', kcal: 310 }
	];
	let meals = $state(initialMeals);

	function deleteMeal(id: string) {
		const index = meals.findIndex((meal) => meal.id === id);
		const meal = meals[index];
		if (!meal) return;
		withUndo({
			message: `Deleted ${meal.name}`,
			apply: () => (meals = meals.filter((m) => m.id !== id)),
			revert: () => {
				// Put the meal back in its original position.
				const next = [...meals];
				next.splice(index, 0, meal);
				meals = next;
			}
		});
	}

	const sampleEntry: LogEntry = {
		id: 'design-oats',
		date: '2026-11-05',
		loggedAt: '2026-11-05T07:30:00.000Z',
		kind: 'food',
		foodId: 'design-oats-food',
		batchId: null,
		amount: 80,
		unit: 'g',
		grams: 80,
		label: 'Rolled oats',
		kcal: 302,
		protein: 10.8,
		carbs: 51.5,
		fat: 5.6,
		fiber: 8,
		deletedAt: null
	};
	const sampleQuick: LogEntry = {
		...sampleEntry,
		id: 'design-quick',
		kind: 'quick',
		foodId: null,
		amount: null,
		unit: null,
		grams: null,
		label: 'Restaurant pasta',
		kcal: 850,
		protein: 30,
		carbs: 110,
		fat: 28
	};
	const heroTarget = { kcal: 3000, proteinG: 126, fatG: 83, carbsG: 424, carbsFloored: false };
	let switcherDate = $state('2026-11-05');
	let rowLog = $state('Tap, swipe left or use the menu button.');

	function simulateSave() {
		loading = true;
		setTimeout(() => (loading = false), 1500);
	}
</script>

<svelte:head>
	<title>Design system · kcal</title>
</svelte:head>

<div class="flex flex-col gap-14 pb-8">
	<header class="flex flex-col gap-4">
		<div class="flex flex-col gap-1">
			<h1 class="text-4xl font-semibold tracking-tight text-text">Design system</h1>
			<p class="max-w-prose text-base text-text-muted">
				Tokens and components used across kcal. Every component state is shown here.
			</p>
		</div>
		<SegmentedControl
			label="Theme"
			options={[
				{ value: 'system', label: 'System' },
				{ value: 'light', label: 'Light' },
				{ value: 'dark', label: 'Dark' }
			]}
			bind:value={
				() => themePref,
				(next) => {
					themePref = next;
					setThemePreference(next);
				}
			}
		/>
	</header>

	<Section
		name="Type scale"
		description="System font, tabular numbers by default. Sizes in px at the default root size."
	>
		<div class="flex flex-col gap-3">
			{#each typeScale as step (step.name)}
				<div class="flex flex-col gap-0.5 border-b border-border pb-3">
					<span class="text-xs text-text-muted">{step.name} · {step.px} px</span>
					<span class={[step.cls, 'text-text']}>Eat 3,200 kcal today</span>
				</div>
			{/each}
		</div>
	</Section>

	<Section name="Colors" description="Semantic tokens. The swatches follow the active theme.">
		<ul class="grid grid-cols-2 gap-3 sm:grid-cols-3">
			{#each colorTokens as token (token)}
				<li class="flex flex-col gap-1.5">
					<span
						class="h-12 rounded-md border border-border-strong"
						style:background-color="var(--kc-{token})"
					></span>
					<span class="text-sm text-text">{token}</span>
					<span class="text-xs text-text-muted">--kc-{token}</span>
				</li>
			{/each}
		</ul>
	</Section>

	<Section name="Spacing" description="4 px base unit.">
		<ul class="flex flex-col gap-2">
			{#each spacing as step (step.name)}
				<li class="flex items-center gap-3">
					<span class="w-24 text-sm text-text-muted">{step.name} · {step.px} px</span>
					<span class={['h-3 rounded-sm bg-brand', step.cls]}></span>
				</li>
			{/each}
		</ul>
	</Section>

	<Section name="Radii">
		<ul class="flex flex-wrap gap-4">
			{#each radii as radius (radius.name)}
				<li class="flex flex-col items-start gap-1.5">
					<span class={['size-16 border border-border-strong bg-surface-raised', radius.cls]}
					></span>
					<span class="text-sm text-text">{radius.name}</span>
					<span class="text-xs text-text-muted">{radius.px}</span>
				</li>
			{/each}
		</ul>
	</Section>

	<Section name="Shadows">
		<ul class="flex flex-wrap gap-6">
			{#each shadows as shadow (shadow.name)}
				<li class="flex flex-col items-start gap-2">
					<span class={['size-20 rounded-lg bg-surface-raised', shadow.cls]}></span>
					<span class="text-sm text-text">{shadow.name}</span>
				</li>
			{/each}
		</ul>
	</Section>

	<Section
		name="Button"
		description="Heights 36, 44 and 52 px. The small size still has a 44 px tall hit area."
	>
		<div class="flex flex-col gap-5">
			{#each variants as variant (variant)}
				<div class="flex flex-col gap-2">
					<span class="text-sm text-text-muted">{variant}</span>
					<div class="flex flex-wrap items-center gap-3">
						{#each sizes as size (size)}
							<Button {variant} {size}
								>{size === 'sm' ? 'Small' : size === 'md' ? 'Medium' : 'Large'}</Button
							>
						{/each}
					</div>
				</div>
			{/each}

			<div class="flex flex-col gap-2">
				<span class="text-sm text-text-muted">With icon, as a link, full width</span>
				<div class="flex flex-wrap items-center gap-3">
					<Button icon={Plus}>Add food</Button>
					<Button variant="secondary" href="#Button">Link button</Button>
					<Button class="w-full sm:w-64">Full width</Button>
				</div>
			</div>

			<div class="flex flex-col gap-2">
				<span class="text-sm text-text-muted">Loading (click to simulate a save)</span>
				<div class="flex flex-wrap items-center gap-3">
					<Button {loading} onclick={simulateSave}>Save entry</Button>
					<Button variant="secondary" loading>Loading</Button>
				</div>
			</div>

			<div class="flex flex-col gap-2 pb-6">
				<span class="text-sm text-text-muted">Disabled, and disabled with a reason (focus it)</span>
				<div class="flex flex-wrap items-center gap-3">
					<Button disabled>Disabled</Button>
					<Button
						disabled
						disabledReason="Add at least one food to save this meal."
						variant="secondary"
					>
						Save meal
					</Button>
				</div>
			</div>
		</div>
	</Section>

	<Section name="IconButton" description="44 by 44 px. The label is the accessible name.">
		<div class="flex flex-wrap items-center gap-3">
			<IconButton label="Search foods" icon={Search} />
			<IconButton label="Settings" icon={Settings} variant="secondary" />
			<IconButton label="Delete entry" icon={Trash2} disabled />
		</div>
	</Section>

	<Section
		name="Input"
		description="Errors come from the parent on blur. Hover and focus any field to see those states."
	>
		<div class="grid gap-5 sm:grid-cols-2">
			<Input
				label="Default"
				bind:value={nameText}
				placeholder="Placeholder text"
				hint="Hint text sits below."
			/>
			<Input label="Filled" bind:value={filled} autocomplete="name" />
			<Input
				label="Error"
				type="email"
				bind:value={email}
				error="Enter a full email address, like maria@example.com."
			/>
			<Input label="Disabled" bind:value={disabledText} disabled />
			<Input label="Read only" value="Read only value" readonly />
		</div>
	</Section>

	<Section
		name="NumberInput"
		description="Accepts a decimal comma or point. The number is committed on blur."
	>
		<div class="grid gap-5 sm:grid-cols-2">
			<div class="flex flex-col gap-1">
				<NumberInput label="Body weight" unit="kg" min={30} max={250} bind:value={weight} />
				<p class="text-sm text-text-muted">Value: {weight ?? 'none'}</p>
			</div>
			<div class="flex flex-col gap-1">
				<NumberInput label="Calorie goal" unit="kcal" decimals={0} max={6000} bind:value={kcal} />
				<p class="text-sm text-text-muted">Value: {kcal ?? 'none'}</p>
			</div>
			<NumberInput
				label="Error from the parent"
				unit="kg"
				bind:value={parentError}
				error="This weight is not plausible."
			/>
			<NumberInput label="Disabled" unit="kg" value={72.5} disabled />
		</div>
	</Section>

	<Section name="SegmentedControl" description="Arrow keys move the selection.">
		<div class="flex flex-col gap-3">
			<SegmentedControl
				label="Range"
				options={[
					{ value: 'day', label: 'Day' },
					{ value: 'week', label: 'Week' },
					{ value: 'month', label: 'Month' }
				]}
				bind:value={range}
			/>
			<p class="text-sm text-text-muted">Selected: {range}</p>
		</div>
	</Section>

	<Section name="Card">
		<div class="grid gap-4 sm:grid-cols-2">
			<Card padding="sm">
				<p class="text-sm text-text-muted">Small padding</p>
				<p class="text-base text-text">Breakfast, 640 kcal</p>
			</Card>
			<Card as="section">
				<p class="text-sm text-text-muted">Medium padding, rendered as a section</p>
				<p class="text-base text-text">Lunch, 820 kcal</p>
			</Card>
		</div>
	</Section>

	<Section name="Badge">
		<div class="flex flex-wrap items-center gap-2">
			{#each tones as tone (tone)}
				<Badge {tone}>{tone}</Badge>
			{/each}
		</div>
	</Section>

	<Section
		name="ProgressBar"
		description="The fill stops at 100%. Going over is not an error, so it gets an end cap instead of a warning color."
	>
		<div class="flex flex-col gap-4">
			<ProgressBar label="Empty" value={0} max={2000} />
			<ProgressBar label="Halfway" value={1000} max={2000} />
			<ProgressBar label="Complete" value={2000} max={2000} />
			<ProgressBar label="Over target" value={2500} max={2000} />
			<div class="grid grid-cols-2 gap-4">
				<ProgressBar label="Protein tone" value={60} max={100} tone="protein" />
				<ProgressBar label="Carbs tone" value={60} max={100} tone="carbs" />
				<ProgressBar label="Fat tone" value={60} max={100} tone="fat" />
				<ProgressBar label="Brand tone" value={60} max={100} />
			</div>
		</div>
	</Section>

	<Section name="MacroBar">
		<Card class="flex flex-col gap-4">
			<MacroBar macro="protein" current={96} target={140} />
			<MacroBar macro="carbs" current={310} target={380} />
			<MacroBar macro="fat" current={92} target={80} />
		</Card>
	</Section>

	<Section
		name="Skeleton"
		description="Pulses while loading. The pulse stops under reduced motion."
	>
		<Card class="flex flex-col gap-3">
			<div class="flex items-center gap-3">
				<Skeleton width="3rem" height="3rem" rounded="full" />
				<div class="flex flex-1 flex-col gap-2">
					<Skeleton width="60%" />
					<Skeleton width="40%" height="0.75rem" />
				</div>
			</div>
			<Skeleton height="6rem" rounded="lg" />
		</Card>
	</Section>

	<Section name="EmptyState">
		<Card>
			<EmptyState
				icon={UtensilsCrossed}
				title="Nothing logged yet"
				body="Add your first meal to see today's calories and macros."
			>
				{#snippet action()}
					<Button icon={Plus}>Log a meal</Button>
				{/snippet}
			</EmptyState>
		</Card>
	</Section>

	<Section name="ListItem" description="At least 56 px tall. A link, a button or a plain row.">
		<div class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
			<ListItem title="Plain row" subtitle="No action" />
			<ListItem title="Link row" subtitle="Goes to a page" href="#ListItem">
				{#snippet trailing()}
					<ChevronRight size={20} aria-hidden="true" />
				{/snippet}
			</ListItem>
			<ListItem title="Button row" subtitle="Clicked {clicks} times" onclick={() => (clicks += 1)}>
				{#snippet leading()}
					<Badge tone="brand">New</Badge>
				{/snippet}
				{#snippet trailing()}
					<span class="text-base text-text">420 kcal</span>
				{/snippet}
			</ListItem>
		</div>
	</Section>

	<Section
		name="Sheet"
		description="A bottom sheet below 640 px and a centered dialog above. Escape, a tap on the backdrop or the close button dismisses it."
	>
		<div class="flex flex-wrap items-center gap-3">
			<Button variant="secondary" onclick={() => (sheetOpen = true)}>Open confirmation</Button>
			<Button variant="secondary" onclick={() => (longSheetOpen = true)}>Open long content</Button>
		</div>
		<Sheet
			bind:open={sheetOpen}
			title="Delete this entry?"
			description="It will be removed from today. You can undo it for a few seconds."
		>
			<p class="text-base text-text">Oats with banana, 480 kcal</p>
			{#snippet footer()}
				<Button variant="secondary" onclick={() => (sheetOpen = false)}>Keep it</Button>
				<Button
					variant="destructive"
					onclick={() => {
						sheetOpen = false;
						toasts.show({ message: 'Entry deleted', tone: 'success' });
					}}
				>
					Delete
				</Button>
			{/snippet}
		</Sheet>
		<Sheet
			bind:open={longSheetOpen}
			title="Long content"
			description="The body scrolls, the header and footer stay put."
		>
			<ul class="flex flex-col gap-3">
				{#each Array.from({ length: 24 }, (_, i) => i + 1) as n (n)}
					<li class="rounded-md border border-border bg-surface p-3 text-base text-text">
						Row {n}
					</li>
				{/each}
			</ul>
			{#snippet footer()}
				<Button onclick={() => (longSheetOpen = false)}>Done</Button>
			{/snippet}
		</Sheet>
	</Section>

	<Section
		name="Toaster"
		description="At most three toasts, each gone after five seconds. A toast with an action stays at least five seconds."
	>
		<div class="flex flex-col gap-5">
			<div class="flex flex-col gap-2">
				<span class="text-sm text-text-muted">Delete with undo</span>
				{#if meals.length > 0}
					<div
						class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface"
					>
						{#each meals as meal (meal.id)}
							<ListItem title={meal.name} subtitle="{meal.kcal} kcal">
								{#snippet trailing()}
									<IconButton
										label="Delete {meal.name}"
										icon={Trash2}
										onclick={() => deleteMeal(meal.id)}
									/>
								{/snippet}
							</ListItem>
						{/each}
					</div>
				{:else}
					<Card>
						<EmptyState
							icon={UtensilsCrossed}
							title="All meals deleted"
							body="Use Undo in the toast to bring the last one back, or reset the list."
						/>
					</Card>
				{/if}
				<div>
					<Button variant="secondary" size="sm" onclick={() => (meals = initialMeals)}>
						Reset list
					</Button>
				</div>
			</div>

			<div class="flex flex-col gap-2">
				<span class="text-sm text-text-muted">Tones</span>
				<div class="flex flex-wrap items-center gap-3">
					<Button variant="secondary" onclick={() => toasts.show({ message: 'Weight saved' })}>
						Neutral
					</Button>
					<Button
						variant="secondary"
						onclick={() => toasts.show({ message: 'Meal logged', tone: 'success' })}
					>
						Success
					</Button>
					<Button
						variant="secondary"
						onclick={() => toasts.show({ message: 'Could not save. Try again.', tone: 'danger' })}
					>
						Danger
					</Button>
				</div>
			</div>
		</div>
	</Section>

	<Section
		name="DateSwitcher"
		description="Previous and next day with the day named. Next is disabled on tomorrow, the last day you can log, with a visible reason."
	>
		<div class="flex flex-col gap-6">
			<div class="flex flex-col gap-2">
				<span class="text-sm text-text-muted">Interactive, today is 5 Nov 2026</span>
				<DateSwitcher date={switcherDate} today="2026-11-05" onselect={(d) => (switcherDate = d)} />
			</div>
			<div class="flex flex-col gap-2">
				<span class="text-sm text-text-muted">On tomorrow (next disabled)</span>
				<DateSwitcher date="2026-11-06" today="2026-11-05" onselect={() => {}} />
			</div>
			<div class="flex flex-col gap-2">
				<span class="text-sm text-text-muted">Earlier day</span>
				<DateSwitcher date="2026-10-30" today="2026-11-05" onselect={() => {}} />
			</div>
		</div>
	</Section>

	<Section
		name="DayHero"
		description="The day summary. Without a target: kcal and grams eaten. With a target: kcal remaining, a progress bar and three macro bars. Over target says &quot;over by&quot; in the success color: gaining weight is the goal."
	>
		<div class="flex flex-col gap-6">
			<div class="flex flex-col gap-2">
				<span class="text-sm text-text-muted">No target</span>
				<DayHero totals={{ kcal: 1240, protein: 82, carbs: 150, fat: 40 }} target={null} />
			</div>
			<div class="flex flex-col gap-2">
				<span class="text-sm text-text-muted">Under target</span>
				<DayHero totals={{ kcal: 1240, protein: 82, carbs: 150, fat: 40 }} target={heroTarget} />
			</div>
			<div class="flex flex-col gap-2">
				<span class="text-sm text-text-muted">Over target</span>
				<DayHero totals={{ kcal: 3120, protein: 140, carbs: 430, fat: 90 }} target={heroTarget} />
			</div>
			<div class="flex flex-col gap-2">
				<span class="text-sm text-text-muted">Carb target floored at zero</span>
				<DayHero
					totals={{ kcal: 900, protein: 60, carbs: 0, fat: 40 }}
					target={{ kcal: 1500, proteinG: 126, fatG: 83, carbsG: 0, carbsFloored: true }}
				/>
			</div>
		</div>
	</Section>

	<Section
		name="EntryRow"
		description="One logged item. Tap to edit, swipe left on a touch screen to delete, or use the menu button. Food entries show the amount, quick entries say Quick add."
	>
		<div class="flex flex-col gap-2">
			<span class="text-sm text-text-muted">{rowLog}</span>
			<ul class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
				<EntryRow
					entry={sampleEntry}
					onedit={() => (rowLog = 'Edit Rolled oats')}
					ondelete={() => (rowLog = 'Delete Rolled oats (swipe)')}
					onmenu={() => (rowLog = 'Menu for Rolled oats')}
				/>
				<EntryRow
					entry={sampleQuick}
					onedit={() => (rowLog = 'Edit Restaurant pasta')}
					ondelete={() => (rowLog = 'Delete Restaurant pasta (swipe)')}
					onmenu={() => (rowLog = 'Menu for Restaurant pasta')}
				/>
			</ul>
		</div>
	</Section>

	<Section
		name="TabBar"
		description="Primary navigation below 1024 px, fixed to the bottom and padded by the home indicator inset. Four tabs, each at least 44 px tall. The active tab uses the brand color, a top marker and aria-current."
	>
		<div class="flex flex-col gap-3">
			<div class="overflow-hidden rounded-lg border border-border">
				<TabBar pathname="/" label="TabBar preview, Today active" preview />
			</div>
			<div class="overflow-hidden rounded-lg border border-border">
				<TabBar pathname="/weight" label="TabBar preview, Weight active" preview />
			</div>
		</div>
	</Section>

	<Section
		name="Sidebar"
		description="Replaces the tab bar from 1024 px. Fixed to the left edge, 240 px wide. Items are 44 px tall; the active one has a raised background and the brand color."
	>
		<Sidebar pathname="/recipes" label="Sidebar preview, Recipes active" preview />
	</Section>
</div>

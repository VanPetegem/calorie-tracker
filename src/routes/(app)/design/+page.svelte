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
	import { addSheet } from '#lib/stores/add-sheet.svelte.ts';
	import { toasts, withUndo } from '#lib/stores/toasts.svelte.ts';
	import {
		getThemePreference,
		setThemePreference,
		type ThemePreference
	} from '#lib/design/theme.ts';
	import { themes, type ColorToken } from '#lib/design/tokens.ts';
	import DateSwitcher from '#lib/components/log/DateSwitcher.svelte';
	import DayHero from '#lib/components/log/DayHero.svelte';
	import AmountStep from '#lib/components/log/AmountStep.svelte';
	import {
		batchSource,
		entryBatchSource,
		type BatchAmountValue
	} from '#lib/components/log/amount.ts';
	import EntryRow from '#lib/components/log/EntryRow.svelte';
	import FoodForm from '#lib/components/log/FoodForm.svelte';
	import FoodRow from '#lib/components/log/FoodRow.svelte';
	import QuickAddForm from '#lib/components/log/QuickAddForm.svelte';
	import BatchRow from '#lib/components/recipes/BatchRow.svelte';
	import ContainerForm from '#lib/components/recipes/ContainerForm.svelte';
	import WeightField from '#lib/components/recipes/WeightField.svelte';
	import AddIngredientSheet from '#lib/components/recipes/AddIngredientSheet.svelte';
	import IngredientList from '#lib/components/recipes/IngredientList.svelte';
	import IngredientRow from '#lib/components/recipes/IngredientRow.svelte';
	import NutritionSummary from '#lib/components/recipes/NutritionSummary.svelte';
	import RecipeRow from '#lib/components/recipes/RecipeRow.svelte';
	import {
		draftNutrients,
		draftTotals,
		type DraftIngredient
	} from '#lib/components/recipes/draft.ts';
	import { addDays } from '#lib/domain/dates.ts';
	import { trendSeries, weeklyRate, type TrendPoint, type WeighIn } from '#lib/domain/trend.ts';
	import EditWeightSheet from '#lib/components/weight/EditWeightSheet.svelte';
	import WeightChart from '#lib/components/weight/WeightChart.svelte';
	import WeightEntry from '#lib/components/weight/WeightEntry.svelte';
	import WeightRow from '#lib/components/weight/WeightRow.svelte';
	import WeightSummary from '#lib/components/weight/WeightSummary.svelte';
	import type { BatchSummary } from '#lib/server/batches/repo.ts';
	import type { RecipeSummary } from '#lib/server/recipes/repo.ts';
	import ScannerPanel from '#lib/components/log/ScannerPanel.svelte';
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
	let disabledUnit = $state<'portion' | 'g'>('portion');
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

	// Weigh-ins for the weight components: a fixed "today" and a made up, repeatable series (no random numbers).
	const weightToday = '2026-11-07';
	/** `count` weigh-ins `every` days apart, the last on today, drifting up by 0.02 kg a day with a daily wobble. */
	function weighIns(count: number, every = 1): WeighIn[] {
		return Array.from({ length: count }, (_, i) => ({
			date: addDays(weightToday, -(count - 1 - i) * every),
			kg: Math.round((68 + i * every * 0.02 + (((i * 7) % 5) - 2) * 0.15) * 10) / 10
		}));
	}
	const weightDense = trendSeries(weighIns(365));
	const weightSparse = trendSeries(weighIns(9, 11));
	const weightOne = trendSeries([{ date: weightToday, kg: 70.4 }]);
	const weightSteady = trendSeries(weighIns(20));
	const weightRateNow = weeklyRate(weightDense, weightToday);
	const weightRows: TrendPoint[] = weightSteady.slice(-3).reverse();
	let weightLog = $state('Change the weight and press Save.');
	let weightRowLog = $state('Tap a row to edit it, or the bin to delete it.');
	let weightSheetOpen = $state(false);
	let weightSheetPoint = $state<WeighIn | null>(null);
	let weightSheetLog = $state('Open the sheet to edit a weigh-in or add one.');
	let weightSheetFails = $state(false);
	// Whether yesterday, the add sheet's first day, already has a weigh-in (the replace hint).
	let weightSheetTaken = $state(false);

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
	let foodLog = $state('Pick a food, or change an amount and log it.');

	const sampleFood = {
		name: 'Rolled oats',
		brand: 'Kölln',
		nutritionBasis: 'g',
		kcal: 372,
		protein: 13.5,
		carbs: 58.7,
		fat: 7,
		fiber: 10,
		servingG: 40
	} as const;
	const sampleLiquid = {
		...sampleFood,
		name: 'Oat drink',
		brand: null,
		nutritionBasis: 'ml',
		kcal: 46,
		protein: 1,
		carbs: 6.7,
		fat: 1.5,
		fiber: 0.8,
		servingG: null
	} as const;
	const ingredientFoods = [
		sampleFood,
		sampleLiquid,
		{ ...sampleFood, name: 'Banana', brand: null, kcal: 89, servingG: 118 },
		{ ...sampleFood, name: 'Peanut butter, crunchy with sea salt and a long name', kcal: 600 },
		{ ...sampleFood, name: 'Honey', kcal: 304, servingG: 21 }
	] as const;
	const ingredientAmounts: [number, 'g' | 'ml' | 'serving'][] = [
		[80, 'g'],
		[250, 'ml'],
		[1, 'serving'],
		[30, 'g'],
		[2, 'serving']
	];
	const makeIngredients = (count: number): DraftIngredient[] =>
		Array.from({ length: count }, (_, i) => {
			const food = ingredientFoods[i % ingredientFoods.length]!;
			const [amount, unit] = ingredientAmounts[i % ingredientAmounts.length]!;
			return {
				key: `design-ingredient-${count}-${i}`,
				food: { ...food, id: `design-food-${i % ingredientFoods.length}` },
				amount: unit === 'serving' && food.servingG === null ? 100 : amount,
				unit: unit === 'serving' && food.servingG === null ? food.nutritionBasis : unit
			};
		});
	let emptyIngredients = $state<DraftIngredient[]>([]);
	let filledIngredients = $state<DraftIngredient[]>(makeIngredients(3));
	let longIngredients = $state<DraftIngredient[]>(makeIngredients(12));
	let addIngredientOpen = $state(false);
	let addIngredientLog = $state('Nothing added yet.');
	let portionsText = $state('1.5');
	const summaryTotals = $derived(draftTotals(filledIngredients));
	const summaryPortions = $derived.by(() => {
		const value = Number(portionsText.replace(',', '.'));
		return portionsText.trim() === '' || Number.isNaN(value) ? null : value;
	});
	const sampleRecipe: RecipeSummary = {
		id: 'design-recipe',
		name: 'Overnight oats',
		defaultPortions: 4,
		notes: null,
		createdAt: '2026-11-01T08:00:00.000Z',
		updatedAt: '2026-11-01T08:00:00.000Z',
		archivedAt: null,
		totals: { kcal: 2480, protein: 96, carbs: 300, fat: 88, fiber: 40 },
		perPortion: { kcal: 620, protein: 24, carbs: 75, fat: 22, fiber: 10 },
		ingredientCount: 6
	};

	const sampleBatch: BatchSummary = {
		id: 'design-batch',
		recipeId: null,
		name: 'Beef stew',
		cookedOn: '2026-11-05',
		portions: 4,
		cookedWeightG: 1600,
		kcal: 2000,
		protein: 120,
		carbs: 200,
		fat: 80,
		fiber: 16,
		finishedAt: null,
		createdAt: '2026-11-05T18:00:00.000Z',
		updatedAt: '2026-11-05T18:00:00.000Z',
		portionsLeft: 2.5,
		perPortion: { kcal: 500, protein: 30, carbs: 50, fat: 20, fiber: 4 },
		per100g: { kcal: 125, protein: 7.5, carbs: 12.5, fat: 5, fiber: 1 },
		lastActivity: '2026-11-05T18:00:00.000Z'
	};
	let batchLog = $state('Nothing picked yet.');

	// WeightField and ContainerForm: a parent that keeps the list, as a batch form does.
	let designContainers = $state([
		{ id: 'design-pot', name: 'Pot', tareG: 650, createdAt: '2026-11-06T09:00:00.000Z' },
		{ id: 'design-box', name: 'Lunch box', tareG: 180, createdAt: '2026-11-06T09:00:00.000Z' }
	]);
	let weightNone = $state<number | null>(null);
	let weightStored = $state<number | null>(1600);
	let weightNoContainers = $state<number | null>(null);
	let containerLog = $state('Nothing saved yet.');
	// A logged entry of the batch: 1.5 portions at 500 kcal a portion, 600 g. Edited from its own snapshot.
	const sampleBatchEntry = {
		kcal: 750,
		protein: 45,
		carbs: 75,
		fat: 30,
		fiber: 6,
		label: 'Beef stew',
		amount: 1.5,
		unit: 'portion',
		grams: 600
	};

	function showRowMenu(event: MouseEvent) {
		(event.currentTarget instanceof Element ? event.currentTarget : null)
			?.closest('[data-menu-demo]')
			?.querySelector<HTMLButtonElement>('button[aria-label^="More actions"]')
			?.click();
	}

	async function failingSubmit() {
		await new Promise((resolve) => setTimeout(resolve, 600));
		throw new Error('Demo failure');
	}

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

	<Section
		name="SegmentedControl"
		description="Arrow keys move the selection. An option that cannot be chosen stays visible and aria-disabled, the arrow keys skip it, and the caller says why next to the control."
	>
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
			<SegmentedControl
				label="Unit, grams off"
				options={[
					{ value: 'portion', label: 'portion' },
					{ value: 'g', label: 'g', disabled: true }
				]}
				bind:value={disabledUnit}
			/>
			<p class="text-sm text-text-muted">Add the cooked weight to log grams</p>
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
		name="FoodRow"
		description="A food in the add sheet. Search results show brand, per 100 g or ml and kcal per 100. Recents and frequents show the last amount and its kcal. At least 56 px tall."
	>
		<ul class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
			<li><FoodRow food={sampleFood} onselect={() => (foodLog = 'Picked Rolled oats')} /></li>
			<li>
				<FoodRow food={sampleLiquid} onselect={() => (foodLog = 'Picked Oat drink')} />
			</li>
			<li>
				<FoodRow
					food={sampleFood}
					last={{ amount: 2, unit: 'serving' }}
					onselect={() => (foodLog = 'Picked Rolled oats (recent)')}
				/>
			</li>
		</ul>
		<span class="text-sm text-text-muted">{foodLog}</span>
	</Section>

	<Section
		name="AmountStep"
		description="The amount step of the add sheet and of editing an entry. The unit switch keeps the quantity (80 g becomes 2 servings of 40 g), the preview is live, and the amount accepts a comma or a point."
	>
		<div class="grid gap-6 md:grid-cols-2">
			<div class="flex flex-col gap-2">
				<span class="text-sm font-medium text-text-muted"
					>Food with a serving: starts at one serving</span
				>
				<AmountStep
					food={sampleFood}
					mode="add"
					onsubmit={(value) => void (foodLog = `Log ${value.amount} ${value.unit}`)}
				/>
			</div>
			<div class="flex flex-col gap-2">
				<span class="text-sm font-medium text-text-muted">Liquid without a serving, edit mode</span>
				<AmountStep
					food={sampleLiquid}
					mode="edit"
					initial={{ amount: 250, unit: 'ml' }}
					onsubmit={(value) => void (foodLog = `Save ${value.amount} ${value.unit}`)}
					onback={() => (foodLog = 'Back')}
				/>
			</div>
			<div class="flex flex-col gap-2">
				<span class="text-sm font-medium text-text-muted">Saving fails: inline error, retry</span>
				<AmountStep food={sampleFood} mode="add" onsubmit={failingSubmit} />
			</div>
		</div>
	</Section>

	<Section
		name="Batch amount step"
		description="The amount step for a batch: portions, or grams when the batch has a cooked weight (grams are off, with the reason, when it has none). It starts at one portion and the preview is live. Editing a logged entry prices it from the entry's own snapshot, so later changes to the batch never reach it, and an entry without grams changes in portions only."
	>
		<div class="grid gap-6 md:grid-cols-2">
			<div class="flex flex-col gap-2">
				<span class="text-sm font-medium text-text-muted">Weighed batch: portions or grams</span>
				<AmountStep
					batch={batchSource(sampleBatch)}
					mode="add"
					onsubmit={(value: BatchAmountValue) =>
						void (batchLog = `Log ${value.amount} ${value.unit}`)}
					onback={() => (batchLog = 'Back')}
				/>
			</div>
			<div class="flex flex-col gap-2">
				<span class="text-sm font-medium text-text-muted"
					>Batch without a cooked weight: grams are off</span
				>
				<AmountStep
					batch={batchSource({ ...sampleBatch, cookedWeightG: null })}
					mode="add"
					onsubmit={(value: BatchAmountValue) =>
						void (batchLog = `Log ${value.amount} ${value.unit}`)}
				/>
			</div>
			<div class="flex flex-col gap-2">
				<span class="text-sm font-medium text-text-muted">Editing an entry of 1.5 portions</span>
				<AmountStep
					batch={entryBatchSource(sampleBatchEntry, 400)!}
					mode="edit"
					initial={{ amount: 1.5, unit: 'portion' }}
					onsubmit={(value: BatchAmountValue) =>
						void (batchLog = `Save ${value.amount} ${value.unit}`)}
				/>
			</div>
			<div class="flex flex-col gap-2">
				<span class="text-sm font-medium text-text-muted">Editing an entry without grams</span>
				<AmountStep
					batch={entryBatchSource({ ...sampleBatchEntry, amount: 2, grams: null }, 400)!}
					mode="edit"
					initial={{ amount: 2, unit: 'portion' }}
					onsubmit={(value: BatchAmountValue) =>
						void (batchLog = `Save ${value.amount} ${value.unit}`)}
				/>
			</div>
		</div>
		<span class="text-sm text-text-muted">{batchLog}</span>
	</Section>

	<Section
		name="FoodForm"
		description="Creates or edits a food. Each field is checked when it loses focus, so 901 kcal or fiber 'abc' shows its message at once; comma decimals work. Editing says that days already logged keep their values. These previews save nothing."
	>
		<div class="grid gap-6 md:grid-cols-2">
			<div class="flex flex-col gap-2">
				<span class="text-sm font-medium text-text-muted">New food</span>
				<FoodForm preview onsaved={() => {}} oncancel={() => {}} />
			</div>
			<div class="flex flex-col gap-2">
				<span class="text-sm font-medium text-text-muted"
					>Editing, with a barcode from the miss flow</span
				>
				<FoodForm
					preview
					foodId="design-oats-food"
					initial={{
						name: 'Rolled oats',
						brand: 'Kölln',
						barcode: '4000540000000',
						nutritionBasis: 'g',
						kcal: 372,
						protein: 13.5,
						carbs: 58.7,
						fat: 7,
						fiber: 10,
						servingG: 40
					}}
					onsaved={() => {}}
				/>
			</div>
		</div>
	</Section>

	<Section
		name="QuickAddForm"
		description="Manual kcal and macros without a food, such as a restaurant estimate. Kcal is required; empty macros count as 0. With an entry it edits that entry. These previews save nothing."
	>
		<div class="grid gap-6 md:grid-cols-2">
			<div class="flex flex-col gap-2">
				<span class="text-sm font-medium text-text-muted">New quick add</span>
				<QuickAddForm preview date="2026-11-05" ondone={() => {}} oncancel={() => {}} />
			</div>
			<div class="flex flex-col gap-2">
				<span class="text-sm font-medium text-text-muted">Editing an entry</span>
				<QuickAddForm preview entry={sampleQuick} date="2026-11-05" ondone={() => {}} />
			</div>
		</div>
	</Section>

	<Section
		name="Scanner"
		description="The scanner step of the add sheet, opened from Scan. The camera starts only after the tap. The manual barcode field is always there: it accepts EAN-13, UPC-A or EAN-8, and an 8 digit code is read as EAN-8, else as UPC-E. The torch button shows only when the camera reports a torch. A camera another app holds, or one the system takes away (a call, switching apps), gets a message and a Restart camera button. These previews have no camera."
	>
		<div class="grid gap-6 md:grid-cols-2">
			{#each [{ id: 'starting', title: 'Starting', camera: 'starting' }, { id: 'scanning', title: 'Scanning, with a torch', camera: 'scanning', torch: true }, { id: 'denied', title: 'Camera denied', camera: 'denied' }, { id: 'unsupported', title: 'Camera unsupported', camera: 'unsupported' }, { id: 'looking', title: 'Looking up the barcode', camera: 'scanning', status: 'looking' }, { id: 'busy', title: 'Camera in use by another app', camera: 'busy' }, { id: 'interrupted', title: 'Camera interrupted', camera: 'interrupted' }, { id: 'unavailable', title: 'Product database unreachable', camera: 'scanning', status: 'unavailable', barcode: '4000540000000' }, { id: 'invalid', title: 'Not a valid barcode', camera: 'scanning', status: 'invalid' }] as const as state (state.id)}
				<div class="flex flex-col gap-2">
					<span class="text-sm font-medium text-text-muted">{state.title}</span>
					<ScannerPanel
						camera={state.camera}
						status={'status' in state ? state.status : 'idle'}
						barcode={'barcode' in state ? state.barcode : undefined}
						torchAvailable={'torch' in state}
						ontorch={() => {}}
						onmanual={() => {}}
						onenter={() => {}}
						onrescan={() => {}}
						onrestart={() => {}}
						onback={() => {}}
					/>
				</div>
			{/each}
		</div>
	</Section>

	<Section
		name="IngredientList"
		description="The ingredients of a recipe or batch. A tap on a row changes its amount; the row menu moves it up or down or removes it, with an Undo toast that puts it back at the same index. The picker stops at 50 ingredients. Totals follow every change."
	>
		<div class="grid gap-6 md:grid-cols-2">
			<div class="flex min-w-0 flex-col gap-2">
				<span class="text-sm font-medium text-text-muted">Empty</span>
				<IngredientList bind:ingredients={emptyIngredients} />
			</div>
			<div class="flex min-w-0 flex-col gap-2" data-menu-demo>
				<span class="text-sm font-medium text-text-muted">Filled, three ingredients</span>
				<IngredientList bind:ingredients={filledIngredients} />
				<div>
					<Button variant="secondary" size="sm" onclick={showRowMenu}>
						Show the menu of the first row
					</Button>
				</div>
			</div>
			<div class="flex min-w-0 flex-col gap-2 md:col-span-2">
				<span class="text-sm font-medium text-text-muted">Long list, twelve ingredients</span>
				<IngredientList bind:ingredients={longIngredients} />
			</div>
		</div>
	</Section>

	<Section
		name="IngredientRow"
		description="One ingredient: name, amount with unit and kcal. The whole row is a button for the amount; the menu button has its own 44 px target. Long names truncate. After a save the server refused, the row is marked with the reason."
	>
		<ul class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
			{#each makeIngredients(4) as ingredient, index (ingredient.key)}
				<IngredientRow
					{ingredient}
					kcal={draftNutrients(ingredient).kcal}
					error={index === 2 ? `${ingredient.food.name} has no serving size` : undefined}
					onedit={() => (addIngredientLog = `Edit ${ingredient.food.name}`)}
					onmenu={() => (addIngredientLog = `Menu for ${ingredient.food.name}`)}
				/>
			{/each}
		</ul>
	</Section>

	<Section
		name="AddIngredientSheet"
		description="The add sheet without Quick add: search, Scan and New food, then the amount step with an Add button. Recents load each time it opens."
	>
		<div class="flex min-w-0 flex-col gap-2">
			<div>
				<Button icon={Plus} onclick={() => (addIngredientOpen = true)}
					>Open the ingredient sheet</Button
				>
			</div>
			<span class="text-sm text-text-muted">{addIngredientLog}</span>
		</div>
		<AddIngredientSheet
			bind:open={addIngredientOpen}
			onadd={(food, value) =>
				(addIngredientLog = `Added ${value.amount} ${value.unit} ${food.name}`)}
		/>
	</Section>

	<Section
		name="NutritionSummary"
		description="Totals and, with valid portions, the values per portion. Portions that are empty or 0 show the totals and a hint. With a cooked weight (batches) it adds values per 100 g."
	>
		<div class="grid gap-6 md:grid-cols-2">
			<div class="flex min-w-0 flex-col gap-2">
				<Input label="Portions" bind:value={portionsText} inputmode="decimal" autocomplete="off" />
				<span class="text-sm font-medium text-text-muted">Live from the filled list above</span>
				<NutritionSummary totals={summaryTotals} portions={summaryPortions} />
			</div>
			<div class="flex min-w-0 flex-col gap-2">
				<span class="text-sm font-medium text-text-muted">Without portions</span>
				<NutritionSummary totals={summaryTotals} portions={null} />
			</div>
			<div class="flex min-w-0 flex-col gap-2 md:col-span-2">
				<span class="text-sm font-medium text-text-muted"
					>With values per 100 g of cooked weight</span
				>
				<NutritionSummary
					totals={{ kcal: 2480, protein: 96, carbs: 300, fat: 88, fiber: 40 }}
					portions={4}
					per100g={{ kcal: 155, protein: 6, carbs: 18.8, fat: 5.5, fiber: 2.5 }}
				/>
			</div>
		</div>
	</Section>

	<Section
		name="RecipeRow"
		description="A recipe in the Recipes tab: name, portions and ingredients, kcal per portion. A link at least 56 px tall."
	>
		<ul class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
			<li><RecipeRow recipe={sampleRecipe} href="/design#RecipeRow" /></li>
			<li>
				<RecipeRow
					recipe={{
						...sampleRecipe,
						id: 'design-recipe-2',
						name: 'Chicken, rice and vegetables with a very long recipe name',
						defaultPortions: 1,
						ingredientCount: 1
					}}
					href="/design#RecipeRow"
				/>
			</li>
		</ul>
	</Section>

	<Section
		name="BatchRow"
		description="A batch in the add sheet (a button) or the Recipes tab (a link): name, how many portions are left of all, kcal per portion. The count never shows below 0; a finished batch says so. At least 56 px tall."
	>
		<ul class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
			<li>
				<BatchRow batch={sampleBatch} onpick={() => (batchLog = 'Picked Beef stew')} />
			</li>
			<li>
				<BatchRow
					batch={{
						...sampleBatch,
						id: 'design-batch-empty',
						name: 'Lentil curry',
						portionsLeft: 0
					}}
					onpick={() => (batchLog = 'Picked Lentil curry')}
				/>
			</li>
			<li>
				<BatchRow
					batch={{
						...sampleBatch,
						id: 'design-batch-finished',
						name: 'Chili with a very long name for a batch of beans and rice',
						portionsLeft: 1,
						finishedAt: '2026-11-06T09:00:00.000Z'
					}}
					href="/design#BatchRow"
				/>
			</li>
		</ul>
		<span class="text-sm text-text-muted">{batchLog}</span>
	</Section>

	<Section
		name="WeightField"
		description="The cooked weight of a batch. Without a container the number is the net weight; with one, type the weight on the scale and the net after the tare shows. A weight at or below the tare, or over 20000 g, is an error under the field and keeps Save off. New container opens the container form inline. Empty is allowed: the batch then logs by portion only."
	>
		<div class="grid gap-6 md:grid-cols-2">
			<div class="flex min-w-0 flex-col gap-2">
				<span class="text-sm font-medium text-text-muted">Empty, containers saved</span>
				<WeightField
					bind:value={weightNone}
					containers={designContainers}
					oncreatecontainer={async (input) => {
						const made = { ...input, id: `design-${designContainers.length}`, createdAt: '' };
						designContainers = [...designContainers, made];
						return made;
					}}
				/>
			</div>
			<div class="flex min-w-0 flex-col gap-2">
				<span class="text-sm font-medium text-text-muted">A stored batch weight, no container</span>
				<WeightField
					bind:value={weightStored}
					containers={designContainers}
					oncreatecontainer={async (input) => ({ ...input, id: 'design-new', createdAt: '' })}
				/>
			</div>
			<div class="flex min-w-0 flex-col gap-2">
				<span class="text-sm font-medium text-text-muted">No containers saved yet</span>
				<WeightField
					bind:value={weightNoContainers}
					containers={[]}
					oncreatecontainer={async (input) => ({ ...input, id: 'design-first', createdAt: '' })}
				/>
			</div>
		</div>
	</Section>

	<Section
		name="ContainerForm"
		description="Name and tare of a container, in the weight field and in Settings. Checked on blur with the schema the server uses. A failed save keeps the form and offers Retry."
	>
		<div class="grid gap-6 md:grid-cols-2">
			<div class="flex min-w-0 flex-col gap-2">
				<span class="text-sm font-medium text-text-muted">New</span>
				<ContainerForm
					onsave={async (input) => void (containerLog = `Saved ${input.name}, ${input.tareG} g`)}
					oncancel={() => (containerLog = 'Cancelled')}
				/>
			</div>
			<div class="flex min-w-0 flex-col gap-2">
				<span class="text-sm font-medium text-text-muted">Editing</span>
				<ContainerForm
					container={designContainers[0]}
					submitLabel="Save"
					onsave={async (input) => void (containerLog = `Saved ${input.name}, ${input.tareG} g`)}
				/>
			</div>
			<div class="flex min-w-0 flex-col gap-2">
				<span class="text-sm font-medium text-text-muted">The save fails</span>
				<ContainerForm
					container={designContainers[1]}
					submitLabel="Save"
					onsave={async () => {
						throw new Error('offline');
					}}
				/>
			</div>
		</div>
		<span class="text-sm text-text-muted">{containerLog}</span>
	</Section>

	<Section
		name="WeightEntry"
		description="Today's weigh-in: a number field, a button for 0.1 kg down and up, and Save. It starts from today's weigh-in, else the latest, else empty (the step buttons stay off until there is a number). The weight is checked against the server's schema when the field loses focus and on Save; a weight outside 20 to 400 kg is an error under the field. A failed save keeps the value and offers Retry. Saving and the failed save are triggered by pressing Save in the last two examples."
	>
		<div class="grid gap-6 md:grid-cols-2">
			<div class="flex min-w-0 flex-col gap-2">
				<span class="text-sm font-medium text-text-muted">Empty, no weigh-in yet</span>
				<WeightEntry
					today={weightToday}
					todayKg={null}
					lastKg={null}
					onsave={async (kg) => void (weightLog = `Saved ${kg} kg`)}
				/>
			</div>
			<div class="flex min-w-0 flex-col gap-2">
				<span class="text-sm font-medium text-text-muted">Prefilled with the latest weigh-in</span>
				<WeightEntry
					today={weightToday}
					todayKg={null}
					lastKg={70.2}
					onsave={async (kg) => void (weightLog = `Saved ${kg} kg`)}
				/>
			</div>
			<div class="flex min-w-0 flex-col gap-2">
				<span class="text-sm font-medium text-text-muted">Logged today</span>
				<WeightEntry
					today={weightToday}
					todayKg={70.6}
					lastKg={70.6}
					onsave={async (kg) => void (weightLog = `Saved ${kg} kg`)}
				/>
			</div>
			<div class="flex min-w-0 flex-col gap-2">
				<span class="text-sm font-medium text-text-muted">Saving (Save never finishes)</span>
				<WeightEntry
					today={weightToday}
					todayKg={null}
					lastKg={70.2}
					onsave={() => new Promise<void>(() => {})}
				/>
			</div>
			<div class="flex min-w-0 flex-col gap-2">
				<span class="text-sm font-medium text-text-muted">The save fails</span>
				<WeightEntry
					today={weightToday}
					todayKg={null}
					lastKg={70.2}
					onsave={async () => {
						throw new Error('offline');
					}}
				/>
			</div>
		</div>
		<span class="text-sm text-text-muted">{weightLog}</span>
	</Section>

	<Section
		name="WeightSummary"
		description="The trend weight today and the weekly rate in kg and percent of the trend, signed. Until there are 14 days of weigh-ins it says when the rate comes; before the first weigh-in it says there is none."
	>
		<div class="grid gap-6 md:grid-cols-2">
			<WeightSummary trendKg={weightDense.at(-1)?.trend ?? null} rate={weightRateNow} />
			<WeightSummary trendKg={70.4} rate={{ kg: -0.3, pct: -0.43 }} />
			<WeightSummary trendKg={70.4} rate={null} />
			<WeightSummary trendKg={null} rate={null} />
		</div>
	</Section>

	<Section
		name="WeightChart"
		description="Weigh-ins as dots and the trend as a line, in an inline SVG. The range control (30 days, 90 days, 1 year, All) is remembered on this device; a fixed range spans its whole window. Tap or drag the chart, hover it, or focus it and use the arrow keys to read a point; Escape closes the tooltip. A table of the visible points is there for screen readers. A dashed line shows the goal slope when a goal is given."
	>
		<div class="grid gap-6">
			<div class="flex min-w-0 flex-col gap-2">
				<span class="text-sm font-medium text-text-muted">Empty</span>
				<WeightChart series={[]} today={weightToday} />
			</div>
			<div class="flex min-w-0 flex-col gap-2">
				<span class="text-sm font-medium text-text-muted">One weigh-in</span>
				<WeightChart series={weightOne} today={weightToday} />
			</div>
			<div class="flex min-w-0 flex-col gap-2">
				<span class="text-sm font-medium text-text-muted"
					>Sparse, nine weigh-ins eleven days apart</span
				>
				<WeightChart series={weightSparse} today={weightToday} />
			</div>
			<div class="flex min-w-0 flex-col gap-2">
				<span class="text-sm font-medium text-text-muted"
					>Dense, a year of daily weigh-ins (try each range)</span
				>
				<WeightChart series={weightDense} today={weightToday} />
			</div>
			<div class="flex min-w-0 flex-col gap-2">
				<span class="text-sm font-medium text-text-muted">With a goal slope</span>
				<WeightChart
					series={weightSteady}
					today={weightToday}
					goal={{
						from: addDays(weightToday, -6),
						trendKg: weightSteady.at(-7)?.trend ?? 70,
						kgPerWeek: 0.35
					}}
				/>
			</div>
		</div>
	</Section>

	<Section
		name="WeightRow"
		description="One weigh-in in the history: date, weight and the trend on that day. A tap on the row edits it; the bin button deletes it, and the page offers Undo. Both are buttons, so nothing needs a swipe or a hover. At least 56 px tall."
	>
		<ul class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
			{#each weightRows as point (point.date)}
				<li>
					<WeightRow
						{point}
						onedit={(p) => (weightRowLog = `Edit ${p.date}`)}
						ondelete={(p) => (weightRowLog = `Delete ${p.date}`)}
					/>
				</li>
			{/each}
		</ul>
		<span class="text-sm text-text-muted">{weightRowLog}</span>
	</Section>

	<Section
		name="EditWeightSheet"
		description="Edits the weight of a stored weigh-in, whose date stays; or adds one for a day up to tomorrow, starting on yesterday. When the chosen day already has a weigh-in, a hint says saving replaces it. The date and the weight are checked on blur and on Save with the server's schema. The sheet closes when the save works; when it fails it stays open and offers Retry."
	>
		<div class="flex flex-wrap gap-2">
			<Button
				variant="secondary"
				onclick={() => {
					weightSheetPoint = { date: '2026-11-03', kg: 70.4 };
					weightSheetFails = false;
					weightSheetTaken = false;
					weightSheetOpen = true;
				}}
			>
				Edit a weigh-in
			</Button>
			<Button
				variant="secondary"
				onclick={() => {
					weightSheetPoint = null;
					weightSheetFails = false;
					weightSheetTaken = false;
					weightSheetOpen = true;
				}}
			>
				Add a weigh-in
			</Button>
			<Button
				variant="secondary"
				onclick={() => {
					weightSheetPoint = null;
					weightSheetFails = false;
					weightSheetTaken = true;
					weightSheetOpen = true;
				}}
			>
				Add, the day has one
			</Button>
			<Button
				variant="secondary"
				onclick={() => {
					weightSheetPoint = { date: '2026-11-03', kg: 70.4 };
					weightSheetFails = true;
					weightSheetTaken = false;
					weightSheetOpen = true;
				}}
			>
				Edit, the save fails
			</Button>
		</div>
		<span class="text-sm text-text-muted">{weightSheetLog}</span>
		<EditWeightSheet
			bind:open={weightSheetOpen}
			point={weightSheetPoint}
			today={weightToday}
			kgOn={(date) => (weightSheetTaken && date === addDays(weightToday, -1) ? 70.6 : null)}
			onsave={async (input) => {
				if (weightSheetFails) throw new Error('offline');
				weightSheetLog = `Saved ${input.kg} kg on ${input.date}`;
			}}
		/>
	</Section>

	<Section
		name="AddSheet"
		description="Search field, then active batches (portions left, kcal per portion), Quick add, New food and Scan, recents and frequents; typing searches the library after 200 ms, Enter or the Open Food Facts row searches OFF. Opens from the add button, the sidebar and Cmd or Ctrl K."
	>
		<div>
			<Button icon={Plus} onclick={() => addSheet.show()}>Open the add sheet</Button>
		</div>
	</Section>

	<Section
		name="TabBar"
		description="Primary navigation below 1024 px, fixed to the bottom and padded by the home indicator inset. Four tabs, each at least 44 px tall, with a round add button in the middle. The active tab uses the brand color, a top marker and aria-current."
	>
		<div class="flex flex-col gap-3">
			<div class="overflow-hidden rounded-lg border border-border">
				<TabBar
					pathname="/"
					label="TabBar preview, Today active"
					preview
					onadd={() => addSheet.show()}
				/>
			</div>
			<div class="overflow-hidden rounded-lg border border-border">
				<TabBar
					pathname="/weight"
					label="TabBar preview, Weight active"
					preview
					onadd={() => addSheet.show()}
				/>
			</div>
		</div>
	</Section>

	<Section
		name="Sidebar"
		description="Replaces the tab bar from 1024 px. Fixed to the left edge, 240 px wide. An Add food button sits above the items. Items are 44 px tall; the active one has a raised background and the brand color."
	>
		<Sidebar
			pathname="/recipes"
			label="Sidebar preview, Recipes active"
			preview
			onadd={() => addSheet.show()}
		/>
	</Section>
</div>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { untrack } from 'svelte';
	import * as v from 'valibot';
	import { MAX_AGE_YEARS, MIN_AGE_YEARS, WEIGHT_STEP_KG } from '#lib/domain/constants.ts';
	import { isCalendarDate } from '#lib/domain/dates.ts';
	import { ageInRange, type ActivityLevel, type Sex } from '#lib/domain/tdee.ts';
	import { Button, Input, NumberInput } from '#lib/components/ui/index.ts';
	import { ProfileInput } from '#lib/schemas/settings.ts';
	import { TodayWeightInput } from '#lib/schemas/weight.ts';
	import { commitFocusedInput, fieldIssue } from '#lib/components/weight/form.ts';

	/** The values the form starts from. Null or empty means not chosen yet. */
	type ProfileValues = {
		sex: Sex | null;
		birthDate: string | null;
		heightCm: number | null;
		activityLevel: ActivityLevel | null;
		kg: number | null;
	};

	type Field = 'sex' | 'birthDate' | 'heightCm' | 'activityLevel' | 'kg';

	/**
	 * The profile behind the formula TDEE, for onboarding (`withWeight`: also today's weight) and Settings. Fields are
	 * checked against `ProfileInput` (and `TodayWeightInput`) when they lose focus and on submit. The age is counted on
	 * `today`, the day in the settings timezone, and must be MIN_AGE_YEARS to MAX_AGE_YEARS. `onsubmit` does the write;
	 * a failure keeps the values and offers Retry. `extra` renders above Save (onboarding puts the goal rate there).
	 */
	type Props = {
		value?: Partial<ProfileValues>;
		withWeight: boolean;
		today: string;
		submitLabel: string;
		onsubmit: (input: { profile: ProfileInput; kg: number | null }) => Promise<void>;
		extra?: Snippet;
	};

	let { value = {}, withWeight, today, submitLabel, onsubmit, extra }: Props = $props();

	const uid = $props.id();
	const start = untrack(() => value);
	let sex = $state<Sex | null>(start.sex ?? null);
	let birthDate = $state(start.birthDate ?? '');
	let heightCm = $state<number | null>(start.heightCm ?? null);
	let activityLevel = $state<ActivityLevel | null>(start.activityLevel ?? null);
	let kg = $state<number | null>(start.kg ?? null);

	let touched = $state<Record<Field, boolean>>({
		sex: false,
		birthDate: false,
		heightCm: false,
		activityLevel: false,
		kg: false
	});
	let submitted = $state(false);
	let busy = $state(false);
	let failure = $state(false);
	let form = $state<HTMLFormElement>();

	const SEX_OPTIONS: { value: Sex; label: string }[] = [
		{ value: 'male', label: 'Male' },
		{ value: 'female', label: 'Female' }
	];

	// One entry per level, with the hint the form shows under its name.
	const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string; hint: string }[] = [
		{ value: 'sedentary', label: 'Sedentary', hint: 'Desk job, little or no exercise' },
		{ value: 'light', label: 'Light', hint: 'Light exercise 1 to 3 days a week' },
		{ value: 'moderate', label: 'Moderate', hint: 'Moderate exercise 3 to 5 days a week' },
		{ value: 'active', label: 'Active', hint: 'Hard exercise 6 to 7 days a week' },
		{ value: 'very_active', label: 'Very active', hint: 'Very hard exercise or a physical job' }
	];

	const AGE_MESSAGE = `Age must be ${MIN_AGE_YEARS} to ${MAX_AGE_YEARS}`;

	/** The age error on `today`, for a birth date in the form YYYY-MM-DD. */
	function ageError(birth: string, on: string): string | undefined {
		if (!isCalendarDate(birth)) return undefined;
		return ageInRange(birth, on) ? undefined : AGE_MESSAGE;
	}

	const profileResult = $derived(
		v.safeParse(ProfileInput, { sex, birthDate, heightCm, activityLevel })
	);
	const weightResult = $derived(withWeight ? v.safeParse(TodayWeightInput, { kg }) : null);

	const errors = $derived<Record<Field, string | undefined>>({
		sex: fieldIssue(profileResult.issues, 'sex'),
		birthDate: ageError(birthDate, today) ?? fieldIssue(profileResult.issues, 'birthDate'),
		heightCm: fieldIssue(profileResult.issues, 'heightCm'),
		activityLevel: fieldIssue(profileResult.issues, 'activityLevel'),
		kg: weightResult ? fieldIssue(weightResult.issues, 'kg') : undefined
	});

	// A field shows its error once it has lost focus, or after a submit.
	const shown = (field: Field) => (touched[field] || submitted ? errors[field] : undefined);

	function touch(field: Field) {
		touched[field] = true;
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		// A number field commits on blur; a button tapped on iOS does not blur it, so commit it here first.
		commitFocusedInput(form);
		submitted = true;
		const profile = v.safeParse(ProfileInput, { sex, birthDate, heightCm, activityLevel });
		const weight = withWeight ? v.safeParse(TodayWeightInput, { kg }) : null;
		if (!profile.success || ageError(birthDate, today) || (weight && !weight.success)) return;
		busy = true;
		failure = false;
		try {
			await onsubmit({ profile: profile.output, kg: weight?.success ? weight.output.kg : null });
		} catch {
			failure = true;
		} finally {
			busy = false;
		}
	}
</script>

<form class="flex flex-col gap-5" onsubmit={submit} bind:this={form} novalidate>
	<fieldset
		class="flex flex-col gap-1"
		onfocusout={() => touch('sex')}
		aria-describedby={shown('sex') ? `${uid}-sex-error` : undefined}
	>
		<legend class="text-sm font-medium text-text">Sex</legend>
		{#each SEX_OPTIONS as option (option.value)}
			<label class="flex min-h-11 items-center gap-3 text-base text-text">
				<input
					type="radio"
					name="{uid}-sex"
					value={option.value}
					bind:group={sex}
					class="size-5 accent-brand"
				/>
				{option.label}
			</label>
		{/each}
		{#if shown('sex')}
			<p id="{uid}-sex-error" role="alert" class="text-sm text-danger">{shown('sex')}</p>
		{/if}
	</fieldset>

	<Input
		label="Birth date"
		type="date"
		bind:value={birthDate}
		autocomplete="bday"
		error={shown('birthDate')}
		onblur={() => touch('birthDate')}
	/>

	<div onfocusout={() => touch('heightCm')}>
		<NumberInput label="Height" unit="cm" bind:value={heightCm} error={shown('heightCm')} />
	</div>

	{#if withWeight}
		<div onfocusout={() => touch('kg')}>
			<NumberInput
				label="Weight"
				unit="kg"
				bind:value={kg}
				step={WEIGHT_STEP_KG}
				error={shown('kg')}
			/>
		</div>
	{/if}

	<fieldset
		class="flex flex-col gap-1"
		onfocusout={() => touch('activityLevel')}
		aria-describedby={shown('activityLevel') ? `${uid}-activity-error` : undefined}
	>
		<legend class="text-sm font-medium text-text">Activity level</legend>
		<p id="{uid}-activity-hint" class="text-sm text-text-muted">
			If you are unsure, choose the level below the one that feels right.
		</p>
		{#each ACTIVITY_OPTIONS as option (option.value)}
			<div class="flex flex-col">
				<label class="flex min-h-11 items-center gap-3 text-base text-text">
					<input
						type="radio"
						name="{uid}-activity"
						value={option.value}
						bind:group={activityLevel}
						aria-describedby="{uid}-activity-hint {uid}-{option.value}-hint"
						class="size-5 accent-brand"
					/>
					{option.label}
				</label>
				<p id="{uid}-{option.value}-hint" class="ps-8 text-sm text-text-muted">{option.hint}</p>
			</div>
		{/each}
		{#if shown('activityLevel')}
			<p id="{uid}-activity-error" role="alert" class="text-sm text-danger">
				{shown('activityLevel')}
			</p>
		{/if}
	</fieldset>

	{@render extra?.()}

	{#if failure}
		<p role="alert" class="text-sm text-danger">Could not save. Try again.</p>
	{/if}
	<Button type="submit" loading={busy}>{failure ? 'Retry' : submitLabel}</Button>
</form>

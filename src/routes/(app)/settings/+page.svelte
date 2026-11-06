<script lang="ts">
	import { untrack } from 'svelte';
	import * as v from 'valibot';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import LogOut from '@lucide/svelte/icons/log-out';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button, Card, Input, ListItem } from '#lib/components/ui/index.ts';
	import { signOutOrWarn } from '#lib/auth-client.ts';
	import { macroTargets } from '#lib/domain/targets.ts';
	import { ManualTargetInput } from '#lib/schemas/settings.ts';
	import { toasts } from '#lib/stores/toasts.svelte.ts';
	import { saveTarget } from './target.remote.ts';

	let { data } = $props();

	let signingOut = $state(false);

	// Daily target (temporary): the fields start from what is saved and are then the person's to edit.
	const saved = untrack(() => data.target);
	let kcalText = $state(saved.kcal === null ? '' : String(saved.kcal));
	let weightText = $state(saved.weightKg === null ? '' : String(saved.weightKg));
	let touched = $state({ kcal: false, weightKg: false });
	let submitted = $state(false);
	let saving = $state(false);
	let failed = $state(false);

	const parsed = $derived(v.safeParse(ManualTargetInput, { kcal: kcalText, weightKg: weightText }));
	const fieldErrors = $derived.by(() => {
		const found: { kcal?: string; weightKg?: string; form?: string } = {};
		for (const issue of parsed.issues ?? []) {
			const key = issue.path?.[0]?.key;
			if (key === 'kcal' || key === 'weightKg') found[key] ??= issue.message;
			else found.form ??= issue.message;
		}
		return found;
	});
	// The macros that go with what is typed, live. Nothing while either field is empty or invalid.
	const macros = $derived(
		parsed.success && parsed.output.kcal !== null
			? macroTargets(parsed.output.kcal, parsed.output.weightKg)
			: null
	);
	const hasTarget = $derived(data.target.kcal !== null);
	const showError = (field: 'kcal' | 'weightKg') =>
		touched[field] || submitted ? fieldErrors[field] : undefined;
	// Only when the other field is what is missing, so the message does not repeat under both.
	const formError = $derived(
		(submitted || touched.kcal || touched.weightKg) && !fieldErrors.kcal && !fieldErrors.weightKg
			? fieldErrors.form
			: undefined
	);

	async function persist(value: { kcal: number | null; weightKg: number | null }, done: string) {
		saving = true;
		failed = false;
		try {
			await saveTarget(value);
		} catch {
			failed = true;
			return;
		} finally {
			saving = false;
		}
		toasts.show({ message: done, tone: 'success' });
		// Saved: a failed refresh only means Today catches up on its next load.
		try {
			await invalidateAll();
		} catch {
			// ignored on purpose
		}
	}

	async function submitTarget(event: SubmitEvent) {
		event.preventDefault();
		submitted = true;
		if (!parsed.success || saving) return;
		const { kcal, weightKg } = parsed.output;
		await persist({ kcal, weightKg }, kcal === null ? 'Target cleared' : 'Target saved');
	}

	async function clearTarget() {
		kcalText = '';
		weightText = '';
		touched = { kcal: false, weightKg: false };
		submitted = false;
		await persist({ kcal: null, weightKg: null }, 'Target cleared');
	}

	async function handleSignOut() {
		signingOut = true;
		if (!(await signOutOrWarn())) signingOut = false;
	}
</script>

<svelte:head>
	<title>Settings · kcal</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<h1 class="text-3xl font-semibold tracking-tight text-text">Settings</h1>
	<section class="flex flex-col gap-3" aria-labelledby="target-heading">
		<div class="flex flex-col gap-1">
			<h2 id="target-heading" class="text-lg font-semibold text-text">Daily target (temporary)</h2>
			<p class="text-sm text-text-muted">
				Set your calories and body weight to see what is left each day, with protein, fat and carbs
				worked out from them. This goes away once weight tracking arrives and sets your target for
				you.
			</p>
		</div>
		<Card>
			<form class="flex flex-col gap-4" onsubmit={submitTarget} novalidate>
				<div class="grid grid-cols-2 gap-3">
					<Input
						label="Calories per day"
						bind:value={kcalText}
						inputmode="decimal"
						autocomplete="off"
						suffix="kcal"
						error={showError('kcal')}
						onblur={() => (touched.kcal = true)}
					/>
					<Input
						label="Body weight"
						bind:value={weightText}
						inputmode="decimal"
						autocomplete="off"
						suffix="kg"
						error={showError('weightKg')}
						onblur={() => (touched.weightKg = true)}
					/>
				</div>
				{#if formError}
					<p role="alert" class="text-sm text-danger">{formError}</p>
				{/if}
				{#if macros}
					<dl class="grid grid-cols-3 gap-3 text-sm" aria-label="Macros for this target">
						<div class="flex flex-col">
							<dt class="flex items-center gap-1.5 text-text-muted">
								<span class="size-2 rounded-full bg-protein" aria-hidden="true"></span>Protein
							</dt>
							<dd class="text-base text-text tabular-nums">{macros.proteinG} g</dd>
						</div>
						<div class="flex flex-col">
							<dt class="flex items-center gap-1.5 text-text-muted">
								<span class="size-2 rounded-full bg-carbs" aria-hidden="true"></span>Carbs
							</dt>
							<dd class="text-base text-text tabular-nums">{macros.carbsG} g</dd>
						</div>
						<div class="flex flex-col">
							<dt class="flex items-center gap-1.5 text-text-muted">
								<span class="size-2 rounded-full bg-fat" aria-hidden="true"></span>Fat
							</dt>
							<dd class="text-base text-text tabular-nums">{macros.fatG} g</dd>
						</div>
					</dl>
					{#if macros.carbsFloored}
						<p class="text-sm text-text-muted">
							Protein and fat already use the whole target, so carbs have no room left.
						</p>
					{/if}
				{/if}
				{#if failed}
					<p role="alert" class="text-sm text-danger">Could not save. Try again.</p>
				{/if}
				<div class="flex gap-2">
					{#if hasTarget}
						<Button variant="secondary" disabled={saving} onclick={clearTarget}>Clear</Button>
					{/if}
					<Button type="submit" loading={saving}>Save target</Button>
				</div>
			</form>
		</Card>
	</section>
	<div class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
		<ListItem
			title="Security"
			subtitle="Passkeys and sign out"
			href={resolve('/(app)/settings/security')}
		>
			{#snippet trailing()}
				<ChevronRight size={20} aria-hidden="true" />
			{/snippet}
		</ListItem>
		<ListItem
			title="Design system"
			subtitle="Tokens and components"
			href={resolve('/(app)/design')}
		>
			{#snippet trailing()}
				<ChevronRight size={20} aria-hidden="true" />
			{/snippet}
		</ListItem>
	</div>
	<section class="flex flex-col gap-2" aria-labelledby="sources-heading">
		<h2 id="sources-heading" class="text-lg font-semibold text-text">Data sources</h2>
		<p class="text-sm text-text-muted">
			Generic foods: Swiss Food Composition Database (BLV), version 7.1, Federal Food Safety and
			Veterinary Office FSVO,
			<a class="underline" href="https://naehrwertdaten.ch" rel="noreferrer" target="_blank"
				>naehrwertdaten.ch</a
			>.
		</p>
		<p class="text-sm text-text-muted">
			Products: Open Food Facts, available under the
			<a
				class="underline"
				href="https://opendatacommons.org/licenses/odbl/1-0/"
				rel="noreferrer"
				target="_blank">Open Database Licence</a
			>, with contributors credited at
			<a class="underline" href="https://openfoodfacts.org" rel="noreferrer" target="_blank"
				>openfoodfacts.org</a
			>.
		</p>
	</section>
	<Button variant="secondary" icon={LogOut} loading={signingOut} onclick={handleSignOut}>
		Sign out
	</Button>
</div>

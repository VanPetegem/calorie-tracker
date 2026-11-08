<script lang="ts">
	import LogOut from '@lucide/svelte/icons/log-out';
	import { isHttpError } from '@sveltejs/kit';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button, SegmentedControl } from '#lib/components/ui/index.ts';
	import ProfileForm from '#lib/components/settings/ProfileForm.svelte';
	import TargetExplainer from '#lib/components/settings/TargetExplainer.svelte';
	import { signOutOrWarn } from '#lib/auth-client.ts';
	import { DEFAULT_GOAL_RATE, GOAL_RATES } from '#lib/domain/constants.ts';
	import type { WeeklyTarget } from '#lib/server/db/schema.ts';
	import { PROFILE_ALREADY_SET_UP, type ProfileInput } from '#lib/schemas/settings.ts';
	import type { PageProps } from './$types';
	import { completeOnboarding } from './onboarding.remote.ts';

	let { data }: PageProps = $props();

	let signingOut = $state(false);

	// The goal rate is part of onboarding, not the profile: Settings sets it in its own section.
	let goalRate = $state(String(DEFAULT_GOAL_RATE));
	const GOAL_OPTIONS = GOAL_RATES.map((rate) => ({ value: String(rate), label: `${rate} %` }));

	// Set once the profile is saved: the page then shows the result instead of the form.
	let target = $state<WeeklyTarget | null>(null);

	async function submit({ profile, kg }: { profile: ProfileInput; kg: number | null }) {
		// Onboarding always sends today's weight, which the form checks before it submits.
		if (kg === null) return;
		try {
			target = await completeOnboarding({ ...profile, kg, goalRatePct: Number(goalRate) });
		} catch (cause) {
			// Set up in another tab or session: there is nothing left to do here, so go to Today.
			if (isHttpError(cause, 400) && cause.body.message === PROFILE_ALREADY_SET_UP) {
				await goto(resolve('/(app)'));
				return;
			}
			throw cause;
		}
	}

	async function handleSignOut() {
		signingOut = true;
		if (!(await signOutOrWarn())) signingOut = false;
	}
</script>

<svelte:head>
	<title>Set up · kcal</title>
</svelte:head>

<main class="screen">
	<div class="flex flex-col gap-6">
		{#if target}
			<h1 class="text-3xl font-semibold tracking-tight text-text">Your first target</h1>
			<TargetExplainer {target} />
			<Button href={resolve('/(app)')}>Start</Button>
		{:else}
			<div class="flex flex-col gap-2">
				<h1 class="text-3xl font-semibold tracking-tight text-text">Set up your target</h1>
				<p class="text-base text-text-muted">
					A few details give your daily target. You can change them later in Settings.
				</p>
			</div>
			{#snippet goal()}
				<div class="flex flex-col gap-2">
					<p id="goal-hint" class="text-sm font-medium text-text">Goal rate</p>
					<SegmentedControl
						label="Goal rate"
						describedby="goal-hint"
						options={GOAL_OPTIONS}
						bind:value={goalRate}
					/>
					<p class="text-sm text-text-muted">
						The share of your weight to gain each week. {DEFAULT_GOAL_RATE} % is the default.
					</p>
				</div>
			{/snippet}
			<ProfileForm
				value={{ kg: data.kg }}
				withWeight
				today={data.today}
				submitLabel="Calculate my target"
				onsubmit={submit}
				extra={goal}
			/>
		{/if}
		<Button variant="secondary" icon={LogOut} loading={signingOut} onclick={handleSignOut}>
			Sign out
		</Button>
	</div>
</main>

<style>
	/* Like the login and setup screens: no tab bar, clear of the status bar and the home indicator. */
	.screen {
		min-height: 100dvh;
		/* Tailwind's 4 px spacing step: 12 = 48 px, 8 = 32 px, 4 = 16 px. */
		padding-top: calc(env(safe-area-inset-top) + var(--spacing) * 12);
		padding-bottom: calc(env(safe-area-inset-bottom) + var(--spacing) * 8);
		padding-inline: max(calc(var(--spacing) * 4), env(safe-area-inset-left))
			max(calc(var(--spacing) * 4), env(safe-area-inset-right));
		max-width: 28rem;
		margin-inline: auto;
	}
</style>

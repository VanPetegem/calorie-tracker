<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Soup from '@lucide/svelte/icons/soup';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		Button,
		Card,
		EmptyState,
		IconButton,
		ListItem,
		Sheet
	} from '#lib/components/ui/index.ts';
	import SignOutButton from '#lib/components/ui/SignOutButton.svelte';
	import ContainerForm from '#lib/components/recipes/ContainerForm.svelte';
	import GoalPicker from '#lib/components/settings/GoalPicker.svelte';
	import MacroRulesForm from '#lib/components/settings/MacroRulesForm.svelte';
	import ProfileForm from '#lib/components/settings/ProfileForm.svelte';
	import TargetsHistory from '#lib/components/settings/TargetsHistory.svelte';
	import type { ContainerInput } from '#lib/schemas/batch.ts';
	import type { MacroRulesInput, ProfileInput } from '#lib/schemas/settings.ts';
	import type { Container } from '#lib/server/db/schema.ts';
	import { toasts } from '#lib/stores/toasts.svelte.ts';
	import { deleteContainer, saveContainer } from '../recipes/batches.remote.ts';
	import { saveProfile } from './profile.remote.ts';
	import { saveGoal, saveMacroRules } from './targets.remote.ts';

	let { data } = $props();

	// Containers: one sheet each for editing and for the delete question. The container is kept after closing so the
	// content does not vanish during the exit transition.
	let editing = $state<Container | null>(null);
	let editOpen = $state(false);
	// Bumped on every Edit tap so the form remounts from the stored values, not what was typed before Cancel.
	let editOpenings = $state(0);
	let removing = $state<Container | null>(null);
	let removeOpen = $state(false);
	let deleting = $state(false);

	async function refresh() {
		// Saved: a failed refresh only means the list catches up on its next load.
		try {
			await invalidateAll();
		} catch {
			// ignored on purpose
		}
	}

	// Saving recalculates this week's target, so Today and this page show the new one after the refresh.
	async function saveProfileSection({ profile }: { profile: ProfileInput }) {
		await saveProfile(profile);
		toasts.show({ message: 'Profile saved', tone: 'success' });
		await refresh();
	}

	async function saveEdit(input: ContainerInput) {
		await saveContainer(input);
		editOpen = false;
		toasts.show({ message: 'Container saved', tone: 'success' });
		await refresh();
	}

	async function removeContainer() {
		const container = removing;
		if (!container || deleting) return;
		deleting = true;
		try {
			await deleteContainer({ id: container.id });
		} catch {
			toasts.show({ message: 'Could not delete. Try again.', tone: 'danger' });
			deleting = false;
			return;
		}
		removeOpen = false;
		toasts.show({ message: `Deleted ${container.name}`, tone: 'success' });
		await refresh();
		deleting = false;
	}

	async function saveGoalRate(goalRatePct: number) {
		await saveGoal({ goalRatePct });
		toasts.show({ message: 'Goal saved', tone: 'success' });
		await refresh();
	}

	async function saveRules(input: MacroRulesInput) {
		await saveMacroRules(input);
		toasts.show({ message: 'Macro rules saved', tone: 'success' });
		await refresh();
	}
</script>

<svelte:head>
	<title>Settings · kcal</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<h1 class="text-3xl font-semibold tracking-tight text-text">Settings</h1>
	<section class="flex flex-col gap-3" aria-labelledby="profile-heading">
		<div class="flex flex-col gap-1">
			<h2 id="profile-heading" class="text-lg font-semibold text-text">Profile</h2>
			<p class="text-sm text-text-muted">
				Your target is worked out from these. Saving recalculates this week's target.
			</p>
		</div>
		<Card>
			<ProfileForm
				value={data.profile}
				withWeight={false}
				today={data.today}
				submitLabel="Save profile"
				onsubmit={saveProfileSection}
			/>
		</Card>
	</section>
	<section class="flex flex-col gap-3" aria-labelledby="goal-heading">
		<div class="flex flex-col gap-1">
			<h2 id="goal-heading" class="text-lg font-semibold text-text">Goal</h2>
			<p class="text-sm text-text-muted">
				How fast you gain. This week's target changes with it at once.
			</p>
		</div>
		<Card>
			<GoalPicker value={data.goalRatePct} trendKg={data.trendKg} onsave={saveGoalRate} />
		</Card>
	</section>
	<section class="flex flex-col gap-3" aria-labelledby="rules-heading">
		<div class="flex flex-col gap-1">
			<h2 id="rules-heading" class="text-lg font-semibold text-text">Macro rules</h2>
			<p class="text-sm text-text-muted">
				Protein per kg of trend weight and fat as a share of kcal. Carbs take the rest.
			</p>
		</div>
		<Card>
			<MacroRulesForm value={data.macroRules} onsave={saveRules} />
		</Card>
	</section>
	<section class="flex flex-col gap-3" aria-labelledby="history-heading">
		<div class="flex flex-col gap-1">
			<h2 id="history-heading" class="text-lg font-semibold text-text">Targets history</h2>
			<p class="text-sm text-text-muted">
				One target per week, newest first. A week uses the adaptive estimate once it has enough
				logged days and weigh-ins, and the formula until then.
			</p>
		</div>
		<TargetsHistory rows={data.targets} currentWeekStart={data.currentWeekStart} />
	</section>
	<section class="flex flex-col gap-3" aria-labelledby="containers-heading">
		<div class="flex flex-col gap-1">
			<h2 id="containers-heading" class="text-lg font-semibold text-text">Containers</h2>
			<p class="text-sm text-text-muted">
				The pots and boxes you weigh batches in. Add one when you enter a cooked weight. Batches
				keep their weight when a container is deleted.
			</p>
		</div>
		{#if data.containers.length === 0}
			<Card>
				<EmptyState
					icon={Soup}
					title="No containers yet"
					body="Add one from the cooked weight of a batch."
				/>
			</Card>
		{:else}
			<ul class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
				{#each data.containers as container (container.id)}
					<li>
						<ListItem title={container.name} subtitle="{container.tareG} g empty">
							{#snippet trailing()}
								<IconButton
									label="Edit {container.name}"
									icon={Pencil}
									onclick={() => {
										editing = container;
										editOpenings++;
										editOpen = true;
									}}
								/>
								<IconButton
									label="Delete {container.name}"
									icon={Trash2}
									onclick={() => {
										removing = container;
										removeOpen = true;
									}}
								/>
							{/snippet}
						</ListItem>
					</li>
				{/each}
			</ul>
		{/if}
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
	<SignOutButton />
</div>

<Sheet bind:open={editOpen} title="Edit container" description={editing?.name}>
	{#if editing}
		{#key `${editing.id}:${editOpenings}`}
			<ContainerForm
				container={editing}
				onsave={saveEdit}
				oncancel={() => (editOpen = false)}
				submitLabel="Save"
			/>
		{/key}
	{/if}
</Sheet>

<Sheet bind:open={removeOpen} title="Delete this container?" description={removing?.name}>
	<p class="text-base text-text-muted">Batches weighed in it keep their net weight.</p>
	{#snippet footer()}
		<Button variant="secondary" onclick={() => (removeOpen = false)}>Keep it</Button>
		<Button variant="destructive" loading={deleting} onclick={removeContainer}>Delete</Button>
	{/snippet}
</Sheet>

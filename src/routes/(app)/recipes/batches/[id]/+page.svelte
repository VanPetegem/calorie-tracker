<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import { resolve } from '$app/paths';
	import { batchDraft } from '#lib/components/recipes/draft.ts';
	import BatchForm from '#lib/components/recipes/BatchForm.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const draft = $derived(batchDraft(data.batch));
	// Another batch mounts a fresh form, and so does a save that gave new lines their ids: the form then starts from
	// the stored lines. Finish, Reopen and a save without new lines keep what is typed.
	const formKey = $derived(
		`${data.batch.id}:${data.batch.ingredients.map((line) => line.id).join()}`
	);
</script>

<svelte:head>
	<title>{data.batch.name} · kcal</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex flex-col gap-1">
		<a
			href={resolve('/(app)/recipes')}
			class="-ml-2 inline-flex min-h-11 items-center gap-1 self-start rounded-md pr-2 text-base text-text-muted transition-colors duration-100 ease-out hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
		>
			<ChevronLeft size={20} aria-hidden="true" />
			Recipes
		</a>
		<h1 class="text-3xl font-semibold tracking-tight text-text">{data.batch.name}</h1>
	</div>
	{#key formKey}
		<BatchForm {draft} batch={data.batch} containers={data.containers} />
	{/key}
</div>

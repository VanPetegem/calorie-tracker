/**
 * Turns the Swiss food composition database (BLV) generic foods sheets into D1 migrations.
 *
 * Download the English, German and French xlsx files from https://naehrwertdaten.ch/en/downloads/ into
 * `data/blv/` (gitignored) and run `pnpm blv:import [--dir data/blv] [--out-dir drizzle]`.
 *
 * `wrangler d1 migrations apply --remote` sends a migration file as one request, which D1 limits to about 100 KB,
 * so the foods are split over several migrations of at most `--chunk-bytes` (default 60 000) of SQL each. Drizzle
 * needs a journal entry and snapshot per migration, so the script fills existing empty custom migrations named
 * `NNNN_blv_foods_01`, `NNNN_blv_foods_02`, and so on, and stops with the exact commands when their number is
 * wrong:
 * `pnpm drizzle-kit generate --custom --name blv_foods_NN`.
 *
 * Run with `node --experimental-strip-types`.
 */
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import ExcelJS from 'exceljs';
import { uuidv7 } from 'uuidv7';
import { BLV_COLUMNS, chunkStatements, mapBlvRow, type BlvFood } from './blv-map.ts';

const { values: args } = parseArgs({
	options: {
		dir: { type: 'string', default: 'data/blv' },
		'out-dir': { type: 'string', default: 'drizzle' },
		'chunk-bytes': { type: 'string', default: '60000' }
	}
});

type Cell = ExcelJS.CellValue | { result?: ExcelJS.CellValue };

const HEADER_ROW = 3;
const FIRST_DATA_ROW = 4;
/** Column positions are identical in the English, German and French files; the headers differ. */
const POSITION = { id: 1, name: 4, synonyms: 5 };
/** English headers of the nutrient columns, checked so a changed file layout fails loudly. */
const ENGLISH_HEADERS = {
	kcal: 'Energy, kilocalories (kcal)',
	fat: 'Fat, total (g)',
	carbs: 'Carbohydrates, available (g)',
	fiber: 'Dietary fibres (g)',
	protein: 'Protein (g)'
} as const;

function plain(cell: Cell): unknown {
	if (cell && typeof cell === 'object' && 'result' in cell) return cell.result;
	return cell;
}

async function readSheet(file: string) {
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.readFile(file);
	const sheet = workbook.worksheets[0];
	if (!sheet) throw new Error(`${file} has no sheet`);
	return sheet;
}

/** Finds the xlsx of a language by the title in its first cell, e.g. `... Generic foods V 7.1 (01.07.2026)`. */
async function findSheets(dir: string) {
	const found: Partial<Record<'en' | 'de' | 'fr', ExcelJS.Worksheet>> = {};
	const titles: Record<string, 'en' | 'de' | 'fr'> = {
		'Swiss food composition database': 'en',
		Schweizer: 'de',
		'Base de données suisse': 'fr'
	};
	for (const file of readdirSync(dir).filter((name) => name.endsWith('.xlsx'))) {
		const sheet = await readSheet(join(dir, file));
		const title = String(plain(sheet.getCell(1, 1).value) ?? '');
		const language = Object.entries(titles).find(([prefix]) => title.startsWith(prefix))?.[1];
		if (language && /generic|générique|generische/i.test(title)) found[language] = sheet;
	}
	if (!found.en || !found.de || !found.fr) {
		throw new Error(`Need the English, German and French generic foods xlsx in ${dir}`);
	}
	return { en: found.en, de: found.de, fr: found.fr };
}

function versionOf(sheet: ExcelJS.Worksheet): string {
	const title = String(plain(sheet.getCell(1, 1).value) ?? '');
	const match = /V\s*(\d+(?:\.\d+)*)\s*\((\d{2}\.\d{2}\.\d{4})\)/.exec(title);
	if (!match) throw new Error(`No version in title: ${title}`);
	return `${match[1]} (${match[2]})`;
}

function englishColumns(sheet: ExcelJS.Worksheet): Record<keyof typeof ENGLISH_HEADERS, number> {
	const header = sheet.getRow(HEADER_ROW);
	const columns = {} as Record<keyof typeof ENGLISH_HEADERS, number>;
	for (const [key, label] of Object.entries(ENGLISH_HEADERS)) {
		let position = 0;
		header.eachCell((cell, index) => {
			if (!position && plain(cell.value) === label) position = index;
		});
		if (!position) throw new Error(`Column "${label}" not found; has the BLV file layout changed?`);
		columns[key as keyof typeof ENGLISH_HEADERS] = position;
	}
	if (plain(header.getCell(POSITION.name).value) !== 'Name') throw new Error('Name column moved');
	return columns;
}

function sqlText(value: string | null): string {
	return value === null ? 'NULL' : `'${value.replaceAll("'", "''")}'`;
}

function sqlNumber(value: number | null | undefined): string {
	return value == null ? 'NULL' : String(value);
}

function insertStatement(food: BlvFood, importedAt: string): string {
	const columns = [
		'id',
		'source',
		'name',
		'nutrition_basis',
		'kcal',
		'protein',
		'carbs',
		'fat',
		'fiber',
		'source_ref',
		'search_text',
		'created_at',
		'updated_at'
	];
	const values = [
		sqlText(uuidv7()),
		sqlText('blv'),
		sqlText(food.name),
		sqlText('g'),
		sqlNumber(food.kcal),
		sqlNumber(food.protein),
		sqlNumber(food.carbs),
		sqlNumber(food.fat),
		sqlNumber(food.fiber),
		sqlText(food.sourceRef ?? null),
		sqlText(food.searchText),
		sqlText(importedAt),
		sqlText(importedAt)
	];
	const updated = ['name', 'kcal', 'protein', 'carbs', 'fat', 'fiber', 'search_text', 'updated_at']
		.map((column) => `${column} = excluded.${column}`)
		.join(', ');
	return (
		`INSERT INTO foods (${columns.join(', ')}) VALUES (${values.join(', ')}) ` +
		`ON CONFLICT(source, source_ref) DO UPDATE SET ${updated} WHERE foods.edited_at IS NULL;`
	);
}

const sheets = await findSheets(args.dir);
const version = versionOf(sheets.en);
const nutrient = englishColumns(sheets.en);

function namesByIdOf(sheet: ExcelJS.Worksheet) {
	const names = new Map<string, { name: unknown; synonyms: unknown }>();
	sheet.eachRow((row, index) => {
		if (index < FIRST_DATA_ROW) return;
		const id = plain(row.getCell(POSITION.id).value);
		if (typeof id !== 'number') return;
		names.set(String(id), {
			name: plain(row.getCell(POSITION.name).value),
			synonyms: plain(row.getCell(POSITION.synonyms).value)
		});
	});
	return names;
}

const german = namesByIdOf(sheets.de);
const french = namesByIdOf(sheets.fr);

const importedAt = new Date().toISOString();
const statements: string[] = [];
let skipped = 0;
let rows = 0;
sheets.en.eachRow((row, index) => {
	if (index < FIRST_DATA_ROW) return;
	const id = plain(row.getCell(POSITION.id).value);
	if (typeof id !== 'number') return;
	rows += 1;
	const de = german.get(String(id));
	const fr = french.get(String(id));
	const food = mapBlvRow(
		{
			[BLV_COLUMNS.id]: id,
			[BLV_COLUMNS.name]: plain(row.getCell(POSITION.name).value),
			[BLV_COLUMNS.synonyms]: plain(row.getCell(POSITION.synonyms).value),
			[BLV_COLUMNS.nameDe]: de?.name,
			[BLV_COLUMNS.synonymsDe]: de?.synonyms,
			[BLV_COLUMNS.nameFr]: fr?.name,
			[BLV_COLUMNS.synonymsFr]: fr?.synonyms,
			[BLV_COLUMNS.kcal]: plain(row.getCell(nutrient.kcal).value),
			[BLV_COLUMNS.protein]: plain(row.getCell(nutrient.protein).value),
			[BLV_COLUMNS.carbs]: plain(row.getCell(nutrient.carbs).value),
			[BLV_COLUMNS.fat]: plain(row.getCell(nutrient.fat).value),
			[BLV_COLUMNS.fiber]: plain(row.getCell(nutrient.fiber).value)
		},
		BLV_COLUMNS
	);
	if (food) statements.push(insertStatement(food, importedAt));
	else skipped += 1;
});

const chunks = chunkStatements(statements, Number(args['chunk-bytes']));
const chunkFiles = readdirSync(args['out-dir'])
	.filter((name) => /^\d{4}_blv_foods_\d{2}\.sql$/.test(name))
	.sort();
if (chunkFiles.length !== chunks.length) {
	const commands = Array.from(
		{ length: chunks.length },
		(_, i) =>
			`pnpm drizzle-kit generate --custom --name blv_foods_${String(i + 1).padStart(2, '0')}`
	);
	throw new Error(
		`${chunks.length} chunks of foods need ${chunks.length} blv_foods_NN migrations, found ${chunkFiles.length}. ` +
			`Remove the old blv_foods_* migrations (and their snapshots and journal entries), then run:\n${commands.join('\n')}`
	);
}

const header = [
	'-- BLV generic foods, imported by scripts/import-blv.ts. Do not edit by hand.',
	`-- Source: Swiss Food Composition Database, Generic foods, version ${version},`,
	'-- Federal Food Safety and Veterinary Office FSVO, https://naehrwertdaten.ch/en/downloads/',
	'-- Licence: free use, including commercial, subject to acknowledgment of the source.',
	`-- Imported at ${importedAt}: ${statements.length} foods (${skipped} of ${rows} skipped for missing or out of range kcal, protein, carbs or fat).`,
	'-- Rows the user edited (foods.edited_at set) are left alone on conflict.'
];
chunks.forEach((chunk, index) => {
	const file = join(args['out-dir'], chunkFiles[index]);
	// Drizzle's statement breakpoints: the test database helper and drizzle's migrator run one statement at a time.
	writeFileSync(
		file,
		`${[...header, `-- Part ${index + 1} of ${chunks.length}: ${chunk.length} foods.`].join('\n')}\n${chunk.join('\n--> statement-breakpoint\n')}\n`
	);
	console.log(`${file}: ${chunk.length} foods`);
});
console.log(
	`${statements.length} foods in ${chunks.length} migrations, ${skipped} of ${rows} skipped, version ${version}`
);

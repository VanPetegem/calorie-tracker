-- Batches for the log e2e tests, inserted by scripts/e2e-db-reset.sh before the server starts (Task 9 has no batch
-- page yet, and a second connection to the live database file would make D1 fail with SQLITE_BUSY).
-- One batch per test, per browser project and per attempt (retry 0 and 1), named "E2E <test> <project> <retry>", so
-- a test only ever touches its own batch: it passes alone, in any order and on a retry.
-- 'portions' and 'grams' are weighed: 4 portions, 2000 kcal, 1600 g cooked, so a portion is 500 kcal and 400 g.
-- 'one off' and 'search' have no cooked weight: 2 portions, 800 kcal, portions only.
WITH project(name) AS (VALUES ('chromium-desktop'), ('webkit-iphone')),
	attempt(n) AS (VALUES (0), (1)),
	kind(name, portions, cooked_weight_g, kcal, protein, carbs, fat, fiber) AS (VALUES
		('portions', 4, 1600, 2000, 120, 200, 80, 16),
		('grams', 4, 1600, 2000, 120, 200, 80, 16),
		('one off', 2, NULL, 800, 40, 90, 30, NULL),
		('search', 2, NULL, 800, 40, 90, 30, NULL)),
	combo AS (
		SELECT 'E2E ' || kind.name || ' ' || project.name || ' ' || attempt.n AS name, kind.*
		FROM kind, project, attempt
	)
INSERT INTO batches (id, name, cooked_on, portions, cooked_weight_g, kcal, protein, carbs, fat, fiber)
SELECT printf('0198e2e0-0000-7000-8000-%012d', row_number() OVER (ORDER BY name)), name, date('now'), portions,
	cooked_weight_g, kcal, protein, carbs, fat, fiber
FROM combo;

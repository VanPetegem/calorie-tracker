-- Batches for the log e2e tests, inserted by scripts/e2e-db-reset.sh before the server starts (Task 9 has no batch
-- page yet, and a second connection to the live database file would make D1 fail with SQLITE_BUSY).
-- 4 portions, 2000 kcal, 1600 g cooked: a portion is 500 kcal and 400 g. One stew per browser project, so the two
-- projects never change each other's portions left.
INSERT INTO batches (id, name, cooked_on, portions, cooked_weight_g, kcal, protein, carbs, fat, fiber) VALUES
	('0198e2e0-0000-7000-8000-000000000001', 'E2E stew chromium-desktop', date('now'), 4, 1600, 2000, 120, 200, 80, 16),
	('0198e2e0-0000-7000-8000-000000000002', 'E2E stew webkit-iphone', date('now'), 4, 1600, 2000, 120, 200, 80, 16),
	-- No cooked weight: portions only.
	('0198e2e0-0000-7000-8000-000000000003', 'E2E one off', date('now'), 2, NULL, 800, 40, 90, 30, NULL);

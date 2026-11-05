-- Custom SQL migration file, put your code below! --
-- kcal has exactly one account. Better Auth's user create hook closes sign up with a 403 first; this trigger
-- is the database level backstop (for example two first run sign ups racing past the hook).
CREATE TRIGGER `user_single_account` BEFORE INSERT ON `user` WHEN (SELECT count(*) FROM `user`) > 0 BEGIN SELECT RAISE(ABORT, 'sign up is closed'); END;

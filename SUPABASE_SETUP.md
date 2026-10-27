# Supabase leaderboard setup

1. Create a Supabase project and enable **Anonymous Sign-Ins** under Authentication → Providers.
2. Run [`supabase/leaderboard.sql`](supabase/leaderboard.sql) in the SQL Editor, then
   [`supabase/2026-10-19_operator_password.sql`](supabase/2026-10-19_operator_password.sql)
   (operator name + password), then
   [`supabase/2026-10-27_endless_games.sql`](supabase/2026-10-27_endless_games.sql)
   (one Endless leaderboard per game; it copies the old Timing Bar list over once).
   All three are safe to re-run. **Run the new file before publishing the site that uses it.**
3. In Supabase's **Connect** dialog, copy the Project URL and the **publishable** key. Do not use a secret or service-role key in a browser.
4. Put those values in [`js/supabase-config.js`](js/supabase-config.js), using the exact `.env`-style format below. The game reads this file as text; it is not executed as JavaScript.

   ```text
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```
5. Ensure `http://localhost` and the production game URL are listed in Authentication → URL Configuration when testing or deploying.

The SQL policies let authenticated anonymous players read public names/scores, while profile creation and score writes go only through the supplied RPC functions. The client-side game remains the authority for gameplay, so this is basic validation rather than full anti-cheat protection.

Operator names are unique (case-insensitive), 3–16 characters, and may use ASCII letters, numbers, spaces, `_`, and `-`.

## Operator name + password (any browser)
Each browser is still an anonymous Supabase user. An operator is a unique name plus a password (8–72 characters):

- **Create** on one browser: `create_operator(name, password)`.
- **Sign in** on any other browser: `sign_in_operator(name, password)` links that browser to the same operator, so the best score and rank carry over. A wrong name or password returns no row; 5 wrong passwords lock that name for 15 minutes.
- Passwords are stored only as bcrypt hashes (`pgcrypto`) in `operator_secrets`, which no client role can read.
- Operators created before this migration have no password and cannot be claimed from another browser. The game asks them once per session to set one (`set_operator_password`).

**Release order:** run the migration SQL first, then publish the site. The new client falls back to the old profile lookup if the migration is missing, and the old client keeps working after the migration.

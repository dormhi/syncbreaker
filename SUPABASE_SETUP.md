# Supabase leaderboard setup

1. Create a Supabase project and enable **Anonymous Sign-Ins** under Authentication → Providers.
2. Run [`supabase/leaderboard.sql`](supabase/leaderboard.sql) in the SQL Editor.
3. In Supabase's **Connect** dialog, copy the Project URL and the **publishable** key. Do not use a secret or service-role key in a browser.
4. Put those values in [`js/supabase-config.js`](js/supabase-config.js), using the exact `.env`-style format below. The game reads this file as text; it is not executed as JavaScript.

   ```text
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```
5. Ensure `http://localhost` and the production game URL are listed in Authentication → URL Configuration when testing or deploying.

The SQL policies let authenticated anonymous players read public names/scores, while profile creation and score writes go only through the supplied RPC functions. The client-side game remains the authority for gameplay, so this is basic validation rather than full anti-cheat protection.

Operator names are unique, 3–16 characters, and may use ASCII letters, numbers, spaces, `_`, and `-`.

# Study Quiz

A two-part quiz site hosted on GitHub Pages:

| Page | URL (after Pages is on) | Who |
|---|---|---|
| Quiz | `https://ianyyu.github.io/studytest/` | Test takers |
| Results | `https://ianyyu.github.io/studytest/admin.html` | You (login required) |

- 8 pages × 4 multiple-choice questions, with instructions first and a progress bar at the top.
- Each test taker is automatically given a number (#1, #2, …). The site records when they started and finished, each answer, and how long each one took.
- Answers are saved page by page, so you can see people who quit partway. A reload resumes where they left off.
- The admin page shows overall accuracy, accuracy for each question, and each test taker's answers, and can download everything as a CSV.

Until `assets/config.js` is filled in, the site runs in **demo mode**: data stays in your own browser and any password works. Use it to try the site out.

## One-time setup (≈10 minutes)

### 1. Create the database (Supabase, free)
1. Sign up at https://supabase.com and click **New project**.
2. Open **SQL Editor** → New query, paste all of `supabase/schema.sql`, and click **Run**.
3. Do the same with `private/answer_key.sql`. This loads the correct answers.
   The `private/` folder is git-ignored, so **the answer key is never published**. Test takers can't find it in the page source.

### 2. Create the admin password
The admin page asks only for a password. Behind the scenes it signs in to one fixed account (`ADMIN_EMAIL` in `assets/config.js`, by default `admin@studytest.app`), so Supabase checks the password and it never appears in this public repo.

1. **Authentication → Users → Add user → Create new user**: email `admin@studytest.app`, then the admin password you want. Tick *Auto Confirm User*.
2. **Authentication → Sign In / Providers → Email**: turn **off** *Allow new users to sign up*.
3. In **SQL Editor**, run:
   ```sql
   insert into public.admins (email) values ('admin@studytest.app');
   ```
To change the password later: **Authentication → Users**, open the admin user, then *Reset password*, or delete the user and create it again with the same email.

### 3. Connect the site
**Project Settings → API**: copy the *Project URL* and the *anon public* key into `assets/config.js`.
The anon key is designed to be public. With the database rules, visitors can only start a quiz and save their own answers. They can't read anyone's results.

### 4. Publish on GitHub Pages
Push this folder to `main`, then go to the repo's **Settings → Pages → Build and deployment**, choose *Deploy from a branch*, then `main` / `(root)`, and click **Save**. The links above go live in about a minute.

## Everyday tasks

- **Change a question:** edit `assets/questions.js`. If you change a correct answer, edit `private/answer_key.sql` and run it again in the SQL editor.
- **Remove a test run:** open it in the admin page and click *Delete this record*.
- **Wipe all results and restart numbering at #1:**
  ```sql
  truncate public.participants restart identity cascade;
  ```
- **Same computer, several test takers:** on the "All done" screen, click *Start over for a new test taker on this device*.

## Preview locally
```bash
python3 -m http.server 8000
```
Then open http://localhost:8000 (quiz) and http://localhost:8000/admin.html (results).

## Files
```
index.html            quiz for test takers
admin.html            results dashboard
assets/questions.js   question text and options (no answers)
assets/config.js      Supabase URL + anon key
assets/api.js         saves to Supabase, or to localStorage in demo mode
assets/quiz.js        quiz logic
assets/admin.js       dashboard logic
supabase/schema.sql   tables, security rules, functions
private/              answer key (git-ignored, never pushed)
```

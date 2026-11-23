// Fill these in from Supabase → Project Settings → API.
// The anon key is meant to be public; the database rules in supabase/schema.sql
// only let visitors start a quiz and save their own answers.
// Leave both empty to run in DEMO mode (data stays in this browser only).
window.QUIZ_CONFIG = {
  SUPABASE_URL: "https://djavsqgfxvvglocvjqkd.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqYXZzcWdmeHZ2Z2xvY3ZqcWtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU0NjU1NjAsImV4cCI6MjExMTA0MTU2MH0.YW8E2va6eujJK_ghTq6hEePpgQmkHOaca-zohf5lGFU",
  // The single admin account. admin.html only asks for the password;
  // Supabase checks it, so the password itself is never stored in this repo.
  ADMIN_EMAIL: "admin@studytest.app",
};

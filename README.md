# Forex & Coding Bulls — V3 Connected

This is the V3 academy frontend connected to the Supabase project configured in `config.js`.

## Already completed in Supabase
- Courses, profiles, payments, enrollments, lessons and progress tables
- Row Level Security policies
- Your admin profile role

## One remaining SQL step
Open Supabase SQL Editor and run `supabase_additions.sql` once. This adds an Auth trigger that creates a student profile automatically after signup, including when email confirmation is enabled.

## Run the site
Use a local web server (for example VS Code Live Server) or deploy the folder to a static host. Do not open the HTML files with `file://`.

## Security
`config.js` contains only the Supabase project URL and publishable key. Never place a Supabase secret/service-role key in the frontend.

## Flow
Student signup/login → profile → dashboard → MTN transaction submission → admin verification → active enrollment → lessons → progress.

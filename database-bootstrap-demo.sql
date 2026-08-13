-- Optional one-time bootstrap for the final assignment demonstration.
-- Run this only if Org A/B and memberships have not already been created.
-- It does not create or alter Nhost auth users; it looks them up by email.

INSERT INTO organizations (name, quota_limit)
SELECT 'Org A', 100
WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE name = 'Org A');

INSERT INTO organizations (name, quota_limit)
SELECT 'Org B', 100
WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE name = 'Org B');

INSERT INTO org_members (org_id, user_id, role)
SELECT o.id, u.id, v.role::org_role
FROM (VALUES
  ('Org A','ownerA@example.com','owner'),
  ('Org A','editorA@example.com','editor'),
  ('Org A','viewerA@example.com','viewer'),
  ('Org B','ownerB@example.com','owner'),
  ('Org B','editorB@example.com','editor'),
  ('Org B','viewerB@example.com','viewer')
) AS v(org_name,email,role)
JOIN organizations o ON o.name=v.org_name
JOIN auth.users u ON u.email=v.email
ON CONFLICT (org_id,user_id) DO UPDATE SET role=EXCLUDED.role;

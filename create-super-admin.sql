-- SimpleSpa Super Admin Creation Script
-- Purpose: Create or update super admin user for retro_lounge@hotmail.com
-- Usage: psql $DATABASE_URL -f create-super-admin.sql

-- Step 1: Check if user exists
DO $$
DECLARE
    user_exists BOOLEAN;
    user_email TEXT := 'retro_lounge@hotmail.com';
BEGIN
    SELECT EXISTS(SELECT 1 FROM users WHERE LOWER(email) = LOWER(user_email))
    INTO user_exists;

    IF user_exists THEN
        RAISE NOTICE 'User % exists. Checking configuration...', user_email;

        -- Show current user configuration
        PERFORM email, role, status,
                CASE WHEN password IS NOT NULL THEN 'YES' ELSE 'NO' END as has_password
        FROM users
        WHERE LOWER(email) = LOWER(user_email);

    ELSE
        RAISE NOTICE 'User % does not exist.', user_email;
    END IF;
END $$;

-- Step 2: Create user if doesn't exist, or update if exists
-- IMPORTANT: Replace 'REPLACE_WITH_PASSWORD_HASH' with actual bcrypt hash
-- Generate hash with: node -e "require('bcryptjs').hash('YourPassword', 10, (e,h) => console.log(h));"

INSERT INTO users (
    id,
    email,
    password,
    role,
    status,
    "createdAt",
    "updatedAt"
)
VALUES (
    'retro-lounge-super-admin',
    'retro_lounge@hotmail.com',
    'REPLACE_WITH_PASSWORD_HASH', -- ⚠️ MUST REPLACE THIS
    'super_admin',
    'approved',
    NOW(),
    NOW()
)
ON CONFLICT (email)
DO UPDATE SET
    role = 'super_admin',
    status = 'approved',
    password = EXCLUDED.password, -- Update password if provided
    "updatedAt" = NOW()
RETURNING id, email, role, status;

-- Step 3: Verify the user was created/updated correctly
SELECT
    id,
    email,
    role,
    status,
    CASE
        WHEN password IS NOT NULL THEN '✓ Password set'
        ELSE '✗ No password'
    END as password_status,
    "adminSpaId",
    "createdAt",
    "updatedAt"
FROM users
WHERE LOWER(email) = 'retro_lounge@hotmail.com';

-- Expected output:
-- id: retro-lounge-super-admin
-- email: retro_lounge@hotmail.com
-- role: super_admin
-- status: approved
-- password_status: ✓ Password set
-- adminSpaId: NULL (super admin doesn't need spa assignment)

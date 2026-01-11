-- Data Integrity Diagnostic Queries
-- Run these queries to verify the admin-spa linkage system is working correctly

-- 1. Check for admin users without spa linkage
-- Expected: Should return 0 rows (all admins should have adminSpaId)
SELECT 
  id, 
  email, 
  role, 
  status, 
  "adminSpaId"
FROM users
WHERE role = 'admin' 
  AND status = 'approved'
  AND ("adminSpaId" IS NULL OR "adminSpaId" = 0);

-- 2. Check for orphaned spas (spas without an owner user)
-- Expected: Should return 0 rows (all spas should have an owner)
SELECT 
  s.id,
  s.name,
  s."ownerUserId",
  s."setupComplete"
FROM spas s
LEFT JOIN users u ON s."ownerUserId" = u.id
WHERE u.id IS NULL;

-- 3. Check for services belonging to non-existent spas
-- Expected: Should return 0 rows (all services should belong to valid spas)
SELECT 
  srv.id,
  srv.name,
  srv."spaId"
FROM services srv
LEFT JOIN spas s ON srv."spaId" = s.id
WHERE s.id IS NULL;

-- 4. Check for staff belonging to non-existent spas
-- Expected: Should return 0 rows (all staff should belong to valid spas)
SELECT 
  st.id,
  st.name,
  st."spaId"
FROM staff st
LEFT JOIN spas s ON st."spaId" = s.id
WHERE s.id IS NULL;

-- 5. Check admin-spa linkage consistency
-- Expected: For each approved admin, adminSpaId should match the spa's ownerUserId
SELECT 
  u.id as user_id,
  u.email,
  u."adminSpaId",
  s.id as spa_id,
  s.name as spa_name,
  s."ownerUserId"
FROM users u
LEFT JOIN spas s ON u."adminSpaId" = s.id
WHERE u.role = 'admin' 
  AND u.status = 'approved'
  AND (
    u."adminSpaId" IS NULL 
    OR s.id IS NULL 
    OR s."ownerUserId" != u.id
  );

-- 6. Check for incomplete setup wizards with existing resources
-- Expected: Spas marked as setupComplete=false shouldn't have staff/services
SELECT 
  s.id as spa_id,
  s.name as spa_name,
  s."setupComplete",
  COUNT(DISTINCT srv.id) as service_count,
  COUNT(DISTINCT st.id) as staff_count
FROM spas s
LEFT JOIN services srv ON srv."spaId" = s.id
LEFT JOIN staff st ON st."spaId" = s.id
WHERE s."setupComplete" = false
GROUP BY s.id, s.name, s."setupComplete"
HAVING COUNT(DISTINCT srv.id) > 0 OR COUNT(DISTINCT st.id) > 0;

-- 7. Check for pending admin applications that already have approved status
-- Expected: Should return 0 rows (approved admins shouldn't have pending applications)
SELECT 
  aa.id as application_id,
  aa."userId",
  aa.status as app_status,
  aa."businessName",
  u.status as user_status,
  u."adminSpaId"
FROM admin_applications aa
JOIN users u ON aa."userId" = u.id
WHERE aa.status = 'pending' AND u.status = 'approved';

-- 8. Summary: Count of admins by status and spa linkage
-- Expected: All approved admins should have a spa linked
SELECT 
  u.status,
  COUNT(*) as total_count,
  COUNT(u."adminSpaId") as with_spa_count,
  COUNT(*) - COUNT(u."adminSpaId") as without_spa_count
FROM users u
WHERE u.role = 'admin'
GROUP BY u.status;

-- 9. Summary: Spa setup completion status
SELECT 
  s."setupComplete",
  COUNT(*) as spa_count,
  AVG(
    CASE WHEN s."setupSteps"->>'basicInfo' = 'true' THEN 1 ELSE 0 END +
    CASE WHEN s."setupSteps"->>'location' = 'true' THEN 1 ELSE 0 END +
    CASE WHEN s."setupSteps"->>'hours' = 'true' THEN 1 ELSE 0 END +
    CASE WHEN s."setupSteps"->>'services' = 'true' THEN 1 ELSE 0 END +
    CASE WHEN s."setupSteps"->>'staff' = 'true' THEN 1 ELSE 0 END +
    CASE WHEN s."setupSteps"->>'policies' = 'true' THEN 1 ELSE 0 END +
    CASE WHEN s."setupSteps"->>'inventory' = 'true' THEN 1 ELSE 0 END +
    CASE WHEN s."setupSteps"->>'activation' = 'true' THEN 1 ELSE 0 END
  ) as avg_steps_completed
FROM spas s
GROUP BY s."setupComplete";

-- 10. Check for bookings belonging to non-existent spas
-- Expected: Should return 0 rows (all bookings should belong to valid spas)
SELECT 
  b.id,
  b."spaId",
  b."customerName"
FROM bookings b
LEFT JOIN spas s ON b."spaId" = s.id
WHERE s.id IS NULL;

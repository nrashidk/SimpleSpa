# Super Admin Setup Guide

## Issue Fixed

The super admin login was failing because the `/api/dev/make-super-admin` endpoint created users without passwords (designed for OAuth users only). However, super admins need to login via email/password authentication.

## Solution

Created a new endpoint `/api/dev/create-super-admin` that creates super admin users with email and password authentication support.

## How to Create a Super Admin

### Method 1: Using the Shell Script

```bash
./create-super-admin.sh [email] [password] [server_url]
```

**Examples:**

```bash
# Create super admin with default email (nrashidk@gmail.com)
./create-super-admin.sh

# Create super admin with custom email and password
./create-super-admin.sh admin@example.com MySecurePassword123

# Create super admin on production server
./create-super-admin.sh admin@example.com MySecurePassword123 https://your-domain.com
```

### Method 2: Using cURL

```bash
curl -X POST http://localhost:5000/api/dev/create-super-admin \
  -H "Content-Type: application/json" \
  -d '{"email":"nrashidk@gmail.com","password":"YourSecurePassword123"}'
```

### Method 3: Using JavaScript/fetch

```javascript
fetch('http://localhost:5000/api/dev/create-super-admin', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'nrashidk@gmail.com',
    password: 'YourSecurePassword123'
  })
})
.then(res => res.json())
.then(data => console.log(data));
```

## Endpoint Details

### `POST /api/dev/create-super-admin`

**Request Body:**
```json
{
  "email": "admin@example.com",
  "password": "YourSecurePassword123"
}
```

**Validation:**
- Email and password are required
- Password must be at least 8 characters long

**Behavior:**
- If user doesn't exist: Creates new super admin with email/password
- If user exists without password: Updates user to super_admin with password
- If user exists with password: Returns error (prevents accidental overwrites)

**Success Response:**
```json
{
  "success": true,
  "message": "Super admin created successfully! You can now login with email and password.",
  "user": {
    "id": "uuid",
    "email": "admin@example.com",
    "role": "super_admin"
  }
}
```

## Login as Super Admin

After creating the super admin, you can login at:

**URL:** `http://localhost:5000/admin/login` (or your production URL)

**Credentials:**
- Email: The email you provided
- Password: The password you provided

## Super Admin vs Business Admin

### Super Admin
- **Role:** `super_admin`
- **Status:** Always `approved`
- **Login:** Direct email/password authentication
- **Capabilities:**
  - View all admin applications
  - Approve/reject business registrations
  - View all businesses and their data
  - Full system access
  - No setup wizard required

### Business Admin
- **Role:** `admin`
- **Status:** Initially `pending`, becomes `approved` after super admin approval
- **Login:** Email/password authentication
- **Capabilities:**
  - Manage their assigned spa only
  - Access after completing setup wizard
  - Manage services, staff, bookings, customers

## Security Notes

1. This endpoint is prefixed with `/api/dev/` indicating it's for development use
2. In production, consider:
   - Removing this endpoint after initial super admin creation
   - Adding additional authentication/authorization
   - Rate limiting
   - Requiring environment variable confirmation
3. Always use strong passwords for super admin accounts
4. Store passwords securely and never commit them to version control

## Troubleshooting

### "Invalid credentials" error
- Verify the email matches exactly (case-insensitive)
- Verify the password is correct
- Check if user exists in database with: `SELECT email, role, status FROM users WHERE email = 'your-email@example.com';`

### "User has no password set" error
- Run the create-super-admin endpoint again to add password to existing user

### "User not approved" error
- This shouldn't happen for super_admins, but check status: `UPDATE users SET status = 'approved' WHERE email = 'your-email@example.com';`

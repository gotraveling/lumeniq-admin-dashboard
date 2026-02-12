# Firebase Authentication Setup Guide

## Setting Up Admin Users and Roles

Since you've added your IP to Cloud SQL authentication, here's how to set up Firebase users with proper roles:

### 1. Create Admin Users in Firebase Console

Go to [Firebase Console](https://console.firebase.google.com/project/lumeniq-platform/authentication/users) and create these users:

#### Super Admin (EquationX)
- **Email**: `admin@equationx.com`
- **Password**: `superadmin123`
- **Display Name**: `EquationX Admin`

#### FirstClass Admin
- **Email**: `admin@firstclass.com.au` 
- **Password**: `firstclass123`
- **Display Name**: `FirstClass Admin`

### 2. Set Custom Claims for Users

You'll need to use Firebase Admin SDK or Firebase CLI to set custom claims. Here are two options:

#### Option A: Using Firebase Admin SDK (Node.js script)

Create a script to set custom claims:

```javascript
// setup-users.js
const admin = require('firebase-admin');
const serviceAccount = require('./path-to-your-service-account-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function setupUsers() {
  try {
    // Set Super Admin claims
    await admin.auth().setCustomUserClaims('UID_OF_EQUATIONX_USER', {
      role: 'super_admin',
      tenant_id: 'equationx',
      tenant_name: 'EquationX'
    });

    // Set FirstClass Admin claims  
    await admin.auth().setCustomUserClaims('UID_OF_FIRSTCLASS_USER', {
      role: 'admin',
      tenant_id: 'firstclass', 
      tenant_name: 'FirstClass Travel'
    });

    console.log('Custom claims set successfully');
  } catch (error) {
    console.error('Error setting claims:', error);
  }
}

setupUsers();
```

#### Option B: Using Firebase CLI (Recommended)

1. Install Firebase CLI:
```bash
npm install -g firebase-tools
```

2. Login and initialize:
```bash
firebase login
firebase use lumeniq-platform
```

3. Create a Firebase function to set claims:
```bash
firebase init functions
```

4. Add this function to `functions/index.js`:
```javascript
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.setUserClaims = functions.https.onCall(async (data, context) => {
  // Verify caller is super admin
  if (!context.auth || context.auth.token.role !== 'super_admin') {
    throw new functions.https.HttpsError('permission-denied', 'Must be super admin');
  }

  const { uid, role, tenant_id, tenant_name } = data;
  
  await admin.auth().setCustomUserClaims(uid, {
    role,
    tenant_id, 
    tenant_name
  });

  return { message: 'Claims set successfully' };
});
```

### 3. Initial Super Admin Setup

Since you need to bootstrap the first super admin, you can temporarily use Firebase Console Rules or create a one-time setup script:

```javascript
// bootstrap-admin.js - Run this once to create initial super admin
const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.applicationDefault() // Use gcloud auth
});

async function bootstrapAdmin() {
  try {
    // Create super admin user
    const userRecord = await admin.auth().createUser({
      email: 'admin@equationx.com',
      password: 'superadmin123',
      displayName: 'EquationX Admin',
      emailVerified: true
    });

    // Set super admin claims
    await admin.auth().setCustomUserClaims(userRecord.uid, {
      role: 'super_admin',
      tenant_id: 'equationx',
      tenant_name: 'EquationX'
    });

    console.log('Super admin created:', userRecord.uid);

    // Create FirstClass admin
    const firstClassUser = await admin.auth().createUser({
      email: 'admin@firstclass.com.au',
      password: 'firstclass123', 
      displayName: 'FirstClass Admin',
      emailVerified: true
    });

    await admin.auth().setCustomUserClaims(firstClassUser.uid, {
      role: 'admin',
      tenant_id: 'firstclass',
      tenant_name: 'FirstClass Travel'
    });

    console.log('FirstClass admin created:', firstClassUser.uid);

  } catch (error) {
    console.error('Error:', error);
  }
}

bootstrapAdmin();
```

### 4. Test the Setup

After setting up the users and claims:

1. **Visit**: http://localhost:3002
2. **Click "Admin Login"**
3. **Use Quick Demo Login buttons** or enter credentials manually:

**Super Admin Login:**
- Email: `admin@equationx.com`
- Password: `superadmin123`
- Should see: All tenants, all bookings, platform settings

**FirstClass Admin Login:**
- Email: `admin@firstclass.com.au` 
- Password: `firstclass123`
- Should see: Only FirstClass bookings, tenant settings

### 5. Security Rules

Update your Firebase Security Rules to enforce tenant isolation:

```javascript
// Firestore Rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow read/write only for same tenant
    match /bookings/{document} {
      allow read, write: if request.auth != null && 
        (request.auth.token.role == 'super_admin' || 
         resource.data.tenant_id == request.auth.token.tenant_id);
    }
    
    // Super admin only for tenant management
    match /tenants/{document} {
      allow read, write: if request.auth != null && 
        request.auth.token.role == 'super_admin';
    }
  }
}
```

### 6. Current Architecture

**Role Hierarchy:**
- `super_admin`: EquationX platform administrators (see everything)
- `admin`: Tenant administrators (see only their tenant data)
- `user`: Regular tenant users (limited access)

**Tenant Isolation:**
- Database queries filtered by `tenant_id`
- UI shows different navigation based on role
- API endpoints respect tenant boundaries

The system is now properly structured with:
- ✅ Public homepage with login
- ✅ Role-based authentication
- ✅ Tenant isolation in all components
- ✅ Left navigation dashboard
- ✅ Proper security boundaries

You can now create the Firebase users and test the complete authentication flow!
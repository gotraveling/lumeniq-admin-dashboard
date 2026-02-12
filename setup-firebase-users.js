const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

// Initialize Firebase Admin with your Google Cloud credentials
const app = initializeApp({
  credential: applicationDefault(),
  projectId: 'lumeniq-platform'
});

async function setupUserRoles() {
  try {
    console.log('🔥 Setting up Firebase user roles...\n');

    // Get all users to find the UIDs
    const listUsersResult = await getAuth().listUsers();
    
    let equationxUser = null;
    let firstclassUser = null;

    // Find users by email
    listUsersResult.users.forEach((userRecord) => {
      if (userRecord.email === 'admin@equationx.ai') {
        equationxUser = userRecord;
      } else if (userRecord.email === 'admin@firstclass.com.au') {
        firstclassUser = userRecord;
      }
    });

    if (!equationxUser) {
      console.log('❌ User admin@equationx.ai not found');
      return;
    }

    if (!firstclassUser) {
      console.log('❌ User admin@firstclass.com.au not found');
      return;
    }

    // Set Super Admin claims for EquationX
    await getAuth().setCustomUserClaims(equationxUser.uid, {
      role: 'super_admin',
      tenant_id: 'equationx',
      tenant_name: 'EquationX'
    });

    console.log('✅ Super Admin claims set for admin@equationx.ai');
    console.log(`   UID: ${equationxUser.uid}`);
    console.log(`   Role: super_admin`);
    console.log(`   Tenant: EquationX\n`);

    // Set Tenant Admin claims for FirstClass
    await getAuth().setCustomUserClaims(firstclassUser.uid, {
      role: 'admin',
      tenant_id: 'firstclass',
      tenant_name: 'FirstClass Travel'
    });

    console.log('✅ Tenant Admin claims set for admin@firstclass.com.au');
    console.log(`   UID: ${firstclassUser.uid}`);
    console.log(`   Role: admin`);
    console.log(`   Tenant: FirstClass Travel\n`);

    console.log('🎉 All user roles configured successfully!');
    console.log('\nYou can now test the login at: http://localhost:3002');
    console.log('\nTest Accounts:');
    console.log('- Super Admin: admin@equationx.ai');
    console.log('- Tenant Admin: admin@firstclass.com.au');

  } catch (error) {
    console.error('❌ Error setting up user roles:', error);
  }
}

setupUserRoles();
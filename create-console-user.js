/**
 * Create a console login in the lumeniq-platform Firebase project.
 * Generalises create-tina-user.js for anyone.
 *
 *   node create-console-user.js <email>           # consultant: Search + Bookings
 *   node create-console-user.js <email> --admin   # admin: everything, claims copied from admin@firstclass.com.au
 *
 * Needs ADC with access to lumeniq-platform:
 *   gcloud auth application-default login
 *   GOOGLE_CLOUD_QUOTA_PROJECT=lumeniq-platform node create-console-user.js ...
 *
 * If the user already exists, it resets the password and re-applies the role.
 * Prints the temp password once; send it to the person.
 */
const crypto = require('crypto');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

initializeApp({ credential: applicationDefault(), projectId: 'lumeniq-platform' });

const email = process.argv[2];
const admin = process.argv.includes('--admin');
if (!email || !email.includes('@')) {
  console.error('Usage: node create-console-user.js <email> [--admin]');
  process.exit(1);
}

const TEMPLATE_EMAIL = 'admin@firstclass.com.au';
const FALLBACK_CLAIMS = { role: 'admin', tenant_id: 'firstclass', tenant_name: 'FirstClass Travel' };
const tempPassword =
  crypto.randomBytes(15).toString('base64').replace(/[+/=]/g, '').slice(0, 16) + 'A9!';

(async () => {
  try {
    let claims = null;                              // no role claim = consultant (useConsoleRole)
    if (admin) {
      const tmpl = await getAuth().getUserByEmail(TEMPLATE_EMAIL).catch(() => null);
      claims = tmpl?.customClaims && Object.keys(tmpl.customClaims).length ? tmpl.customClaims : FALLBACK_CLAIMS;
    }

    let uid, created = false;
    try {
      uid = (await getAuth().createUser({ email, password: tempPassword, emailVerified: true })).uid;
      created = true;
    } catch (e) {
      if (e.code !== 'auth/email-already-exists') throw e;
      uid = (await getAuth().getUserByEmail(email)).uid;
      await getAuth().updateUser(uid, { password: tempPassword });
    }
    await getAuth().setCustomUserClaims(uid, claims);

    console.log(`${created ? 'Created' : 'Already existed, password reset'}: ${email} as ${admin ? 'admin' : 'consultant'}`);
    console.log(`Temp password: ${tempPassword}`);
    console.log('Login: https://hotel-admin-dashboard-91901273027.australia-southeast1.run.app/console');
  } catch (e) {
    console.error('Failed:', e.code || '', e.message);
    if (/quota project/i.test(e.message)) console.error('Set GOOGLE_CLOUD_QUOTA_PROJECT=lumeniq-platform and retry.');
    process.exit(1);
  }
})();

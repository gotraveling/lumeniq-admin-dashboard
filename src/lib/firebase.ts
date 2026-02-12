import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyBrhc2KFBKfSTGZa68rd4DBmogHrLySRpU",
  authDomain: "lumeniq-platform.firebaseapp.com",
  projectId: "lumeniq-platform",
  storageBucket: "lumeniq-platform.firebasestorage.app",
  messagingSenderId: "835957076126",
  appId: "1:835957076126:web:09d5ea0e0f9a29e0190b8f",
  measurementId: "G-BREWDKNFSV"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);

// Initialize Analytics only on client side
export const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;

export default app;
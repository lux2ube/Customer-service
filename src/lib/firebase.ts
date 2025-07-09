
// Import the functions you need from the SDKs you need
import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration for the REALTIME DATABASE
const primaryFirebaseConfig = {
  apiKey: "AIzaSyCeXpvJgcvOcp49c-jKX3hLBWvO9tzuYk0",
  authDomain: "crmp2p-86b24.firebaseapp.com",
  projectId: "crmp2p-86b24",
  storageBucket: "crmp2p-86b24.appspot.com",
  messagingSenderId: "818879362173",
  appId: "1:818879362173:android:5fb45ca7ec77d654ea2d14",
  databaseURL: "https://crmp2p-86b24-default-rtdb.firebaseio.com",
};

// Your web app's Firebase configuration for STORAGE
const storageFirebaseConfig = {
  apiKey: "AIzaSyCeXpvJgcvOcp49c-jKX3hLBWvO9tzuYk0", // The API key is often the same across projects
  authDomain: "exchange-83a2f.firebaseapp.com",
  projectId: "exchange-83a2f",
  storageBucket: "exchange-83a2f.appspot.com",
  messagingSenderId: "818879362173",
  appId: "1:818879362173:android:5fb45ca7ec77d654ea2d14"
};


// --- App Initialization ---

// Helper to initialize an app only once, preventing re-initialization errors.
function initializeNamedApp(config: object, name: string): FirebaseApp {
    const existingApp = getApps().find(app => app.name === name);
    if (existingApp) {
        return existingApp;
    }
    return initializeApp(config, name);
}

// Initialize the primary app (for the database) as the default instance.
const app = !getApps().find(app => app.name === '[DEFAULT]') 
    ? initializeApp(primaryFirebaseConfig) 
    : getApp('[DEFAULT]');

// Initialize a secondary, named app instance specifically for Storage.
const storageApp = initializeNamedApp(storageFirebaseConfig, "storageApp");

// Get services from their respective apps
const db = getDatabase(app);
const storage = getStorage(storageApp);

export { app, db, storage };

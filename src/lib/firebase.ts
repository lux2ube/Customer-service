// Import the functions you need from the SDKs you need
import { initializeApp, getApp, getApps } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCeXpvJgcvOcp49c-jKX3hLBWvO9tzuYk0",
  authDomain: "exchange-83a2f.firebaseapp.com",
  projectId: "exchange-83a2f",
  storageBucket: "exchange-83a2f.appspot.com",
  messagingSenderId: "818879362173",
  appId: "1:818879362173:android:5fb45ca7ec77d654ea2d14",
  databaseURL: "https://exchange-83a2f-default-rtdb.firebaseio.com",
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getDatabase(app);
const storage = getStorage(app);


export { app, db, storage };

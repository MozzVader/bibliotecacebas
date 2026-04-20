/* ════════════════════════════════════════════
   firebase.js — Firebase Firestore + Auth
   ════════════════════════════════════════════ */

import { initializeApp }                               from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getFirestore, collection, getDocs, getDoc,
         addDoc, setDoc, deleteDoc, doc, updateDoc,
         query, orderBy, where, limit,
         serverTimestamp, increment, writeBatch }                  from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
         signOut, onAuthStateChanged }                 from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";

const firebaseConfig = {
  apiKey:            "AIzaSyAeZpIpMaUhaRPmqOSGZn0qhN-mPAbgkxw",
  authDomain:        "biliotecacebas.firebaseapp.com",
  projectId:         "biliotecacebas",
  storageBucket:     "biliotecacebas.firebasestorage.app",
  messagingSenderId: "819436243540",
  appId:             "1:819436243540:web:9ea1833d653f13bf617bc1"
};

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

// ── App secundaria para crear usuarios sin desloguear al admin ──
const secondaryApp  = initializeApp(firebaseConfig, "Secondary");
const secondaryAuth = getAuth(secondaryApp);

export {
  // Instancias
  db, auth, secondaryAuth,
  // SDK directo (usado por app.js para queries avanzadas)
  collection, doc, addDoc, setDoc, getDoc, getDocs,
  updateDoc, deleteDoc, query, where, orderBy, limit,
  serverTimestamp, increment, writeBatch,
  // Auth SDK directo (usado por app.js Auth module)
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged
};

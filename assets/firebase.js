/* ════════════════════════════════════════════
   firebase.js — Firebase Firestore + Auth
   ════════════════════════════════════════════ */

import { initializeApp }                               from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getFirestore, collection, getDocs, getDoc,
         addDoc, setDoc, deleteDoc, doc, updateDoc,
         query, orderBy, where, limit,
         serverTimestamp, increment }                  from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
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

// ── Referencias a colecciones ─────────────────
const colLibros    = collection(db, 'libros');
const colUsuarios  = collection(db, 'usuarios');
const colPrestamos = collection(db, 'prestamos');

// ── AUTH ──────────────────────────────────────
async function fbLogin(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

async function fbLogout() {
  await signOut(auth);
}

function fbOnAuthChange(callback) {
  onAuthStateChanged(auth, callback);
}

// ── LIBROS ────────────────────────────────────
async function fbGetLibros() {
  const snap = await getDocs(query(colLibros, orderBy('titulo')));
  return snap.docs.map(d => ({ _id: d.id, ...d.data() }));
}
async function fbAddLibro(libro) {
  const ref = await addDoc(colLibros, libro);
  return ref.id;
}
async function fbDeleteLibro(id) {
  await deleteDoc(doc(db, 'libros', id));
}
async function fbUpdateLibro(id, datos) {
  await updateDoc(doc(db, 'libros', id), datos);
}

// ── USUARIOS ──────────────────────────────────
async function fbGetUsuarios() {
  const snap = await getDocs(query(colUsuarios, orderBy('nombre')));
  return snap.docs.map(d => ({ _id: d.id, ...d.data() }));
}
async function fbAddUsuario(usuario) {
  const ref = await addDoc(colUsuarios, usuario);
  return ref.id;
}
async function fbDeleteUsuario(id) {
  await deleteDoc(doc(db, 'usuarios', id));
}

// ── PRÉSTAMOS ─────────────────────────────────
async function fbGetPrestamos() {
  const snap = await getDocs(query(colPrestamos, orderBy('fechaPrestamo')));
  return snap.docs.map(d => ({ _id: d.id, ...d.data() }));
}
async function fbAddPrestamo(prestamo) {
  const ref = await addDoc(colPrestamos, prestamo);
  return ref.id;
}
async function fbUpdatePrestamo(id, datos) {
  await updateDoc(doc(db, 'prestamos', id), datos);
}

export {
  // Instancias
  db, auth,
  // SDK directo (usado por app.js para queries avanzadas)
  collection, doc, addDoc, setDoc, getDoc, getDocs,
  updateDoc, deleteDoc, query, where, orderBy, limit,
  serverTimestamp, increment,
  // Auth SDK directo (usado por app.js Auth module)
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged,
  // Helpers
  fbLogin, fbLogout, fbOnAuthChange,
  fbGetLibros,    fbAddLibro,    fbDeleteLibro,  fbUpdateLibro,
  fbGetUsuarios,  fbAddUsuario,  fbDeleteUsuario,
  fbGetPrestamos, fbAddPrestamo, fbUpdatePrestamo
};

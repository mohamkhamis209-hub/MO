import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { 
    getFirestore, collection, addDoc, getDocs, deleteDoc, 
    doc, updateDoc, query, where, getDoc, setDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { 
    getStorage, ref, uploadBytes, getDownloadURL, listAll, deleteObject 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyAlXtyhDacyq6ToDeYkG377RyFmjkaqFyM",
  authDomain: "mr-omar-new.firebaseapp.com",
  projectId: "mr-omar-new",
  storageBucket: "mr-omar-new.firebasestorage.app",
  messagingSenderId: "146072056100",
  appId: "1:146072056100:web:b940343335bed1b81a83b1",
  measurementId: "G-KYGRBH3Y1P"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);
const ensureAnonymousAuth = () => auth.currentUser ? Promise.resolve(auth.currentUser) : signInAnonymously(auth);
const authReady = ensureAnonymousAuth();

export { 
    db, storage, auth, ensureAnonymousAuth, authReady, ref, uploadBytes, getDownloadURL, listAll, deleteObject,
    collection, addDoc, getDocs, deleteDoc, doc, updateDoc, 
    query, where, getDoc, setDoc, serverTimestamp
};


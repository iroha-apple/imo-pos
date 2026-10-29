// ============================================================
//  芋を出す。POS2026 ― Firebase の接続設定
//
//  ★ ここだけ書き換えます ★
//  Firebase の画面に出てくる「const firebaseConfig = { ... };」の
//  { から } までの中身を、下の { から } までと入れ替えてください。
//  （apiKey などの行が6〜7行並んでいる部分です）
// ============================================================

export const firebaseConfig = {
  // Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAkWuMcRTjIvQGDmUvCDJizqwpoLeVIPzQ",
  authDomain: "imo-pos-2026.firebaseapp.com",
  projectId: "imo-pos-2026",
  storageBucket: "imo-pos-2026.firebasestorage.app",
  messagingSenderId: "98959449286",
  appId: "1:98959449286:web:b757714c5243cdc4454bc7"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
};

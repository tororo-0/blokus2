// Firebaseコンソール →「プロジェクトの設定」→「全般」→「マイアプリ」に表示される
// firebaseConfig の値をここに貼り付けてください。
const firebaseConfig = {
  apiKey: "AIzaSyCI864P_T2q99g4bj4Y5luG63Y_0fbQYec",
  authDomain: "blokus2.firebaseapp.com",
  databaseURL: "https://blokus2-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "blokus2",
  storageBucket: "blokus2.firebasestorage.app",
  messagingSenderId: "85538386238",
  appId: "1:85538386238:web:1ffa2903395efde223fc6f"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
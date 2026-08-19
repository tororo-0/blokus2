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

// 匿名で自動サインイン（画面や操作感には影響しません）
firebase.auth().signInAnonymously().catch(e=>{
  console.error('匿名サインインに失敗しました', e);
  alert('接続に失敗しました。時間をおいて再度お試しください。');
});
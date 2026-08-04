//SIZE→盤面の大きさ
//COLORS→ピースの色
//NAMES→プレイヤーごとの名前
//CORNERS→角の座標 盤面の大きさに合わせて調整する
//PDEFS→ピースデータ
const SIZE    = 20;
const COLORS  = ['','#e63946','#2196f3','#4caf50','#ff9800'];
const NAMES   = ['','赤プレイヤー','青プレイヤー','緑プレイヤー','黄プレイヤー'];
const CORNERS = [null,[0,0],[0,19],[19,0],[19,19]];
const PDEFS   = [
  [[0,0]],
  [[0,0],[0,1]],
  [[0,0],[0,1],[0,2]],
  [[0,0],[1,0],[1,1]],
  [[1,1],[1,0],[0,1],[0,2]],
  [[0,0],[0,1],[1,0],[1,1]],
  [[0,0],[1,0],[1,1],[2,0]],
  [[0,0],[1,0],[0,1],[0,2]],
  [[0,0],[0,1],[0,2],[0,3]],
  [[0,0],[0,1],[0,2],[1,0],[2,0]],
  [[0,0],[1,0],[2,0],[1,1],[1,2]],
  [[0,1],[1,1],[1,2],[2,0],[2,1]],
  [[0,0],[0,1],[1,0],[1,1],[1,2]],
  [[0,1],[1,0],[1,1],[1,2],[1,3]],
  [[0,2],[1,2],[1,1],[1,0],[2,0]],
  [[0,1],[0,2],[1,1],[1,0],[2,0]],
  [[0,2],[0,3],[1,2],[1,1],[1,0]],
  [[0,0],[0,1],[0,2],[0,3],[0,4]],
  [[0,2],[1,2],[1,1],[1,0],[0,0]],
  [[0,1],[1,1],[1,0],[2,1],[1,2]],
  [[0,3],[1,3],[1,2],[1,1],[1,0]],
];

const G = {
  board:  Array.from({length:SIZE},()=>Array(SIZE).fill(0)),
  remain: {1:[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20],2:[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20],3:[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20],4:[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]},
  first:  {1:true,2:true,3:true,4:true},
  passed: {1:false,2:false,3:false,4:false},
  active: {1:false,2:false,3:false,4:false},
  cur: 1, selId: null, rot: 0, hoverR: -1, hoverC: -1, flip:false,
  lastPiece: {1:null, 2:null, 3:null, 4:null},
  roomId: null, mySeat: null, isHost: false,
  pendingMove: null
};

let zoom = 0.6;
let seatsCache = {};

function dbg(s){ console.log(s); }

/* =========================================================
   ロビー機能
   ========================================================= */

function genCode(){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for(let i=0;i<5;i++) s += chars[Math.floor(Math.random()*chars.length)];
  return s;
}

function createRoom(){
  const code = genCode();
  db.ref('rooms/'+code).set({
    status: 'waiting',
    seats: {1:null,2:null,3:null,4:null},
    createdAt: Date.now()
  }).then(()=>{
    G.isHost = true;
    enterRoom(code);
  }).catch(e=>{
    document.getElementById('lobbyMsg').textContent = '部屋の作成に失敗しました: ' + e.message;
  });
}

function joinRoomFromInput(){
  const code = document.getElementById('roomCodeInput').value.trim().toUpperCase();
  if(!code){ return; }
  db.ref('rooms/'+code).get().then(snap=>{
    if(!snap.exists()){
      document.getElementById('lobbyMsg').textContent = 'その部屋コードは見つかりませんでした';
      return;
    }
    G.isHost = false;
    enterRoom(code);
  }).catch(e=>{
    document.getElementById('lobbyMsg').textContent = '接続に失敗しました: ' + e.message;
  });
}

function enterRoom(code){
  G.roomId = code;
  document.getElementById('lobby-entry').style.display = 'none';
  document.getElementById('lobby-room').style.display = 'block';
  document.getElementById('roomCodeDisplay').textContent = code;

  db.ref('rooms/'+code+'/seats').on('value', snap=>{
    seatsCache = snap.val() || {};
    renderSeats(seatsCache);
  });

  db.ref('rooms/'+code+'/status').on('value', snap=>{
    const st = snap.val();
    G.roomStatus = st;
    if(st === 'playing'){
      document.getElementById('lobby').style.display = 'none';
      document.getElementById('gameArea').style.display = '';
      setZoom(zoom);
      subscribeGameState();
    } else if(st === 'finished'){
      showResult();
    }
  });
}

function isCOM(p){ return seatsCache[p] === 'COM'; }

function setSeatCOM(p){
  db.ref('rooms/'+G.roomId+'/seats/'+p).set('COM');
}

function renderSeats(seats){
  const wrap = document.getElementById('seatList');
  wrap.innerHTML = '';
  let takenCount = 0;
  for(let p=1;p<=4;p++){
    const val = seats[p];
    const taken = !!val;
    if(taken) takenCount++;

    const row = document.createElement('div');
    row.className = 'seat-row';

    const btn = document.createElement('button');
    btn.className = 'seat-btn' + (G.mySeat===p ? ' mine' : '');
    btn.style.borderColor = COLORS[p];
    let label = NAMES[p] + '：';
    if(val === 'COM') label += '（CPU）';
    else if(taken) label += val + (G.mySeat===p?'（あなた）':'');
    else label += '（空席・タップで参加）';
    btn.textContent = label;
    if(taken){
      btn.disabled = true;
    } else {
      btn.addEventListener('click', ()=>claimSeat(p));
    }
    row.appendChild(btn);

    if(!taken && G.isHost){
      const comBtn = document.createElement('button');
      comBtn.className = 'com-btn';
      comBtn.textContent = 'CPUにする';
      comBtn.addEventListener('click', ()=>setSeatCOM(p));
      row.appendChild(comBtn);
    }

    wrap.appendChild(row);
  }
  document.getElementById('startBtn').style.display = (G.isHost && takenCount>0) ? '' : 'none';
}

function claimSeat(p){
  if(G.mySeat !== null){ return; }
  const name = (prompt('表示名を入力してください（空欄可）') || '').trim() || (NAMES[p]);
  db.ref('rooms/'+G.roomId+'/seats/'+p).set(name).then(()=>{
    G.mySeat = p;
  });
}

function startGame(){
  db.ref('rooms/'+G.roomId+'/seats').get().then(snap=>{
    const seats = snap.val() || {};
    const active={}, passed={}, remain={}, first={}, lastPiece={};
    let firstSeat = null;
    for(let p=1;p<=4;p++){
      const isActive = !!seats[p];
      active[p] = isActive;
      passed[p] = !isActive;
      remain[p] = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20];
      first[p] = true;
      lastPiece[p] = null;
      if(isActive && firstSeat===null) firstSeat = p;
    }
    if(firstSeat===null){ alert('誰も参加していません'); return; }
    const board = Array.from({length:SIZE},()=>Array(SIZE).fill(0));
    db.ref('rooms/'+G.roomId+'/state').set({board,remain,first,passed,active,cur:firstSeat,lastPiece});
    db.ref('rooms/'+G.roomId+'/status').set('playing');
  });
}

/* =========================================================
   招待メッセージのクリップボードコピー機能
   ========================================================= */

function copyInviteMessage() {
  const code = G.roomId;
  if (!code) return;

  // 現在のページURLを取得（クエリパラメータなどを除いたベースURL）
  const url = window.location.href.split('?')[0];

  // 送信用メッセージの組み立て
  const text = `Blokus対戦しませんか？\n部屋コード：${code}\n${url}`;

  // クリップボードにコピー
  navigator.clipboard.writeText(text).then(() => {
    const msgEl = document.getElementById('copyMsg');
    msgEl.textContent = 'コピーしました！';
    
    // 2秒後に「コピーしました！」を消す
    setTimeout(() => {
      msgEl.textContent = '';
    }, 2000);
  }).catch(err => {
    alert('コピーに失敗しました。手動で部屋コードを共有してください。');
    console.error('Copy failed: ', err);
  });
}

/* =========================================================
   ゲーム状態のオンライン同期 (Firebase変換補正付き)
   ========================================================= */

// Firebaseから復元する際、オブジェクト化された配列を2次元配列に正しく変換
function normalizeBoard(rawBoard) {
  const board = Array.from({length:SIZE}, ()=>Array(SIZE).fill(0));
  if (!rawBoard) return board;
  for (let r = 0; r < SIZE; r++) {
    if (rawBoard[r]) {
      for (let c = 0; c < SIZE; c++) {
        board[r][c] = rawBoard[r][c] || 0;
      }
    }
  }
  return board;
}

function subscribeGameState(){
  db.ref('rooms/'+G.roomId+'/state').on('value', snap=>{
    const s = snap.val();
    if(!s) return;
    
    G.board     = normalizeBoard(s.board);
    G.remain    = s.remain || G.remain;
    G.first     = s.first || G.first;
    G.passed    = s.passed || G.passed;
    G.active    = s.active || G.active;
    G.cur       = s.cur;
    G.lastPiece = s.lastPiece || G.lastPiece;
    
    // 手番が変わったら仮置き・選択を強制リセット
    G.pendingMove = null;
    G.selId = null; G.rot = 0; G.flip = false; G.hoverR = -1; G.hoverC = -1;

    const seatEl = document.getElementById('myseatLabel');
    seatEl.textContent = G.mySeat ? '（あなた: ' + NAMES[G.mySeat] + '）' : '（観戦中）';
    seatEl.style.color = G.mySeat ? COLORS[G.mySeat] : '';

    render();
    maybeRunCOM();
  });
}

function syncState(){
  if(!G.roomId) return;
  
  // Firebaseへ送信
  db.ref('rooms/'+G.roomId+'/state').set({
    board: G.board, 
    remain: G.remain, 
    first: G.first, 
    passed: G.passed,
    active: G.active, 
    cur: G.cur, 
    lastPiece: G.lastPiece
  });
}

function endGame(){
  if(!confirm('ゲームを終了しますか？（現在の手持ちピースで採点されます）')) return;
  if(G.roomId){
    db.ref('rooms/'+G.roomId+'/status').set('finished');
  }
}


/* =========================================================
   拡大・縮小
   ========================================================= */

function setZoom(z){
  zoom = Math.min(2, Math.max(0.5, Math.round(z*10)/10));
  document.getElementById('gameArea').style.transform = 'scale(' + zoom + ')';
  document.getElementById('zoomLabel').textContent = Math.round(zoom*100) + '%';
}
document.addEventListener('keydown', e=>{
  if(e.key==='+' || e.key==='=') setZoom(zoom+0.1);
  if(e.key==='-') setZoom(zoom-0.1);
});

/* =========================================================
   ゲームロジック
   ========================================================= */

function getShape(id, r){
  let cs = PDEFS[id].map(c=>[...c]);
  if(G.flip){
    cs = cs.map(([r,c]) => [r,-c]);
    const mc =Math.min(...cs.map(([,c])=>c));
    cs = cs.map(([r,c])=>[r,c-mc]);
  }
  for(let i=0;i<r;i++){
    cs = cs.map(([r,c])=>[c,-r]);
    const mr=Math.min(...cs.map(([r])=>r));
    const mc=Math.min(...cs.map(([,c])=>c));
    cs = cs.map(([r,c])=>[r-mr,c-mc]);
  }
  return cs;
}

function getPlaced(br,bc,id,r){
  return getShape(id,r).map(([dr,dc])=>[br+dr,bc+dc]);
}

function isValid(p, cells){
  const [cR,cC]=CORNERS[p];
  let start=false, diag=false;
  for(const [r,c] of cells){
    if(r<0||r>=SIZE||c<0||c>=SIZE) return false;
    if(G.board[r][c]!==0) return false;

    for(const [nr,nc] of [[r-1,c],[r+1,c],[r,c-1],[r,c+1]]){
      if(nr>=0&&nr<SIZE&&nc>=0&&nc<SIZE&&G.board[nr][nc]===p) return false;
    }
    if(r===cR&&c===cC) start=true;

    for(const [nr,nc] of [[r-1,c-1],[r-1,c+1],[r+1,c-1],[r+1,c+1]]){
      if(nr>=0&&nr<SIZE&&nc>=0&&nc<SIZE&&G.board[nr][nc]===p) diag=true;
    }
  }
  return G.first[p] ? start : diag;
}

const cells2d = [];

(function buildBoard(){
  const tbl = document.getElementById('board');
  for(let r=0;r<SIZE;r++){
    cells2d[r] = [];
    const tr = document.createElement('tr');
    for(let c=0;c<SIZE;c++){
      const td = document.createElement('td');

      td.addEventListener('click', ()=>{
        // 自分のターンでない場合は操作させない
        if(G.mySeat===null || G.cur!==G.mySeat){
          return;
        }
        if(G.selId===null) return;

        const pcs = getPlaced(r,c,G.selId,G.rot);
        if(!isValid(G.cur, pcs)) return;

        G.pendingMove = { r, c, id: G.selId, rot: G.rot, flip: G.flip, pcs };
        renderBoard();
      });

      td.addEventListener('mouseenter', ()=>{
        G.hoverR=r; G.hoverC=c;
        if (G.selId !== null) renderBoard();
      });

      td.addEventListener('contextmenu', e=>{
        e.preventDefault();
        doRotate();
      });

      cells2d[r][c] = td;
      tr.appendChild(td);
    }
    tbl.appendChild(tr);
  }
})();

// 確定ボタン実行
function doConfirm(){
  if(!G.pendingMove || G.cur !== G.mySeat) return;

  const { id, pcs } = G.pendingMove;

  if(!isValid(G.cur, pcs)) return;

  // 1. 盤面に反映
  pcs.forEach(([r,c])=> {
    G.board[r][c] = G.cur;
  });
  
  G.first[G.cur] = false;
  
  const idx = G.remain[G.cur].indexOf(id);
  if(idx !== -1) {
    G.remain[G.cur].splice(idx, 1);
  }

  G.lastPiece[G.cur] = id;
  
  G.pendingMove = null;
  G.selId = null; 
  G.rot = 0; 
  G.flip = false;

  // 2. 次のターンへ進めて同期
  nextTurn();
}

function renderBoard() {
  let pre=[], preOk=false;
  if(G.selId!==null && G.hoverR>=0){
    pre   = getPlaced(G.hoverR,G.hoverC,G.selId,G.rot);
    preOk = isValid(G.cur, pre);
  }
  const preSet = new Set(pre.map(([r,c])=>r+','+c));
  const pendingSet = new Set((G.pendingMove ? G.pendingMove.pcs : []).map(([r,c])=>r+','+c));

  for(let r=0;r<SIZE;r++){
    for(let c=0;c<SIZE;c++){
      const td  = cells2d[r][c];
      const key = r+','+c;
      td.className='';
      td.style.background='';
      td.style.opacity='';

      if(pendingSet.has(key)){
        td.style.background = COLORS[G.cur];
        td.style.opacity = '0.6';
      } else if(preSet.has(key)){
        if(preOk){ td.className='pre'; td.style.background=COLORS[G.cur]; }
        else      td.className='bad';
      } else if(G.board[r][c]>0){
        td.className='p'+G.board[r][c];
      } else {
        for(let p=1;p<=4;p++){
          if(G.first[p]&&G.active[p]&&CORNERS[p][0]===r&&CORNERS[p][1]===c) {
            td.className='corner'+p;
          }
        }
      }
    }
  }

  const confirmBtn = document.getElementById('confirmBtn');
  if(confirmBtn){
    if(G.cur === G.mySeat){
      confirmBtn.style.display = '';
      confirmBtn.disabled = !G.pendingMove;
    } else {
      confirmBtn.style.display = 'none';
    }
  }
}

function renderPieces(){
  const lbl=document.getElementById('tlabel');
  lbl.textContent=NAMES[G.cur];
  lbl.style.color=COLORS[G.cur];

  const seat = G.mySeat || G.cur;
  const pd=document.getElementById('pieces');
  pd.innerHTML='';
  for(const id of (G.remain[seat]||[])){
    const btn=document.createElement('button');
    btn.className='pbtn'+(G.selId===id?' sel':'');

    const r2=G.selId===id?G.rot:0;
    const sh=getShape(id,r2);
    const mr=Math.max(...sh.map(([r])=>r));
    const mc=Math.max(...sh.map(([,c])=>c));
    const t=document.createElement('table');

    for(let r=0;r<=mr;r++){
      const row=document.createElement('tr');

      for(let c=0;c<=mc;c++){
        const cell=document.createElement('td');
        if(sh.some(([sr,sc])=>sr===r&&sc===c)) cell.style.background=COLORS[seat];
        row.appendChild(cell);
      }

      t.appendChild(row);
    }
    btn.appendChild(t);

    btn.addEventListener('click',()=>{
      if(G.mySeat===null || G.cur!==G.mySeat){
        return;
      }
      G.pendingMove = null;
      G.selId=id; G.rot=0;
      renderPieces();
      renderBoard();
    });
    pd.appendChild(btn);
  }
}

function render(){ renderBoard(); renderPieces(); }

function doRotate(){
  if(G.selId===null && !G.pendingMove) return;
  G.rot=(G.rot+1)%4;
  if(G.pendingMove){
    const pcs = getPlaced(G.pendingMove.r, G.pendingMove.c, G.pendingMove.id, G.rot);
    if(isValid(G.cur, pcs)){
      G.pendingMove.rot = G.rot;
      G.pendingMove.pcs = pcs;
    }
  }
  renderBoard();
}
document.addEventListener('keydown',e=>{ if(e.key==='r'||e.key==='R') doRotate(); });

function doFlip(){
  if(G.selId===null && !G.pendingMove) return;
  G.flip = !G.flip;
  if(G.pendingMove){
    const pcs = getPlaced(G.pendingMove.r, G.pendingMove.c, G.pendingMove.id, G.rot);
    if(isValid(G.cur, pcs)){
      G.pendingMove.flip = G.flip;
      G.pendingMove.pcs = pcs;
    }
  }
  renderBoard();
}
document.addEventListener('keydown',e=>{ if(e.key==='f'||e.key==='F') doFlip(); });

function doPass(){
  G.passed[G.cur]=true;
  nextTurn();
}

function validCheck() {
  const p = G.cur;
  if (G.passed[p] || (G.remain[p] && G.remain[p].length === 0)) return;
  let canPlace = false;
  outer:
  for (const id of G.remain[p]) {
    for (let rot = 0; rot < 4; rot++) {
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          const pcs = getPlaced(r, c, id, rot);
          if (pcs.some(([pr, pc]) => pr < 0 || pr >= SIZE || pc < 0 || pc >= SIZE)) continue;
          if (isValid(p, pcs)) {
            canPlace = true;
            break outer;
          }
        }
      }
    }
  }

  if (!canPlace) {
    doPass();
  }
}

function nextTurn(){
  const allDone=[1,2,3,4].every(p=>!G.active[p]||G.passed[p]||(G.remain[p]&&G.remain[p].length===0));
  if(allDone){
    syncState();
    if(G.roomId) db.ref('rooms/'+G.roomId+'/status').set('finished');
    return;
  }
  for(let i=1;i<=4;i++){
    G.cur=(G.cur%4)+1;
    if(G.active[G.cur]&&!G.passed[G.cur]&&G.remain[G.cur]&&G.remain[G.cur].length>0) break;
  }
  G.hoverR=-1; G.hoverC=-1;
  G.selId=null; G.rot=0; G.flip=false; G.pendingMove=null;
  
  syncState();
  render();
  validCheck();
}

/* =========================================================
   CPU（COM）の自動着手（大きいピース優先）
   ========================================================= */

function findAnyValidMove(p){
  // 残っているピースを「ブロック数が多い順（降降順）」にソートする
  // ブロック数が同じなら、元のIDが大きいものを優先
  const sortedRemain = [...G.remain[p]].sort((a, b) => {
    const sizeA = PDEFS[a].length;
    const sizeB = PDEFS[b].length;
    if (sizeB !== sizeA) {
      return sizeB - sizeA; // マス数が多い順
    }
    return b - a; // マス数が同じならIDが大きい順（右側のピース優先）
  });

  // ブロック数が大きいピースから順に置ける場所を探索
  for(const id of sortedRemain){
    for(let rot=0; rot<4; rot++){
      for(let r=0; r<SIZE; r++){
        for(let c=0; c<SIZE; c++){
          const pcs = getPlaced(r, c, id, rot);
          if(pcs.some(([pr,pc]) => pr<0 || pr>=SIZE || pc<0 || pc>=SIZE)) continue;
          if(isValid(p, pcs)) return {id, rot, r, c};
        }
      }
    }
  }
  return null;
}


let comRunning = false;
function maybeRunCOM(){
  if(!G.isHost || comRunning) return;
  if(G.roomStatus !== 'playing') return;
  if(!isCOM(G.cur)) return;
  if(G.passed[G.cur] || (G.remain[G.cur]||[]).length===0) return;

  comRunning = true;
  setTimeout(()=>{
    comRunning = false;
    if(!isCOM(G.cur) || G.roomStatus!=='playing') return;
    const move = findAnyValidMove(G.cur);
    if(!move) return;

    const pcs = getPlaced(move.r, move.c, move.id, move.rot);
    pcs.forEach(([rr,cc])=>G.board[rr][cc]=G.cur);
    G.first[G.cur]=false;
    const idx=G.remain[G.cur].indexOf(move.id);
    if(idx!==-1) G.remain[G.cur].splice(idx,1);
    G.lastPiece[G.cur]=move.id;
    nextTurn();
  }, 900);
}


/* =========================================================
   結果表示（順位順にすっきり表示）
   ========================================================= */

function showResult(){
  const sc = {}; // 最終スコア（置いたマス数）
  const placedCount = {}; // 置いたピースの個数

  for(let p = 1; p <= 4; p++){
    // 参加していないプレイヤーはスキップ
    if(!G.active[p]) continue;

    // 残っているマスの合計数を計算
    let remainCells = 0;
    for(const id of G.remain[p]){
      remainCells += PDEFS[id].length;
    }

    // 置けたマスの合計数（全89マス - 残ったマス）
    let score = 89 - remainCells;

    // 全ピース置き切りボーナス（15点）
    if(G.remain[p].length === 0){
      score += 15;
      // 上がりピースが1目盛り（ID:0）なら+5点
      if(G.lastPiece[p] === 0){
        score += 5;
      }
    }

    sc[p] = score;
    placedCount[p] = 21 - G.remain[p].length; // 置けたピースの個数
  }

  // スコアが高い順（降順）にソートしてプレイヤー配列を作成
  const rankOrder = Object.keys(sc).map(Number).sort((a, b) => sc[b] - sc[a]);
  const winner = rankOrder[0]; // 1位

  // 結果メッセージの作成
  let msg = `🎉 【勝者：${NAMES[winner]}！】 🎉\n\n`;
  msg += `🏆 最終順位 🏆\n`;
  msg += `------------------------------\n`;

  // 1位から順番に表示を組み立て
  rankOrder.forEach((p, idx) => {
    const rank = idx + 1;
    const badge = (rank === 1) ? '🥇 ' : (rank === 2) ? '🥈 ' : (rank === 3) ? '🥉 ' : '  ';
    
    msg += `${badge}第${rank}位：${NAMES[p]}\n`;
    msg += `  得点：${sc[p]} pt (${placedCount[p]}個配置)\n`;
    if(idx < rankOrder.length - 1) {
      msg += `------------------------------\n`;
    }
  });

  alert(msg);
  location.reload();
}


//SIZE→盤面の大きさ
//COLORS→ピースの色（1〜4＝実際にゲーム中で使う「色スロット」。ロビーの参加順とは別物）
//NAMES→表示名が届く前の初期フォールバック名
//CORNERS→角の座標
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

//mySeat    : ロビーでの参加順（1〜4）。名前や準備状態はこの番号にひもづく
//myColor   : ゲーム開始後に割り振られる実際のピースの色（1〜4）。mySeatとは別物
//names     : 色スロットごとの表示名（{1:'たろう', 2:'CPU2', ...}）
//isCOMMap  : 色スロットごとにCPUかどうか
const G = {
  board:  Array.from({length:SIZE},()=>Array(SIZE).fill(0)),
  remain: {1:[],2:[],3:[],4:[]},
  first:  {1:true,2:true,3:true,4:true},
  passed: {1:false,2:false,3:false,4:false},
  active: {1:false,2:false,3:false,4:false},
  cur: 1, selId: null, rot: 0, hoverR: -1, hoverC: -1, flip:false,
  lastPiece: {1:null, 2:null, 3:null, 4:null},
  roomId: null, mySeat: null, myColor: null, isHost: false,
  pendingMove: null,
  names: {}, isCOMMap: {}, seatMap: {},
  roomStatus: null, turnDeadline: null, timeoutTriggered: false,
  openedOpponent: null,
  dragging: false,
};

let zoom = 1;
let seatsCache = {};
let lastCur = null;
let activeDragTouchId = null;

function dbg(s){ console.log(s); }

/* =========================================================
   ロビー機能（部屋の作成・参加は「先着で番号が決まる」方式）
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
    seats: {},
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

//席は「早い者勝ち」で1〜4番が自動的に割り当てられる（トランザクションで同時参加の衝突を防ぐ）
function enterRoom(code){
  G.roomId = code;
  const seatsRef = db.ref('rooms/'+code+'/seats');
  let claimed = undefined;

  seatsRef.transaction(seats=>{
    seats = seats || {};
    claimed = null;
    for(let p=1;p<=4;p++){
      if(!seats[p]){
        seats[p] = {name:'プレイヤー'+p, ready:false};
        claimed = p;
        return seats;
      }
    }
    return seats; //空きなし＝満室
  }, (err, committed)=>{
    if(err || !committed){
      document.getElementById('lobbyMsg').textContent = '参加に失敗しました。もう一度お試しください';
      return;
    }
    if(claimed === null){
      document.getElementById('lobbyMsg').textContent = 'この部屋は満員です（最大4人）';
      return;
    }
    G.mySeat = claimed;
    showLobbyRoom(code);
  });
}

function showLobbyRoom(code){
  document.getElementById('lobby-entry').style.display = 'none';
  document.getElementById('lobby-room').style.display = 'block';
  document.getElementById('roomCodeDisplay').textContent = code;
  document.getElementById('myNameInput').value = 'プレイヤー'+G.mySeat;

  db.ref('rooms/'+code+'/seats').on('value', snap=>{
    seatsCache = snap.val() || {};
    renderSeats(seatsCache);
    updateReadyButton();
  });

  db.ref('rooms/'+code+'/status').on('value', snap=>{
    const st = snap.val();
    G.roomStatus = st;
    if(st === 'playing'){
      document.getElementById('lobby').style.display = 'none';
      document.getElementById('gameArea').style.display = '';
      subscribeGameState();
    } else if(st === 'finished'){
      showResult();
    }
  });
}

function saveMyName(){
  if(!G.roomId || !G.mySeat) return;
  const raw = document.getElementById('myNameInput').value.trim().slice(0,10);
  const val = raw || ('プレイヤー'+G.mySeat);
  db.ref('rooms/'+G.roomId+'/seats/'+G.mySeat+'/name').set(val);
}

function toggleReady(){
  if(!G.roomId || !G.mySeat) return;
  const info = seatsCache[G.mySeat] || {};
  db.ref('rooms/'+G.roomId+'/seats/'+G.mySeat+'/ready').set(!info.ready);
}

function updateReadyButton(){
  const info = seatsCache[G.mySeat];
  const btn = document.getElementById('readyBtn');
  if(!btn || !info) return;
  btn.textContent = info.ready ? '準備を取り消す' : '準備OK';
}

function renderSeats(seats){
  const wrap = document.getElementById('seatList');
  wrap.innerHTML = '';
  for(let p=1;p<=4;p++){
    const info = seats[p];
    const row = document.createElement('div');
    row.className = 'seat-row' + (G.mySeat===p ? ' mine' : '') + (!info ? ' empty' : '');
    if(info){
      row.textContent = 'プレイヤー' + p + '： ' + info.name + (info.ready ? '（準備OK）' : '（準備中）') + (G.mySeat===p ? '（あなた）' : '');
    } else {
      row.textContent = 'プレイヤー' + p + '：（空席・ゲーム開始時にCPUが入ります）';
    }
    wrap.appendChild(row);
  }
  document.getElementById('startBtn').style.display = G.isHost ? '' : 'none';
}

//ゲーム開始：空席はCPUで自動補完し、色（手番順）はランダムに割り当てる
function startGame(){
  db.ref('rooms/'+G.roomId+'/seats').get().then(snap=>{
    const seats = snap.val() || {};

    //1〜4をシャッフルして「ロビー番号→色スロット」の対応表を作る
    const colors = [1,2,3,4];
    for(let i=colors.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [colors[i],colors[j]] = [colors[j],colors[i]];
    }
    const seatMap = {};

    const active={}, passed={}, remain={}, first={}, lastPiece={}, names={}, isCOM={};
    for(let p=1;p<=4;p++){
      const colorSlot = colors[p-1];
      seatMap[p] = colorSlot;
      const info = seats[p];
      const isCOMSeat = !info;

      active[colorSlot]    = true;
      passed[colorSlot]    = false;
      remain[colorSlot]    = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20];
      first[colorSlot]     = true;
      lastPiece[colorSlot] = null;
      names[colorSlot]     = info ? info.name : ('CPU' + colorSlot);
      isCOM[colorSlot]     = isCOMSeat;
    }

    const board = Array.from({length:SIZE},()=>Array(SIZE).fill(0));
    db.ref('rooms/'+G.roomId+'/state').set({
      board, remain, first, passed, active, cur: 1, lastPiece,
      names, isCOM, seatMap,
      turnDeadline: Date.now() + 60000
    });
    db.ref('rooms/'+G.roomId+'/status').set('playing');
  });
}

/* =========================================================
   招待メッセージのクリップボードコピー
   ========================================================= */

function copyInviteMessage() {
  const code = G.roomId;
  if (!code) return;
  const url = window.location.href.split('?')[0];
  const text = `Blokus対戦しませんか？\n部屋コード：${code}\n${url}`;

  navigator.clipboard.writeText(text).then(() => {
    const msgEl = document.getElementById('copyMsg');
    msgEl.textContent = 'コピーしました！';
    setTimeout(() => { msgEl.textContent = ''; }, 2000);
  }).catch(err => {
    alert('コピーに失敗しました。手動で部屋コードを共有してください。');
    console.error('Copy failed: ', err);
  });
}

/* =========================================================
   ゲーム状態のオンライン同期
   ========================================================= */

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

    G.board       = normalizeBoard(s.board);
    G.remain      = s.remain || G.remain;
    G.first       = s.first || G.first;
    G.passed      = s.passed || G.passed;
    G.active      = s.active || G.active;
    G.cur         = s.cur;
    G.lastPiece   = s.lastPiece || G.lastPiece;
    G.names       = s.names || {};
    G.isCOMMap    = s.isCOM || {};
    G.seatMap     = s.seatMap || {};
    G.turnDeadline = s.turnDeadline || null;
    G.myColor     = (G.mySeat && G.seatMap) ? G.seatMap[G.mySeat] : null;

    G.pendingMove = null;
    G.selId = null; G.rot = 0; G.flip = false; G.hoverR = -1; G.hoverC = -1;

    const seatEl = document.getElementById('myseatLabel');
    const myName = G.myColor ? (G.names[G.myColor] || NAMES[G.myColor]) : null;
    seatEl.textContent = myName ? '（あなた: ' + myName + '）' : '（観戦中）';
    seatEl.style.color = G.myColor ? COLORS[G.myColor] : '';

    if(G.cur !== lastCur){
      showTurnAnnounce(G.names[G.cur] || NAMES[G.cur]);
      lastCur = G.cur;
    }

    render();
    maybeRunCOM();
  });

  autoFitZoom();
}

function syncState(){
  if(!G.roomId) return;
  db.ref('rooms/'+G.roomId+'/state').set({
    board: G.board,
    remain: G.remain,
    first: G.first,
    passed: G.passed,
    active: G.active,
    cur: G.cur,
    lastPiece: G.lastPiece,
    names: G.names || {},
    isCOM: G.isCOMMap || {},
    seatMap: G.seatMap || {},
    turnDeadline: Date.now() + 60000
  });
}

function endGame(){
  if(!confirm('ゲームを終了しますか？（現在の手持ちピースで採点されます）')) return;
  if(G.roomId){
    db.ref('rooms/'+G.roomId+'/status').set('finished');
  }
}

/* =========================================================
   ターン切り替えの中央演出
   ========================================================= */

let turnAnnounceTimer = null;
function showTurnAnnounce(name){
  const el = document.getElementById('turnAnnounce');
  if(!el || !name) return;
  el.textContent = name + 'のターン';
  el.classList.add('show');
  clearTimeout(turnAnnounceTimer);
  turnAnnounceTimer = setTimeout(()=>{ el.classList.remove('show'); }, 3000);
}

/* =========================================================
   1ターン60秒タイマー（Firebase上のturnDeadlineに全員が合わせる）
   ========================================================= */

setInterval(()=>{
  const el = document.getElementById('timerLabel');
  if(!el) return;
  if(G.roomStatus !== 'playing' || !G.turnDeadline){
    el.textContent = '';
    return;
  }
  const remain = Math.max(0, Math.round((G.turnDeadline - Date.now())/1000));
  el.textContent = '残り ' + remain + '秒';
  el.classList.toggle('low', remain <= 10);

  if(remain <= 0){
    if(G.cur === G.myColor && !G.timeoutTriggered){
      G.timeoutTriggered = true;
      autoTimeoutSkip();
    }
  } else {
    G.timeoutTriggered = false;
  }
}, 500);

//時間切れになったら、そのターンだけスキップする（パス確定にはしない＝次の自分の番はまた回ってくる）
function autoTimeoutSkip(){
  if(G.cur !== G.myColor) return;
  G.pendingMove = null; G.selId = null; G.rot = 0; G.flip = false;
  nextTurn();
}

/* =========================================================
   自動フィット（スマホ画面に盤面全体が収まるよう自動で縮小）
   ========================================================= */

function setZoom(z){
  zoom = Math.max(0.2, Math.min(1.5, z));
  const el = document.getElementById('gameArea');
  if(el) el.style.transform = 'scale(' + zoom + ')';
}

function autoFitZoom(){
  const el = document.getElementById('gameArea');
  if(!el) return;
  el.style.transform = 'scale(1)';
  requestAnimationFrame(()=>{
    const rect = el.getBoundingClientRect();
    if(rect.width===0 || rect.height===0) return;
    const availW = window.innerWidth - 12;
    const availH = window.innerHeight - 12;
    const scale = Math.min(availW/rect.width, availH/rect.height, 1);
    setZoom(Math.max(scale, 0.25));
  });
}
window.addEventListener('resize', ()=>{ if(G.roomStatus==='playing') autoFitZoom(); });

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

//観戦・相手ピース表示用：回転や反転の影響を受けない基本形
function getBaseShape(id){
  return PDEFS[id].map(c=>[...c]);
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
      td.dataset.r = r;
      td.dataset.c = c;

      td.addEventListener('click', ()=>{
        if(G.myColor===null || G.cur!==G.myColor){ return; }
        if(G.selId===null) return;

        const pcs = getPlaced(r,c,G.selId,G.rot);
        const valid = isValid(G.cur, pcs);
        G.pendingMove = { r, c, id: G.selId, rot: G.rot, flip: G.flip, pcs, valid };
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

      //仮置き中のピースの上を長押しすると、そのままつかんで動かせる
      //（一旦、仮置きを解除してから、そのピースで改めてドラッグを開始する）
      td.addEventListener('touchstart', (e)=>{
        if(!G.pendingMove || G.cur !== G.myColor) return;
        const grabbed = G.pendingMove.pcs.some(([pr,pc])=>pr===r&&pc===c);
        if(!grabbed) return;
        e.preventDefault();
        const pm = G.pendingMove;
        G.pendingMove = null;
        startPieceDrag(pm.id, e.touches[0], pm.rot, pm.flip);
      }, { passive:false });

      cells2d[r][c] = td;
      tr.appendChild(td);
    }
    tbl.appendChild(tr);
  }
})();

/* =========================================================
   指でのドラッグ＆ドロップ（スマホ向け）
   ・ピース一覧のボタンを長押し→盤面にドロップ：新しく仮置きする
   ・仮置き済みのピースを長押し→別の場所にドロップ：置き直す
   置けない場所にドロップしても仮置き状態にはなり、フローティングの
   回転・反転ボタンで向きを直してから、もう一度ドラッグして動かせる。
   ========================================================= */

function startPieceDrag(id, touch, rot, flip){
  G.pendingMove = null;
  G.selId = id;
  G.rot = (rot !== undefined) ? rot : 0;
  G.flip = (flip !== undefined) ? flip : false;
  G.dragging = true;
  activeDragTouchId = touch.identifier;
  renderPieces();
  renderBoard();
  createDragGhost();
  moveDragGhost(touch.clientX, touch.clientY);
}

//ghost（ドラッグ中の指の下に表示するピース）の見た目を、器だけ作る
function createDragGhost(){
  removeDragGhost();
  const ghost = document.createElement('div');
  ghost.id = 'dragGhost';
  ghost.className = 'drag-ghost';
  document.body.appendChild(ghost);
  refreshGhostShape();
}

//現在のG.rot/G.flipに合わせてghostの中身を作り直す
function refreshGhostShape(){
  const ghost = document.getElementById('dragGhost');
  if(!ghost || G.selId===null) return;

  const sh = getShape(G.selId, G.rot);
  const mr = Math.max(...sh.map(([r])=>r));
  const mc = Math.max(...sh.map(([,c])=>c));
  const t = document.createElement('table');
  for(let r=0;r<=mr;r++){
    const row = document.createElement('tr');
    for(let c=0;c<=mc;c++){
      const cell = document.createElement('td');
      if(sh.some(([sr,sc])=>sr===r&&sc===c)) cell.style.background = COLORS[G.cur];
      row.appendChild(cell);
    }
    t.appendChild(row);
  }
  ghost.innerHTML = '';
  ghost.appendChild(t);
}

function moveDragGhost(x, y){
  const ghost = document.getElementById('dragGhost');
  if(!ghost) return;
  ghost.style.left = x + 'px';
  ghost.style.top = y + 'px';
}

function removeDragGhost(){
  const ghost = document.getElementById('dragGhost');
  if(ghost) ghost.remove();
}

function findTouchById(touchList, id){
  for(let i=0;i<touchList.length;i++){
    if(touchList[i].identifier === id) return touchList[i];
  }
  return null;
}

document.addEventListener('touchmove', (e)=>{
  if(!G.dragging) return;
  e.preventDefault();

  const touch = findTouchById(e.touches, activeDragTouchId) || e.touches[0];
  moveDragGhost(touch.clientX, touch.clientY);

  const el = document.elementFromPoint(touch.clientX, touch.clientY);
  if(el && el.dataset && el.dataset.r !== undefined){
    G.hoverR = parseInt(el.dataset.r, 10);
    G.hoverC = parseInt(el.dataset.c, 10);
  } else {
    G.hoverR = -1; G.hoverC = -1;
  }
  renderBoard();
}, { passive:false });

//盤面のマス(r,c)を、そのままピースの原点(0,0)としてドロップする
function finishDrag(){
  G.dragging = false;
  activeDragTouchId = null;
  removeDragGhost();

  if(G.hoverR>=0 && G.selId!==null){
    const pcs = getPlaced(G.hoverR, G.hoverC, G.selId, G.rot);
    const valid = isValid(G.cur, pcs);
    G.pendingMove = { r:G.hoverR, c:G.hoverC, id:G.selId, rot:G.rot, flip:G.flip, pcs, valid };
  }
  G.hoverR=-1; G.hoverC=-1;
  render();
}

//ドラッグに使っていた指が離れた時だけドロップ確定する（他の指のタッチは無視）
document.addEventListener('touchend', (e)=>{
  if(!G.dragging) return;
  const ended = findTouchById(e.changedTouches, activeDragTouchId);
  if(!ended) return;
  finishDrag();
});

document.addEventListener('touchcancel', (e)=>{
  if(!G.dragging) return;
  const ended = findTouchById(e.changedTouches, activeDragTouchId);
  if(!ended) return;
  finishDrag();
});


function doConfirm(){
  if(!G.pendingMove || !G.pendingMove.valid || G.cur !== G.myColor) return;
  const { id, pcs } = G.pendingMove;
  if(!isValid(G.cur, pcs)) return;

  pcs.forEach(([r,c])=>{ G.board[r][c] = G.cur; });
  G.first[G.cur] = false;

  const idx = G.remain[G.cur].indexOf(id);
  if(idx !== -1) G.remain[G.cur].splice(idx, 1);

  G.lastPiece[G.cur] = id;
  G.pendingMove = null;
  G.selId = null; G.rot = 0; G.flip = false;

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
  const pendingValid = G.pendingMove ? G.pendingMove.valid : false;

  for(let r=0;r<SIZE;r++){
    for(let c=0;c<SIZE;c++){
      const td  = cells2d[r][c];
      const key = r+','+c;
      td.className='';
      td.style.background='';
      td.style.opacity='';

      if(pendingSet.has(key)){
        if(pendingValid){
          td.style.background = COLORS[G.cur];
          td.style.opacity = '0.6';
        } else {
          td.className = 'bad';
        }
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
    if(G.cur === G.myColor){
      confirmBtn.style.display = '';
      confirmBtn.disabled = !G.pendingMove || !G.pendingMove.valid;
    } else {
      confirmBtn.style.display = 'none';
    }
  }

  positionFloatingControls();
}

//盤面に仮置きしたピースのそばに、回転・反転・確定ボタンを表示する
function positionFloatingControls(){
  const fc = document.getElementById('floatingControls');
  if(!fc) return;
  if(!G.pendingMove || G.cur !== G.myColor){
    fc.style.display = 'none';
    return;
  }
  const pcs = G.pendingMove.pcs;
  const cell = 28;
  const controlsWidth = 110;
  const boardPx = SIZE * cell;

  const minR = Math.min(...pcs.map(p=>p[0]));
  const minC = Math.min(...pcs.map(p=>p[1]));
  const maxC = Math.max(...pcs.map(p=>p[1]));

  let left = (maxC + 1) * cell + 4;
  if(left + controlsWidth > boardPx){
    left = Math.max(0, minC * cell - controlsWidth - 4);
  }
  const top = Math.max(0, minR * cell);

  fc.style.left = left + 'px';
  fc.style.top = top + 'px';
  fc.style.display = 'flex';

  const floatingConfirm = document.getElementById('floatingConfirmBtn');
  if(floatingConfirm) floatingConfirm.disabled = !G.pendingMove.valid;
}

function renderPieces(){
  const lbl=document.getElementById('tlabel');
  lbl.textContent = G.names[G.cur] || NAMES[G.cur];
  lbl.style.color = COLORS[G.cur];

  const seat = G.myColor || G.cur;
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
      if(G.myColor===null || G.cur!==G.myColor) return;
      G.pendingMove = null;
      G.selId=id; G.rot=0;
      renderPieces();
      renderBoard();
    });

    btn.addEventListener('touchstart', (e)=>{
      if(G.myColor===null || G.cur!==G.myColor) return;
      e.preventDefault();
      startPieceDrag(id, e.touches[0]);
    }, { passive:false });

    pd.appendChild(btn);
  }
}

//盤面下：4人分の名前ボタン。タップすると該当プレイヤーの残りピースを表示
function renderOpponentBar(){
  const bar = document.getElementById('opponentBar');
  if(!bar) return;
  bar.innerHTML = '';
  for(let p=1;p<=4;p++){
    if(!G.active[p]) continue;
    const btn = document.createElement('button');
    btn.className = 'opp-btn' + (G.openedOpponent===p ? ' open' : '');
    btn.style.borderColor = COLORS[p];
    if(G.openedOpponent===p) btn.style.background = COLORS[p] + '33';
    const nm = (G.names[p] || NAMES[p]);
    btn.textContent = nm.slice(0,5);
    btn.addEventListener('click', ()=>{
      G.openedOpponent = (G.openedOpponent===p) ? null : p;
      renderOpponentBar();
      renderOpponentPieces();
    });
    bar.appendChild(btn);
  }
}

function renderOpponentPieces(){
  const wrap = document.getElementById('opponentPieces');
  if(!wrap) return;
  const p = G.openedOpponent;
  if(!p || !G.active[p]){
    wrap.style.display = 'none';
    wrap.innerHTML = '';
    return;
  }
  wrap.style.display = 'flex';
  wrap.innerHTML = '';
  for(const id of (G.remain[p]||[])){
    const box = document.createElement('div');
    box.className = 'opp-piece';
    const sh = getBaseShape(id);
    const mr=Math.max(...sh.map(([r])=>r));
    const mc=Math.max(...sh.map(([,c])=>c));
    const t=document.createElement('table');
    for(let r=0;r<=mr;r++){
      const row=document.createElement('tr');
      for(let c=0;c<=mc;c++){
        const cell=document.createElement('td');
        if(sh.some(([sr,sc])=>sr===r&&sc===c)) cell.style.background=COLORS[p];
        row.appendChild(cell);
      }
      t.appendChild(row);
    }
    box.appendChild(t);
    wrap.appendChild(box);
  }
}

function render(){
  renderBoard();
  renderPieces();
  renderOpponentBar();
  renderOpponentPieces();
}

function doRotate(){
  if(G.selId===null && !G.pendingMove) return;
  G.rot=(G.rot+1)%4;
  if(G.pendingMove){
    const pcs = getPlaced(G.pendingMove.r, G.pendingMove.c, G.pendingMove.id, G.rot);
    G.pendingMove.rot = G.rot;
    G.pendingMove.pcs = pcs;
    G.pendingMove.valid = isValid(G.cur, pcs);
  }
  renderBoard();
}
document.addEventListener('keydown',e=>{ if(e.key==='r'||e.key==='R') doRotate(); });

function doFlip(){
  if(G.selId===null && !G.pendingMove) return;
  G.flip = !G.flip;
  if(G.pendingMove){
    const pcs = getPlaced(G.pendingMove.r, G.pendingMove.c, G.pendingMove.id, G.rot);
    G.pendingMove.flip = G.flip;
    G.pendingMove.pcs = pcs;
    G.pendingMove.valid = isValid(G.cur, pcs);
  }
  renderBoard();
}
document.addEventListener('keydown',e=>{ if(e.key==='f'||e.key==='F') doFlip(); });

//パス（置ける場所が本当にない時の自動パス専用。以後そのプレイヤーの番は回ってこない）
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

function isCOM(p){ return G.isCOMMap && !!G.isCOMMap[p]; }

function findAnyValidMove(p){
  const sortedRemain = [...G.remain[p]].sort((a, b) => {
    const sizeA = PDEFS[a].length;
    const sizeB = PDEFS[b].length;
    if (sizeB !== sizeA) return sizeB - sizeA;
    return b - a;
  });

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
   結果表示
   ========================================================= */

//色スロット(1〜4)に対応する絵文字。結果画面で「誰が何色だったか」を分かりやすくするため
const COLOR_EMOJI = { 1:'🔴', 2:'🔵', 3:'🟢', 4:'🟡' };

function showResult(){
  const sc = {};
  const placedCount = {};

  for(let p = 1; p <= 4; p++){
    if(!G.active[p]) continue;

    let remainCells = 0;
    for(const id of G.remain[p]){
      remainCells += PDEFS[id].length;
    }
    let score = 89 - remainCells;

    if(G.remain[p].length === 0){
      score += 15;
      if(G.lastPiece[p] === 0){
        score += 5;
      }
    }

    sc[p] = score;
    placedCount[p] = 21 - G.remain[p].length;
  }

  const rankOrder = Object.keys(sc).map(Number).sort((a, b) => sc[b] - sc[a]);

  const listEl = document.getElementById('resultRanking');
  listEl.innerHTML = '';
  rankOrder.forEach((p, idx) => {
    const rank = idx + 1;
    const badge = (rank === 1) ? '🥇' : (rank === 2) ? '🥈' : (rank === 3) ? '🥉' : (rank + '位');
    const nm = G.names[p] || NAMES[p];
    const colorEmoji = COLOR_EMOJI[p] || '';

    const row = document.createElement('div');
    row.className = 'result-row' + (rank === 1 ? ' winner' : '');

    const line1 = document.createElement('div');
    line1.textContent = `${badge} 第${rank}位：${colorEmoji} ${nm}`;
    const line2 = document.createElement('div');
    line2.textContent = `得点：${sc[p]} pt（${placedCount[p]}個配置）`;

    row.appendChild(line1);
    row.appendChild(line2);
    listEl.appendChild(row);
  });

  const boardWrap = document.getElementById('resultBoardWrap');
  boardWrap.innerHTML = '';
  boardWrap.appendChild(buildResultBoardTable(G.board));

  document.getElementById('lobby').style.display = 'none';
  document.getElementById('gameArea').style.display = 'none';
  document.getElementById('resultScreen').style.display = '';
}

//最終盤面を、操作できない静止画として表示する
function buildResultBoardTable(board){
  const t = document.createElement('table');
  t.id = 'resultBoardTable';
  for(let r=0;r<SIZE;r++){
    const tr = document.createElement('tr');
    for(let c=0;c<SIZE;c++){
      const td = document.createElement('td');
      const v = board[r][c];
      if(v>0) td.style.background = COLORS[v];
      tr.appendChild(td);
    }
    t.appendChild(tr);
  }
  return t;
}
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

//mySeats   : この端末が担当するロビー番号（1〜4）の配列。1台で複数人が交代プレイする場合は複数入る
//myColor   : 「今の手番の色が、自分の担当席のものであれば」その色になる（そうでなければnull）。
//            毎ターン計算し直すことで、複数席を担当していても手番が来た席だけ操作できるようにする
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
  roomId: null, mySeats: [], myColor: null, isHost: false,
  pendingMove: null,
  names: {}, isCOMMap: {}, seatMap: {},
  roomStatus: null, turnDeadline: null, timeoutTriggered: false,
  openedOpponent: null,
  dragging: false,
  comDifficulty: {}, //色スロット(1〜4) → 'easy'|'normal'|'hard'
};

let zoom = 1;
let seatsCache = {};
let comDifficultyCache = {1:'normal',2:'normal',3:'normal',4:'normal'}; //ロビー番号(1〜4) → 強さ
let cpuNamesCache = {}; //ロビー番号(1〜4) → CPUの表示名（空席のみ有効）
let manualColorsCache = {}; //ロビー番号(1〜4) → 色スロット(1〜4)。各自で選ぶか「ランダムに決める」ボタンで一括設定する
let lastCur = null;
let activeDragTouchId = null;

//一度でも画面をタップしたら true にする。
//スマホのSafariはタップ後にPC向けのmouseenter等を疑似的に発火することがあり、
//それによる「二重プレビュー」を防ぐためのフラグ。
let isTouchDevice = false;
document.addEventListener('touchstart', ()=>{ isTouchDevice = true; }, { passive:true, capture:true });
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    
/* =========================================================
   ロビー機能（部屋の作成・参加は「先着で番号が決まる」方式）
   ========================================================= */

function genCode(){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for(let i=0;i<5;i++) s += chars[Math.floor(Math.random()*chars.length)];
  return s;
}

function getLocalSeatCount(){
  const sel = document.getElementById('localCountSelect');
  const v = sel ? parseInt(sel.value, 10) : 1;
  return Math.max(1, Math.min(4, v || 1));
}

function createRoom(){
  const code = genCode();
  const seatCount = getLocalSeatCount();
  db.ref('rooms/'+code).set({
    status: 'waiting',
    seats: {},
    comDifficulty: {1:'normal',2:'normal',3:'normal',4:'normal'},
    cpuNames: {},
    manualColors: {},
    createdAt: Date.now()
  }).then(()=>{
    G.isHost = true;
    enterRoom(code, seatCount);
  }).catch(e=>{
    document.getElementById('lobbyMsg').textContent = '部屋の作成に失敗しました: ' + e.message;
  });
}

function joinRoomFromInput(){
  const code = document.getElementById('roomCodeInput').value.trim().toUpperCase();
  if(!code){ return; }
  const seatCount = getLocalSeatCount();
  db.ref('rooms/'+code).get().then(snap=>{
    if(!snap.exists()){
      document.getElementById('lobbyMsg').textContent = 'その部屋コードは見つかりませんでした';
      return;
    }
    G.isHost = false;
    enterRoom(code, seatCount);
  }).catch(e=>{
    document.getElementById('lobbyMsg').textContent = '接続に失敗しました: ' + e.message;
  });
}

//席は「早い者勝ち」で1〜4番が自動的に割り当てられる（トランザクションで同時参加の衝突を防ぐ）。
//1台のスマホを友達と回して遊ぶ場合はseatCountを2以上にして、その端末がまとめて複数席を担当する。
function enterRoom(code, seatCount){
  seatCount = Math.max(1, Math.min(4, seatCount || 1));
  G.roomId = code;
  const seatsRef = db.ref('rooms/'+code+'/seats');
  let claimed = [];

  seatsRef.transaction(seats=>{
    seats = seats || {};
    claimed = [];
    for(let p=1; p<=4 && claimed.length<seatCount; p++){
      if(!seats[p]) claimed.push(p);
    }
    if(claimed.length < seatCount) return; //空きが足りない→中断（committed=false）
    for(const p of claimed){
      seats[p] = {name:'プレイヤー'+p, ready:false};
    }
    return seats;
  }, (err, committed)=>{
    if(err){
      document.getElementById('lobbyMsg').textContent = '参加に失敗しました。もう一度お試しください';
      return;
    }
    if(!committed){
      document.getElementById('lobbyMsg').textContent = '空席が足りません（残り席を確認してください）';
      return;
    }
    G.mySeats = claimed;
    showLobbyRoom(code);
  });
}

function showLobbyRoom(code){
  document.getElementById('lobby-entry').style.display = 'none';
  document.getElementById('lobby-room').style.display = 'block';
  document.getElementById('roomCodeDisplay').textContent = code;

  const btnWrap = document.getElementById('randomColorBtnWrap');
  if(btnWrap) btnWrap.style.display = G.isHost ? 'block' : 'none';

  db.ref('rooms/'+code+'/seats').on('value', snap=>{
    seatsCache = snap.val() || {};
    renderPlayerList();
  });

  db.ref('rooms/'+code+'/comDifficulty').on('value', snap=>{
    comDifficultyCache = snap.val() || {1:'normal',2:'normal',3:'normal',4:'normal'};
    renderPlayerList();
  });

  db.ref('rooms/'+code+'/cpuNames').on('value', snap=>{
    cpuNamesCache = snap.val() || {};
    renderPlayerList();
  });

  db.ref('rooms/'+code+'/manualColors').on('value', snap=>{
    manualColorsCache = snap.val() || {};
    renderPlayerList();
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

function saveMyName(seat, rawValue){
  if(!G.roomId || !G.mySeats.includes(seat)) return;
  const raw = (rawValue || '').trim().slice(0,10);
  const val = raw || ('プレイヤー'+seat);
  db.ref('rooms/'+G.roomId+'/seats/'+seat+'/name').set(val);
}

function toggleSeatReady(seat){
  if(!G.roomId || !G.mySeats.includes(seat)) return;
  const info = seatsCache[seat] || {};
  db.ref('rooms/'+G.roomId+'/seats/'+seat+'/ready').set(!info.ready);
}

//CPUの強さ・名前は席（ロビー番号）ごとに設定。ホストのみ変更可能で、部屋に保存して全員に配信し、
//ゲーム開始時に色スロットへ変換してstateへ引き継ぐ（3体のCPUがそれぞれ違う強さ・名前で動くようにする）
function setComDifficulty(seat, v){
  if(!G.roomId || !G.isHost) return;
  db.ref('rooms/'+G.roomId+'/comDifficulty/'+seat).set(v);
}

function setCpuName(seat, v){
  if(!G.roomId || !G.isHost) return;
  const raw = (v || '').trim().slice(0,10);
  db.ref('rooms/'+G.roomId+'/cpuNames/'+seat).set(raw);
}

function setManualColor(seat, colorSlot){
  if(!G.roomId || !G.isHost) return;
  if(colorSlot){
    db.ref('rooms/'+G.roomId+'/manualColors/'+seat).set(colorSlot);
  } else {
    db.ref('rooms/'+G.roomId+'/manualColors/'+seat).remove();
  }
}

//ホストが色の組み合わせをその場でランダムに決めて、全員のロビー画面（各行の色欄）に反映する。
//決めた後も各行の選択欄で個別に選び直せる。何も決めずにゲーム開始した場合はstartGame側で自動的にランダム決定される
function rollRandomColors(){
  if(!G.roomId || !G.isHost) return;
  const colors = [1,2,3,4];
  for(let i=colors.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [colors[i],colors[j]] = [colors[j],colors[i]];
  }
  const obj = {};
  for(let p=1;p<=4;p++) obj[p] = colors[p-1];
  db.ref('rooms/'+G.roomId+'/manualColors').set(obj);
}

const COLOR_NAMES = ['', '赤', '青', '緑', '黄'];
const DIFF_LABELS = [['easy','弱い'],['normal','ふつう'],['hard','強い']];

//プレイヤー1〜4を1行ずつ表示し、名前・CPUの強さ・準備状態・色をまとめて操作できるようにする
function renderPlayerList(){
  const wrap = document.getElementById('playerList');
  if(!wrap) return;
  wrap.innerHTML = '';

  for(let p=1;p<=4;p++){
    const info = seatsCache[p];
    const mine = G.mySeats.includes(p);
    const row = document.createElement('div');
    row.className = 'player-row' + (mine ? ' mine' : '') + (!info ? ' empty' : '');

    const label = document.createElement('span');
    label.className = 'player-row-label';
    label.textContent = 'プレイヤー' + p;
    row.appendChild(label);

    //名前：人間が座っていれば本人だけ編集可、空席ならホストがCPUの名前を編集可
    if(info){
      if(mine){
        const input = document.createElement('input');
        input.maxLength = 10;
        input.value = info.name;
        input.addEventListener('change', ()=>{ saveMyName(p, input.value); });
        row.appendChild(input);
      } else {
        const span = document.createElement('span');
        span.className = 'player-row-name';
        span.textContent = info.name;
        row.appendChild(span);
      }
    } else {
      const nameInput = document.createElement('input');
      nameInput.maxLength = 10;
      nameInput.placeholder = 'CPU' + p;
      nameInput.value = cpuNamesCache[p] || '';
      nameInput.disabled = !G.isHost;
      nameInput.addEventListener('change', ()=>{ setCpuName(p, nameInput.value); });
      row.appendChild(nameInput);
    }

    //CPUの強さ（空席のみ）
    if(!info){
      const sel = document.createElement('select');
      sel.disabled = !G.isHost;
      for(const [v, text] of DIFF_LABELS){
        const opt = document.createElement('option');
        opt.value = v; opt.textContent = text;
        if((comDifficultyCache[p] || 'normal') === v) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener('change', ()=>{ setComDifficulty(p, sel.value); });
      row.appendChild(sel);
    }

    //準備状態：自分の席だけボタンで切り替え、他人の席やCPU席は状態表示のみ
    if(info){
      if(mine){
        const btn = document.createElement('button');
        btn.className = 'ready-btn';
        btn.textContent = info.ready ? '準備を取り消す' : '準備OK';
        btn.addEventListener('click', ()=>toggleSeatReady(p));
        row.appendChild(btn);
      } else {
        const span = document.createElement('span');
        span.className = 'player-row-status';
        span.textContent = info.ready ? '準備OK' : '準備中';
        row.appendChild(span);
      }
    } else {
      const span = document.createElement('span');
      span.className = 'player-row-status';
      span.textContent = 'CPU';
      row.appendChild(span);
    }

    //色：席ごとに選択欄を出す（デフォルトは自分で選ぶ前提。右下の「ランダムに決める」ボタンで一括設定も可能）
    {
      const sel = document.createElement('select');
      sel.disabled = !G.isHost;
      const emptyOpt = document.createElement('option');
      emptyOpt.value = ''; emptyOpt.textContent = '未設定';
      sel.appendChild(emptyOpt);
      const usedColors = Object.values(manualColorsCache).map(Number);
      for(let cslot=1; cslot<=4; cslot++){
        const opt = document.createElement('option');
        opt.value = cslot;
        opt.textContent = COLOR_NAMES[cslot];
        //他の席が既に使っている色は選べないようにする（自分に割り当て済みの色は選択可のまま）
        opt.disabled = usedColors.includes(cslot) && Number(manualColorsCache[p]) !== cslot;
        if(Number(manualColorsCache[p]) === cslot) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener('change', ()=>{
        setManualColor(p, sel.value ? parseInt(sel.value,10) : null);
      });
      row.appendChild(sel);
    }

    wrap.appendChild(row);
  }

  document.getElementById('startBtn').style.display = G.isHost ? '' : 'none';
}

//ロビー番号(1〜4)→色スロット(1〜4)の対応表を作る。
//手動設定が全席分そろっていればそれを使い、そうでなければランダムに割り当てる
function buildSeatMap(){
  const usedSet = new Set(Object.values(manualColorsCache).map(Number));
  const isComplete = usedSet.size === 4 && [1,2,3,4].every(c=>usedSet.has(c));
  if(isComplete){
    const seatMap = {};
    for(let p=1;p<=4;p++) seatMap[p] = Number(manualColorsCache[p]);
    return seatMap;
  }
  const colors = [1,2,3,4];
  for(let i=colors.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [colors[i],colors[j]] = [colors[j],colors[i]];
  }
  const seatMap = {};
  for(let p=1;p<=4;p++) seatMap[p] = colors[p-1];
  return seatMap;
}

//ゲーム開始：空席はCPUで自動補完し、色（手番順）は設定に応じてランダムまたは手動で割り当てる
function startGame(){
  db.ref('rooms/'+G.roomId+'/seats').get().then(snap=>{
    const seats = snap.val() || {};
    const seatMap = buildSeatMap();

    const active={}, passed={}, remain={}, first={}, lastPiece={}, names={}, isCOM={}, comDifficulty={};
    for(let p=1;p<=4;p++){
      const colorSlot = seatMap[p];
      const info = seats[p];
      const isCOMSeat = !info;

      active[colorSlot]    = true;
      passed[colorSlot]    = false;
      remain[colorSlot]    = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20];
      first[colorSlot]     = true;
      lastPiece[colorSlot] = null;
      names[colorSlot]     = info ? info.name : (cpuNamesCache[p] || ('CPU' + colorSlot));
      isCOM[colorSlot]     = isCOMSeat;
      comDifficulty[colorSlot] = isCOMSeat ? (comDifficultyCache[p] || 'normal') : 'normal';
    }

    const board = Array.from({length:SIZE},()=>Array(SIZE).fill(0));
    db.ref('rooms/'+G.roomId+'/state').set({
      board, remain, first, passed, active, cur: 1, lastPiece,
      names, isCOM, seatMap,
      comDifficulty,
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
    //FirebaseのRealtime Databaseは空配列[]を保存できず、そのキーごと消えてしまう仕様がある。
    //ピースを全部置き切ったプレイヤーのremain[p]はちょうど[]になるため、そのまま受け取ると
    //undefinedになってしまい、以降のallDone判定や結果画面の集計がその人だけ無限に「未終了」
    //扱いになって結果画面に進めなくなる。ここで必ず配列に正規化しておく。
    G.remain = s.remain || G.remain;
    for(let p=1;p<=4;p++){
      if(!Array.isArray(G.remain[p])) G.remain[p] = [];
    }
    G.first       = s.first || G.first;
    G.passed      = s.passed || G.passed;
    G.active      = s.active || G.active;
    G.cur         = s.cur;
    G.lastPiece   = s.lastPiece || G.lastPiece;
    G.names       = s.names || {};
    G.isCOMMap    = s.isCOM || {};
    G.seatMap     = s.seatMap || {};
    //自分の担当席（複数の場合あり）の色一覧を求め、「今の手番がその中のどれかなら」自分の番として扱う。
    //1台で複数席を担当していても、手番が来た席のピースだけ操作できるようにするための判定。
    const myColorSlots = G.seatMap ? G.mySeats.map(p=>G.seatMap[p]).filter(Boolean) : [];
    G.myColor = myColorSlots.includes(G.cur) ? G.cur : null;

    G.pendingMove = null;
    G.selId = null; G.rot = 0; G.flip = false; G.hoverR = -1; G.hoverC = -1;

    const seatEl = document.getElementById('myseatLabel');
    if(G.myColor){
      const myName = G.names[G.myColor] || NAMES[G.myColor];
      seatEl.textContent = '（あなた: ' + myName + '）';
      seatEl.style.color = COLORS[G.myColor];
    } else if(myColorSlots.length > 0){
      seatEl.textContent = '（他のプレイヤーの番です）';
      seatEl.style.color = '';
    } else {
      seatEl.textContent = '（観戦中）';
      seatEl.style.color = '';
    }

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
    comDifficulty: G.comDifficulty || {},
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
  //display:noneから表示に切り替えた直後などはレイアウトがまだ確定しておらず、
  //1回のrequestAnimationFrameだとscrollWidth/Heightが0のまま測ってしまうことがある。
  //その場合は測れるようになるまで数フレーム待ってからリトライする（サイズが取れないまま
  //諦めると、盤面が原寸のままはみ出して「中央揃えになっていない」ように見えてしまう）。
  requestAnimationFrame(()=>requestAnimationFrame(()=>measureAndFit(el, 0)));
}

function measureAndFit(el, attempt){
  //#gameAreaはalign-items:centerで#boardWrap（盤面）を中央寄せしているため、
  //盤面が#gameAreaより横に大きいと左右に均等にはみ出す。scrollWidthは要素の
  //開始側（左）へのはみ出しを含まないため、#gameArea.scrollWidthだけで測ると
  //実際の横幅より小さく出てしまい、縮小が足りずスマホで画面からはみ出す
  //（＝盤面が中央に見えない）原因になる。盤面自体の幅は#boardWrapで正しく測れる。
  const boardWrap = document.getElementById('boardWrap');
  const w = boardWrap ? Math.max(boardWrap.scrollWidth, el.scrollWidth) : el.scrollWidth;
  const h = el.scrollHeight;
  if((w===0 || h===0) && attempt < 10){
    requestAnimationFrame(()=>measureAndFit(el, attempt+1));
    return;
  }
  if(w===0 || h===0) return;
  const rawScale = Math.min(window.innerWidth/w, window.innerHeight/h, 1);
  const MARGIN_RATIO = 0.88; //ぴったりフィットさせず、あえて88%に収めて周囲に均等な余白を作る
  const scale = rawScale * MARGIN_RATIO;
  setZoom(Math.max(scale, 0.25));
}
window.addEventListener('resize', ()=>{ if(G.roomStatus==='playing') autoFitZoom(); });

/* =========================================================
   ゲームロジック
   ========================================================= */

//flipを引数として明示的に受け取れるようにする。省略時は現在のG.flip（従来通りの挙動）。
//これにより「今操作しているピース以外」の見た目にG.flipが漏れて影響することを防げる。
function getShape(id, r, flip = G.flip){
  let cs = PDEFS[id].map(c=>[...c]);
  if(flip){
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

function getPlaced(br,bc,id,r,flip = G.flip){
  return getShape(id,r,flip).map(([dr,dc])=>[br+dr,bc+dc]);
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
        if(isTouchDevice) return; //スマホでのタップ後に疑似的に発火するmouseenterを無視（二重プレビュー防止）
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
  G.hoverR = -1; G.hoverC = -1; //前回操作の位置が残っていると、動かさずに指を離した時に意図しない場所へ仮置きされる
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

//ドラッグに使っていた指が離れた時だけドロップ確定する（他の指のタッチは無視）。
//ただし、識別子がずれてどの指のtouchendか判定できない場合でも、画面上の指が
//全部離れているならドラッグは終わっているはずなので、取りこぼさず確定する
//（ここで確定し損なうと、G.draggingが立ちっぱなしになり以後ボタン類が反応しなくなる）。
document.addEventListener('touchend', (e)=>{
  if(!G.dragging) return;
  const ended = findTouchById(e.changedTouches, activeDragTouchId);
  if(!ended && e.touches.length > 0) return;
  finishDrag();
});

document.addEventListener('touchcancel', (e)=>{
  if(!G.dragging) return;
  const ended = findTouchById(e.changedTouches, activeDragTouchId);
  if(!ended && e.touches.length > 0) return;
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

  const deselectBtn = document.getElementById('deselectBtn');
  if(deselectBtn){
    deselectBtn.style.display = (G.cur === G.myColor && (G.selId !== null || G.pendingMove)) ? '' : 'none';
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
  const controlsWidth = 145;
  const boardPad = 10; //#boardWrapのpadding（styles.cssと合わせる。ずれると盤面上のボタンが指した位置と合わなくなる）
  const boardPx = SIZE * cell;

  const minR = Math.min(...pcs.map(p=>p[0]));
  const minC = Math.min(...pcs.map(p=>p[1]));
  const maxC = Math.max(...pcs.map(p=>p[1]));

  let left = boardPad + (maxC + 1) * cell + 4;
  if(left + controlsWidth > boardPad + boardPx){
    left = Math.max(0, boardPad + minC * cell - controlsWidth - 4);
  }
  const top = boardPad + Math.max(0, minR * cell);

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
    const flip2 = G.selId===id ? G.flip : false; //選択中のピース以外には反転を適用しない
    const sh=getShape(id,r2,flip2);
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
  renderLiveScores();
  renderOpponentPieces();
}

//盤面・ピース一覧・操作ボタン以外の場所をタップしたら、選択中/仮置き中のピースを解除する
document.addEventListener('click', (e)=>{
  if(G.selId===null && !G.pendingMove) return;
  if(G.dragging) return; //ドラッグ操作中に発火した合成clickは無視

  const target = e.target;
  const insideBoard       = target.closest('#board');
  const insideFloating    = target.closest('#floatingControls');
  const insidePieces      = target.closest('#pieces');
  const insideControlRow  = target.closest('.control-row');
  const insideOpponentBar = target.closest('#opponentBar');
  const insideOpponentPcs = target.closest('#opponentPieces');

  if(insideBoard || insideFloating || insidePieces || insideControlRow || insideOpponentBar || insideOpponentPcs){
    return;
  }

  G.selId = null;
  G.pendingMove = null;
  G.rot = 0; G.flip = false;
  render();
});

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

//選択中/仮置き中のピースを解除する（盤面には反映しない）
function doDeselect(){
  if(G.selId===null && !G.pendingMove) return;
  G.selId = null;
  G.pendingMove = null;
  G.rot = 0; G.flip = false;
  render();
}
document.addEventListener('keydown',e=>{ if(e.key==='Escape') doDeselect(); });

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
    for (const flip of [false, true]) {
      for (let rot = 0; rot < 4; rot++) {
        for (let r = 0; r < SIZE; r++) {
          for (let c = 0; c < SIZE; c++) {
            const pcs = getPlaced(r, c, id, rot, flip);
            if (pcs.some(([pr, pc]) => pr < 0 || pr >= SIZE || pc < 0 || pc >= SIZE)) continue;
            if (isValid(p, pcs)) {
              canPlace = true;
              break outer;
            }
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
  //全員が「パス済み」か「手持ちのピースを置き切った」状態になって、初めてゲーム終了とする。
  //(以前は誰か1人が置き切った時点で即終了させていたが、それだと他のプレイヤーがまだ置ける
  //　ピースを残したまま強制的に打ち切られてしまうバグになっていたため、本来の判定に戻した)
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

function shuffled(arr){
  const a = [...arr];
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

//あるピースを置いた時に新しく生まれる「自分の色の角（次に置ける起点）」の数を数える。
//強いCPUが、置いたあとの自分の選択肢を広げる手を選ぶための評価値として使う。
function countNewCorners(p, pcs){
  const placedSet = new Set(pcs.map(([r,c])=>r+','+c));
  const seen = new Set();
  let count = 0;
  for(const [r,c] of pcs){
    for(const [dr,dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]){
      const nr=r+dr, nc=c+dc;
      if(nr<0||nr>=SIZE||nc<0||nc>=SIZE) continue;
      const key = nr+','+nc;
      if(seen.has(key) || placedSet.has(key)) continue;
      if(G.board[nr][nc] !== 0) continue;
      let blocked = false;
      for(const [ar,ac] of [[nr-1,nc],[nr+1,nc],[nr,nc-1],[nr,nc+1]]){
        if(ar<0||ar>=SIZE||ac<0||ac>=SIZE) continue;
        if(placedSet.has(ar+','+ac) || G.board[ar][ac]===p){ blocked = true; break; }
      }
      if(blocked) continue;
      seen.add(key);
      count++;
    }
  }
  return count;
}

//弱い：ピースの大きさを無視してランダムな順で試す（大きいピースを温存しがちで弱くなる）
function findMoveEasy(p){
  const ids = shuffled(G.remain[p]);
  const rows = shuffled([...Array(SIZE).keys()]);
  const cols = shuffled([...Array(SIZE).keys()]);
  const flips = shuffled([false, true]);
  const rots = shuffled([0,1,2,3]);

  for(const id of ids){
    for(const flip of flips){
      for(const rot of rots){
        for(const r of rows){
          for(const c of cols){
            const pcs = getPlaced(r, c, id, rot, flip);
            if(pcs.some(([pr,pc]) => pr<0 || pr>=SIZE || pc<0 || pc>=SIZE)) continue;
            if(isValid(p, pcs)) return {id, rot, r, c, flip};
          }
        }
      }
    }
  }
  return null;
}

//ふつう：大きいピース優先の従来ロジックだが、探索順をランダム化して毎回同じ手にならないようにする
function findMoveNormal(p){
  const sortedRemain = [...G.remain[p]].sort((a, b) => {
    const sizeA = PDEFS[a].length;
    const sizeB = PDEFS[b].length;
    if (sizeB !== sizeA) return sizeB - sizeA;
    return Math.random() - 0.5;
  });
  const rows = shuffled([...Array(SIZE).keys()]);
  const cols = shuffled([...Array(SIZE).keys()]);
  const flips = shuffled([false, true]);
  const rots = shuffled([0,1,2,3]);

  for(const id of sortedRemain){
    for(const flip of flips){
      for(const rot of rots){
        for(const r of rows){
          for(const c of cols){
            const pcs = getPlaced(r, c, id, rot, flip);
            if(pcs.some(([pr,pc]) => pr<0 || pr>=SIZE || pc<0 || pc>=SIZE)) continue;
            if(isValid(p, pcs)) return {id, rot, r, c, flip};
          }
        }
      }
    }
  }
  return null;
}

//強い：置けるピースの中で最大サイズの候補をすべて洗い出し、新しくできる角の数が最も多い手を選ぶ
//（僅差の候補が複数ある時はその中からランダムに選び、パターンの偏りを防ぐ）
function findMoveHard(p){
  const sizes = [...new Set(G.remain[p].map(id => PDEFS[id].length))].sort((a,b)=>b-a);

  for(const size of sizes){
    const idsOfSize = G.remain[p].filter(id => PDEFS[id].length === size);
    const candidates = [];
    for(const id of idsOfSize){
      for(const flip of [false, true]){
        for(let rot=0; rot<4; rot++){
          for(let r=0; r<SIZE; r++){
            for(let c=0; c<SIZE; c++){
              const pcs = getPlaced(r, c, id, rot, flip);
              if(pcs.some(([pr,pc]) => pr<0 || pr>=SIZE || pc<0 || pc>=SIZE)) continue;
              if(isValid(p, pcs)) candidates.push({id, rot, r, c, flip, pcs});
            }
          }
        }
      }
    }
    if(candidates.length === 0) continue;

    let bestScore = -Infinity;
    for(const mv of candidates){
      mv.score = countNewCorners(p, mv.pcs);
      if(mv.score > bestScore) bestScore = mv.score;
    }
    const top = candidates.filter(mv => mv.score >= bestScore - 1);
    return top[Math.floor(Math.random()*top.length)];
  }
  return null;
}

function findAnyValidMove(p){
  const difficulty = (G.comDifficulty && G.comDifficulty[p]) || 'normal';
  if(difficulty === 'easy') return findMoveEasy(p);
  if(difficulty === 'hard') return findMoveHard(p);
  return findMoveNormal(p);
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
    if(!move){
      //置ける場所が本当にどこにもない場合。ここで何もせず抜けると誰も手番を進められず
      //ゲームが永久に止まってしまう（＝全部置けても結果画面に進まない原因になる）ため、
      //人間の手番と同じくパス扱いにして次の手番へ進める。
      doPass();
      return;
    }

    const pcs = getPlaced(move.r, move.c, move.id, move.rot, move.flip);
    pcs.forEach(([rr,cc])=>G.board[rr][cc]=G.cur);
    G.first[G.cur]=false;
    const idx=G.remain[G.cur].indexOf(move.id);
    if(idx!==-1) G.remain[G.cur].splice(idx,1);
    G.lastPiece[G.cur]=move.id;
    nextTurn();
  }, 1900);
}

/* =========================================================
   結果表示
   ========================================================= */

//色スロット(1〜4)に対応する絵文字。結果画面で「誰が何色だったか」を分かりやすくするため
const COLOR_EMOJI = { 1:'🔴', 2:'🔵', 3:'🟢', 4:'🟡' };

//ある色の現在の得点内訳。対戦中の速報表示と結果画面で共通利用する
//21ピースの合計マス数は89。基本点＝置いたマス数、全消しで+15、さらに最後が1マスピースなら+5
function computeScore(p){
  let remainCells = 0;
  for(const id of (G.remain[p]||[])){
    remainCells += PDEFS[id].length;
  }
  const allPlaced = (G.remain[p]||[]).length === 0;
  const monominoLast = allPlaced && G.lastPiece[p] === 0;
  let score = 89 - remainCells;
  if(allPlaced) score += 15;
  if(monominoLast) score += 5;
  return { score, placedCount: 21 - (G.remain[p]||[]).length, allPlaced, monominoLast };
}

//対戦中の得点速報（相手の残りピース表示ボタンの下）
function renderLiveScores(){
  const el = document.getElementById('liveScoreBar');
  if(!el) return;
  el.innerHTML = '';
  for(let p = 1; p <= 4; p++){
    if(!G.active[p]) continue;
    const r = computeScore(p);
    const item = document.createElement('div');
    item.className = 'live-score' + (p === G.cur ? ' current' : '');
    const dot = document.createElement('span');
    dot.className = 'live-score-dot';
    dot.style.background = COLORS[p];
    const label = document.createElement('span');
    label.textContent = `${(G.names[p] || NAMES[p]).slice(0,5)} ${r.score}`;
    item.appendChild(dot);
    item.appendChild(label);
    el.appendChild(item);
  }
}

function showResult(){
  const sc = {};
  const placedCount = {};
  const info = {};

  for(let p = 1; p <= 4; p++){
    if(!G.active[p]) continue;
    const r = computeScore(p);
    sc[p] = r.score;
    placedCount[p] = r.placedCount;
    info[p] = r;
  }

  const rankOrder = Object.keys(sc).map(Number).sort((a, b) => sc[b] - sc[a]);

  //同点は同順位（標準競技順位）。次の順位は人数分だけ飛ぶ（例: 1位が2人なら次は3位）
  const rankOf = {};
  rankOrder.forEach(p => {
    rankOf[p] = 1 + rankOrder.filter(q => sc[q] > sc[p]).length;
  });

  const listEl = document.getElementById('resultRanking');
  listEl.innerHTML = '';
  rankOrder.forEach((p) => {
    const rank = rankOf[p];
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

    if(info[p] && info[p].monominoLast){
      const note = document.createElement('div');
      note.className = 'result-note';
      note.textContent = '※1マスピースを最後に置いたので +5点';
      row.appendChild(note);
    }

    listEl.appendChild(row);
  });

  const boardWrap = document.getElementById('resultBoardWrap');
  boardWrap.innerHTML = '';
  boardWrap.appendChild(buildResultBoardTable(G.board));

  //切り替わる前に残っている可能性のある表示（フローティングボタン・ドラッグ中のゴースト・
  //ターン演出など）を確実に消しておく（iOS Safariの描画残りバグ対策）
  G.dragging = false;
  G.pendingMove = null;
  G.selId = null;
  removeDragGhost();
  const fc = document.getElementById('floatingControls');
  if(fc) fc.style.display = 'none';
  const announce = document.getElementById('turnAnnounce');
  if(announce) announce.classList.remove('show');
  clearTimeout(turnAnnounceTimer);

  document.getElementById('lobby').style.display = 'none';
  document.getElementById('gameArea').style.display = 'none';
  document.getElementById('resultScreen').style.display = '';

  //display:noneにした後、念のためもう一度スクロール位置を先頭に戻す
  window.scrollTo(0, 0);
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
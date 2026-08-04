//SIZE→盤面の大きさ
//COLORS→ピースの色
//NAMES→プレイヤーごとの名前
//CORNERS→角の座標 盤面の大きさに合わせて調整する
//PDEFS→ピースデータ　片方向五個以上を想定していないので要注意
//ピースデータの番号は０から始まるので注意
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
  [[0,0],[1,0],[1,1,],[2,0]],
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



//ゲーム状態（プレイヤーのターンや残りピース、パス状況など）
//active: そのプレイヤーの席に誰かが座っているか（オンライン対戦用）
//mySeat/roomId/isHost: この端末（このブラウザ）に関する情報。Firebaseには送らないローカル専用の値
const G = {
  board:  Array.from({length:SIZE},()=>Array(SIZE).fill(0)),
  remain: {1:[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20],2:[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20],3:[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20],4:[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]},  //remainはピースの数を増やしたらその数追加する
  first:  {1:true,2:true,3:true,4:true},
  passed: {1:false,2:false,3:false,4:false},
  active: {1:false,2:false,3:false,4:false},
  cur: 1, selId: null, rot: 0, hoverR: -1, hoverC: -1, flip:false,
  lastPiece: {1:null, 2:null, 3:null, 4:null},
  roomId: null, mySeat: null, isHost: false,
};

let zoom = 1;

//デバックメッセージ表示
function dbg(s){ document.getElementById('debug').textContent = s; }


/* =========================================================
   ロビー機能（部屋の作成・参加・席選び・ゲーム開始）
   ========================================================= */

function genCode(){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; //紛らわしい文字(0,O,1,I)は除外
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
    renderSeats(snap.val() || {});
  });

  db.ref('rooms/'+code+'/status').on('value', snap=>{
    if(snap.val() === 'playing'){
      document.getElementById('lobby').style.display = 'none';
      document.getElementById('gameArea').style.display = '';
      subscribeGameState();
    }
  });
}

function renderSeats(seats){
  const wrap = document.getElementById('seatList');
  wrap.innerHTML = '';
  let takenCount = 0;
  for(let p=1;p<=4;p++){
    const taken = !!seats[p];
    if(taken) takenCount++;
    const btn = document.createElement('button');
    btn.className = 'seat-btn' + (G.mySeat===p ? ' mine' : '');
    btn.style.borderColor = COLORS[p];
    btn.textContent = NAMES[p] + '：' + (taken ? seats[p] + (G.mySeat===p?'（あなた）':'') : '（空席・タップで参加）');
    if(taken){
      btn.disabled = true;
    } else {
      btn.addEventListener('click', ()=>claimSeat(p));
    }
    wrap.appendChild(btn);
  }
  document.getElementById('startBtn').style.display = (G.isHost && takenCount>0) ? '' : 'none';
}

function claimSeat(p){
  if(G.mySeat !== null){ return; } //すでにどこかに座っている
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
      passed[p] = !isActive; //空席は最初からパス扱い→ターンが自動で回ってこなくなる
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
   ゲーム状態のオンライン同期
   ========================================================= */

//Firebase上の状態が変わったら、自分の画面に反映する
function subscribeGameState(){
  db.ref('rooms/'+G.roomId+'/state').on('value', snap=>{
    const s = snap.val();
    if(!s) return;
    G.board     = s.board;
    G.remain    = s.remain;
    G.first     = s.first;
    G.passed    = s.passed;
    G.active    = s.active;
    G.cur       = s.cur;
    G.lastPiece = s.lastPiece;
    G.selId=null; G.rot=0; G.flip=false; G.hoverR=-1; G.hoverC=-1;

    const seatEl = document.getElementById('myseatLabel');
    seatEl.textContent = G.mySeat ? '（あなた: ' + NAMES[G.mySeat] + '）' : '（観戦中）';
    seatEl.style.color = G.mySeat ? COLORS[G.mySeat] : '';

    render();
  });
}

//自分の手番の操作結果をFirebaseへ書き込む（他プレイヤーの画面に反映される）
function syncState(){
  if(!G.roomId) return;
  db.ref('rooms/'+G.roomId+'/state').update({
    board: G.board, remain: G.remain, first: G.first, passed: G.passed,
    active: G.active, cur: G.cur, lastPiece: G.lastPiece
  });
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
   ここから下はもとのゲームロジック（一部、オンライン対応の変更あり）
   ========================================================= */

//ピース変換
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


//バリデーション
function isValid(p, cells){
  const [cR,cC]=CORNERS[p];
  let start=false, diag=false;
  for(const [r,c] of cells){
    if(r<0||r>=SIZE||c<0||c>=SIZE) return false;
    if(G.board[r][c]!==0) return false;

    //横に自分のピースがないか、マップからはみ出ていないか
    for(const [nr,nc] of [[r-1,c],[r+1,c],[r,c-1],[r,c+1]]){
      if(nr>=0&&nr<SIZE&&nc>=0&&nc<SIZE&&G.board[nr][nc]===p) return false;
    }
    if(r===cR&&c===cC) start=true;

    //斜めに自分のピースがないか
    for(const [nr,nc] of [[r-1,c-1],[r-1,c+1],[r+1,c-1],[r+1,c+1]]){
      if(nr>=0&&nr<SIZE&&nc>=0&&nc<SIZE&&G.board[nr][nc]===p) diag=true;
    }
  }
  return G.first[p] ? start : diag;
}


//テーブルを最初に一度だけ生成
//render()ではDOMを壊さず、classとstyleだけ変える）
const cells2d = []; // cells2d[r][c] = td要素

(function buildBoard(){
  const tbl = document.getElementById('board');
  for(let r=0;r<SIZE;r++){
    cells2d[r] = [];
    const tr = document.createElement('tr');
    for(let c=0;c<SIZE;c++){
      const td = document.createElement('td');

      // クリック
      td.addEventListener('click', ()=>{
        if(G.mySeat===null || G.cur!==G.mySeat){
          dbg('あなたのターンではありません');
          return;
        }
        dbg('クリック td('+r+','+c+') selId='+G.selId);
        if(G.selId===null){ dbg('ピース未選択'); return; }
        const pcs = getPlaced(r,c,G.selId,G.rot);
        const ok  = isValid(G.cur, pcs);
        dbg(
          'クリック('+r+','+c+')\n'+
          'id='+G.selId+' rot='+G.rot+'\n'+
          'マス='+JSON.stringify(pcs)+'\n'+
          'コーナー='+JSON.stringify(CORNERS[G.cur])+'\n'+
          '初手='+G.first[G.cur]+'\n'+
          'isValid='+ok
        );
        if(!ok) return;
        pcs.forEach(([r,c])=>G.board[r][c]=G.cur);
        G.first[G.cur]=false;
        const idx=G.remain[G.cur].indexOf(G.selId);
        if(idx!==-1) G.remain[G.cur].splice(idx,1);
        G.lastPiece[G.cur]=G.selId;
        G.selId=null; G.rot=0;
        nextTurn();
      });

      //ホバー　仕様を理解していないのでこれ以上触らない
      td.addEventListener('mouseenter', ()=>{
        G.hoverR=r; G.hoverC=c;
        if (G.selId !== null) {
            renderBoard();
        }
      });

      //右クリックで回転
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


//ボードだけ再描画（DOMは壊さない）
function renderBoard() {
  let pre=[], preOk=false;
  if(G.selId!==null && G.hoverR>=0){
    pre   = getPlaced(G.hoverR,G.hoverC,G.selId,G.rot);
    preOk = isValid(G.cur, pre);
  }
  const preSet = new Set(pre.map(([r,c])=>r+','+c));

  for(let r=0;r<SIZE;r++){
    for(let c=0;c<SIZE;c++){
      const td  = cells2d[r][c];
      const key = r+','+c;
      td.className='';
      td.style.background='';
      td.style.opacity='';

      if(preSet.has(key)){
        if(preOk){ td.className='pre'; td.style.background=COLORS[G.cur]; }
        else      td.className='bad';
      } else if(G.board[r][c]>0){
        td.className='p'+G.board[r][c];
      } else {
        for(let p=1;p<=4;p++){
          if(G.first[p]&&G.active[p]&&CORNERS[p][0]===r&&CORNERS[p][1]===c) {
            switch(p) {
                case 1: td.className='corner1'; break;
                case 2: td.className='corner2'; break;
                case 3: td.className='corner3'; break;
                case 4: td.className='corner4'; break;
            }
          };
        }
      }
    }
  }
}


//ピース一覧を再描画（自分の手持ちピースを常に表示する。置けるのは自分の番の時だけ）
function renderPieces(){
  const lbl=document.getElementById('tlabel');
  lbl.textContent=NAMES[G.cur];
  lbl.style.color=COLORS[G.cur];

  const seat = G.mySeat || G.cur; //観戦中(mySeatなし)の場合は手番のプレイヤーを表示
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
        dbg('あなたのターンではありません');
        return;
      }
      G.selId=id; G.rot=0;
      dbg('ピース選択: id='+id);
      renderPieces();
      renderBoard();
    });
    pd.appendChild(btn);
  }
}

function render(){ renderBoard(); renderPieces(); }


//回転（公式使用）
function doRotate(){
  if(G.selId===null) return;
  G.rot=(G.rot+1)%4;
  renderBoard();
}
document.addEventListener('keydown',e=>{ if(e.key==='r'||e.key==='R') doRotate(); });


//反転
function doFlip(){
  if(G.selId===null) return;
  G.flip = !G.flip //trueとfalseの切り替え用
  renderBoard();
}
document.addEventListener('keydown',e=>{ if(e.key==='f'||e.key==='F') doFlip(); });


//パス（置ける場所がない時の自動パス専用。空席のプレイヤーもここを通る）
function doPass(){
  G.passed[G.cur]=true;
  nextTurn();
}

function validCheck() {
  const p = G.cur;
  if (G.passed[p] || G.remain[p].length === 0) return;
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
    dbg(NAMES[p] + ' は置ける場所がないため自動でパスしました');
    doPass();
  }
}

//ターン送り（active=trueの席だけを対象にする）
function nextTurn(){
  const allDone=[1,2,3,4].every(p=>!G.active[p]||G.passed[p]||G.remain[p].length===0);
  if(allDone){ syncState(); showResult(); return; }
  for(let i=1;i<=4;i++){
    G.cur=(G.cur%4)+1;
    if(G.active[G.cur]&&!G.passed[G.cur]&&G.remain[G.cur].length>0) break;
  }
  G.hoverR=-1; G.hoverC=-1;
  G.selId=null; G.rot=0; G.flip=false;
  syncState();
  render();
  validCheck();
}


///採点　一旦アラートで表示
function showResult(){
  const sc={};
  for(let p=1;p<=4;p++){//ピース数変更後は注意
    if(!G.active[p]) continue; //空席は採点しない

    let remainCells=0;
    let score=0;
    for(const id of G.remain[p]){
      remainCells += PDEFS[id].length;
    }

    score -= remainCells;

    if(G.remain[p].length === 0){
      score += 15;
      if(G.lastPiece[p] === 0){
        score += 5;
      }
    }

    sc[p]=score;
  }
  const order=Object.keys(sc).map(Number).sort((a,b)=>sc[b]-sc[a]);
  alert('ゲーム終了!\n\n'+order.map((p,i)=>`${i+1}位: ${NAMES[p]} (${sc[p]}ポイント)`).join('\n'));
}
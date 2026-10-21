/* Riverfair: rules engine, AI, interface, effects and online play.
   All player-facing names come from THEME (themes/*.js). */
const $=s=>document.querySelector(s);
const T=window.THEME, W=T.words;
const GOODS=['r','g','y','b'];
const GNAME=T.goods;
const PNAME={},SHORT={},PDESC={};
for(let i=1;i<=20;i++)if(T.places[i]){PNAME[i]=T.places[i].name;SHORT[i]=T.places[i].short;PDESC[i]=T.places[i].desc;}
const KIND={1:'ruby',2:'goods',3:'goods',4:'goods',5:'util',6:'util',7:'util',8:'goods',9:'money',10:'money',11:'money',12:'util',13:'ruby',14:'ruby',15:'ruby',16:'ruby',17:'goods',18:'util',19:'util',20:'ruby'};
const LAYOUTS={short:[15,5,2,14,4,12,7,3,8,6,11,9,13,10,1,16],order:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]};
/* expansion: 20 places in 5 columns x 4 rows; "short" is the recommended first-game layout */
const LAYOUTS20={short:[16,15,18,3,10,8,1,7,17,4,2,19,6,12,9,20,11,5,14,13],order:[...Array(20)].map((_,i)=>i+1)};
const DICE_GIFT={1:'lira',2:'y',3:'g',4:'r',5:'b',6:'coffee'};
const POST_TOP=[{g:'r'},{l:2},{g:'b'},{l:2}], POST_BOT=[{g:'g'},{l:1},{g:'y'},{l:1}];
/* demand tiles as printed (read from the components) */
const SMALL_TILES=[['g','r','g','y','b'],['r','g','y','g','g'],['g','y','g','y','r'],['y','r','y','g','b'],['g','y','g','y','b']];
const LARGE_TILES=[['r','b','r','b','g'],['g','b','y','b','r'],['r','b','g','b','b'],['r','b','r','b','y'],['r','b','y','b','b']];
const REV={10:[0,3,7,12,18,25],11:[0,2,5,9,14,20]};
const ENVOY_SEQ=['b','r','g','y','*','b','r','g','y','*'];
const LODGE={14:['r','g'],15:['y','b']};
const TILE_ABIL=T.tileAbil;
const CARD_COUNTS={good:4,lira5:4,dEnvoy:2,dPost:2,dGem:2,family:2,stay:2,move34:4,recall:2,smAny:2};
const EXP_CARDS={tea2:2,gcard:2,tea8:2,diceGift:2,swap3:2,six:2,corner:2,dWain:2,dCH:2};
const TT_COST=[1,2,3,4];               // Snug favours: cost of each tile in a pile, top first
const BRIBE_SIDES=[['y','y','y'],['r','b','g']]; // goods asked by the two sides of the bribe slate
Object.assign(CARD_COUNTS,EXP_CARDS);
const CARD_DEFS={};for(const k in CARD_COUNTS)if(T.cards[k])CARD_DEFS[k]={n:CARD_COUNTS[k],...T.cards[k]};
const COLORS=['red','green','yellow','teal','white'];
const AI_NAMES=T.aiNames;
const LEVELS={easy:'Easy',normal:'Normal',hard:'Hard'};
const lvlOf=p=>p&&p.lvl||'normal';
const STORE='riverfair-table-v1';
(function(){try{['table-v1','name','sound','me','preview'].forEach(k=>{const o='istan'+'bul-'+k,n='riverfair-'+k;
  [localStorage,sessionStorage].forEach(st=>{if(st.getItem(n)==null&&st.getItem(o)!=null)st.setItem(n,st.getItem(o));});});}catch(e){}})();
const PREVIEW=(()=>{const q=new URLSearchParams(location.search);try{if(q.has('preview'))localStorage.setItem('riverfair-preview','1');if(q.get('preview')==='off')localStorage.removeItem('riverfair-preview');return !!localStorage.getItem('riverfair-preview');}catch(e){return q.has('preview');}})();
const ABORT={abort:true};
const REDUCED=matchMedia('(prefers-reduced-motion: reduce)').matches;
let G=null, GEN=0;
let TUT=null, SIMN=0; // guided tutorial state; SIMN>0 while the AI is simulating moves
let UI={phase:'idle',sel:null,mode:'normal',busy:false};
let pendingMove=null, pendingEnd=null;
let TURN={snap:null,rng:-1};

/* ---------- helpers ---------- */
let RNG_N=0; // counts every random draw; undo is only offered while it hasn't changed
const rnd=n=>{RNG_N++;return Math.floor(Math.random()*n);};
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=rnd(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
const roll2=()=>(TUT&&TUT.dice&&TUT.dice.length&&!SIMN)?TUT.dice.shift().slice():[1+rnd(6),1+rnd(6)]; // the tutorial can line up its dice
const rollSum=()=>{const d=roll2();return d[0]+d[1];};
const cap=p=>2+p.ext;
const cur=g=>g.players[g.current];
const winTarget=g=>g.x?6:(g.players.length===2?6:5);
const COLS=g=>g.cols||4;
function rc(g,pl){const C=COLS(g);const i=g.layout.indexOf(pl);return[Math.floor(i/C),i%C];}
function dist(g,a,b){const[x1,y1]=rc(g,a),[x2,y2]=rc(g,b);return Math.abs(x1-x2)+Math.abs(y1-y2);}
/* Envoy's track: blue, red, green, yellow, any, blue, red, green, yellow, any. 4–5 players start with 4 goods uncovered, 2–3 with 5 */
const envoyReq=g=>ENVOY_SEQ.slice(0,(g.envoyStart||4)+g.envoyTaken);
/* Gemstone Dealer's track runs 12–23: 4–5 players start at 12, 3 players at 14, 2 players at 15 */
const gemPrice=g=>(g.gemStart||12)+g.gemTaken;
const hasCard=(p,t)=>p.cards.includes(t);
const cardOK=(ctx,p,t)=>!ctx.noCards&&hasCard(p,t); // place cards can't be used during a guild card's action
function drawGuild(g){RNG_N++;if(!g.guildDeck.length)g.guildDeck=shuffle(g.guildDiscard.splice(0));return g.guildDeck.pop()||null;}
function upgradeState(g){ // games saved by earlier versions
  if(!g)return g;
  const mv=(o,a,b)=>{if(o&&o[a]!==undefined&&o[b]===undefined){o[b]=o[a];delete o[a];}};
  mv(g,'sultan'+'Taken','envoyTaken');mv(g,'sultan'+'Start','envoyStart');mv(g,'sultan'+'Rubies','envoyRubies');
  mv(g,'mos'+'que','lodge');mv(g,'mos'+'queRubies','lodgeRubies');mv(g,'b'+'ak','bribe');
  const fix=a=>a&&a.forEach((c,i)=>{if(c==='dSul'+'tan')a[i]='dEnvoy';});
  fix(g.deck);fix(g.discard);(g.players||[]).forEach(p=>fix(p.cards));
  if(!g.x)return g;
  if(!g.guildDeck){g.guildDeck=shuffle([...Array(20)].map((_,i)=>i+1));g.guildDiscard=[];}
  if(!g.tt){g.tt={m:TT_COST.slice(),e:TT_COST.slice()};g.bribe=0;g.barrier=null;g.barrierOwner=null;}
  g.players.forEach(p=>{if(!p.guild)p.guild=[];if(!p.tt)p.tt={m:0,e:0};});
  return g;
}
function useCard(g,p,t){const i=p.cards.indexOf(t);if(i<0)return false;p.cards.splice(i,1);g.discard.push(t);return true;}
function drawCard(g,fromDiscard){RNG_N++;if(fromDiscard&&g.discard.length)return g.discard.pop();if(!g.deck.length)g.deck=shuffle(g.discard.splice(0));return g.deck.pop()||null;}
const totalGoods=p=>GOODS.reduce((s,c)=>s+p.goods[c],0);
function tileCount(t){const o={r:0,g:0,y:0,b:0};t.forEach(c=>o[c]++);return o;}
function probAtLeast(n){let k=0;for(let a=1;a<=6;a++)for(let b=1;b<=6;b++)if(a+b>=n)k++;return k/36;}
function canPayEnvoy(p,req){const need={r:0,g:0,y:0,b:0};let any=0;req.forEach(x=>x==='*'?any++:need[x]++);for(const c of GOODS)if(p.goods[c]<need[c])return false;return GOODS.reduce((s,c)=>s+p.goods[c]-need[c],0)>=any;}
function envoyMissing(p,req){const need={r:0,g:0,y:0,b:0};let any=0;req.forEach(x=>x==='*'?any++:need[x]++);let miss=0,spare=0;for(const c of GOODS){miss+=Math.max(0,need[c]-p.goods[c]);spare+=Math.max(0,p.goods[c]-need[c]);}return miss+Math.max(0,any-spare);}
function postItems(g){return[0,1,2,3].map(i=>i<g.post?POST_TOP[i]:POST_BOT[i]);}
const ICON=k=>(window.THEME&&THEME.art&&THEME.art.icons&&THEME.art.icons[k])||null;
const GICON={r:'wool',g:'herbs',y:'honey',b:'pearls','*':'any'};
const chip=c=>{const ic=ICON(GICON[c]);return ic?`<img class="gi" src="${ic}" alt="${c==='*'?'any good':GNAME[c]}">`:`<span class="gd ${c==='*'?'g-any':'g-'+c}"></span>`;};
const CS=()=>{const ic=ICON('coin');return ic?`<img class="gi" src="${ic}" alt="${W.cur}">`:W.curShort;};
const CD=()=>{const ic=ICON('card');return ic?`<img class="gi" src="${ic}" alt="${W.card}">`:'';};
const coinIc=()=>{const ic=ICON('coin');return ic?`<img class="gi" src="${ic}" alt="${W.cur}">`:'';};
const clone=o=>JSON.parse(JSON.stringify(o));
/* character names: themes may give a short name and a full title; otherwise "the Governor" */
const NS=k=>W[k+'Name']||('the '+W[k]);
const NSC=k=>{const v=NS(k);return v[0].toUpperCase()+v.slice(1);};
const NT=k=>W[k+'Title']||('The '+W[k]);
const L=n=>`${n} ${W.cur}`;
const TEA=n=>`${n} ${n===1?(W.coffee1||W.coffee):W.coffee}`;
const chCost=g=>6+g.chTaken;
const teaIc=()=>{const ic=ICON('coffee');return ic?`<img class="gi" src="${ic}" alt="${W.coffee}">`:'<span class="gd g-cof"></span>';};
const plural=(n,one,many)=>n===1?one:many;
function checkGen(ctx){if(!ctx.sim&&ctx.gen!==GEN)throw ABORT;}
async function sleep(ctx,ms){if(ctx.sim)return;await new Promise(r=>setTimeout(r,ms));checkGen(ctx);}
function cornerPlaces(g){const C=COLS(g),R=g.layout.length/C;return[0,C-1,(R-1)*C,R*C-1].map(i=>g.layout[i]);}
function edgeBlocked(g,p,a,b){if(!g.barrier||(p&&g.barrierOwner===p.i))return false;const[x,y]=g.barrier;return(a===x&&b===y)||(a===y&&b===x);}
/* can p walk from one place to another along some shortest path without crossing the Barrier? */
function pathClear(g,p,from,to){
  if(!g.barrier||g.barrierOwner===p.i)return true;
  const C=COLS(g),[r1,c1]=rc(g,from),[r2,c2]=rc(g,to),dr=Math.sign(r2-r1),dc=Math.sign(c2-c1),at=(r,c)=>g.layout[r*C+c],ok={};
  ok[r1+','+c1]=true;
  for(let i=0;i<=Math.abs(r2-r1);i++)for(let j=0;j<=Math.abs(c2-c1);j++){if(!i&&!j)continue;const r=r1+dr*i,c=c1+dc*j;
    ok[r+','+c]=(i>0&&ok[(r-dr)+','+c]&&!edgeBlocked(g,p,at(r-dr,c),at(r,c)))||(j>0&&ok[r+','+(c-dc)]&&!edgeBlocked(g,p,at(r,c-dc),at(r,c)));}
  return !!ok[r2+','+c2];
}
function neighbours(g,pl){const C=COLS(g),R=g.layout.length/C,[r,c]=rc(g,pl);return[[r-1,c],[r+1,c],[r,c-1],[r,c+1]].filter(([a,b])=>a>=0&&b>=0&&a<R&&b<C).map(([a,b])=>g.layout[a*C+b]);}
function reachable(g,p,mode){
  if(mode==='stay')return[p.pos];
  if(mode==='corner')return cornerPlaces(g).filter(pl=>pl!==p.pos);
  if(mode==='line'){const[r,c]=rc(g,p.pos);return g.layout.filter(pl=>{if(pl===p.pos)return false;const[a,b]=rc(g,pl);return(a===r||b===c)&&pathClear(g,p,p.pos,pl);});}
  const ds=mode==='move34'?[3,4]:[1,2];
  return g.layout.filter(pl=>pl!==p.pos&&ds.includes(dist(g,p.pos,pl))&&pathClear(g,p,p.pos,pl));
}
function randomLayout(x){
  if(!x){for(;;){const L2=shuffle([...Array(16)].map((_,i)=>i+1));if(![5,6,9,10].includes(L2.indexOf(7)))continue;if(dist({layout:L2},8,9)<3)continue;return L2;}}
  for(;;){const L2=shuffle([...Array(20)].map((_,i)=>i+1));const g={layout:L2,cols:5};
    if(![6,7,8,11,12,13].includes(L2.indexOf(7)))continue;
    const[a,b]=rc(g,8),[c,d]=rc(g,9);if(a===c||b===d||dist(g,8,9)<3)continue;return L2;}
}
let toastT=null;
function toast(m){const t=$('#toast');t.textContent=m;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>t.hidden=true,2600);}
function log(ctx,msg,p,sep){if(ctx.sim)return;ctx.G.log.unshift({t:msg,c:p?p.color:null,s:!!sep});if(ctx.G.log.length>160)ctx.G.log.pop();render();}
function note(ctx,p,msg){if(ctx.sim)return;log(ctx,msg,p);if(isMine(p)){toast(msg);sfx('bad');}}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function cleanName(s){return String(s??'').replace(/[<>&"'`]/g,'').trim().slice(0,16);}
function lsGet(k){try{return localStorage.getItem(k);}catch(e){return null;}}
function lsSet(k,v){try{localStorage.setItem(k,v);}catch(e){}}

/* ---------- setup ---------- */
function newGame(cfg){
  const n=cfg.players.length;
  const x=!!cfg.exp;
  const layout=cfg.layout==='random'?randomLayout(x):(x?LAYOUTS20:LAYOUTS)[cfg.layout].slice();
  const players=cfg.players.map((pl,i)=>({i,name:cleanName(pl.name)||('Player '+(i+1)),ai:!!pl.ai,lvl:pl.ai?(pl.lvl||cfg.lvl||'normal'):undefined,owner:pl.owner||(pl.ai?'ai':''),color:COLORS[i],lira:0,coffee:0,guild:[],tt:{m:0,e:0},goods:{r:0,g:0,y:0,b:0},ext:0,rubies:0,tiles:{r:0,g:0,y:0,b:0},stack:4,assist:{},pos:7,family:12,cards:[],yellowUsed:false}));
  const deck=[];Object.entries(CARD_DEFS).forEach(([k,d])=>{if(EXP_CARDS[k]&&!x)return;for(let i=0;i<d.n;i++)deck.push(k);});shuffle(deck);
  const start=rnd(n);
  for(let k=0;k<n;k++){const p=players[(start+k)%n];p.lira=2+k;p.cards.push(deck.pop());}
  const reqs=n===2?[2,4]:n===3?[2,3,4]:[2,3,4,5];
  const g={id:Math.random().toString(36).slice(2,10),x,cols:x?5:4,players,layout,deck,discard:[],post:0,
    trader:x?rollSum():null,chTaken:0,chRubies:4,
    guildDeck:x?shuffle([...Array(20)].map((_,i)=>i+1)):[],guildDiscard:[],tt:{m:TT_COST.slice(),e:TT_COST.slice()},bribe:0,barrier:null,barrierOwner:null,
    neutrals:n===2?[{color:'grey',pos:14},{color:'grey',pos:15},{color:'grey',pos:16}]:[],
    gov:rollSum(),smug:rollSum(),
    small:shuffle(SMALL_TILES.map(t=>t.slice())),large:shuffle(LARGE_TILES.map(t=>t.slice())),
    lodge:{r:reqs.slice(),g:reqs.slice(),y:reqs.slice(),b:reqs.slice()},
    lodgeRubies:{14:n===5?4:n,15:n===5?4:n},wainRubies:n,
    envoyTaken:0,envoyStart:n<=3?5:4,envoyRubies:n<=3?6:7,gemTaken:0,gemStart:n===2?15:n===3?14:12,gemRubies:n===2?9:n===3?10:12,
    current:start,start,round:1,endTriggered:false,over:false,result:null,log:[],lastRoll:null,layoutName:cfg.layout,cfg};
  g.log.unshift({t:`${players[start].name} starts. First to ${winTarget(g)} ${W.rubies} ends the game.`,c:players[start].color});
  return g;
}

/* ---------- turn resolution ---------- */
const stat=(p,k,n=1)=>{if(!p.st)p.st={};p.st[k]=(p.st[k]||0)+n;}; // end-of-game stats
function gainRuby(ctx,p,src){const g=ctx.G;p.rubies++;if(!p.fsrc)p.fsrc={};p.fsrc[src]=(p.fsrc[src]||0)+1;log(ctx,`${p.name} gains a ${W.ruby} at the ${src} (${p.rubies}).`,p);
  if(!g.endTriggered&&p.rubies>=winTarget(g)){g.endTriggered=true;log(ctx,`${p.name} reached ${p.rubies} ${W.rubies}. The game ends after this round.`,p);}}

async function resolveMove(ctx,target,mode){
  const g=ctx.G,p=cur(g);
  const from=p.pos;
  if(mode!=='stay')stat(p,'steps',dist(g,from,target));
  p.pos=target;
  log(ctx,mode==='stay'?`${p.name} stays at the ${PNAME[target]}.`:`${p.name} moves to the ${PNAME[target]}.`,p);
  { const steps=mode==='stay'?0:dist(g,from,target); await sleep(ctx,Math.max(p.ai?650:420,steps*STEP_MS+(p.ai?350:200))); }
  if(target!==7){
    if(mode!=='stay'&&p.assist[target]){p.stack+=p.assist[target];delete p.assist[target];log(ctx,`${p.name} picks up the waiting ${W.assistant}.`,p);}
    else if(p.stack>0){p.stack--;p.assist[target]=(p.assist[target]||0)+1;}
    else{note(ctx,p,`${p.name} has no ${W.assistant} along, so the turn ends.`);return;}
  }
  if(target!==7){
    const others=g.players.filter(q=>q!==p&&q.pos===target);
    const neut=g.neutrals.filter(x=>x.pos===target);
    const cost=2*(others.length+neut.length);
    if(cost>0){
      if(p.lira<cost){note(ctx,p,`${p.name} can't pay the ${L(cost)} owed to ${W.merchants} here, so the turn ends.`);return;}
      p.lira-=cost;stat(p,'paid',cost);others.forEach(q=>q.lira+=2);neut.forEach(x=>x.pos=rollSum());
      log(ctx,`${p.name} pays ${L(cost)} to the ${plural(cost/2,W.merchant,W.merchants)} here.`,p);
    }
  }
  await doAction(ctx,p,target);
  checkGen(ctx);
  if(target!==12){
    for(const q of g.players){if(q!==p&&q.family===target){
      q.family=12;stat(p,'caught');const r=await decide(ctx,p,'familyReward',{name:q.name});
      if(r==='card'){const c=drawCard(g);if(c)p.cards.push(c);log(ctx,`${p.name} sends ${q.name}'s ${W.family} to the ${PNAME[12]} and draws a card.`,p);}
      else{p.lira+=3;log(ctx,`${p.name} sends ${q.name}'s ${W.family} to the ${PNAME[12]} and takes ${L(3)}.`,p);}
    }}
  }
  if(g.gov===target&&(g.deck.length||g.discard.length)){
    if(await decide(ctx,p,'confirm',{key:'gov',title:NT('gov'),text:`Draw a ${W.card}, then pay ${L(2)} or discard a ${W.card}.`,yes:'Draw a card',no:'Ignore'})){
      const c=drawCard(g);if(c)p.cards.push(c);
      if(p.tt&&p.tt.e)log(ctx,`${p.name} pays nothing, thanks to the ${W.encTile}.`,p);
      else{const pay=await decide(ctx,p,'govPay',{});
      if(pay==='lira'){p.lira-=2;}else{const [d]=p.cards.splice(pay,1);g.discard.push(d);}}
      g.gov=rollSum();stat(p,'deals');log(ctx,`${p.name} deals with ${NS('gov')}, who moves to the ${PNAME[g.gov]}.`,p);
    }
  }
  if(g.smug===target){
    const room=GOODS.filter(c=>p.goods[c]<cap(p));
    if(room.length&&await decide(ctx,p,'confirm',{key:'smug',title:NT('smug'),text:`Take 1 good of your choice, then pay ${L(2)} or 1 good.`,yes:'Take a good',no:'Ignore'})){
      const c=await decide(ctx,p,'pickGood',{key:'smug',title:NT('smug'),text:'Take 1 good.',options:room});
      p.goods[c]++;
      if(!(p.tt&&p.tt.e)){const pay=await decide(ctx,p,'smugPay',{});
      if(pay==='lira')p.lira-=2;else p.goods[pay]--;}
      g.smug=rollSum();stat(p,'deals');log(ctx,`${p.name} deals with ${NS('smug')}, who moves to the ${PNAME[g.smug]}.`,p);
    }
  }
  if(g.x&&g.trader===target&&(p.lira>=2||totalGoods(p)>0||(p.tt&&p.tt.e))){
    if(await decide(ctx,p,'confirm',{key:'trader',title:NT('trader'),text:p.tt&&p.tt.e?`Take ${TEA(1)} for free (${W.encTile})?`:`Take ${TEA(1)} for ${L(2)} or 1 good?`,yes:`Take ${TEA(1)}`,no:'Ignore'})){
      if(!(p.tt&&p.tt.e)){const pay=await decide(ctx,p,'smugPay',{who:'trader'});
      if(pay==='lira')p.lira-=2;else p.goods[pay]--;}
      p.coffee++;g.trader=rollSum();stat(p,'deals');log(ctx,`${p.name} buys ${TEA(1)} from ${NS('trader')}, who moves to the ${PNAME[g.trader]}.`,p);
    }
  }
}

function setRoll(ctx,p,d,purpose,target,note2){if(ctx.sim)return;const g=ctx.G;g.lastRoll={n:(g.lastRoll?g.lastRoll.n:0)+1,d:[d[0],d[1]],who:p.i,purpose,target:target??null,note:note2||''};}
async function rollWithRed(ctx,p,purpose,target){
  let d=roll2();
  setRoll(ctx,p,d,purpose,target);
  log(ctx,`${p.name} rolls ${d[0]} + ${d[1]} = ${d[0]+d[1]}.`,p);
  await sleep(ctx,1100);
  if(p.tiles.r&&!ctx.noCards){
    const ch=await decide(ctx,p,'dice',{dice:d,purpose,target});
    if(ch==='four'){const i=d[0]<=d[1]?0:1;d[i]=4;setRoll(ctx,p,d,purpose,target,'Turned a die to 4');log(ctx,`${p.name} turns a die to 4: ${d[0]+d[1]}.`,p);await sleep(ctx,900);}
    else if(ch==='reroll'){d=roll2();setRoll(ctx,p,d,purpose,target,'Re-roll');log(ctx,`${p.name} re-rolls: ${d[0]} + ${d[1]} = ${d[0]+d[1]}.`,p);await sleep(ctx,1100);}
  }
  if(hasCard(p,'six')&&Math.min(d[0],d[1])<6&&await decide(ctx,p,'six',{dice:d,purpose,target})){
    useCard(ctx.G,p,'six');const i=d[0]<=d[1]?0:1;d[i]=6;setRoll(ctx,p,d,purpose,target,`${CARD_DEFS.six.name}: a die turned to 6`);log(ctx,`${p.name} plays “${CARD_DEFS.six.name}”: ${d[0]+d[1]}.`,p);await sleep(ctx,900);
  }
  return d;
}

async function postAction(ctx,p){
  const g=ctx.G;const items=postItems(g);let lira=0;const got=[];
  items.forEach(it=>{if(it.l)lira+=it.l;else if(p.goods[it.g]<cap(p)){p.goods[it.g]++;got.push(GNAME[it.g]);}});
  p.lira+=lira;g.post=g.post<4?g.post+1:0;
  log(ctx,`${p.name} collects mail: ${L(lira)}${got.length?', '+got.join(', '):''}.`,p);
}

async function doAction(ctx,p,place){
  const g=ctx.G;
  switch(place){
  case 1:{
    if(p.ext>=3){note(ctx,p,`Your ${W.cart} is already fully extended.`);break;}
    if(p.lira<7){note(ctx,p,`The ${PNAME[1]} needs ${L(7)}.`);break;}
    if(!await decide(ctx,p,'confirm',{key:'wain',title:PNAME[1],text:`Pay ${L(7)} to extend your ${W.cart} to ${cap(p)+1} of each good?${p.ext===2?` This completes it and earns a ${W.ruby}.`:''}`,yes:`Pay ${L(7)}`}))break;
    p.lira-=7;p.ext++;log(ctx,`${p.name} extends the ${W.cart} (${cap(p)} per good).`,p);
    if(p.ext===3&&g.wainRubies>0){g.wainRubies--;gainRuby(ctx,p,PNAME[1]);}
    if(p.ext<3&&p.lira>=7&&cardOK(ctx,p,'dWain')&&await decide(ctx,p,'confirm',{key:'dWain',title:CARD_DEFS.dWain.name,text:`Play your ${W.card} to pay ${L(7)} for another extension?`,yes:'Play card'})){
      useCard(g,p,'dWain');p.lira-=7;p.ext++;log(ctx,`${p.name} extends the ${W.cart} again (${cap(p)} per good).`,p);
      if(p.ext===3&&g.wainRubies>0){g.wainRubies--;gainRuby(ctx,p,PNAME[1]);}}
    break;}
  case 2:case 3:case 4:{
    const c={2:'r',3:'g',4:'y'}[place];const n=cap(p)-p.goods[c];p.goods[c]=cap(p);
    log(ctx,`${p.name} loads ${n} ${GNAME[c]}.`,p);
    if(p.tiles.g&&!ctx.noCards&&p.lira>=2){const room=GOODS.filter(x=>p.goods[x]<cap(p));
      if(room.length){const pick=await decide(ctx,p,'pickGood',{key:'green',title:`${GNAME.g} ${W.tile}`,text:`Pay ${L(2)} for 1 extra good?`,options:room,allowSkip:true});
        if(pick){p.lira-=2;p.goods[pick]++;log(ctx,`${p.name} buys 1 extra ${GNAME[pick]}.`,p);}}}
    break;}
  case 5:{
    await postAction(ctx,p);
    if(cardOK(ctx,p,'dPost')&&await decide(ctx,p,'confirm',{key:'dPost',title:CARD_DEFS.dPost.name,text:`Play your ${W.card} to collect the mail again?`,yes:'Play card'})){useCard(g,p,'dPost');await postAction(ctx,p);}
    break;}
  case 6:{
    for(let k=1;k<=2;k++){let src='deck';if(g.discard.length)src=await decide(ctx,p,'cardSource',{top:g.discard[g.discard.length-1],n:k});
      const c=drawCard(g,src==='discard');if(c)p.cards.push(c);}
    log(ctx,`${p.name} takes 2 ${W.cards}${g.x?` and ${TEA(1)}`:''}.`,p);if(g.x)p.coffee++;
    if(p.cards.length){const i=await decide(ctx,p,'discardCard',{title:`${PNAME[6]}: discard 1`});const [c]=p.cards.splice(i,1);g.discard.push(c);log(ctx,`${p.name} discards “${CARD_DEFS[c].name}”.`,p);}
    break;}
  case 7:{
    let n=0;for(const k in p.assist)n+=p.assist[k];p.stack+=n;p.assist={};
    log(ctx,n?`${p.name} brings ${n} ${plural(n,W.assistant,W.assistants)} home.`:`${p.name} has no ${W.assistants} out.`,p);break;}
  case 8:{
    const opts=['r','y','g'].filter(c=>p.goods[c]<cap(p));
    if(opts.length){const c=await decide(ctx,p,'pickGood',{key:'bm',title:PNAME[8],text:`Take 1 good, then roll for ${GNAME.b}.`,options:opts});if(c){p.goods[c]++;log(ctx,`${p.name} takes 1 ${GNAME[c]}.`,p);}}
    const d=await rollWithRed(ctx,p,'bm',null);const s=d[0]+d[1];
    const blue=s>=11?3:s>=9?2:s>=7?1:0;const add=Math.min(blue,cap(p)-p.goods.b);p.goods.b+=add;
    log(ctx,add?`${p.name} gains ${add} ${GNAME.b}.`:`${p.name} gains no ${GNAME.b}.`,p);break;}
  case 9:{
    const n=await decide(ctx,p,'pickNumber',{});
    log(ctx,`${p.name} announces ${n}.`,p);
    const d=await rollWithRed(ctx,p,'tea',n);const s=d[0]+d[1];const gain=s>=n?n:2;p.lira+=gain;stat(p,'bet',gain);
    log(ctx,`${p.name} takes ${L(gain)} at the ${PNAME[9]}.`,p);break;}
  case 10:case 11:{
    const mk=place===10?g.large:g.small;const tile=mk[0];
    let any=false;
    if(place===11&&cardOK(ctx,p,'smAny'))any=await decide(ctx,p,'confirm',{key:'smAny',title:CARD_DEFS.smAny.name,text:`Play your ${W.card} to sell any types of goods here?`,yes:'Play card',no:'Not now'});
    if(any)useCard(g,p,'smAny');
    const sel=await decide(ctx,p,'sell',{tile,rev:REV[place],any,place});
    const n=GOODS.reduce((s,c)=>s+sel[c],0);
    if(n>0){GOODS.forEach(c=>p.goods[c]-=sel[c]);p.lira+=REV[place][n];stat(p,'sold',REV[place][n]);log(ctx,`${p.name} sells ${n} ${plural(n,'good','goods')} for ${L(REV[place][n])}.`,p);}
    else log(ctx,`${p.name} sells nothing.`,p);
    mk.push(mk.shift());break;}
  case 12:{
    if(p.family!==12){note(ctx,p,`Your ${W.family} is not at the ${PNAME[12]}.`);break;}
    const t=await decide(ctx,p,'policeTarget',{options:g.layout.filter(x=>x!==12)});
    if(t==null)break;
    p.family=t;log(ctx,`${p.name}'s ${W.family} heads to the ${PNAME[t]}.`,p);
    await doAction(ctx,p,t);break;}
  case 13:{
    let times=0;
    for(;;){
      if(g.envoyTaken>=g.envoyRubies){if(!times)note(ctx,p,`${NSC('king')} has no ${W.rubies} left.`);break;}
      const req=envoyReq(g);
      if(!canPayEnvoy(p,req)){if(!times)note(ctx,p,`${NSC('king')} wants ${req.length} goods you don't have.`);break;}
      if(times===0){if(!await decide(ctx,p,'confirm',{key:'envoy',title:PNAME[13],text:`Deliver ${req.length} goods for a ${W.ruby}? <span class="chips">${req.map(chip).join('')}</span>`,yes:'Deliver'}))break;}
      else{if(!cardOK(ctx,p,'dEnvoy')||!await decide(ctx,p,'confirm',{key:'dEnvoy',title:CARD_DEFS.dEnvoy.name,text:`Play your ${W.card} to deliver again? <span class="chips">${req.map(chip).join('')}</span>`,yes:'Play card'}))break;useCard(g,p,'dEnvoy');}
      req.forEach(x=>{if(x!=='*')p.goods[x]--;});
      for(const x of req)if(x==='*'){const opts=GOODS.filter(c=>p.goods[c]>0);const c=await decide(ctx,p,'pickGood',{key:'envoyAny',title:'Any good',text:'Pick the good to give for the open slot.',options:opts});p.goods[c]--;}
      g.envoyTaken++;gainRuby(ctx,p,PNAME[13]);times++;
    }
    break;}
  case 14:case 15:{
    const cols=LODGE[place];
    const opts=cols.filter(c=>!p.tiles[c]&&g.lodge[c].length&&p.goods[c]>=g.lodge[c][0]);
    if(!opts.length){note(ctx,p,`You can't claim a ${W.tile} here yet.`);break;}
    const c=await decide(ctx,p,'lodgeColor',{options:opts});
    if(!c)break;
    const req=g.lodge[c].shift();p.goods[c]--;p.tiles[c]=1;
    log(ctx,`${p.name} claims the ${GNAME[c]} ${W.tile} (showed ${req}).`,p);
    if(c==='b'){p.stack++;log(ctx,`${p.name} gains a 5th ${W.assistant}.`,p);}
    if(cols.every(x=>p.tiles[x])&&g.lodgeRubies[place]>0){g.lodgeRubies[place]--;gainRuby(ctx,p,PNAME[place]);}
    break;}
  case 16:{
    let times=0;
    for(;;){
      if(g.gemTaken>=g.gemRubies){if(!times)note(ctx,p,`The ${PNAME[16]} is sold out.`);break;}
      const price=gemPrice(g);
      if(p.lira<price){if(!times)note(ctx,p,`A ${W.ruby} costs ${L(price)} here.`);break;}
      if(times===0){if(!await decide(ctx,p,'confirm',{key:'gem',title:PNAME[16],text:`Buy a ${W.ruby} for ${L(price)}?`,yes:`Pay ${L(price)}`}))break;}
      else{if(!cardOK(ctx,p,'dGem')||!await decide(ctx,p,'confirm',{key:'dGem',title:CARD_DEFS.dGem.name,text:`Play your ${W.card} to buy another ${W.ruby} for ${L(price)}?`,yes:'Play card'}))break;useCard(g,p,'dGem');}
      p.lira-=price;g.gemTaken++;gainRuby(ctx,p,PNAME[16]);times++;
    }
    break;}
  case 17:{
    const used={};let got=0;
    for(let k=0;k<3;k++){
      const opts=[];
      if(!used.lira&&p.lira>=2)opts.push('lira');
      if(!used.good&&totalGoods(p)>0)opts.push('good');
      if(!used.card&&(p.cards.length||(p.guild&&p.guild.length)))opts.push('card');
      if(!opts.length)break;
      const ch=await decide(ctx,p,'roast',{opts,got});
      if(!ch)break;used[ch]=1;
      if(ch==='lira')p.lira-=2;
      else if(ch==='good'){const c=await decide(ctx,p,'pickGood',{key:'roastPay',title:PNAME[17],text:'Pay 1 good.',options:GOODS.filter(c=>p.goods[c]>0)});p.goods[c]--;}
      else{let kind=p.cards.length?'bonus':'guild';if(p.cards.length&&p.guild&&p.guild.length)kind=await decide(ctx,p,'discardKind',{title:PNAME[17]});
        if(kind==='guild'){const i=await decide(ctx,p,'discardGuild',{title:`${PNAME[17]}: give up a ${W.guildCard}`});const[c]=p.guild.splice(i,1);g.guildDiscard.push(c);}
        else{const i=await decide(ctx,p,'discardCard',{title:`${PNAME[17]}: give up a ${W.card}`});const[c]=p.cards.splice(i,1);g.discard.push(c);}}
      p.coffee+=2;got+=2;
    }
    log(ctx,got?`${p.name} gets ${TEA(got)} at the ${PNAME[17]}.`:`${p.name} takes nothing at the ${PNAME[17]}.`,p);
    break;}
  case 18:{
    p.coffee++;for(let k=0;k<2;k++){const c=drawGuild(g);if(c)p.guild.push(c);}
    log(ctx,`${p.name} takes ${TEA(1)} and draws 2 ${W.guildCards}.`,p);
    if(p.guild.length){const i=await decide(ctx,p,'discardGuild',{title:`${PNAME[18]}: discard 1 ${W.guildCard}`});const[c]=p.guild.splice(i,1);g.guildDiscard.push(c);}
    break;}
  case 19:await snugAction(ctx,p,1,0);break;
  case 20:{
    let times=0;
    for(;;){
      if(g.chTaken>=g.chRubies){if(!times)note(ctx,p,`The ${PNAME[20]} has no ${W.rubies} left.`);break;}
      const cost=chCost(g);
      if(p.coffee<cost){if(!times)note(ctx,p,`A ${W.ruby} costs ${TEA(cost)} here.`);break;}
      if(times===0){if(!await decide(ctx,p,'confirm',{key:'ch',title:PNAME[20],text:`Deliver ${TEA(cost)} for a ${W.ruby}?`,yes:`Deliver ${TEA(cost)}`}))break;}
      else{if(!cardOK(ctx,p,'dCH')||!await decide(ctx,p,'confirm',{key:'dCH',title:CARD_DEFS.dCH.name,text:`Play your ${W.card} to deliver ${TEA(cost)} for another ${W.ruby}?`,yes:'Play card'}))break;useCard(g,p,'dCH');}
      p.coffee-=cost;g.chTaken++;gainRuby(ctx,p,PNAME[20]);times++;
    }
    break;}
  }
}
/* ---------- Gutterlane Snug / Tavern ---------- */
const BRIBE_PLACES=[13,16,20];
function bribeRubyPlaces(g){return BRIBE_PLACES.filter(pl=>pl===13?g.envoyTaken<g.envoyRubies:pl===16?g.gemTaken<g.gemRubies:g.chTaken<g.chRubies);}
function canPayGoods(p,list){const n={r:0,g:0,y:0,b:0};list.forEach(c=>n[c]++);return GOODS.every(c=>p.goods[c]>=n[c]);}
function snugOptions(g,p){
  const o=[{k:'barrier',cost:2}];
  if(!p.tt.m&&g.tt.m.length)o.push({k:'tm',cost:g.tt.m[0]});
  if(!p.tt.e&&g.tt.e.length)o.push({k:'te',cost:g.tt.e[0]});
  if(bribeRubyPlaces(g).length&&canPayGoods(p,BRIBE_SIDES[g.bribe]))o.push({k:'bribe',cost:4});
  return o;
}
async function snugAction(ctx,p,times,discount){
  const g=ctx.G;let disc=discount,done=0;const used={};
  while(done<times){
    const opts=snugOptions(g,p).filter(o=>!used[o.k]&&p.coffee>=Math.max(0,o.cost-disc)).map(o=>({...o,pay:Math.max(0,o.cost-disc)}));
    if(!opts.length){if(!done)note(ctx,p,`You need more ${W.coffee} at the ${PNAME[19]}.`);break;}
    const k=await decide(ctx,p,'snug',{opts,n:done,times});
    if(!k)break;
    const o=opts.find(x=>x.k===k);p.coffee-=o.pay;disc=Math.max(0,disc-o.cost);used[k]=1;done++;
    if(k==='tm'||k==='te'){const t=k==='tm'?'m':'e';g.tt[t].shift();p.tt[t]=1;log(ctx,`${p.name} pays ${TEA(o.pay)} for the ${t==='m'?W.moveTile:W.encTile}.`,p);}
    else if(k==='bribe'){
      BRIBE_SIDES[g.bribe].forEach(c=>p.goods[c]--);
      const pl=await decide(ctx,p,'bribeRuby',{options:bribeRubyPlaces(g)});
      if(pl===13)g.envoyTaken++;else if(pl===16)g.gemTaken++;else g.chTaken++;
      g.bribe^=1;log(ctx,`${p.name} pays ${TEA(o.pay)} and goods at the ${PNAME[19]}.`,p);gainRuby(ctx,p,PNAME[pl]);
    }
    else await placeBarrier(ctx,p,o.pay);
  }
}
async function placeBarrier(ctx,p,paid){
  const g=ctx.G;
  const a=await decide(ctx,p,'policeTarget',{options:g.layout.filter(x=>x!==19),title:`Place the ${W.barrier}`,text:`Choose the place whose action you'll take. The ${W.barrier} goes on one of its edges, and only you may cross it. No encounters.`});
  if(a==null){p.coffee+=paid;return;}
  const b=await decide(ctx,p,'barrierSide',{options:neighbours(g,a),a});
  g.barrier=[a,b];g.barrierOwner=p.i;
  log(ctx,`${p.name} puts up the ${W.barrier} between the ${PNAME[a]} and the ${PNAME[b]}.`,p);
  await doAction(ctx,p,a);
}

/* ---------- guild cards ---------- */
function guildName(n){
  if(T.guildNames&&T.guildNames[n])return T.guildNames[n];
  return {1:`Free ${W.ext}`,2:`${GNAME.r} haul`,3:`${GNAME.g} haul`,4:`${GNAME.y} haul`,5:'Grand delivery',6:'Favours owed',7:'Home early',8:'Lucky find',9:'Big night',10:'Bulk sale',11:'Fine sale',12:'Errand',13:'Tribute',14:`${SHORT[14]} favour`,15:`${SHORT[15]} favour`,16:"Collector's deal",17:`Sack of ${W.coffee}`,18:'Guild contacts',19:'Backroom deal',20:`Half-price ${W.ruby}`}[n];
}
function guildText(n){
  const fill=c=>`Fill your ${GNAME[c]} to capacity, then take up to 3 different goods (no ${W.coffee}).`;
  return {1:`Take a free ${W.ext} from the ${PNAME[1]}.`,2:fill('r'),3:fill('g'),4:fill('y'),
    5:`Take ${L(4)} and up to 4 different goods (no ${W.coffee}).`,
    6:`Draw 3 ${W.cards}.`,
    7:`Bring your ${W.merchant} and all your ${W.assistants} to the ${PNAME[7]}, then take another turn.`,
    8:`Take 2 ${GNAME.r}, 2 ${GNAME.y} or 2 ${GNAME.g}. Then roll: 4–6 gives 1 ${GNAME.b}, 7–12 gives 3.`,
    9:`Take the ${PNAME[9]} action and double what you win.`,
    10:`Pay 1 ${GNAME.r}, 1 ${GNAME.g} and 1 ${GNAME.y} for ${L(15)}.`,
    11:`Pay 1 ${GNAME.b}, 1 ${GNAME.r} and 1 ${GNAME.g} for ${L(20)}.`,
    12:`Take any place's action. If you can, your ${W.family} then goes back to the ${PNAME[12]} (no reward).`,
    13:`Pay any 6 goods (no ${W.coffee}) for the next ${W.ruby} at the ${PNAME[13]}.`,
    14:`Take a ${W.tile} you don't own from the ${PNAME[14]}, paying just 1 of its good.`,
    15:`Take a ${W.tile} you don't own from the ${PNAME[15]}, paying just 1 of its good.`,
    16:`Pay ${L(15)} for the next ${W.ruby} at the ${PNAME[16]}, then take ${TEA(1)} for each ${W.ruby} you hold.`,
    17:`Take ${TEA(5)}.`,
    18:`Take ${TEA(1)} and draw 2 ${W.guildCards}.`,
    19:`Take 1 or 2 ${PNAME[19]} actions, paying ${TEA(1)} less in total.`,
    20:`Take the next ${W.ruby} at the ${PNAME[20]} for half its price, rounded up.`}[n];
}
const GUILD_VAL={1:6,2:5,3:5,4:5,5:8,6:6,7:5,8:6,9:5,10:6,11:7,12:7,13:9,14:7,15:7,16:9,17:7,18:5,19:6,20:9};
function lodgeGuildOpts(g,p,pl){return LODGE[pl].filter(c=>!p.tiles[c]&&g.lodge[c].length&&p.goods[c]>=1);}
function guildPlayable(g,p,n){
  switch(n){
  case 1:return p.ext<3;
  case 10:return p.goods.r>0&&p.goods.g>0&&p.goods.y>0;
  case 11:return p.goods.b>0&&p.goods.r>0&&p.goods.g>0;
  case 13:return totalGoods(p)>=6&&g.envoyTaken<g.envoyRubies;
  case 14:case 15:return lodgeGuildOpts(g,p,n).length>0;
  case 16:return p.lira>=15&&g.gemTaken<g.gemRubies;
  case 19:return snugOptions(g,p).some(o=>p.coffee>=Math.max(0,o.cost-1));
  case 20:return g.chTaken<g.chRubies&&p.coffee>=Math.ceil(chCost(g)/2);
  default:return true;
  }
}
async function takeDifferentGoods(ctx,p,max,title){
  const got=[];
  for(let k=0;k<max;k++){
    const room=GOODS.filter(c=>!got.includes(c)&&p.goods[c]<cap(p));if(!room.length)break;
    const c=await decide(ctx,p,'pickGood',{key:'guildGood',title,text:`Take a different good (${k+1} of up to ${max}).`,options:room,allowSkip:true});
    if(!c)break;p.goods[c]++;got.push(c);
  }
  return got;
}
async function playGuild(ctx,p,n){
  const g=ctx.G;const i=p.guild.indexOf(n);if(i<0)return null;
  p.guild.splice(i,1);g.guildDiscard.push(n);
  log(ctx,`${p.name} plays the ${W.guildCard} “${guildName(n)}”.`,p);
  const gc={...ctx,noCards:true};
  switch(n){
  case 1:p.ext++;log(ctx,`${p.name} extends the ${W.cart} (${cap(p)} per good).`,p);if(p.ext===3&&g.wainRubies>0){g.wainRubies--;gainRuby(ctx,p,PNAME[1]);}break;
  case 2:case 3:case 4:{const c={2:'r',3:'g',4:'y'}[n];p.goods[c]=cap(p);const got=await takeDifferentGoods(gc,p,3,guildName(n));log(ctx,`${p.name} fills up on ${GNAME[c]}${got.length?` and takes ${got.map(x=>GNAME[x]).join(', ')}`:''}.`,p);break;}
  case 5:{p.lira+=4;const got=GOODS.filter(c=>p.goods[c]<cap(p));got.forEach(c=>p.goods[c]++);log(ctx,`${p.name} takes ${L(4)}${got.length?` and ${got.map(x=>GNAME[x]).join(', ')}`:''}.`,p);break;}
  case 6:{for(let k=0;k<3;k++){const c=drawCard(g);if(c)p.cards.push(c);}log(ctx,`${p.name} draws 3 ${W.cards}.`,p);break;}
  case 7:{let k=0;for(const x in p.assist)k+=p.assist[x];p.stack+=k;p.assist={};p.pos=7;log(ctx,`${p.name} heads to the ${PNAME[7]} with every ${W.assistant}, and takes another turn.`,p);return 'again';}
  case 8:{const c=await decide(ctx,p,'pickGood',{key:'guild8',title:guildName(8),text:'Take 2 of one good.',options:['r','y','g']});
    p.goods[c]=Math.min(cap(p),p.goods[c]+2);const d=roll2();setRoll(ctx,p,d,'guild8',null);const s2=d[0]+d[1];const blue=s2>=7?3:s2>=4?1:0;const add=Math.min(blue,cap(p)-p.goods.b);p.goods.b+=add;
    log(ctx,`${p.name} takes 2 ${GNAME[c]}, rolls ${s2} and gains ${add} ${GNAME.b}.`,p);await sleep(ctx,900);break;}
  case 9:{const t=await decide(ctx,p,'pickNumber',{});const d=roll2();setRoll(ctx,p,d,'tea',t,'Winnings doubled');const s2=d[0]+d[1];const gain=2*(s2>=t?t:2);p.lira+=gain;
    log(ctx,`${p.name} announces ${t}, rolls ${s2} and takes ${L(gain)}.`,p);await sleep(ctx,900);break;}
  case 10:p.goods.r--;p.goods.g--;p.goods.y--;p.lira+=15;stat(p,'sold',15);log(ctx,`${p.name} sells 3 goods for ${L(15)}.`,p);break;
  case 11:p.goods.b--;p.goods.r--;p.goods.g--;p.lira+=20;stat(p,'sold',20);log(ctx,`${p.name} sells 3 goods for ${L(20)}.`,p);break;
  case 12:{const t=await decide(gc,p,'policeTarget',{options:g.layout.filter(x=>x!==12),title:guildName(12),text:"Choose any place and take its action. No assistant needed and no encounters."});
    if(t!=null){log(ctx,`${p.name} takes the ${PNAME[t]} action.`,p);await doAction(gc,p,t);}
    if(p.family!==12){p.family=12;log(ctx,`${p.name}'s ${W.family} goes back to the ${PNAME[12]}.`,p);}break;}
  case 13:{const sel=await decide(ctx,p,'payGoods',{n:6,title:guildName(13)});GOODS.forEach(c=>p.goods[c]-=sel[c]);g.envoyTaken++;gainRuby(ctx,p,PNAME[13]);break;}
  case 14:case 15:{const c=await decide(ctx,p,'lodgeColor',{options:lodgeGuildOpts(g,p,n),cheap:true});const cols=LODGE[n];
    g.lodge[c].shift();p.goods[c]--;p.tiles[c]=1;log(ctx,`${p.name} claims the ${GNAME[c]} ${W.tile}.`,p);
    if(c==='b'){p.stack++;log(ctx,`${p.name} gains a 5th ${W.assistant}.`,p);}
    if(cols.every(x=>p.tiles[x])&&g.lodgeRubies[n]>0){g.lodgeRubies[n]--;gainRuby(ctx,p,PNAME[n]);}break;}
  case 16:p.lira-=15;g.gemTaken++;gainRuby(ctx,p,PNAME[16]);p.coffee+=p.rubies;log(ctx,`${p.name} takes ${TEA(p.rubies)}.`,p);break;
  case 17:p.coffee+=5;log(ctx,`${p.name} takes ${TEA(5)}.`,p);break;
  case 18:{p.coffee++;for(let k=0;k<2;k++){const c=drawGuild(g);if(c)p.guild.push(c);}log(ctx,`${p.name} takes ${TEA(1)} and draws 2 ${W.guildCards}.`,p);break;}
  case 19:await snugAction(gc,p,2,1);break;
  case 20:{const cost=Math.ceil(chCost(g)/2);p.coffee-=cost;g.chTaken++;log(ctx,`${p.name} pays ${TEA(cost)}.`,p);gainRuby(ctx,p,PNAME[20]);break;}
  }
  return 'done';
}

/* expansion bonus cards that are played on your turn (shared by players and the AI) */
async function playExpCard(ctx,p,t){
  const g=ctx.G;
  if(t==='tea2'){useCard(g,p,t);p.coffee+=2;log(ctx,`${p.name} plays “${CARD_DEFS[t].name}” for ${TEA(2)}.`,p);return true;}
  if(t==='gcard'){if(p.coffee<2)return false;useCard(g,p,t);p.coffee-=2;const c=drawGuild(g);if(c)p.guild.push(c);log(ctx,`${p.name} plays “${CARD_DEFS[t].name}” and draws a ${W.guildCard}.`,p);return true;}
  if(t==='tea8'){if(p.coffee<1)return false;useCard(g,p,t);p.coffee--;p.lira+=8;log(ctx,`${p.name} plays “${CARD_DEFS[t].name}”: ${TEA(1)} for ${L(8)}.`,p);return true;}
  if(t==='diceGift'){useCard(g,p,t);const d=roll2();setRoll(ctx,p,d,'gift',null);const got=[];
    d.forEach(v=>{const r=DICE_GIFT[v];if(r==='lira'){p.lira+=2;got.push(L(2));}else if(r==='coffee'){p.coffee++;got.push(TEA(1));}else if(p.goods[r]<cap(p)){p.goods[r]++;got.push(GNAME[r]);}});
    log(ctx,`${p.name} plays “${CARD_DEFS[t].name}”, rolls ${d[0]} and ${d[1]}: ${got.join(', ')||'nothing fits'}.`,p);return true;}
  if(t==='swap3'){
    let n=0;const kinds=[...GOODS,'coffee'];const has=k=>k==='coffee'?p.coffee>0:p.goods[k]>0;const room=k=>k==='coffee'||p.goods[k]<cap(p);
    while(n<3){
      const give=await decide(ctx,p,'swapGive',{options:kinds.filter(has),n});if(!give)break;
      const take=await decide(ctx,p,'swapTake',{options:kinds.filter(k=>k!==give&&room(k)),give});if(!take)break;
      if(give==='coffee')p.coffee--;else p.goods[give]--;if(take==='coffee')p.coffee++;else p.goods[take]++;n++;
    }
    if(!n)return false;useCard(g,p,t);log(ctx,`${p.name} plays “${CARD_DEFS[t].name}” and exchanges ${n}.`,p);return true;}
  return false;
}

/* ---------- decisions ---------- */
async function decide(ctx,p,kind,d={}){
  if(ctx.sim||p.ai)return aiDecide(ctx,p,kind,d);
  const r=await humanDecide(ctx,p,kind,d);checkGen(ctx);return r;
}
function need(g,p){
  const s={r:0,g:0,y:0,b:0};
  if(g.envoyTaken<g.envoyRubies){const cnt={r:0,g:0,y:0,b:0};envoyReq(g).forEach(x=>{if(x!=='*')cnt[x]++;});GOODS.forEach(c=>{if(p.goods[c]<cnt[c])s[c]+=3*(cnt[c]-p.goods[c]);});}
  [14,15].forEach(pl=>LODGE[pl].forEach(c=>{if(!p.tiles[c]&&g.lodge[c].length&&p.goods[c]<g.lodge[c][0])s[c]+=2;}));
  GOODS.forEach(c=>{if(c==='b')s[c]+=.5;if(p.goods[c]>=cap(p))s[c]=-99;});
  return s;
}
const bestGood=(g,p,opts)=>{const s=need(g,p);return opts.slice().sort((a,b)=>s[b]-s[a]||p.goods[a]-p.goods[b])[0];};
const spareGood=(g,p,opts)=>{const s=need(g,p);return opts.slice().sort((a,b)=>(p.goods[b]-p.goods[a])||(s[a]-s[b]))[0];};
const CARD_VAL={gcard:5,lira5:9,good:8,family:6,move34:5,dGem:4,dEnvoy:4,recall:4,dPost:4,smAny:3,stay:2,tea2:6,tea8:6,diceGift:6,swap3:2,six:3,corner:4,dWain:3,dCH:4};
const worstCard=p=>{let bi=0;p.cards.forEach((c,i)=>{if(CARD_VAL[c]<CARD_VAL[p.cards[bi]])bi=i;});return bi;};

async function aiDecide(ctx,p,kind,d){
  const g=ctx.G;
  switch(kind){
  case 'confirm':
    if(d.key==='gov')return p.lira>=5||p.cards.length>=1;
    if(d.key==='smug')return p.lira>=5||totalGoods(p)>=3;
    if(d.key==='trader')return g.chTaken<g.chRubies&&(p.lira>=5||totalGoods(p)>=4);
    return true;
  case 'pickGood':
    if(d.key==='green'&&p.lira<4)return null;
    if(d.key==='envoyAny')return spareGood(g,p,d.options);
    return bestGood(g,p,d.options);
  case 'pickNumber':{const l=lvlOf(p);if(l==='easy')return 4+rnd(6);if(l==='hard')return p.tiles.r?8:7;return p.tiles.r?8:6;}
  case 'dice':{const s=d.dice[0]+d.dice[1],lo=Math.min(...d.dice),four=s-lo+4;
    if(d.purpose==='tea'){if(s>=d.target)return 'keep';if(lo<4&&four>=d.target)return 'four';return 'reroll';}
    const br=x=>x>=11?3:x>=9?2:x>=7?1:0;
    if(lo<4&&br(four)>br(s))return 'four';if(br(s)===0)return 'reroll';return 'keep';}
  case 'sell':{const sel={r:0,g:0,y:0,b:0};
    if(d.any){let left=5;GOODS.slice().sort((a,b)=>p.goods[b]-p.goods[a]).forEach(c=>{const k=Math.min(left,p.goods[c]);sel[c]=k;left-=k;});}
    else{const t=tileCount(d.tile);GOODS.forEach(c=>sel[c]=Math.min(t[c],p.goods[c]));}
    return sel;}
  case 'cardSource':return(d.top==='lira5'||d.top==='good')?'discard':'deck';
  case 'discardCard':return worstCard(p);
  case 'lodgeColor':return['b','y','r','g'].find(c=>d.options.includes(c));
  case 'policeTarget':{
    const depth=ctx.depth||0;
    if(depth>=2)return d.options.includes(16)&&p.lira>=gemPrice(g)?16:3;
    let best=null,bv=-1e9;
    for(const t of d.options){const C=clone(g);const q=C.players[p.i];q.family=t;await doAction({G:C,sim:true,depth:depth+1},q,t);const v=evalPlayer(C,q);if(v>bv){bv=v;best=t;}}
    return best;}
  case 'familyReward':return 'lira';
  case 'govPay':return p.lira>=4?'lira':worstCard(p);
  case 'roast':{
    if(g.chTaken>=g.chRubies)return null;
    if(d.opts.includes('card')&&p.cards.length&&CARD_VAL[p.cards[worstCard(p)]]<=4)return 'card';
    if(d.opts.includes('lira')&&p.lira>=5)return 'lira';
    if(d.opts.includes('good')&&totalGoods(p)>=4)return 'good';
    return d.got?null:(d.opts.includes('lira')?'lira':d.opts[0]);}
  case 'six':{const s=d.dice[0]+d.dice[1],lo=Math.min(...d.dice),six=s-lo+6;
    if(d.purpose==='tea')return s<d.target&&six>=d.target;
    const br=x=>x>=11?3:x>=9?2:x>=7?1:0;return br(six)>br(s);}
  case 'swapGive':case 'swapTake':return null;
  case 'discardGuild':{let bi=0,bv=1e9;p.guild.forEach((c,i)=>{const v=GUILD_VAL[c]+(guildPlayable(g,p,c)?3:0);if(v<bv){bv=v;bi=i;}});return bi;}
  case 'discardKind':return p.cards.length&&CARD_VAL[p.cards[worstCard(p)]]<=4?'bonus':(p.guild.length?'guild':'bonus');
  case 'payGoods':{const sel={r:0,g:0,y:0,b:0};let left=d.n;while(left>0){const c=GOODS.slice().sort((a,b)=>(p.goods[b]-sel[b])-(p.goods[a]-sel[a])||(a==='b')-(b==='b'))[0];sel[c]++;left--;}return sel;}
  case 'snug':{const has=k=>d.opts.some(o=>o.k===k);
    if(has('bribe'))return 'bribe';
    if(has('tm')&&p.coffee>=d.opts.find(o=>o.k==='tm').pay+1)return 'tm';
    if(has('te')&&(d.opts.find(o=>o.k==='te').pay<=2))return 'te';
    if(has('barrier')&&(d.n>0||g.chTaken>=g.chRubies||p.coffee>=chCost(g)+2))return 'barrier';
    return d.n>0?null:(d.opts[0]&&d.opts[0].k==='barrier'&&p.coffee>=4?'barrier':null);}
  case 'barrierSide':{const opp=g.players.filter(q=>q!==p).map(q=>q.pos);return d.options.find(x=>opp.includes(x))||d.options[0];}
  case 'bribeRuby':return [16,13,20].find(x=>d.options.includes(x));
  case 'smugPay':{if(p.lira>=6)return 'lira';const opts=GOODS.filter(c=>p.goods[c]>0);if(!opts.length)return 'lira';return spareGood(g,p,opts);}
  }
}

function evalPlayer(g,p){
  let v=p.rubies*70+Math.min(p.lira,30)+Math.max(0,p.lira-30)*.3+p.cards.length*3+[0,15,32,40][p.ext];
  const cp=cap(p);
  GOODS.forEach(c=>v+=Math.min(p.goods[c],cp)*(c==='b'?3.2:2.4));
  v+=(p.tiles.r?13:0)+(p.tiles.g?11:0)+(p.tiles.y?15:0)+(p.tiles.b?11:0);
  v+=p.stack*3;
  if(p.stack===0){v-=8;if([7,...Object.keys(p.assist).map(Number)].some(pl=>dist(g,p.pos,pl)<=2))v+=5;}
  if(g.envoyTaken<g.envoyRubies){const req=envoyReq(g);const nd={r:0,g:0,y:0,b:0};let any=0;req.forEach(x=>x==='*'?any++:nd[x]++);
    let have=0;GOODS.forEach(c=>have+=Math.min(p.goods[c],nd[c]));const extra=GOODS.reduce((s,c)=>s+Math.max(0,p.goods[c]-nd[c]),0);have+=Math.min(any,extra);
    const f=have/req.length;v+=14*f*f;}
  if(g.gemTaken<g.gemRubies){const f=Math.min(1,p.lira/gemPrice(g));v+=10*f*f;}
  [14,15].forEach(pl=>LODGE[pl].forEach(c=>{if(!p.tiles[c]&&g.lodge[c].length){const f=Math.min(1,p.goods[c]/g.lodge[c][0]);v+=6*f*f;}}));
  if(p.ext<3)v+=Math.min(1,p.lira/7)*4;
  if(g.x){v+=(p.guild?p.guild.length:0)*4+(p.tt&&p.tt.m?10:0)+(p.tt&&p.tt.e?6:0);}
  if(g.x){if(g.chTaken<g.chRubies){const f=Math.min(1,p.coffee/chCost(g));v+=Math.min(p.coffee,chCost(g))*2+22*f*f;}else v+=p.coffee;}
  return v;
}

async function simulate(g,pi,target,mode){
  const C=clone(g);const p=C.players[pi];if(mode!=='normal')useCard(C,p,mode);
  SIMN++;try{await resolveMove({G:C,sim:true,depth:1},target,mode);}finally{SIMN--;}
  return evalPlayer(C,p);
}
async function rankMoves(g,p,modes,look){
  const cands=[];modes.forEach(m=>reachable(g,p,m).forEach(t=>cands.push({t,mode:m,pen:m==='normal'||m==='line'?0:5})));
  for(const c of cands){const runs=[8,9,12].includes(c.t)?3:1;let v=0;for(let r=0;r<runs;r++)v+=await simulate(g,p.i,c.t,c.mode);c.v=v/runs-c.pen+Math.random()*.6;}
  cands.sort((a,b)=>b.v-a.v);
  if(look&&cands.length>1){ // Hard: for the best few moves, also weigh the best move that would follow
    const top=cands.slice(0,5);
    for(const c of top){
      const C=clone(g),q=C.players[p.i];if(c.mode!=='normal'&&c.mode!=='line')useCard(C,q,c.mode);
      SIMN++;try{await resolveMove({G:C,sim:true,depth:1},c.t,c.mode);}finally{SIMN--;}
      q.yellowUsed=false;
      const nx=(await rankMoves(C,q,['normal']))[0];
      c.v2=nx?.4*c.v+.6*nx.v:c.v;
    }
    top.sort((a,b)=>b.v2-a.v2);return [...top,...cands.slice(5)];
  }
  return cands;
}

async function aiTurn(ctx){
  const g=ctx.G,p=cur(g);
  if(g.tut&&TUT&&TUT.ai&&TUT.ai.length){const t=TUT.ai.shift();UI.sel=t;render();await sleep(ctx,550);await resolveMove(ctx,t,'normal');return;} // scripted rival moves in the tutorial
  while(hasCard(p,'lira5')){useCard(g,p,'lira5');p.lira+=5;log(ctx,`${p.name} plays “${CARD_DEFS.lira5.name}”.`,p);}
  if(hasCard(p,'family')&&p.family!==12){useCard(g,p,'family');p.family=12;p.lira+=3;log(ctx,`${p.name} calls the ${W.family} home and takes ${L(3)}.`,p);}
  if(hasCard(p,'good')){const room=GOODS.filter(c=>p.goods[c]<cap(p));if(room.length){const c=bestGood(g,p,room);if(need(g,p)[c]>0){useCard(g,p,'good');p.goods[c]++;log(ctx,`${p.name} plays “${CARD_DEFS.good.name}” for ${GNAME[c]}.`,p);}}}
  if(g.x){
    while(hasCard(p,'tea2'))await playExpCard(ctx,p,'tea2');
    if(hasCard(p,'diceGift'))await playExpCard(ctx,p,'diceGift');
    if(hasCard(p,'gcard')&&p.coffee>=2&&(g.chTaken>=g.chRubies||p.coffee-2>=chCost(g)||p.coffee>=6))await playExpCard(ctx,p,'gcard');
    if(hasCard(p,'tea8')&&p.coffee>0&&(g.chTaken>=g.chRubies||p.coffee>chCost(g)||p.coffee<2))await playExpCard(ctx,p,'tea8');
  }
  const out=Object.keys(p.assist).map(Number);
  if(p.stack===0&&out.length){
    const far=out.sort((a,b)=>dist(g,p.pos,b)-dist(g,p.pos,a))[0];
    if(p.tiles.y&&p.lira>=2&&!p.yellowUsed){p.lira-=2;p.yellowUsed=true;recallFrom(p,far);log(ctx,`${p.name} pays ${L(2)} to bring an ${W.assistant} home.`,p);}
    else if(hasCard(p,'recall')){useCard(g,p,'recall');recallFrom(p,far);log(ctx,`${p.name} plays “${CARD_DEFS.recall.name}”.`,p);}
  }
  const modes=['normal'];if(hasCard(p,'move34'))modes.push('move34');if(hasCard(p,'corner'))modes.push('corner');if(p.tt&&p.tt.m)modes.push('line');
  const lvl=lvlOf(p);
  const ranked=await rankMoves(g,p,modes,lvl==='hard');
  let best=ranked[0];
  if(lvl==='easy'&&ranked.length>1){ // Easy: often settles for a decent move rather than the best one
    const w=[.4,.25,.2,.15],pool=ranked.slice(0,4);let r=Math.random()*w.slice(0,pool.length).reduce((a,b)=>a+b,0);
    for(let k=0;k<pool.length;k++){r-=w[k];if(r<=0){best=pool[k];break;}}}
  checkGen(ctx);
  if(g.x&&p.guild&&p.guild.length&&!(lvl==='easy'&&Math.random()<.4)){
    let gb=null,gv=-1e9;
    for(const n of [...new Set(p.guild)]){
      if(!guildPlayable(g,p,n))continue;
      const C=clone(g),q=C.players[p.i];const r=await playGuild({G:C,sim:true,depth:1},q,n);
      let v=evalPlayer(C,q);if(r==='again'){const nx=(await rankMoves(C,q,['normal']))[0];if(nx)v=nx.v;}
      if(v>gv){gv=v;gb=n;}
    }
    checkGen(ctx);
    if(gb!=null&&gv>best.v+3){const r=await playGuild(ctx,p,gb);checkGen(ctx);render();await sleep(ctx,700);if(r==='again')await aiTurn(ctx);return;}
  }
  if(best.mode==='line')log(ctx,`${p.name} uses the ${W.moveTile}.`,p);
  else if(best.mode!=='normal'){useCard(g,p,best.mode);log(ctx,`${p.name} plays “${CARD_DEFS[best.mode].name}”.`,p);}
  UI.sel=best.t;render();await sleep(ctx,550);
  await resolveMove(ctx,best.t,best.mode);
}
function recallFrom(p,pl){p.assist[pl]--;if(p.assist[pl]<=0)delete p.assist[pl];p.stack++;}

/* ---------- human decision sheets ---------- */
function sheet(title,body,buttons,opt={}){
  return new Promise(res=>{
    const w=$('#sheetWrap'),s=$('#sheet');
    s.className=opt.wide?'wide':'';
    s.innerHTML=`<h2>${title}</h2><div class="sbody">${body}</div><div class="sbtns ${opt.grid?'grid':''}">${buttons.map((b,i)=>`<button class="btn ${b.primary?'primary':''} ${b.cls||''}" data-i="${i}" ${b.disabled?'disabled':''}>${b.label}</button>`).join('')}</div>`;
    w.hidden=false;
    s.querySelectorAll('.sbtns button').forEach(btn=>btn.onclick=()=>{w.hidden=true;res(buttons[+btn.dataset.i].value);});
    const f=s.querySelector('.sbtns button');if(f)f.focus({preventScroll:true});
  });
}
function sellSheet(p,d){
  return new Promise(res=>{
    const w=$('#sheetWrap'),s=$('#sheet');s.className='';const t=tileCount(d.tile);const sel={r:0,g:0,y:0,b:0};
    const goods=d.any?GOODS:GOODS.filter(c=>t[c]>0);
    const max=c=>d.any?p.goods[c]:Math.min(t[c],p.goods[c]);
    const tot=()=>GOODS.reduce((a,c)=>a+sel[c],0);
    const fill=()=>{GOODS.forEach(c=>sel[c]=0);let left=5;goods.slice().sort((a,b)=>max(b)-max(a)).forEach(c=>{const k=Math.min(left,max(c));sel[c]=k;left-=k;});};
    fill();
    const draw=()=>{const n=tot();
      s.innerHTML=`<h2>${PNAME[d.place]}</h2><div class="sbody"><p>Demand: <span class="chips">${d.tile.map(chip).join('')}</span>${d.any?` · ${CARD_DEFS.smAny.name}: sell any types.`:''}</p>
      ${goods.map(c=>`<div class="srow"><span>${chip(c)} ${GNAME[c]} <small class="muted">have ${p.goods[c]}${d.any?'':`, wanted ${t[c]}`}</small></span>
      <button class="btn" data-c="${c}" data-d="-1" ${sel[c]<=0?'disabled':''} aria-label="Sell one fewer ${GNAME[c]}">−</button><output>${sel[c]}</output>
      <button class="btn" data-c="${c}" data-d="1" ${sel[c]>=max(c)||n>=5?'disabled':''} aria-label="Sell one more ${GNAME[c]}">+</button></div>`).join('')}
      <div class="total">${n} ${plural(n,'good','goods')} → ${L(d.rev[n])}</div></div>
      <div class="sbtns"><button class="btn primary" data-act="sell">${n?`Sell for ${L(d.rev[n])}`:'Sell nothing'}</button><button class="btn" data-act="none">Clear</button></div>`;
      s.querySelectorAll('[data-c]').forEach(b=>b.onclick=()=>{sel[b.dataset.c]+=+b.dataset.d;draw();});
      s.querySelector('[data-act=none]').onclick=()=>{GOODS.forEach(c=>sel[c]=0);draw();};
      s.querySelector('[data-act=sell]').onclick=()=>{w.hidden=true;res({...sel});};
    };
    draw();w.hidden=false;
  });
}
function payGoodsSheet(p,d){
  return new Promise(res=>{
    const w=$('#sheetWrap'),s=$('#sheet');s.className='';const sel={r:0,g:0,y:0,b:0};let left=d.n;
    GOODS.slice().sort((a,b)=>p.goods[b]-p.goods[a]).forEach(c=>{const k=Math.min(left,p.goods[c]);sel[c]=k;left-=k;});
    const tot=()=>GOODS.reduce((a,c)=>a+sel[c],0);
    const draw=()=>{const n=tot();
      s.innerHTML=`<h2>${d.title}</h2><div class="sbody"><p>Choose ${d.n} goods to pay.</p>
      ${GOODS.map(c=>`<div class="srow"><span>${chip(c)} ${GNAME[c]} <small class="muted">have ${p.goods[c]}</small></span>
      <button class="btn" data-c="${c}" data-d="-1" ${sel[c]<=0?'disabled':''}>−</button><output>${sel[c]}</output>
      <button class="btn" data-c="${c}" data-d="1" ${sel[c]>=p.goods[c]||n>=d.n?'disabled':''}>+</button></div>`).join('')}
      <div class="total">${n} of ${d.n}</div></div><div class="sbtns"><button class="btn primary" data-act="ok" ${n!==d.n?'disabled':''}>Pay</button></div>`;
      s.querySelectorAll('[data-c]').forEach(b=>b.onclick=()=>{sel[b.dataset.c]+=+b.dataset.d;draw();});
      s.querySelector('[data-act=ok]').onclick=()=>{w.hidden=true;res({...sel});};
    };
    draw();w.hidden=false;
  });
}
const TT_TEXT=t=>t==='m'?`Instead of moving 1 or 2 places, move any number of places in a straight line (never through the ${W.barrier}).`:`${NSC('gov')}, ${NS('smug')} and ${NS('trader')} no longer charge you anything.`;
const dieFace=n=>`<span class="die" data-v="${n}">${[...Array(9)].map((_,i)=>`<i class="${PIPS[n].includes(i)?'on':''}"></i>`).join('')}</span>`;
const PIPS={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
async function humanDecide(ctx,p,kind,d){
  switch(kind){
  case 'confirm':return sheet(d.title,`<p>${d.text}</p>`,[{label:d.yes||'Yes',value:true,primary:true},{label:d.no||'No thanks',value:false}]);
  case 'pickGood':return sheet(d.title,`<p>${d.text}</p>`,[...d.options.map(c=>({label:`${chip(c)} ${GNAME[c]} <small>${p.goods[c]}/${cap(p)}</small>`,value:c})),...(d.allowSkip?[{label:'Skip',value:null}]:[])]);
  case 'pickNumber':{const b=[];for(let n=3;n<=12;n++)b.push({label:`<b>${n}</b><small>${Math.round(probAtLeast(n)*100)}% chance</small>`,value:n,cls:'num'});
    return sheet(PNAME[9],`<p>Announce a number, then roll two dice. Meet or beat it to take that many ${W.cur}; otherwise take 2.</p>`,b,{grid:true});}
  case 'dice':{const[a,b]=d.dice,lo=Math.min(a,b);const btns=[{label:`Keep ${a+b}`,value:'keep',primary:true}];
    if(lo<4)btns.push({label:`Turn the ${lo} into 4 (total ${a+b-lo+4})`,value:'four'});btns.push({label:'Re-roll both',value:'reroll'});
    return sheet(`${GNAME.r} ${W.tile}`,`<div class="dice">${dieFace(a)}${dieFace(b)}</div><p>${d.purpose==='tea'?`You announced ${d.target}.`:`${GNAME.b}: 7–8 gives 1 · 9–10 gives 2 · 11–12 gives 3`}</p>`,btns);}
  case 'sell':return sellSheet(p,d);
  case 'cardSource':return sheet(PNAME[6],`<p>Take ${W.card} ${d.n} of 2.</p>`,[{label:'Draw from the pile',value:'deck',primary:true},{label:`Take “${CARD_DEFS[d.top].name}” from the discards`,value:'discard'}]);
  case 'discardCard':return sheet(d.title||'Discard a card',`<p>Choose a ${W.card} to discard.</p>`,p.cards.map((c,i)=>({label:`${CARD_DEFS[c].name} <small>${CARD_DEFS[c].text}</small>`,value:i})));
  case 'lodgeColor':return sheet(`Claim a ${W.tile}`,'<p>Pay 1 of the shown goods to take the tile.</p>',[...d.options.map(c=>({label:`${chip(c)} ${GNAME[c]} tile <small>${d.cheap?'':`needs ${G.lodge[c][0]} · `}${TILE_ABIL[c]}</small>`,value:c})),...(d.cheap||tutScripted()?[]:[{label:'Skip',value:null}])]);
  case 'discardGuild':return sheet(d.title||`Discard a ${W.guildCard}`,`<p>Choose a ${W.guildCard} to discard.</p>`,p.guild.map((c,i)=>({label:`${guildName(c)} <small>${guildText(c)}</small>`,value:i})));
  case 'discardKind':return sheet(d.title,`<p>Give up a ${W.card} or a ${W.guildCard}?</p>`,[{label:`A ${W.card}`,value:'bonus',primary:true},{label:`A ${W.guildCard}`,value:'guild'}]);
  case 'payGoods':return payGoodsSheet(p,d);
  case 'snug':{const oi=k=>ICON(k)?`<img class="gi" src="${ICON(k)}" alt="" style="width:1.6em;height:1.6em;margin-right:4px">`:'';
    const lab={barrier:`${oi('barricade')}Put up the ${W.barrier} and take a nearby action`,tm:`${oi('gutter-map')}Buy the ${W.moveTile}`,te:`${oi('friends')}Buy the ${W.encTile}`,bribe:`Pay ${BRIBE_SIDES[G.bribe].map(chip).join('')} for a ${W.ruby}`};
    const sub={barrier:'Only you may cross it',tm:TT_TEXT('m'),te:TT_TEXT('e'),bribe:'From the '+bribeRubyPlaces(G).map(x=>SHORT[x]).join(', ')};
    return sheet(PNAME[19],`<p>${d.times>1?`Action ${d.n+1} of up to ${d.times}. `:''}You have ${TEA(p.coffee)}.</p>`,[...d.opts.map(o=>({label:`<b>${lab[o.k]}</b> <span class="cost">${teaIc()}${o.pay}</span><small>${sub[o.k]}</small>`,value:o.k,cls:'opt'})),{label:d.n?'Done':'Skip',value:null}]);}
  case 'barrierSide':return sheet(`Place the ${W.barrier}`,`<p>Which edge of the ${PNAME[d.a]} does the ${W.barrier} go on? Others can't cross between those two places.</p>`,d.options.map(x=>({label:`Between it and the ${PNAME[x]}`,value:x})));
  case 'bribeRuby':return sheet(`Take a ${W.ruby}`,`<p>Take the next ${W.ruby} from:</p>`,d.options.map(x=>({label:PNAME[x],value:x})));
  case 'policeTarget':return sheet(d.title||PNAME[12],`<p>${d.text||`Send your ${W.family} to any place and take that action there. No ${W.assistant} needed and no encounters.`}</p>`,[...d.options.map(pl=>({label:PNAME[pl],value:pl})),{label:'Skip',value:null}],{grid:true});
  case 'familyReward':return sheet(`${W.family[0].toUpperCase()+W.family.slice(1)} caught`,`<p>You sent ${d.name}'s ${W.family} to the ${PNAME[12]}. Choose your reward.</p>`,[{label:`Take ${L(3)}`,value:'lira',primary:true},{label:`Draw a ${W.card}`,value:'card'}]);
  case 'govPay':return sheet(`Pay ${NS('gov')}`,`<p>Pay ${L(2)} or discard a ${W.card}.</p>`,[...(p.lira>=2?[{label:`Pay ${L(2)}`,value:'lira',primary:true}]:[]),...p.cards.map((c,i)=>({label:'Discard “'+CARD_DEFS[c].name+'”',value:i}))]);
  case 'roast':{const lab={lira:`Pay ${L(2)}`,good:'Pay 1 good',card:`Give up a ${W.card}`};
    return sheet(PNAME[17],`<p>${d.got?`You have roasted ${TEA(d.got)} so far. `:''}Each choice, once per visit, gives ${TEA(2)}.</p>`,[...d.opts.map((o,i)=>({label:`${lab[o]} ${teaIc()}+2`,value:o,primary:i===0})),{label:d.got?'Done':'Skip',value:null}]);}
  case 'six':{const[a,b]=d.dice,lo=Math.min(a,b);return sheet(CARD_DEFS.six.name,`<div class="dice">${dieFace(a)}${dieFace(b)}</div><p>Play your ${W.card} to turn the ${lo} into a 6 (total ${a+b-lo+6})?</p>`,[{label:'Play card',value:true,primary:true},{label:'Keep the roll',value:false}]);}
  case 'swapGive':{const nm=k=>k==='coffee'?`${teaIc()} ${W.coffee} <small>${p.coffee}</small>`:`${chip(k)} ${GNAME[k]} <small>${p.goods[k]}/${cap(p)}</small>`;
    return sheet(CARD_DEFS.swap3.name,`<p>Exchange ${d.n+1} of up to 3: what do you give?</p>`,[...d.options.map(k=>({label:nm(k),value:k})),{label:d.n?'Done':'Cancel',value:null}]);}
  case 'swapTake':{const nm=k=>k==='coffee'?`${teaIc()} ${W.coffee}`:`${chip(k)} ${GNAME[k]} <small>${p.goods[k]}/${cap(p)}</small>`;
    return sheet(CARD_DEFS.swap3.name,`<p>And what do you take for it?</p>`,[...d.options.map(k=>({label:nm(k),value:k})),{label:'Cancel',value:null}]);}
  case 'smugPay':if(d.who==='trader')return sheet(`Pay ${NS('trader')}`,`<p>Pay ${L(2)} or 1 good for ${TEA(1)}.</p>`,[...(p.lira>=2?[{label:`Pay ${L(2)}`,value:'lira',primary:true}]:[]),...GOODS.filter(c=>p.goods[c]>0).map(c=>({label:`Pay 1 ${chip(c)} ${GNAME[c]}`,value:c}))]);
    return sheet(`Pay ${NS('smug')}`,`<p>Pay ${L(2)} or 1 good.</p>`,[...(p.lira>=2?[{label:`Pay ${L(2)}`,value:'lira',primary:true}]:[]),...GOODS.filter(c=>p.goods[c]>0).map(c=>({label:`Pay 1 ${chip(c)} ${GNAME[c]}`,value:c}))]);
  }
}

/* ---------- human turn controls ---------- */
const liveCtx=()=>({G,sim:false,gen:GEN});
function isMine(q){if(!q||q.ai)return false;return ON.code?ownerOf(q)===ME:true;}
const myTurnNow=()=>G&&!G.over&&isMine(cur(G))&&(!ON.code||ON.driving)&&['move','post'].includes(UI.phase);
async function cardTap(pi,i){
  const p=G.players[pi];if(!p||UI.busy)return;
  if(ON.code?ownerOf(p)!==ME:p.ai)return;
  const myTurn=p===cur(G)&&(!ON.code||ON.driving);
  const t=p.cards[i],def=CARD_DEFS[t];const canAct=myTurn&&['move','post'].includes(UI.phase);const moving=myTurn&&UI.phase==='move';
  let playable=false,label='Play card',hint=myTurn?'':'You can play this on your turn.';
  if(t==='lira5'||t==='good')playable=canAct;
  if(t==='family'){playable=canAct&&p.family!==12;if(p.family===12)hint=`Your ${W.family} is already at the ${PNAME[12]}.`;}
  if(t==='stay'||t==='move34'){playable=moving;label=UI.mode===t?'Cancel':'Use for this move';if(!moving)hint='Only before you move.';}
  if(t==='recall'){playable=moving&&Object.keys(p.assist).length>0;if(!moving)hint='Only before you move.';else if(!playable)hint=`All your ${W.assistants} are already with you.`;}
  if(['dEnvoy','dPost','dGem','smAny','six','dWain','dCH'].includes(t))hint=t==='six'?'You will be offered this card when you roll the dice.':'You will be offered this card during that action.';
  if(t==='tea2'||t==='diceGift')playable=canAct;
  if(t==='gcard'){playable=canAct&&p.coffee>=2;if(canAct&&p.coffee<2)hint=`You need ${TEA(2)}.`;}
  if(t==='tea8'){playable=canAct&&p.coffee>0;if(canAct&&!p.coffee)hint=`You need ${TEA(1)}.`;}
  if(t==='swap3'){playable=canAct&&(totalGoods(p)+p.coffee)>0;}
  if(t==='corner'){playable=moving;label=UI.mode===t?'Cancel':'Use for this move';if(!moving)hint='Only before you move.';}
  UI.busy=true;
  try{
    const ok=await sheet(def.name,`<div class="bigcard">${cardHTML(t,'tabindex="-1"')}</div><p>${def.text}</p>${hint?`<p class="muted">${hint}</p>`:''}`,playable?[{label,value:true,primary:true},{label:'Close',value:false}]:[{label:'Close',value:false}]);
    if(!ok)return;
    const ctx=liveCtx();
    if(t==='lira5'){useCard(G,p,t);p.lira+=5;log(ctx,`${p.name} plays “${def.name}”.`,p);}
    else if(t==='good'){const room=GOODS.filter(c=>p.goods[c]<cap(p));if(!room.length){toast(`Your ${W.cart} is full.`);return;}
      const c=await humanDecide(ctx,p,'pickGood',{title:def.name,text:'Choose a good.',options:room,allowSkip:true});if(c){useCard(G,p,t);p.goods[c]++;log(ctx,`${p.name} plays “${def.name}” for ${GNAME[c]}.`,p);}}
    else if(t==='family'){useCard(G,p,t);p.family=12;const r=await humanDecide(ctx,p,'familyReward',{name:'your own'});if(r==='card'){const c=drawCard(G);if(c)p.cards.push(c);}else p.lira+=3;log(ctx,`${p.name} calls the ${W.family} home.`,p);}
    else if(['tea2','gcard','tea8','diceGift','swap3'].includes(t)){await playExpCard(ctx,p,t);}
    else if(t==='stay'||t==='move34'||t==='corner'){UI.mode=UI.mode===t?'normal':t;UI.sel=null;UI.sugg=null;}
    else if(t==='recall'){const pl=await pickAssistant(p);if(pl!=null){useCard(G,p,t);recallFrom(p,pl);log(ctx,`${p.name} plays “${def.name}”.`,p);}}
  }finally{UI.busy=false;render();}
}
async function guildTap(pi,i){
  const p=G.players[pi];if(!p||UI.busy)return;
  if(ON.code?ownerOf(p)!==ME:p.ai)return;
  const n=p.guild[i];const myTurn=p===cur(G)&&(!ON.code||ON.driving);const moving=myTurn&&UI.phase==='move';
  const ok=guildPlayable(G,p,n);
  const hint=!myTurn?'You can play this on your turn.':!moving?'Play it before you move: it replaces your whole turn.':!ok?"You can't carry it out right now.":'Playing it replaces your whole turn: no move and no encounters.';
  UI.busy=true;
  let go=false;
  try{go=await sheet(guildName(n),`<div class="bigcard">${guildCardHTML(n,'tabindex="-1"')}</div><p>${guildText(n)}</p><p class="muted">${hint}</p>`,moving&&ok?[{label:'Play instead of moving',value:true,primary:true},{label:'Close',value:false}]:[{label:'Close',value:false}]);}
  finally{UI.busy=false;render();}
  if(go&&pendingMove){$('#moveBar').hidden=true;document.body.classList.remove('has-movebar');pendingMove({guild:n});}
}
function pickAssistant(p){const out=Object.keys(p.assist).map(Number);return sheet(`Bring an ${W.assistant} home`,`<p>Choose where to collect one ${W.assistant} from.</p>`,[...out.map(pl=>({label:PNAME[pl],value:pl})),{label:'Cancel',value:null}]);}
async function yellowTap(){
  const p=cur(G);if(UI.busy)return;UI.busy=true;
  try{const pl=await pickAssistant(p);if(pl!=null){p.lira-=2;p.yellowUsed=true;recallFrom(p,pl);log(liveCtx(),`${p.name} pays ${L(2)} to bring an ${W.assistant} home.`,p);}}
  finally{UI.busy=false;render();}
}
async function suggestMove(){
  if(UI.busy||UI.phase!=='move')return;const p=cur(G);UI.busy=true;
  const saved=RNG_N;
  try{const r=await rankMoves(G,p,[UI.mode]);if(r.length){UI.sugg=r[0].t;UI.sel=r[0].t;toast(`Suggested: ${PNAME[r[0].t]}`);}}
  finally{RNG_N=saved;UI.busy=false;render();}
}
function restoreInPlace(obj,snap){const s=JSON.parse(snap);Object.keys(obj).forEach(k=>delete obj[k]);Object.assign(obj,s);}

/* ---------- game loop ---------- */
async function playTurn(ctx){
  const p0=cur(G);p0.yellowUsed=false;UI.mode='normal';UI.sel=null;UI.sugg=null;
  log(ctx,p0.name==='You'?'Your turn':`${p0.name}'s turn`,p0,true);
  if(p0.ai){UI.phase='ai';render();await sleep(ctx,400);await aiTurn(ctx);await sleep(ctx,700);return;}
  TURN={snap:JSON.stringify(G),rng:RNG_N};
  if(G.x&&!G.tut&&!TUT&&!lsGet('riverfair-xlesson')&&isMine(p0))startXLesson();
  for(;;){
    UI.phase='move';UI.sel=null;UI.sugg=null;render();
    const target=await new Promise(r=>pendingMove=r);pendingMove=null;checkGen(ctx);
    if(target&&typeof target==='object'&&target.guild){
      UI.phase='busy';UI.mode='normal';UI.sel=null;UI.sugg=null;render();
      const r=await playGuild(ctx,cur(G),target.guild);checkGen(ctx);
      if(r==='again'){render();continue;}
    }else{
    const mode=UI.mode;const p=cur(G);if(mode!=='normal'&&mode!=='line')useCard(G,p,mode);
    UI.phase='busy';UI.sel=null;UI.sugg=null;render();
    await resolveMove(ctx,target,mode);checkGen(ctx);
    }
    UI.phase='post';UI.sel=null;render();
    const r=await new Promise(r=>pendingEnd=r);pendingEnd=null;checkGen(ctx);
    if(r==='undo'&&RNG_N===TURN.rng){FX.quiet=true;restoreInPlace(G,TURN.snap);UI.mode='normal';toast('Move undone');continue;}
    break;
  }
}
function finishGame(ctx){
  const g=ctx.G;
  g.players.forEach(p=>{p.cards.slice().forEach(c=>{
    if(c==='lira5'){useCard(g,p,c);p.lira+=5;}
    if(c==='good'){const room=GOODS.filter(x=>p.goods[x]<cap(p));if(room.length){useCard(g,p,c);p.goods[room[0]]++;}}});});
  const rank=g.players.slice().sort((a,b)=>b.rubies-a.rubies||b.lira-a.lira||totalGoods(b)-totalGoods(a)||b.cards.length-a.cards.length);
  g.result=rank.map(p=>p.i);g.over=true;UI.phase='over';
  log(ctx,`${rank[0].name} wins the ${W.market}.`,rank[0],true);
}
function advanceTurn(ctx){const g=ctx.G;g.current=(g.current+1)%g.players.length;if(g.current===g.start){if(g.endTriggered)finishGame(ctx);else g.round++;}}
async function gameLoop(){
  const ctx=liveCtx();
  try{
    while(!G.over){save();await playTurn(ctx);checkGen(ctx);advanceTurn(ctx);}
    save();render();showEnd();
  }catch(e){if(e!==ABORT){console.error(e);toast('Something went wrong: '+e.message);}}
}
function save(){if(ON.code||(G&&G.tut))return;try{localStorage.setItem(STORE,JSON.stringify(G));}catch(e){}}
function startGame(cfg){tutStop();leaveOnline();showScreen('table');GEN++;pendingMove=pendingEnd=null;G=newGame(cfg);UI={phase:'idle',sel:null,mode:'normal',busy:false};$('#sheetWrap').hidden=true;render();gameLoop();}
function resumeGame(saved){tutStop();leaveOnline();showScreen('table');GEN++;pendingMove=pendingEnd=null;G=upgradeState(saved);UI={phase:'idle',sel:null,mode:'normal',busy:false};$('#sheetWrap').hidden=true;render();if(G.over){UI.phase='over';render();}else gameLoop();}

/* ---------- sound (synthesised, no files) ---------- */
const SND={ctx:null,on:lsGet('riverfair-sound')!=='off'};
function actx(){if(!SND.ctx){const A=window.AudioContext||window.webkitAudioContext;if(!A)return null;try{SND.ctx=new A();}catch(e){return null;}}if(SND.ctx.state==='suspended')SND.ctx.resume();return SND.ctx;}
addEventListener('pointerdown',()=>{if(SND.on)actx();});
function tone(f,t0,dur,type,vol,f2){const c=SND.ctx;const t=c.currentTime+t0;const o=c.createOscillator(),g=c.createGain();o.type=type||'sine';o.frequency.setValueAtTime(f,t);if(f2)o.frequency.exponentialRampToValueAtTime(f2,t+dur);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(g).connect(c.destination);o.start(t);o.stop(t+dur+.02);}
function noise(t0,dur,vol,freq){const c=SND.ctx;const t=c.currentTime+t0;const b=c.createBuffer(1,Math.ceil(c.sampleRate*dur),c.sampleRate);const a=b.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=(Math.random()*2-1)*(1-i/a.length);const s=c.createBufferSource();s.buffer=b;const f=c.createBiquadFilter();f.type='bandpass';f.frequency.value=freq;f.Q.value=1.2;const g=c.createGain();g.gain.value=vol;s.connect(f).connect(g).connect(c.destination);s.start(t);}
const SFX={
  coin(){tone(1568,0,.16,'triangle',.11);tone(2093,.06,.22,'triangle',.09);},
  goods(){tone(392,0,.1,'triangle',.12,330);tone(523,.05,.12,'triangle',.08);},
  move(){tone(170,0,.14,'sine',.28,110);noise(0,.06,.18,700);},
  dice(){for(let i=0;i<6;i++)noise(i*.065+Math.random()*.02,.045,.35,1800+Math.random()*1800);},
  ruby(){[784,988,1175,1568].forEach((f,i)=>tone(f,i*.09,.6,'sine',.12));tone(2349,.4,.8,'sine',.05);},
  turn(){tone(659,0,.4,'sine',.14);tone(988,.13,.55,'sine',.1);},
  card(){noise(0,.14,.16,3200);},
  bad(){tone(196,0,.22,'triangle',.12,147);}
};
function sfx(n){if(!SND.on||!SND.ctx)return;try{if(SND.ctx.state==='suspended')SND.ctx.resume();SFX[n]();}catch(e){}}
/* ---------- music: a gentle market-town tune, synthesised so it needs no files ----------
   6/8 in D major, 32 bars (A B A B, the repeat adds a harp arpeggio), about a minute per loop.
   Off by default; the choice is remembered. If THEME.music names an audio file, that plays instead. */
const MUS={on:lsGet('riverfair-music')==='on',timer:null,bus:null,pos:0,next:0,el:null};
const MEL=[ // [midi note or 0 for a rest, length in eighths], 6 eighths a bar
  [[74,2],[73,1],[71,2],[69,1]],[[67,2],[69,1],[71,3]],[[69,2],[66,1],[62,2],[66,1]],[[69,3],[64,3]],
  [[74,2],[73,1],[71,2],[69,1]],[[71,2],[74,1],[76,2],[74,1]],[[73,2],[71,1],[69,2],[73,1]],[[74,6]],
  [[71,2],[74,1],[78,3]],[[79,2],[78,1],[76,3]],[[74,2],[76,1],[78,2],[74,1]],[[76,4],[73,2]],
  [[78,2],[76,1],[74,2],[71,1]],[[71,2],[74,1],[79,2],[76,1]],[[76,2],[74,1],[73,2],[69,1]],[[74,3],[0,3]]];
const CHORD=['D','G','D','A','D','G','A','D','Bm','G','D','A','Bm','G','A','D'];
const CH={D:[50,4,7],G:[43,4,7],A:[45,4,7],Bm:[47,3,7]}; // bass root, third, fifth
const EIGHTH=60/(58*3); // dotted quarter = 58
const hz=m=>440*Math.pow(2,(m-69)/12);
function musBus(c){
  if(MUS.bus)return MUS.bus;
  const out=c.createGain();out.gain.value=0;out.connect(c.destination);
  const dry=c.createGain();dry.gain.value=.8;dry.connect(out);
  const rev=c.createConvolver();const len=Math.floor(c.sampleRate*2.2),ir=c.createBuffer(2,len,c.sampleRate);
  for(let ch=0;ch<2;ch++){const d=ir.getChannelData(ch);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,3);}
  rev.buffer=ir;const wet=c.createGain();wet.gain.value=.28;rev.connect(wet).connect(out);
  const inp=c.createGain();inp.connect(dry);inp.connect(rev);
  MUS.bus={out,inp};return MUS.bus;
}
function pluck(c,m,t,len,vol,bright){ // lute-like plucked string
  const g=c.createGain(),f=c.createBiquadFilter();f.type='lowpass';f.frequency.setValueAtTime(bright,t);f.frequency.exponentialRampToValueAtTime(600,t+len);
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+.006);g.gain.exponentialRampToValueAtTime(.0005,t+len);
  [['triangle',1,0],['sawtooth',.35,4]].forEach(([ty,v,det])=>{const o=c.createOscillator(),og=c.createGain();o.type=ty;o.frequency.value=hz(m);o.detune.value=det;og.gain.value=v;o.connect(og).connect(f);o.start(t);o.stop(t+len+.05);});
  f.connect(g).connect(MUS.bus.inp);
}
function bassNote(c,m,t,len){const o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.value=hz(m);
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.11,t+.02);g.gain.exponentialRampToValueAtTime(.0005,t+len);o.connect(g).connect(MUS.bus.inp);o.start(t);o.stop(t+len+.05);}
function musSchedule(){
  const c=SND.ctx;if(!c||!MUS.bus)return;
  if(MUS.next<c.currentTime)MUS.next=c.currentTime+.1;
  while(MUS.next<c.currentTime+.7){
    const bar=Math.floor(MUS.pos/6)%32,e=MUS.pos%6,b16=bar%16,t=MUS.next,[root,third,fifth]=CH[CHORD[b16]];
    let k=0;for(const[m,d]of MEL[b16]){if(k===e&&m)pluck(c,m,t,Math.min(1.6,d*EIGHTH+.5),.075,2600);k+=d;}
    if(e===0)bassNote(c,root,t,3*EIGHTH+.3);
    if(e===3)bassNote(c,root+fifth,t,3*EIGHTH+.3);
    if(bar>=16){const arp=[0,third,fifth,12,fifth,third];pluck(c,root+24+arp[e],t,.9,.026,1800);}
    MUS.pos++;MUS.next+=EIGHTH;
  }
}
function musicStart(){
  if(!MUS.on||document.hidden)return;
  if(T.music){if(!MUS.el){MUS.el=new Audio(T.music);MUS.el.loop=true;MUS.el.volume=.35;}MUS.el.play().catch(()=>{});return;}
  const c=actx();if(!c||MUS.timer)return;
  const b=musBus(c);b.out.gain.cancelScheduledValues(c.currentTime);b.out.gain.setTargetAtTime(1.1,c.currentTime,.6);
  MUS.next=c.currentTime+.15;musSchedule();MUS.timer=setInterval(musSchedule,120);
}
function musicStop(){
  if(MUS.el)MUS.el.pause();
  clearInterval(MUS.timer);MUS.timer=null;
  const c=SND.ctx;if(c&&MUS.bus){MUS.bus.out.gain.cancelScheduledValues(c.currentTime);MUS.bus.out.gain.setTargetAtTime(0,c.currentTime,.25);}
}
function setMusic(on){MUS.on=on;lsSet('riverfair-music',on?'on':'off');if(on)musicStart();else musicStop();renderMusicBtn();}
function renderMusicBtn(){const cm=$('#coMus');if(cm){cm.setAttribute('aria-pressed',String(MUS.on));cm.textContent=`♪ Music ${MUS.on?'on':'off'}`;}
  const b=$('#musicBtn');if(!b)return;b.setAttribute('aria-pressed',String(MUS.on));b.title=MUS.on?'Music is on':'Music is off';
  b.innerHTML=`<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 17V5l10-2v12" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/><circle cx="6.5" cy="17" r="2.6" fill="currentColor"/><circle cx="16.5" cy="15" r="2.6" fill="currentColor"/>${MUS.on?'':'<path d="M3 3l18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'}</svg><span class="sr">${MUS.on?'Music on':'Music off'}</span>`;}
addEventListener('pointerdown',()=>{if(MUS.on&&!MUS.timer&&!(MUS.el&&!MUS.el.paused))musicStart();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)musicStop();else musicStart();});
function setSound(on){SND.on=on;lsSet('riverfair-sound',on?'on':'off');if(on){actx();sfx('coin');}renderSoundBtn();}
function renderSoundBtn(){const b=$('#soundBtn');b.setAttribute('aria-pressed',String(SND.on));b.title=SND.on?'Sound is on':'Sound is off';b.innerHTML=`<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/>${SND.on?'<path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>':'<path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'}</svg><span class="sr">${SND.on?'Sound on':'Sound off'}</span>`;}

/* ---------- board-game effects: sliding tokens, gain pop-ups, dice, ruby flourish ---------- */
const FX={prev:null,quiet:false,rollSeen:null};
const FACE={}; // standees face the way they last walked
function fxSnap(){return{id:G.id,cur:G.current,over:G.over,roll:G.lastRoll?G.lastRoll.n:0,players:G.players.map(p=>({pos:p.pos,lira:p.lira,coffee:p.coffee||0,assist:{...p.assist},badges:{...p.tiles},tt:{...(p.tt||{})},guild:(p.guild||[]).length,goods:{...p.goods},rubies:p.rubies,cards:p.cards.length,ext:p.ext,tiles:GOODS.reduce((s,c)=>s+p.tiles[c],0)}))};}
function tokenRects(){const b=$('#board');if(!b)return{};const br=b.getBoundingClientRect();const o={};b.querySelectorAll('[data-k]').forEach(el=>{const r=el.getBoundingClientRect();o[el.dataset.k]={x:r.left-br.left,y:r.top-br.top};});return o;}
function runFx(before){
  const prev=FX.prev,now=fxSnap();FX.prev=now;
  const same=prev&&prev.id===now.id&&prev.players.length===now.players.length;
  if(!same){FX.rollSeen=now.roll;FX.quiet=false;return;}
  const b=$('#board'),br=b.getBoundingClientRect();
  // slide tokens from where they were
  // keep figures that are still walking hidden in place until their walk ends
  b.querySelectorAll('[data-k]').forEach(el=>{if(WALK[el.dataset.k])el.style.visibility='hidden';});
  if(!REDUCED)b.querySelectorAll('[data-k]').forEach(el=>{const k=el.dataset.k;if(WALK[k])return;const was=before[k];const r=el.getBoundingClientRect();
    if(was){const nowPt={x:r.left-br.left,y:r.top-br.top};if(Math.abs(was.x-nowPt.x)+Math.abs(was.y-nowPt.y)<=2)return;
      const pts=[was];
      const m=/^m(\d+)$/.exec(k);
      if(m){const pi=+m[1];const a=prev.players[pi]&&prev.players[pi].pos,z=now.players[pi]&&now.players[pi].pos;
        if(a&&z&&a!==z)gridPath(a,z).slice(1,-1).forEach(pl=>{const t=b.querySelector(`.tile[data-pl="${pl}"]`);if(t){const tr=t.getBoundingClientRect();pts.push({x:tr.left-br.left+tr.width/2-r.width/2,y:tr.top-br.top+tr.height-r.height-6});}});}
      pts.push(nowPt);
      walkToken(b,el,pts,!!m);}
    else if(/^a\d+-\d+$/.test(k)&&!FX.quiet)el.style.opacity='0';
    else el.animate([{scale:0,opacity:0},{scale:1.25,opacity:1,offset:.6},{scale:1}],{duration:380,easing:'ease-out'});});
  const sounds=new Set();
  if(now.players.some((p,i)=>p.pos!==prev.players[i].pos))sounds.add('move');
  if(!FX.quiet){
    now.players.forEach((p,i)=>{
      const q=prev.players[i],bits=[];
      const dl=p.lira-q.lira;if(dl)bits.push(`<span class="${dl>0?'up':'down'}">${dl>0?'+':'−'}${Math.abs(dl)} ${CS()}</span>`);
      GOODS.forEach(c=>{const d=p.goods[c]-q.goods[c];if(d)bits.push(`<span class="${d>0?'up':'down'}">${d>0?'+':'−'}${Math.abs(d)}${chip(c)}</span>`);});
      const dt=p.coffee-q.coffee;if(dt)bits.push(`<span class="${dt>0?'up':'down'}">${dt>0?'+':'−'}${Math.abs(dt)}${teaIc()}</span>`);
      const dc=p.cards-q.cards;if(dc>0)bits.push(`<span class="up">+${dc} ${CD()||plural(dc,'card','cards')}</span>`);
      if(p.ext>q.ext)bits.push(`<span class="up">${W.cart} +1</span>`);
      if(p.tiles>q.tiles)bits.push(`<span class="up">+1 tile</span>`);
      if(dl>0)sounds.add('coin');if(GOODS.some(c=>p.goods[c]>q.goods[c]))sounds.add('goods');if(dc>0)sounds.add('card');
      if(bits.length)popGain(i,bits.join(''));
      if(dl>0)flyGain(i,'lira',dl,CS());
      GOODS.forEach(c=>{const d=p.goods[c]-q.goods[c];if(d>0)flyGain(i,c,d,chip(c));});
      if(p.coffee>q.coffee)flyGain(i,'coffee',p.coffee-q.coffee,teaIc());
      if(dl<0)flyGain(i,'lira',-dl,CS(),true);
      GOODS.forEach(c=>{const d=q.goods[c]-p.goods[c];if(d>0)flyGain(i,c,d,chip(c),true);});
      if(p.coffee<q.coffee)flyGain(i,'coffee',q.coffee-p.coffee,teaIc(),true);
      flyApprentices(i,q.assist||{},p.assist||{},before,br);
      flyItems(i,q,p);
      if(bits.length){const el=document.querySelector(`.pl[data-pi="${i}"]`);if(el&&!REDUCED)el.animate([{background:'color-mix(in srgb, var(--turq) 22%, transparent)'},{background:'transparent'}],{duration:1200});}
      if(p.rubies>q.rubies){rubyFlourish(i,p.rubies);sounds.add('ruby');}
    });
  }
  FX.quiet=false;
  b.querySelectorAll('[data-k^="a"]').forEach(el=>{if(el.style.opacity==='0'&&!el.dataset.fly)el.style.opacity='';});
  if(now.roll!==FX.rollSeen&&G.lastRoll){FX.rollSeen=now.roll;showDice(G.lastRoll);sounds.add('dice');}
  if(now.cur!==prev.cur&&!now.over&&isMine(G.players[now.cur]))sounds.add('turn');
  if(sounds.has('ruby'))sounds.delete('coin');
  [...sounds].forEach((s,k)=>setTimeout(()=>sfx(s),k*90));
}
/* walking figures: a copy of the token travels above the board, tile by tile, then hands back to the real one */
const WALK={};
const STEP_MS=360;
function gridPath(a,z){
  const at=pl=>rc(G,pl),pos=(r,c)=>G.layout[r*COLS(G)+c];
  const walk=rowsFirst=>{let [r,c]=at(a);const [r2,c2]=at(z);const out=[a];
    const rows=()=>{while(r!==r2){r+=Math.sign(r2-r);out.push(pos(r,c));}},cols=()=>{while(c!==c2){c+=Math.sign(c2-c);out.push(pos(r,c));}};
    if(rowsFirst){rows();cols();}else{cols();rows();}return out;};
  const crosses=pth=>G.barrier&&pth.some((x,i)=>i&&edgeBlocked(G,null,pth[i-1],x));
  const p1=walk(true);return crosses(p1)?walk(false):p1;
}
function walkToken(board,el,pts,walking){
  const k=el.dataset.k;
  const r=el.getBoundingClientRect();
  const clone=el.cloneNode(true);clone.removeAttribute('data-k');clone.classList.add('walker');
  Object.assign(clone.style,{position:'absolute',left:'0',top:'0',margin:'0',width:r.width+'px',height:r.height+'px',zIndex:50,pointerEvents:'none',visibility:'visible',transform:`translate(${pts[0].x}px,${pts[0].y}px)`});
  clone.dataset.walk=k;board.appendChild(clone);
  el.style.visibility='hidden';WALK[k]=clone;
  const segs=pts.length-1;
  const dur=walking?STEP_MS*segs+80:Math.min(900,420+Math.hypot(pts[0].x-pts.at(-1).x,pts[0].y-pts.at(-1).y)*0.6);
  let frames;
  if(walking)frames=pts.map((p,i)=>({transform:`translate(${p.x}px,${p.y}px)`,offset:i/segs,easing:'ease-in-out'}));
  else{const a=pts[0],z=pts.at(-1),mid={x:(a.x+z.x)/2,y:Math.min(a.y,z.y)-40};
    frames=[{transform:`translate(${a.x}px,${a.y}px) scale(1)`},{transform:`translate(${mid.x}px,${mid.y}px) scale(1.15)`,offset:.5},{transform:`translate(${z.x}px,${z.y}px) scale(1)`}];}
  const fin=()=>{clone.remove();if(WALK[k]===clone)delete WALK[k];const cur=board.querySelector(`[data-k="${k}"]`);if(cur)cur.style.visibility='';};
  clone.animate(frames,{duration:dur,fill:'forwards'}).onfinish=fin;
  if(clone.classList.contains('standee')){
    // the art faces right: mirror the figure on every leftward leg, and remember the last way it faced
    // a leg only turns the figure when it is mostly sideways
    const legs=pts.slice(1).map((pt,i)=>{const dx=pt.x-pts[i].x,dy=pt.y-pts[i].y;return Math.abs(dx)>4&&Math.abs(dx)>Math.abs(dy)?dx:0;});
    const lastH=legs.filter(d=>d).pop();
    const first=walking?legs.find(d=>d):lastH;
    clone.classList.toggle('flip',first!==undefined?first<0:!!FACE[k]);
    const legMs=dur/Math.max(1,segs);
    if(walking)legs.forEach((d,i)=>{if(i&&d)setTimeout(()=>clone.classList.toggle('flip',d<0),i*legMs);});
    if(lastH!==undefined)FACE[k]=lastH<0;
    const img=clone.querySelector('img');
    if(img)img.animate([{rotate:'0deg',translate:'0 0'},{rotate:'-7deg',translate:'0 -4px'},{rotate:'0deg',translate:'0 0'},{rotate:'7deg',translate:'0 -4px'},{rotate:'0deg',translate:'0 0'}],{duration:STEP_MS,iterations:Math.max(1,Math.round(dur/STEP_MS)),easing:'linear'});
  }
  setTimeout(()=>{if(WALK[k]===clone)fin();},dur+400);
}
function popGain(i,html){
  const tok=document.querySelector(`#board [data-k="m${i}"]`);if(!tok)return;
  const r=tok.getBoundingClientRect();const el=document.createElement('div');el.className='gain';el.innerHTML=html;
  el.style.left=(r.left+r.width/2)+'px';el.style.top=(r.top)+'px';document.body.appendChild(el);
  const a=el.animate([{transform:'translate(-50%,0)',opacity:0},{transform:'translate(-50%,-14px)',opacity:1,offset:.15},{transform:'translate(-50%,-34px)',opacity:1,offset:.75},{transform:'translate(-50%,-48px)',opacity:0}],{duration:REDUCED?1400:1900,easing:'ease-out'});
  a.onfinish=()=>el.remove();
}
function rubyFlourish(i,n){
  const p=G.players[i];const el=document.createElement('div');el.className='flourish';
  el.innerHTML=`<svg viewBox="0 0 64 56" width="76" height="66" aria-hidden="true"><path d="M14 2h36l14 16-32 36L0 18z" fill="var(--bole)"/><path d="M14 2l6 16h24l6-16M0 18h64M20 18l12 36 12-36" stroke="rgba(255,255,255,.55)" stroke-width="2" fill="none"/></svg><b>${esc(p.name)}</b><span>earns a ${W.ruby} · ${n} of ${winTarget(G)}</span>`;
  document.body.appendChild(el);
  const a=el.animate(REDUCED?[{opacity:0},{opacity:1,offset:.1},{opacity:1,offset:.85},{opacity:0}]:[{opacity:0,transform:'translate(-50%,-50%) scale(.4) rotate(-12deg)'},{opacity:1,transform:'translate(-50%,-50%) scale(1.08) rotate(3deg)',offset:.18},{opacity:1,transform:'translate(-50%,-50%) scale(1)',offset:.3},{opacity:1,transform:'translate(-50%,-50%) scale(1)',offset:.82},{opacity:0,transform:'translate(-50%,-58%) scale(.96)'}],{duration:2100,easing:'ease-out'});
  a.onfinish=()=>el.remove();
}
let diceEl=null;
function showDice(r){
  if(diceEl)diceEl.remove();
  const p=G.players[r.who];const el=document.createElement('div');el.className='diceroll';diceEl=el;
  const s=r.d[0]+r.d[1];
  let res='';
  if(r.purpose==='gift')res=r.d.map(v=>{const k=DICE_GIFT[v];return k==='lira'?`2${CS()}`:k==='coffee'?teaIc():chip(k);}).join(' ');
  else if(r.purpose==='tea')res=s>=r.target?`Needed ${r.target}: takes ${L(r.target)}`:`Needed ${r.target}: takes ${L(2)}`;
  else{const blue=s>=11?3:s>=9?2:s>=7?1:0;res=blue?`+${blue} ${GNAME.b}`:`No ${GNAME.b}`;}
  el.innerHTML=`<div class="who"><i class="mer c-${p.color}"></i>${esc(p.name)}${r.note?` · ${r.note}`:''}</div><div class="dice">${dieFace(1)}${dieFace(1)}</div><div class="res"><b>${s}</b> <span>${res}</span></div>`;
  document.body.appendChild(el);
  const faces=el.querySelectorAll('.die'),resEl=el.querySelector('.res');resEl.style.visibility='hidden';
  let k=0;const spin=REDUCED?0:9;
  const tick=()=>{if(k<spin){faces.forEach(f=>f.outerHTML);faces[0].innerHTML=dieFace(1+Math.floor(Math.random()*6)).replace(/^<span[^>]*>|<\/span>$/g,'');faces[1].innerHTML=dieFace(1+Math.floor(Math.random()*6)).replace(/^<span[^>]*>|<\/span>$/g,'');faces.forEach(f=>f.animate([{rotate:'-14deg'},{rotate:'12deg'}],{duration:70}));k++;setTimeout(tick,65);}
    else{faces[0].innerHTML=dieFace(r.d[0]).replace(/^<span[^>]*>|<\/span>$/g,'');faces[1].innerHTML=dieFace(r.d[1]).replace(/^<span[^>]*>|<\/span>$/g,'');resEl.style.visibility='visible';}};
  tick();
  el.animate([{opacity:0,transform:'translate(-50%,-12px)'},{opacity:1,transform:'translate(-50%,0)',offset:.08},{opacity:1,transform:'translate(-50%,0)',offset:.9},{opacity:0,transform:'translate(-50%,-6px)'}],{duration:2600}).onfinish=()=>{el.remove();if(diceEl===el)diceEl=null;};
}

/* ---------- clarity: hints, recap, rules ---------- */
function hintFor(p,pl,mode){
  const g=G;
  if(pl!==7&&!(mode!=='stay'&&p.assist[pl])&&p.stack<=0)return{t:`No ${W.assistant}`,k:'bad'};
  if(pl!==7){const n=g.players.filter(q=>q!==p&&q.pos===pl).length+g.neutrals.filter(x=>x.pos===pl).length;if(p.lira<2*n)return{t:`Can't pay ${2*n}${CS()}`,k:'bad'};}
  const fam=pl!==12&&g.players.some(q=>q!==p&&q.family===pl)?' +catch':'';
  const back=pl!==7&&mode!=='stay'&&p.assist[pl]?` +${ICON('apprentice')?`<img class="gi" src="${ICON('apprentice')}" alt="${W.assistant}">`:W.assistant}`:'';
  const H=(t,k)=>({t:t+fam+back,k:k||(fam||back?'good':'')});
  switch(pl){
  case 1:return p.ext>=3?H('Fully extended','meh'):p.lira>=7?H(p.ext===2?`◆ Extend`:'Extend cart',p.ext===2?'ruby':'good'):H(`Need ${7-p.lira}${CS()} more`,'meh');
  case 2:case 3:case 4:{const c={2:'r',3:'g',4:'y'}[pl];const n=cap(p)-p.goods[c];return n?H(`+${n} ${chip(c)}`,'good'):H('Already full','meh');}
  case 5:{let l=0,gd=0;postItems(g).forEach(it=>{if(it.l)l+=it.l;else if(p.goods[it.g]<cap(p))gd++;});return H(`+${l}${CS()} +${gd}${ICON('any')?chip('*'):' goods'}`,'good');}
  case 6:return H(`+1 ${CD()||'card'}${g.x?` +1${teaIc()}`:''}`,'good');
  case 7:{let n=0;for(const k in p.assist)n+=p.assist[k];return n?H(`${n} home`,'good'):H('Nothing out','meh');}
  case 8:return H('Good + roll','good');
  case 9:return H('Gamble','good');
  case 10:case 11:{const mk=pl===10?g.large:g.small;const t=tileCount(mk[0]);let n=Math.min(5,GOODS.reduce((s,c)=>s+Math.min(t[c],p.goods[c]),0));if(pl===11&&hasCard(p,'smAny'))n=Math.max(n,Math.min(5,totalGoods(p)));return n?H(`Sell ${n}: ${REV[pl][n]}${CS()}`,'good'):H('Nothing to sell','meh');}
  case 12:return p.family===12?H('Free action','good'):H(`${W.family} away`,'meh');
  case 13:{if(g.envoyTaken>=g.envoyRubies)return H('Sold out','meh');const m=envoyMissing(p,envoyReq(g));return m?H(`Need ${m} more`,'meh'):H(`◆ Deliver`,'ruby');}
  case 14:case 15:{const cols=LODGE[pl];const ok=cols.filter(c=>!p.tiles[c]&&g.lodge[c].length&&p.goods[c]>=g.lodge[c][0]);
    if(ok.length){const done=cols.every(c=>p.tiles[c]||ok.includes(c))&&cols.filter(c=>!p.tiles[c]).length===1;return H(done?'◆ Tile':'Claim tile',done&&g.lodgeRubies[pl]>0?'ruby':'good');}
    const left=cols.filter(c=>!p.tiles[c]&&g.lodge[c].length);if(!left.length)return H('Done','meh');
    const c=left.sort((a,b)=>(g.lodge[a][0]-p.goods[a])-(g.lodge[b][0]-p.goods[b]))[0];return H(`Need ${g.lodge[c][0]} ${chip(c)}`,'meh');}
  case 16:{if(g.gemTaken>=g.gemRubies)return H('Sold out','meh');const pr=gemPrice(g);return p.lira>=pr?H(`◆ ${pr}${CS()}`,'ruby'):H(`Need ${pr-p.lira}${CS()} more`,'meh');}
  case 17:{const n=(p.lira>=2?1:0)+(totalGoods(p)?1:0)+(p.cards.length?1:0);return n?H(`up to +${2*n}${teaIc()}`,'good'):H('Nothing to pay','meh');}
  case 18:return H(`+1${teaIc()} +guild`,'good');
  case 19:{const o=snugOptions(g,p).filter(x=>p.coffee>=x.cost);if(o.some(x=>x.k==='bribe'))return H(`◆ Bribe`,'ruby');if(o.some(x=>x.k==='tm'||x.k==='te'))return H(W.ttile,'good');if(o.length)return H(W.barrier[0].toUpperCase()+W.barrier.slice(1),'good');return H(`Need ${W.coffee}`,'meh');}
  case 20:{if(g.chTaken>=g.chRubies)return H('Sold out','meh');const c=chCost(g);return p.coffee>=c?H(`◆ ${c}${teaIc()}`,'ruby'):H(`Need ${c-p.coffee}${teaIc()} more`,'meh');}
  }
  return H('');
}
function recapFor(p){
  const out=[];
  for(let i=1;i<G.log.length;i++){const e=G.log[i];if(e.s&&e.c===p.color)break;out.push(e);}
  return out.reverse().slice(-16);
}
function rulesSheet(){
  const X=!!(G&&G.x);
  const pl=Object.keys(T.places).map(Number).filter(n=>n<=16||X).sort((a,b)=>a-b);
  sheet('How to play',`<div class="rules">
    <p><b>Goal.</b> Be the first to collect ${X?'6':'5'} ${W.rubies}${X?'':' (6 with two players)'}. The round then finishes so everyone has had the same number of turns. Ties go to the most ${W.cur}.</p>
    <h4>Your turn, in order</h4>
    <ol>
      <li><b>Move</b> your ${W.merchant} 1 or 2 places (no diagonals). You may first play ${W.cards} that say “before moving”.</li>
      <li><b>${W.assistants[0].toUpperCase()+W.assistants.slice(1)}.</b> Leave one ${W.assistant} at the place, or pick up the one waiting there. With no ${W.assistant} along, your turn ends. The ${PNAME[7]} needs none.</li>
      <li><b>Other ${W.merchants}.</b> Pay ${L(2)} to each other ${W.merchant} already there.</li>
      <li><b>Action.</b> Take the place's action (it's optional).</li>
      <li><b>Encounters.</b> Catch another player's ${W.family} for a reward, and deal with ${NS('gov')} or ${NS('smug')} if they're here.${X?` ${NSC('trader')} sells ${TEA(1)} for ${L(2)} or 1 good.`:''}</li>
    </ol>${X?`<p><b>${W.coffeeLong[0].toUpperCase()+W.coffeeLong.slice(1)}.</b> Get them at the ${PNAME[17]}, buy them from ${NS('trader')}, and pick up 1 at the ${PNAME[6]}. Spend them at the ${PNAME[20]} for ${W.rubies}. The game ends at 6 ${W.rubies}.</p>`:''}
    <h4>Places</h4>
    <div class="rplaces">${pl.map(n=>`<div><b>${n}. ${PNAME[n]}</b><span>${PDESC[n]}</span></div>`).join('')}</div>
    <h4>${W.tiles[0].toUpperCase()+W.tiles.slice(1)}</h4>
    <div class="rplaces">${GOODS.map(c=>`<div><b>${chip(c)} ${GNAME[c]}</b><span>${TILE_ABIL[c]}</span></div>`).join('')}</div>
    <h4>${W.cards[0].toUpperCase()+W.cards.slice(1)}</h4>
    <div class="rplaces">${Object.entries(CARD_DEFS).filter(([k])=>X||!EXP_CARDS[k]).map(([,d])=>`<div><b>${d.name} ×${d.n}</b><span>${d.text}</span></div>`).join('')}</div>
    ${X?`<h4>${W.guildCards[0].toUpperCase()+W.guildCards.slice(1)}</h4><p>Play one on your turn instead of moving. It replaces your whole turn: no encounters, and no ${W.cards} tied to a place.</p><div class="rplaces">${[...Array(20)].map((_,i)=>`<div><b>${i+1}. ${guildName(i+1)}</b><span>${guildText(i+1)}</span></div>`).join('')}</div>
    <h4>${PNAME[19]}</h4><div class="rplaces"><div><b>${W.moveTile}</b><span>${TT_TEXT('m')}</span></div><div><b>${W.encTile}</b><span>${TT_TEXT('e')}</span></div><div><b>${W.bribe[0].toUpperCase()+W.bribe.slice(1)}</b><span>Its two sides ask for ${BRIBE_SIDES[0].map(chip).join('')} and ${BRIBE_SIDES[1].map(chip).join('')}; it flips after each use.</span></div></div>`:''}
    <h4>Tips</h4>
    <p>Reachable places show a hint of what you'd get. ◆ marks a ${W.ruby} you can take right now. <b>Suggest</b> asks the AI for its pick, and <b>Undo</b> takes back a move as long as no dice were rolled and no cards were drawn.</p>
  </div>`,[{label:'Close',value:null,primary:true},...(X&&!G.over?[{label:`Replay the ${T.expName||'expansion'} tour`,value:'xl'}]:[])],{wide:true}).then(v=>{if(v==='xl')startXLesson();});
}

/* ---------- rendering ---------- */
function tileStatus(pl){
  switch(pl){
  case 1:return `<span class="ruby">◆${G.wainRubies}</span> 7${CS()}`;
  case 2:case 3:case 4:return `${chip({2:'r',3:'g',4:'y'}[pl])} fill up`;
  case 5:return postItems(G).map(it=>it.g?chip(it.g):`${it.l}${CS()}`).join(' ');
  case 6:return `+2 −1 ${CD()||'cards'}${G.x?` +1${teaIc()}`:''}`;
  case 7:return `${W.assistants} home`;
  case 8:return 'good + dice';
  case 9:return 'bet 3–12';
  case 10:return G.large[0].map(chip).join('');
  case 11:return G.small[0].map(chip).join('');
  case 12:return 'free action';
  case 13:{const left=G.envoyRubies-G.envoyTaken;return left?`<span class="ruby">◆${left}</span> ${envoyReq(G).length} goods`:'sold out';}
  case 14:case 15:return LODGE[pl].map(c=>`${chip(c)}${G.lodge[c].length?G.lodge[c][0]:'–'}`).join(' ')+` <span class="ruby">◆${G.lodgeRubies[pl]}</span>`;
  case 16:{const left=G.gemRubies-G.gemTaken;return left?`<span class="ruby">◆${left}</span> ${gemPrice(G)}${CS()}`:'sold out';}
  case 17:return `→ 2${teaIc()} ×3`;
  case 18:return `+1${teaIc()} +2 ${W.guildCards}`;
  case 19:return `<span class="ruby">◆</span> ${BRIBE_SIDES[G.bribe].map(chip).join('')}+4${teaIc()}`;
  case 20:{const left=G.chRubies-G.chTaken;return left?`<span class="ruby">◆${left}</span> ${chCost(G)}${teaIc()}`:'sold out';}
  }
}
function merchantToken(q,active){
  const art=T.art.merchants&&T.art.merchants[q.color];
  return `<i class="mer c-${q.color} ${active?'active':''} ${art?'standee':''} ${art&&FACE['m'+q.i]?'flip':''}" data-k="m${q.i}" title="${esc(q.name)}">${art?`<img src="${art}" alt="">`:q.stack}</i>`;
}
function figN(pl){ // standing figures on a place, for crowding and the backdrop shade
  return Math.min(5,G.players.filter(q=>q.pos===pl&&T.art.merchants&&T.art.merchants[q.color]).length+(T.art.neutral?G.neutrals.filter(x=>x.pos===pl).length:0)+(T.art.gov&&G.gov===pl?1:0)+(T.art.smug&&G.smug===pl?1:0)+(T.art.trader&&G.x&&G.trader===pl?1:0));
}
function tokens(pl){
  const p=cur(G);let h='';
  G.players.forEach(q=>{if(q.pos===pl)h+=merchantToken(q,q===p&&!G.over);});
  const A=T.art||{};
  const fig=(art,cls,k,title,fallback)=>art?`<i class="mer standee ${cls} ${FACE[k]?'flip':''}" data-k="${k}" title="${title}"><img src="${art}" alt=""></i>`:fallback;
  G.neutrals.forEach((x,k)=>{if(x.pos===pl)h+=fig(A.neutral,'c-grey','n'+k,(W.neutral||`Neutral ${W.merchant}`),`<i class="mer c-grey" data-k="n${k}" title="Neutral ${W.merchant}"></i>`);});
  const apIc=ICON('apprentice'),coIc=ICON('cousin');
  const me=stripPlayer();
  G.players.forEach(q=>{if(q.assist[pl])h+=`<i class="ast c-${q.color} ${apIc?'icon':''} ${me&&q===me?'mine':''}" data-k="a${q.i}-${pl}" title="${esc(q.name)}'s ${W.assistant}">${apIc?`<img src="${apIc}" alt="">`:''}${q.assist[pl]>1?`<b>${q.assist[pl]}</b>`:''}</i>`;});
  G.players.forEach(q=>{if(q.family===pl)h+=`<i class="fam c-${q.color} ${coIc?'icon':''}" data-k="f${q.i}" title="${esc(q.name)}'s ${W.family}">${coIc?`<img src="${coIc}" alt="">`:''}</i>`;});
  if(G.gov===pl)h+=fig(A.gov,'npc c-gov','gov',NT('gov'),`<i class="gov" data-k="gov" title="${W.gov}"><b>${W.gov[0]}</b></i>`);
  if(G.smug===pl)h+=fig(A.smug,'npc c-smug','smug',NT('smug'),`<i class="smg" data-k="smug" title="${W.smug}"><b>${W.smug[0]}</b></i>`);
  if(G.x&&G.trader===pl)h+=fig(A.trader,'npc c-trader','trader',NT('trader'),`<i class="trd" data-k="trader" title="${NT('trader')}"><b>${W.trader[0]}</b></i>`);
  return h;
}
function placeDetail(pl){
  const p=cur(G);
  switch(pl){
  case 1:return `<div class="detail"><span><span class="k">${W.rubies} left</span><span class="ruby">◆ ${G.wainRubies}</span></span><span><span class="k">Your extensions</span>${p.ext}/3</span></div>`;
  case 5:return `<div class="detail"><span><span class="k">Showing now</span><span class="chips">${postItems(G).map(it=>it.g?chip(it.g)+' '+GNAME[it.g]:L(it.l)).join(' · ')}</span></span></div>`;
  case 10:case 11:{const mk=pl===10?G.large:G.small;return `<div class="detail"><span><span class="k">${W.orders||"Demand tile"}</span><span class="chips">${mk[0].map(chip).join('')}</span></span><span><span class="k">Next</span><span class="chips">${mk[1].map(chip).join('')}</span></span></div>`;}
  case 12:{const f=G.players.filter(q=>q.family===12).map(q=>esc(q.name));return `<div class="detail"><span><span class="k">${W.family}s here</span>${f.length?f.join(', '):'none'}</span></div>`;}
  case 13:{const left=G.envoyRubies-G.envoyTaken;return `<div class="detail"><span><span class="k">Next delivery</span>${left?`<span class="chips">${envoyReq(G).map(chip).join('')}</span>`:'—'}</span><span><span class="k">${W.rubies} left</span><span class="ruby">◆ ${left}</span></span></div>`;}
  case 14:case 15:return `<div class="detail">${LODGE[pl].map(c=>`<span><span class="k">${GNAME[c]} tile</span>${G.lodge[c].length?`needs ${G.lodge[c][0]} ${chip(c)}`:'gone'} <small class="muted">${TILE_ABIL[c]}</small></span>`).join('')}<span><span class="k">${W.rubies} left</span><span class="ruby">◆ ${G.lodgeRubies[pl]}</span></span></div>`;
  case 16:{const left=G.gemRubies-G.gemTaken;return `<div class="detail"><span><span class="k">Price</span>${left?L(gemPrice(G)):'—'}</span><span><span class="k">${W.rubies} left</span><span class="ruby">◆ ${left}</span></span></div>`;}
  case 18:return `<div class="detail"><span><span class="k">Your ${W.guildCards}</span>${(p.guild||[]).length}</span><span><span class="k">Play one</span>instead of a whole turn</span></div>`;
  case 19:return `<div class="detail"><span><span class="k">${W.barrier[0].toUpperCase()+W.barrier.slice(1)} · ${TEA(2)}</span>${G.barrier?`${SHORT[G.barrier[0]]} | ${SHORT[G.barrier[1]]}`:'not placed'}</span><span><span class="k">${W.moveTile}</span>${G.tt.m.length?TEA(G.tt.m[0]):'gone'}</span><span><span class="k">${W.encTile}</span>${G.tt.e.length?TEA(G.tt.e[0]):'gone'}</span><span><span class="k">${W.bribe[0].toUpperCase()+W.bribe.slice(1)}</span><span class="chips">${BRIBE_SIDES[G.bribe].map(chip).join('')}</span> + ${TEA(4)}</span></div>`;
  case 20:{const left=G.chRubies-G.chTaken;return `<div class="detail"><span><span class="k">Price</span>${left?TEA(chCost(G)):'—'}</span><span><span class="k">${W.rubies} left</span><span class="ruby">◆ ${left}</span></span><span><span class="k">Your ${W.coffee}</span>${p.coffee}</span></div>`;}
  }
  return '';
}
function preview(p,pl,mode){
  const out=[];
  if(pl===7)out.push({t:`No ${W.assistant} needed at the ${PNAME[7]}.`});
  else if(mode!=='stay'&&p.assist[pl])out.push({t:`Your ${W.assistant} is waiting here; you pick it up.`,c:'good'});
  else if(p.stack>0)out.push({t:`Leave 1 ${W.assistant} here (${p.stack-1} stay with you).`});
  else out.push({t:`No ${W.assistant} with you. Your turn would end on arrival.`,c:'bad'});
  if(pl!==7){const n=G.players.filter(q=>q!==p&&q.pos===pl).length+G.neutrals.filter(x=>x.pos===pl).length;
    if(n)out.push({t:`Pay ${L(2*n)} to the ${plural(n,W.merchant,W.merchants)} here.`,c:p.lira>=2*n?'':'bad'});}
  const back=pl!==7&&mode!=='stay'&&p.assist[pl]?` +${ICON('apprentice')?`<img class="gi" src="${ICON('apprentice')}" alt="${W.assistant}">`:W.assistant}`:'';const h=hintFor(p,pl,mode);if(h.t&&h.k!=='bad')out.push({t:`You'd get: ${h.t.replace(' +catch','').replace(back,'')}`,c:h.k==='meh'?'':'good'});
  const fams=G.players.filter(q=>q!==p&&q.family===pl&&pl!==12);
  if(fams.length)out.push({t:`Catch ${fams.map(q=>esc(q.name)).join(', ')}'s ${W.family} for a reward.`,c:'good'});
  if(G.gov===pl)out.push({t:`${NSC('gov')} is here: draw a ${W.card} for ${L(2)} or a card.`});
  if(G.smug===pl)out.push({t:`${NSC('smug')} is here: take a good for ${L(2)} or a good.`});
  if(G.x&&G.trader===pl)out.push({t:`${NSC('trader')} is here: buy ${TEA(1)} for ${L(2)} or a good.`});
  return out;
}
function render(){
  if(!G)return;
  const before=tokenRects();
  const p=cur(G);
  $('#roundInfo').textContent=G.over?'Game over':`Round ${G.round}${G.endTriggered?' · final':''}`;
  const mineNow=isMine(p)&&(!ON.code||ON.driving);
  // banner
  let msg='',acts='';
  if(G.over)msg='The game is over.';
  else if(UI.phase==='ai')msg=esc(G.log[0]&&!G.log[0].s?G.log[0].t:`${p.name} is thinking…`);
  else if(UI.phase==='move'&&mineNow)msg=UI.mode==='stay'?'Stay put: tap your own place, then Stay here.':UI.mode==='move34'?'Long stride: tap a place 3 or 4 steps away.':UI.mode==='corner'?`${CARD_DEFS.corner.name}: tap a corner place.`:UI.mode==='line'?`${W.moveTile}: tap any place in a straight line.`:'Tap a highlighted place, then Move here.';
  else if(UI.phase==='busy')msg=esc(G.log[0]&&!G.log[0].s?G.log[0].t:'Resolving your action…');
  else if(UI.phase==='post')msg='Play a card if you like, then end your turn.';
  else{const e=G.log.find(x=>!x.s);msg=esc(e?e.t:`Waiting for ${p.name}…`);}
  tutAdvance();const tutLock=tutScripted();
  if(!G.over&&mineNow){
    if(UI.phase==='move'&&!tutLock)acts+=`<button class="btn" id="suggBtn">Suggest</button>`;
    if(UI.phase==='move'&&p.tt&&p.tt.m)acts+=`<button class="btn ${UI.mode==='line'?'primary':''}" id="lineBtn">${UI.mode==='line'?'Normal move':'Straight line'}</button>`;
    if(['move','post'].includes(UI.phase)&&p.tiles.y&&!p.yellowUsed&&p.lira>=2&&Object.keys(p.assist).length)acts+=`<button class="btn" id="yelBtn">${chip('y')} Recall (${L(2)})</button>`;
    if(UI.phase==='post'&&RNG_N===TURN.rng&&!tutLock)acts+=`<button class="btn" id="undoBtn">Undo move</button>`;
    if(UI.phase==='post'&&(!tutLock||tutStep().end))acts+=`<button class="btn primary" id="endBtn">End turn</button>`;
  }
  if(G.over)acts=`<button class="btn primary" id="resBtn">Results</button>`;
  $('#banner').innerHTML=`<span class="who">${merchantToken(p,false).replace(/data-k="[^"]*"/,'')}${G.over?'':esc(p.name)+(p.ai?' (AI)':'')}</span><span class="msg">${msg}</span><span class="acts">${acts}</span>`;
  $('#banner').classList.toggle('mine',mineNow&&!G.over);
  const eb=$('#endBtn');if(eb)eb.onclick=()=>pendingEnd&&pendingEnd('end');
  const ub=$('#undoBtn');if(ub)ub.onclick=()=>pendingEnd&&pendingEnd('undo');
  const yb=$('#yelBtn');if(yb)yb.onclick=yellowTap;
  const sb=$('#suggBtn');if(sb)sb.onclick=suggestMove;
  const lb=$('#lineBtn');if(lb)lb.onclick=()=>{UI.mode=UI.mode==='line'?'normal':'line';UI.sel=null;UI.sugg=null;render();};
  const rb=$('#resBtn');if(rb)rb.onclick=showEnd;
  // board
  const moving=UI.phase==='move'&&mineNow;
  let reach=new Set(moving?reachable(G,p,UI.mode):[]);
  if(tutLock)reach=new Set([...reach].filter(x=>(tutStep().only||[]).includes(x))); // the lesson decides where you may go
  const bd=$('#board');bd.classList.toggle('x5',COLS(G)===5);
  /* rebuild only the tiles: walking figures and the barrier live on the board too and must survive redraws */
  bd.querySelectorAll(':scope > .tile').forEach(t=>t.remove());
  bd.insertAdjacentHTML('afterbegin',G.layout.map((pl,ix)=>{const C=COLS(G),gr=Math.floor(ix/C)+1,gc=ix%C+1;
    const art=T.art.tiles&&T.art.tiles[pl];const h=reach.has(pl)?hintFor(p,pl,UI.mode):null;
    return `<button class="tile k-${KIND[pl]} ${art?'art':''} ${reach.has(pl)?'reach':''} ${moving&&!reach.has(pl)?'dim':''} ${UI.sel===pl?'sel':''} ${UI.sugg===pl?'sugg':''}" data-pl="${pl}" aria-label="${PNAME[pl]}${h?': '+h.t.replace(/<[^>]+>/g,''):''}" style="--r:${gr};--c:${gc};${art?`--art:url('${art}')`:''}"><span class="plate"><span class="pn">${pl}</span><span class="nm">${SHORT[pl]}</span><span class="st">${tileStatus(pl)}</span></span>${h&&h.t?`<span class="hint h-${h.k||'plain'}">${h.t}</span>`:''}${UI.sel===pl&&reach.has(pl)?`<span class="again">Tap again to ${UI.mode==='stay'?'stay':'move'}</span>`:''}${figN(pl)?'<span class="shade" aria-hidden="true"></span>':''}<span class="tok n${figN(pl)}">${tokens(pl)}</span></button>`;}).join(''));
  drawBarrier();
  document.querySelectorAll('.tile').forEach(t=>t.onclick=()=>{const v=+t.dataset.pl;
    if(moving&&reach.has(v)&&UI.sel===v&&pendingMove){commitMove(v);return;}
    UI.sel=v;render();});
  // phone move bar: shows the picked place with a Move button pinned to the bottom of the screen
  const bar=$('#moveBar');const pickOk=moving&&UI.sel!=null&&reach.has(UI.sel);
  bar.hidden=!pickOk;document.body.classList.toggle('has-movebar',pickOk);
  if(pickOk){const hh=hintFor(p,UI.sel,UI.mode);bar.innerHTML=`<div class="mbt"><b>${PNAME[UI.sel]}</b>${hh.t?`<span class="hint h-${hh.k||'plain'}">${hh.t}</span>`:''}</div><button class="btn primary" id="moveBtn2">${UI.mode==='stay'?'Stay here':'Move here'}</button>`;$('#moveBtn2').onclick=()=>commitMove(UI.sel);}
  // panel
  const pl=UI.sel??p.pos;
  let h='';
  if(moving&&!UI.recapHidden){const rec=recapFor(p);if(rec.length&&G.round+G.current>1)h+=`<div class="recap"><div class="rh"><h4>Since your last turn</h4><button class="btn" id="recapX">Hide</button></div><ul class="log">${rec.map(e=>`<li class="${e.s?'sep':''}">${e.c?`<i class="c-${e.c}"></i>`:''}<span>${esc(e.t)}</span></li>`).join('')}</ul></div>`;}
  const partArt=T.art.tiles&&T.art.tiles[pl];
  h+=`<article class="loccard k-${KIND[pl]} ${partArt?'has-art':''}" aria-label="${PNAME[pl]}">
    <div class="lc-frame">
      ${partArt?`<div class="lc-art"><img src="${partArt}" alt=""></div>`:''}
      <header class="lc-title"><span class="lc-num">${pl}</span><h3>${PNAME[pl]}</h3></header>
      <div class="lc-body"><p class="pd">${PDESC[pl]}</p>${placeDetail(pl)}${hereList(pl)}</div>
    </div>
  </article>`;
  if(moving){
    if(reach.has(pl))h+=`<ul class="pv">${preview(p,pl,UI.mode).map(x=>`<li class="${x.c||''}">${x.t}</li>`).join('')}</ul><button class="btn primary big" id="moveBtn">${UI.mode==='stay'?'Stay here':'Move here'}</button>`;
    else if(pl===p.pos)h+=`<p class="muted">Your ${W.merchant} is here. Pick a different place to move to.</p>`;
    else h+=`<p class="muted">Out of reach: ${dist(G,p.pos,pl)} steps away.</p>`;
  }
  $('#panel').innerHTML=h;
  const mb=$('#moveBtn');if(mb)mb.onclick=()=>commitMove(pl);
  const rx=$('#recapX');if(rx)rx.onclick=()=>{UI.recapHidden=true;render();};
  // players
  const tgt=winTarget(G);
  $('#players').innerHTML=G.players.map(q=>{
    const me=q===p&&!G.over;const mine=ON.code?ownerOf(q)===ME:false;const away=ON.code&&!q.ai&&!(ON.data&&ON.data.presence&&ON.data.presence[ownerOf(q)]);const out=Object.entries(q.assist).map(([k,n])=>SHORT[k]+(n>1?' ×'+n:'')).join(', ');
    const showHand=ON.code?mine:(me&&!q.ai);
    const canRejoin=ON.code&&away&&!q.ai&&!G.players.some(x=>ownerOf(x)===ME);
    const port=PORT(q.color);
    return `<div class="pl" data-pi="${q.i}"><div class="plh">${port?`<span class="portrait c-${q.color}" style="background-image:url('${port}')"></span>`:`<i class="mer c-${q.color}"></i>`}<span class="nm">${esc(q.name)}</span>${q.ai?`<span class="tag">AI${lvlOf(q)!=='normal'?' · '+LEVELS[lvlOf(q)]:''}</span>`:''}${mine?'<span class="tag">You</span>':''}${away?'<span class="tag">Away</span>':''}${me?'<span class="tag turn">Turn</span>':''}
      <span class="rubies" aria-label="${q.rubies} ${W.rubies}">${[...Array(tgt)].map((_,i)=>`<span class="${i<q.rubies?'ruby':'off'}">◆</span>`).join('')}${q.rubies>tgt?`<span class="ruby">+${q.rubies-tgt}</span>`:''}</span></div>
      <div class="stats"><span data-stat="lira"><b>${q.lira}</b> ${W.cur}</span>${G.x?`<span data-stat="coffee">${teaIc()} <b>${q.coffee}</b> ${W.coffee}</span>`:''}<span data-stat="ap"><b>${q.stack}</b> ${plural(q.stack,W.assistant,W.assistants)} along${out?` <span class="muted">· out: ${out}</span>`:''}</span><span class="muted">${W.family[0].toUpperCase()+W.family.slice(1)}: ${SHORT[q.family]}</span>${q.tt&&q.tt.m?`<span class="tag tt" data-tt="m" title="${TT_TEXT('m')}">${ICON('gutter-map')?`<img class="gi" src="${ICON('gutter-map')}" alt="">`:''}${W.moveTile}</span>`:''}${q.tt&&q.tt.e?`<span class="tag tt" data-tt="e" title="${TT_TEXT('e')}">${ICON('friends')?`<img class="gi" src="${ICON('friends')}" alt="">`:''}${W.encTile}</span>`:''}${G.x&&G.barrierOwner===q.i?`<span class="tag tt">${ICON('barricade')?`<img class="gi" src="${ICON('barricade')}" alt="">`:''}Holds the ${W.barrier}</span>`:''}
      <span class="tiles4" title="${W.tiles}">${GOODS.map(c=>ICON('badge-'+c)?`<span class="badge ${q.tiles[c]?'on':''}" data-b="${c}" title="${GNAME[c]} ${W.tile}${q.tiles[c]?'':' (not earned)'}"><img class="gi" src="${ICON('badge-'+c)}" alt=""></span>`:`<span class="mt ${q.tiles[c]?'on g-'+c:''}" data-b="${c}" title="${GNAME[c]} tile"></span>`).join('')}</span></div>
      ${cartHTML(q)}
      ${showHand?`<div class="hand">${q.cards.map((c,i)=>cardHTML(c,`data-card="${q.i}:${i}"`,UI.mode===c?'armed':'')).join('')}${(q.guild||[]).map((c,i)=>guildCardHTML(c,`data-guild="${q.i}:${i}"`)).join('')}${!q.cards.length&&!(q.guild||[]).length?`<span class="muted">No ${W.cards}</span>`:''}</div>`:`<div class="stats muted hidhand">${backsHTML(q.cards.length,'f')}${G.x?`<span data-stat="guild">${backsHTML((q.guild||[]).length,'g')}</span>`:''}${!q.cards.length&&!(q.guild||[]).length?`No ${W.cards}`:''}</div>`}
      ${canRejoin?`<button class="btn" style="margin-top:8px" data-rejoin="${q.i}">This is me: play as ${esc(q.name)}</button>`:''}
    </div>`;}).join('');
  document.querySelectorAll('[data-card]').forEach(b=>b.onclick=()=>{const[a,c]=b.dataset.card.split(':');cardTap(+a,+c);});
  document.querySelectorAll('[data-guild]').forEach(b=>b.onclick=()=>{const[a,c]=b.dataset.guild.split(':');guildTap(+a,+c);});
  document.querySelectorAll('[data-rejoin]').forEach(b=>b.onclick=()=>rejoinSeat(+b.dataset.rejoin));
  // log
  $('#log').innerHTML=G.log.slice(0,60).map(e=>`<li class="${e.s?'sep':''}">${e.c?`<i class="c-${e.c}"></i>`:''}<span>${esc(e.t)}</span></li>`).join('');
  const myTurn=ON.code&&!G.over&&isMine(p);
  document.title=myTurn?`● Your turn · ${T.name}`:T.name;
  $('#codeChip').hidden=!ON.code;if(ON.code)$('#codeChip').textContent='Game '+ON.code;
  renderStrip();
  runFx(before);
  if(ON.code&&ON.driving)queueLive();
  tutUpdate();
}
function drawBarrier(){
  const b=$('#board');if(!b)return;b.querySelectorAll('.barrier').forEach(x=>x.remove());
  const key0=G&&G.barrier?G.barrier.join('-')+':'+G.barrierOwner:null;
  b.querySelectorAll('.barrier-ic').forEach(x=>{if(x.dataset.key!==key0)x.remove();});
  if(!G||!G.barrier){BAR_LAST=G?{key:null,at:null}:null;return;}
  const ta=b.querySelector(`.tile[data-pl="${G.barrier[0]}"]`),tb=b.querySelector(`.tile[data-pl="${G.barrier[1]}"]`);if(!ta||!tb)return;
  const br=b.getBoundingClientRect(),ra=ta.getBoundingClientRect(),rb=tb.getBoundingClientRect();
  const ic=ICON('barricade');
  const el=document.createElement('div');el.className='barrier c-'+G.players[G.barrierOwner].color+(ic?' has-ic':'');el.title=`${W.barrier[0].toUpperCase()+W.barrier.slice(1)} (${G.players[G.barrierOwner].name} may cross)`;
  if(Math.abs(ra.top-rb.top)<4){const x=(Math.max(ra.left,rb.left)+Math.min(ra.right,rb.right))/2-br.left;Object.assign(el.style,{left:(x-4)+'px',top:(ra.top-br.top+ra.height*.15)+'px',width:'8px',height:(ra.height*.7)+'px'});}
  else{const y=(Math.max(ra.top,rb.top)+Math.min(ra.bottom,rb.bottom))/2-br.top;Object.assign(el.style,{top:(y-4)+'px',left:(ra.left-br.left+ra.width*.15)+'px',height:'8px',width:(ra.width*.7)+'px'});}
  b.appendChild(el);
  if(ic){const r=el.getBoundingClientRect();const key=G.barrier.join('-')+':'+G.barrierOwner;
    let im=b.querySelector('.barrier-ic');const fresh=!im;
    if(fresh){im=document.createElement('img');im.className='barrier-ic';im.src=ic;im.alt='';im.dataset.key=key;b.appendChild(im);}
    const cx=r.left-br.left+r.width/2,cy=r.top-br.top+r.height/2;Object.assign(im.style,{left:(cx-20)+'px',top:(cy-20)+'px'});
    if(!fresh){BAR_LAST={key,at:{x:cx,y:cy}};return;}
    if(BAR_LAST!==null&&BAR_LAST.key!==key&&!REDUCED){
      let from=BAR_LAST.at;if(!from){const sn=b.querySelector('.tile[data-pl="19"]');if(sn){const t=sn.getBoundingClientRect();from={x:t.left-br.left+t.width/2,y:t.top-br.top+t.height/2};}}
      if(from)im.animate([{transform:`translate(${from.x-cx}px,${from.y-cy}px) scale(.8)`},{transform:`translate(${(from.x-cx)/2}px,${(from.y-cy)/2-50}px) scale(1.3)`,offset:.5},{transform:'translate(0,0) scale(1)'}],{duration:900,easing:'cubic-bezier(.45,0,.4,1)'});
      el.animate([{opacity:0},{opacity:0,offset:.8},{opacity:1}],{duration:900});
    }
    BAR_LAST={key,at:{x:cx,y:cy}};
  }
}
let BAR_LAST=null;
addEventListener('resize',()=>{if(G)drawBarrier();});
/* the handcart: one row per good, five slots; slots past your capacity wait for a crate */
function cartHTML(q){
  const crate=ICON('crate');
  return `<div class="cart" data-cart="${q.i}">${GOODS.map(c=>`<div class="crow r-${c}" data-g="${c}" title="${GNAME[c]}: ${q.goods[c]} of ${cap(q)}">${[...Array(5)].map((_,i)=>{
    const k=i<q.goods[c]?'full':i<cap(q)?'empty':'locked';
    return `<span class="slot ${k}">${k==='full'?chip(c):k==='empty'?`<span class="ghost">${chip(c)}</span>`:crate?`<img class="gi" src="${crate}" alt="">`:''}</span>`;}).join('')}</div>`).join('')}</div>`;
}
/* who is standing on a place, in words (also helps on touch screens, where there is no hover) */
function hereList(pl){
  const out=[];
  G.players.forEach(q=>{if(q.pos===pl)out.push(`<span class="who c-${q.color}"><i></i>${esc(q.name)}</span>`);});
  G.neutrals.forEach(x=>{if(x.pos===pl)out.push(`<span class="who c-grey"><i></i>${W.neutral||`Neutral ${W.merchant}`}</span>`);});
  if(G.gov===pl)out.push(`<span class="who npc">${NT('gov')}</span>`);
  if(G.smug===pl)out.push(`<span class="who npc">${NT('smug')}</span>`);
  if(G.x&&G.trader===pl)out.push(`<span class="who npc">${NT('trader')}</span>`);
  G.players.forEach(q=>{if(q.assist[pl])out.push(`<span class="who c-${q.color}"><i></i>${esc(q.name)}'s ${plural(q.assist[pl],W.assistant,W.assistants)}${q.assist[pl]>1?' ×'+q.assist[pl]:''}</span>`);});
  G.players.forEach(q=>{if(q.family===pl)out.push(`<span class="who c-${q.color}"><i></i>${esc(q.name)}'s ${W.family}</span>`);});
  return out.length?`<div class="here"><span class="k">Here</span>${out.join('')}</div>`:'';
}
/* hover labels for pieces on the board */
function tipLabel(el){
  const k=el.dataset.k||'';let m;
  if((m=/^m(\d+)$/.exec(k))){const q=G.players[+m[1]];return `${esc(q.name)}${isMine(q)?' (you)':''}`+` · ${W.merchant}`;}
  if((m=/^a(\d+)-(\d+)$/.exec(k))){const q=G.players[+m[1]];const n=q.assist[+m[2]]||1;return `${esc(q.name)}'s ${plural(n,W.assistant,W.assistants)}${n>1?' ×'+n:''}`;}
  if((m=/^f(\d+)$/.exec(k))){const q=G.players[+m[1]];return `${esc(q.name)}'s ${W.family}`;}
  if(/^n\d+$/.test(k))return W.neutral||`Neutral ${W.merchant}`;
  if(k==='gov'||k==='smug'||k==='trader')return NT(k);
  return el.getAttribute('aria-label')||'';
}
function initTips(){
  const b=$('#board');const tip=document.createElement('div');tip.className='tip';tip.hidden=true;document.body.appendChild(tip);
  b.addEventListener('mouseover',e=>{const el=e.target.closest('[data-k]');if(!el||!b.contains(el)){tip.hidden=true;return;}
    if(el.title){el.dataset.t=el.title;el.removeAttribute('title');}
    tip.innerHTML=tipLabel(el);if(!tip.innerHTML){tip.hidden=true;return;}
    const r=el.getBoundingClientRect();tip.hidden=false;const tr=tip.getBoundingClientRect();
    tip.style.left=Math.max(6,Math.min(innerWidth-tr.width-6,r.left+r.width/2-tr.width/2))+'px';tip.style.top=Math.max(6,r.top-tr.height-6)+'px';});
  b.addEventListener('mouseleave',()=>tip.hidden=true);
  addEventListener('scroll',()=>tip.hidden=true,{passive:true});
}
/* gains fly out of the tile and into the player's board */
function flyTarget(i,what,out){
  const strip=$('#myStrip');const sp=stripPlayer();
  const inView=el=>{if(!el)return false;const r=el.getBoundingClientRect();return r.width>0&&r.bottom>0&&r.top<innerHeight;};
  let el=null;
  if(sp&&sp.i===i&&!strip.hidden&&getComputedStyle(strip).display!=='none'){
    el=what==='ap'?strip.querySelector('.ms-ap'):what==='lira'?strip.querySelector('.ms-coin'):what==='coffee'?strip.querySelector('.ms-tea'):strip.querySelector(`.ms-g[data-g="${what}"]`);
    if(inView(el))return el;}
  const card=document.querySelector(`.pl[data-pi="${i}"]`);if(!card)return null;
  if(what==='ap'){el=card.querySelector('[data-stat="ap"] b');return inView(el)?el:null;}
  el=what==='lira'?card.querySelector('[data-stat="lira"]'):what==='coffee'?card.querySelector('[data-stat="coffee"]'):card.querySelector(`.crow[data-g="${what}"] .slot.full:last-of-type`)||card.querySelector(`.crow[data-g="${what}"]`);
  if(what!=='lira'&&what!=='coffee'){const row=card.querySelector(`.crow[data-g="${what}"]`);
    if(out){const empty=row&&row.querySelector('.slot.empty');el=empty||row;}  // the slot the good just left
    else{const full=row&&row.querySelectorAll('.slot.full');if(full&&full.length)el=full[full.length-1];}}
  return inView(el)?el:null;
}
function flyGain(i,what,n,html,out){
  if(REDUCED)return;
  const tok=document.querySelector(`#board [data-k="m${i}"]`)||document.querySelector(`#board .tile[data-pl="${G.players[i].pos}"]`);
  const bd=flyTarget(i,what,out);if(!tok||!bd)return;
  const tr=tok.getBoundingClientRect(),br=bd.getBoundingClientRect();
  const tx=tr.left+tr.width/2,ty=tr.top+tr.height*0.4,bx=br.left+br.width/2,by=br.top+br.height/2;
  if(out){flyOut(bx,by,tx,ty,n,html,bd);return;}
  const sx=tx,sy=ty,ex=bx,ey=by,to=bd;
  const m=n;
  for(let k=0;k<m;k++){
    const el=document.createElement('div');el.className='fly';el.innerHTML=html;document.body.appendChild(el);
    const ox=SPREAD(k,m),up=-38-6*(k%5);
    const mx=(sx+ex)/2,my=Math.min(sy,ey)-70;
    const anim=el.animate([
      {transform:`translate(${sx}px,${sy}px) translate(-50%,-50%) scale(.3)`,opacity:0},
      {transform:`translate(${sx+ox}px,${sy+up}px) translate(-50%,-50%) scale(1.25)`,opacity:1,offset:.28},
      {transform:`translate(${sx+ox}px,${sy+up-6}px) translate(-50%,-50%) scale(1.1)`,opacity:1,offset:.42},
      {transform:`translate(${mx}px,${my}px) translate(-50%,-50%) scale(.95)`,opacity:1,offset:.7},
      {transform:`translate(${ex}px,${ey}px) translate(-50%,-50%) scale(.6)`,opacity:.9}],
      {duration:1150,delay:GAP(m)*k,easing:'cubic-bezier(.45,0,.4,1)',fill:'backwards'});
    anim.onfinish=()=>{el.remove();if(k===m-1)to.animate([{transform:'scale(1)'},{transform:'scale(1.35)'},{transform:'scale(1)'}],{duration:320,easing:'ease-out'});};
  }
}
/* apprentices: gathered ones fly back to your board, placed ones fly out to the tile */
function flyApprentices(i,was,now,before,br){
  const q=G.players[i];const ic=ICON('apprentice');
  const html=`<i class="ast icon c-${q.color}" style="width:24px;height:24px">${ic?`<img src="${ic}" alt="">`:''}</i>`;
  const board=flyTarget(i,'ap');
  const places=new Set([...Object.keys(was),...Object.keys(now)]);
  let k=0;
  places.forEach(pl=>{
    const d=(now[pl]||0)-(was[pl]||0);if(!d)return;
    const key=`a${i}-${pl}`;
    if(d<0){ // picked up / called home: from where the token stood to the board
      const r=before[key];if(!r||!board)return;
      const sx=br.left+r.x+10,sy=br.top+r.y+10,z=board.getBoundingClientRect();
      flyPath(sx,sy,z.left+z.width/2,z.top+z.height/2,-d,html,180*k++,()=>bump(board));
    }else{ // left behind: from the board to the tile
      const el=document.querySelector(`#board [data-k="${key}"]`);if(!el)return;
      const show=()=>{el.style.opacity='';delete el.dataset.fly;el.animate([{scale:.4},{scale:1.3,offset:.6},{scale:1}],{duration:320,easing:'ease-out'});};
      if(!board||REDUCED){show();return;}
      el.dataset.fly='1';el.style.opacity='0';
      const z=board.getBoundingClientRect(),t=el.getBoundingClientRect();
      bump(board);flyPath(z.left+z.width/2,z.top+z.height/2,t.left+t.width/2,t.top+t.height/2,d,html,180*k++,show);
    }
  });
}
const bump=el=>el.animate([{transform:'scale(1)'},{transform:'scale(1.3)'},{transform:'scale(1)'}],{duration:300,easing:'ease-out'});
function flyPath(sx,sy,ex,ey,n,html,delay,onLand){
  if(REDUCED){onLand&&onLand();return;}
  const m=n,mx=(sx+ex)/2,my=Math.min(sy,ey)-60;
  for(let k=0;k<m;k++){
    const el=document.createElement('div');el.className='fly';el.innerHTML=html;document.body.appendChild(el);
    el.animate([
      {transform:`translate(${sx}px,${sy}px) translate(-50%,-50%) scale(.8)`,opacity:0},
      {transform:`translate(${sx}px,${sy-22}px) translate(-50%,-50%) scale(1.15)`,opacity:1,offset:.2},
      {transform:`translate(${mx}px,${my}px) translate(-50%,-50%) scale(1.05)`,opacity:1,offset:.6},
      {transform:`translate(${ex}px,${ey}px) translate(-50%,-50%) scale(.85)`,opacity:1}],
      {duration:1000,delay:delay+GAP(m)*k,easing:'cubic-bezier(.45,0,.4,1)',fill:'backwards'}).onfinish=()=>{el.remove();if(k===m-1&&onLand)onLand();};
  }
}
/* badges, Snug favours and guild cards travel between their place on the board and the player's panel */
function flyItems(i,was,now){
  if(REDUCED)return;
  const card=document.querySelector(`.pl[data-pi="${i}"]`);if(!card)return;
  const tile=pl=>document.querySelector(`#board .tile[data-pl="${pl}"]`);
  const ctr=el=>{const r=el.getBoundingClientRect();return[r.left+r.width/2,r.top+r.height/2];};
  const inView=el=>{if(!el)return false;const r=el.getBoundingClientRect();return r.width>0&&r.bottom>0&&r.top<innerHeight;};
  const go=(fromEl,toEl,icon,size,delay,land)=>{if(!fromEl||!toEl||!inView(toEl)&&!inView(fromEl))return;const[a,b]=ctr(fromEl),[c,d]=ctr(toEl);
    flyPath(a,b,c,d,1,`<img class="gi" src="${ICON(icon)}" alt="" style="width:${size}px;height:${size}px">`,delay,()=>{land&&land();toEl.animate([{transform:'scale(1)'},{transform:'scale(1.35)'},{transform:'scale(1)'}],{duration:320});});};
  let k=0;
  GOODS.forEach(c=>{if(now.badges&&was.badges&&now.badges[c]>was.badges[c]&&ICON('badge-'+c)){const to=card.querySelector(`[data-b="${c}"]`);go(tile(LODGE[14].includes(c)?14:15),to,'badge-'+c,40,150*k++);}});
  ['m','e'].forEach(t=>{if(now.tt&&(now.tt[t]||0)>(was.tt&&was.tt[t]||0)){const to=card.querySelector(`[data-tt="${t}"]`);go(tile(19),to,t==='m'?'gutter-map':'friends',40,150*k++);}});
  if(ICON('card')&&now.cards!==was.cards){
    const tok=document.querySelector(`#board [data-k="m${i}"]`)||tile(G.players[i].pos);
    const hand=[...card.querySelectorAll('.pcard.fav')].pop()||card.querySelector('.backs.f')||card.querySelector('.hand,.hidhand');
    const d=now.cards-was.cards;
    for(let n=0;n<Math.abs(d);n++){if(d>0)go(tok,hand,'card',36,150*k++);else go(hand||card,tok,'card',36,150*k++);}
  }
  if(ICON('guild-card')&&now.guild!==was.guild){
    const hand=[...card.querySelectorAll('.pcard.gld')].pop()||card.querySelector('.backs.g')||card.querySelector('[data-stat="guild"]')||card.querySelector('.hand,.hidhand');
    const d=now.guild-was.guild;
    for(let n=0;n<Math.abs(d);n++){
      if(d>0)go(tile(18),hand,'guild-card',36,150*k++);
      else go(hand||card,tile(18),'guild-card',36,150*k++);
    }
  }
}
/* spending: lifts off the player's board and drops onto the tile */
function flyOut(sx,sy,ex,ey,n,html,from){
  const m=n;from.animate([{transform:'scale(1)'},{transform:'scale(.8)'},{transform:'scale(1)'}],{duration:260});
  for(let k=0;k<m;k++){
    const el=document.createElement('div');el.className='fly out';el.innerHTML=html;document.body.appendChild(el);
    const ox=SPREAD(k,m),mx=(sx+ex)/2,my=Math.min(sy,ey)-70;
    el.animate([
      {transform:`translate(${sx}px,${sy}px) translate(-50%,-50%) scale(.7)`,opacity:0},
      {transform:`translate(${sx}px,${sy-26}px) translate(-50%,-50%) scale(1.15)`,opacity:1,offset:.2},
      {transform:`translate(${mx}px,${my}px) translate(-50%,-50%) scale(1)`,opacity:1,offset:.6},
      {transform:`translate(${ex+ox}px,${ey-10}px) translate(-50%,-50%) scale(.9)`,opacity:1,offset:.88},
      {transform:`translate(${ex+ox}px,${ey+6}px) translate(-50%,-50%) scale(.4)`,opacity:0}],
      {duration:1100,delay:GAP(m)*k,easing:'cubic-bezier(.45,0,.4,1)',fill:'backwards'}).onfinish=()=>el.remove();
  }
}
/* close-up of a player's standee */
const PORT=c=>{const a=T.art.merchants&&T.art.merchants[c];return a?a.replace('/standees/','/portraits/'):null;};
/* ---------- physical cards ---------- */
const I=(k,cls='')=>ICON(k)?`<img class="ci ${cls}" src="${ICON(k)}" alt="">`:'';
const PT=pl=>{const a=T.art.tiles&&T.art.tiles[pl];return `<span class="cpl" ${a?`style="background-image:url('${a}')"`:''}><b>${pl}</b></span>`;};
const NUM=(t,cls='')=>`<span class="cn ${cls}">${t}</span>`;
const goodI=c=>ICON(GICON[c])?I(GICON[c]):chip(c);
const dieI=n=>`<span class="cdie">${dieFace(n)}</span>`;
function cardArt(k){
  switch(k){
  case 'good':return `${I('any','big')}${NUM('+1')}`;
  case 'lira5':return `${I('coin','big')}${NUM('+5')}`;
  case 'dEnvoy':return `${PT(13)}${NUM('2×')}`;
  case 'dPost':return `${PT(5)}${NUM('2×')}`;
  case 'dGem':return `${PT(16)}${NUM('2×')}`;
  case 'dWain':return `${PT(1)}${NUM('2×')}`;
  case 'dCH':return `${PT(20)}${NUM('2×')}`;
  case 'smAny':return `${PT(11)}${I('any')}`;
  case 'family':return `${I('cousin')}<span class="arr">→</span>${PT(12)}`;
  case 'stay':return `<span class="glyph">⟲</span>${NUM('0','sm')}`;
  case 'move34':return `<span class="glyph">👣</span>${NUM('3–4','sm')}`;
  case 'recall':return `${I('apprentice','big')}<span class="arr">↩</span>`;
  case 'tea2':return `${I('coffee','big')}${NUM('+2')}`;
  case 'gcard':return `${I('coffee')}${NUM('2','sm')}<span class="arr">→</span>${I('guild-card')}`;
  case 'tea8':return `${I('coffee')}<span class="arr">→</span>${I('coin')}${NUM('8','sm')}`;
  case 'diceGift':return `${dieI(3)}${dieI(5)}`;
  case 'swap3':return `<span class="glyph">⇄</span>${NUM('×3','sm')}`;
  case 'six':return `${dieI(6)}`;
  case 'corner':return `<span class="glyph corner">⌜ ⌟</span>`;
  }
  return '';
}
function guildArt(n){
  const fill=c=>`${goodI(c)}${NUM('max','sm')}${I('any')}`;
  return {1:`${I('crate','big')}${NUM('+1')}`,2:fill('r'),3:fill('g'),4:fill('y'),5:`${I('coin')}${NUM('4','sm')}${I('any')}${NUM('×4','sm')}`,
    6:`${I('card','big')}${NUM('+3')}`,7:`${PT(7)}${NUM('+1 turn','sm')}`,8:`${I('any')}${NUM('2','sm')}${dieI(4)}${I('pearls')}`,
    9:`${PT(9)}${NUM('×2')}`,10:`${goodI('r')}${goodI('g')}${goodI('y')}<span class="arr">→</span>${NUM('15','sm')}`,11:`${goodI('b')}${goodI('r')}${goodI('g')}<span class="arr">→</span>${NUM('20','sm')}`,
    12:`<span class="glyph">✳</span>${I('cousin')}`,13:`${I('any')}${NUM('×6','sm')}<span class="arr">→</span>${I('feather')}`,14:`${PT(14)}${I('badge-r')}${I('badge-g')}`,15:`${PT(15)}${I('badge-y')}${I('badge-b')}`,
    16:`${I('coin')}${NUM('15','sm')}<span class="arr">→</span>${I('feather')}`,17:`${I('coffee','big')}${NUM('+5')}`,18:`${I('coffee')}${I('guild-card')}${NUM('×2','sm')}`,
    19:`${PT(19)}${NUM('×2','sm')}`,20:`${PT(20)}${NUM('½','sm')}`}[n]||'';
}
const shortText=t=>t.length>54?t.slice(0,52).replace(/\s+\S*$/,'')+'…':t;
/* painted card art (THEME.art.cards[key], THEME.art.guild[n]) fills the window; the icon formula stays as a small badge */
const PA=(img,html)=>img?`<span class="pa painted" style="background-image:url('${img}')"><span class="pform">${html}</span></span>`:`<span class="pa">${html}</span>`;
function cardHTML(k,attrs='',extra=''){const d=CARD_DEFS[k];
  return `<button class="pcard fav ${extra}" ${attrs} aria-label="${esc(d.name)}: ${esc(d.text)}"><span class="pt">${d.name}</span>${PA(T.art.cards&&T.art.cards[k],cardArt(k))}<span class="px">${shortText(d.text)}</span></button>`;}
function guildCardHTML(n,attrs='',extra=''){
  return `<button class="pcard gld ${extra}" ${attrs} aria-label="${esc(guildName(n))}: ${esc(guildText(n))}"><span class="pt">${guildName(n)}</span>${PA(T.art.guild&&T.art.guild[n],guildArt(n))}<span class="px">${shortText(guildText(n))}</span><i class="gno">${n}</i></button>`;}
function backsHTML(n,kind){const ic=ICON(kind==='g'?'guild-card':'card');
  return n?`<span class="backs ${kind}" title="${n} ${kind==='g'?plural(n,W.guildCard,W.guildCards):plural(n,W.card,W.cards)}">${[...Array(Math.min(n,6))].map((_,i)=>`<span class="cback ${kind}" style="--i:${i}">${ic?`<img src="${ic}" alt="">`:''}</span>`).join('')}<b>${n}</b></span>`:'';}

const GAP=n=>Math.max(28,Math.min(120,900/Math.max(1,n))); // ms between icons
const SPREAD=(k,m)=>((k%5)-(Math.min(m,5)-1)/2)*12;
/* ---------- my status strip (phones) ---------- */
let LAST_HUMAN=null;
function stripPlayer(){
  if(!G)return null;
  if(ON.code)return G.players.find(q=>ownerOf(q)===ME)||null;
  const p=cur(G);if(!p.ai){LAST_HUMAN=p.i;return p;}
  if(LAST_HUMAN!=null&&G.players[LAST_HUMAN]&&!G.players[LAST_HUMAN].ai)return G.players[LAST_HUMAN];
  return G.players.find(q=>!q.ai)||null;
}
function renderStrip(){
  const el=$('#myStrip');const q=stripPlayer();
  if(!q||$('#table').hidden){el.hidden=true;fitDock();return;}
  el.hidden=false;
  const port=PORT(q.color);
  const fe=ICON('feather');
  const turn=q===cur(G)&&!G.over;
  el.innerHTML=`<button class="ms-who ${turn?'turn':''}" id="msWho" aria-label="Show ${esc(q.name)}'s details">
      ${port?`<span class="portrait c-${q.color}" style="background-image:url('${port}')"></span>`:`<i class="mer c-${q.color}"></i>`}
      <span class="ms-name">${esc(q.name)}<small>${turn?'Your turn':'You'}</small></span></button>
    <span class="ms-stat ms-feath" title="${W.rubies}">${fe?`<img class="gi" src="${fe}" alt="">`:'<span class="ruby">◆</span>'}<b>${q.rubies}</b><small>/${winTarget(G)}</small></span>
    <span class="ms-stat ms-coin" title="${W.cur}">${coinIc()||'<span class="coin">c</span>'}<b>${q.lira}</b></span>${G.x?`<span class="ms-stat ms-tea" title="${W.coffeeLong}">${teaIc()}<b>${q.coffee}</b></span>`:''}
    <span class="ms-goods">${GOODS.map(c=>`<span class="ms-g ${q.goods[c]>=cap(q)?'full':''} ${q.goods[c]===0?'zero':''}" data-g="${c}" title="${GNAME[c]} ${q.goods[c]} of ${cap(q)}">${chip(c)}<b>${q.goods[c]}</b><small>/${cap(q)}</small></span>`).join('')}</span>
    <span class="ms-stat ms-ap ${q.stack===0?'bad':''}" title="${W.assistants} with you">${ICON('apprentice')?`<img class="gi" src="${ICON('apprentice')}" alt="">`:`<i class="ast c-${q.color}"></i>`}<b>${q.stack}</b></span>
    <span class="ms-stat ms-cards" title="${W.cards}">${ICON('card')?`<img class="gi" src="${ICON('card')}" alt="">`:'<span class="mini-card"></span>'}<b>${q.cards.length}</b></span>${q.ext&&ICON('crate')?`<span class="ms-stat ms-crate" title="${W.ext}s">${`<img class="gi" src="${ICON('crate')}" alt="">`}<b>${q.ext}</b></span>`:''}`;
  $('#msWho').onclick=()=>{const t=document.querySelector(`.pl[data-pi="${q.i}"]`);if(t)t.scrollIntoView({behavior:REDUCED?'auto':'smooth',block:'center'});};
  fitDock();
}
function fitDock(){const d=$('#dock');const h=d.offsetHeight||0;document.body.style.setProperty('--dock-h',h+'px');}
addEventListener('resize',fitDock);
function commitMove(pl){if(!pendingMove)return;UI.recapHidden=false;$('#moveBar').hidden=true;fitDock();document.body.classList.remove('has-movebar');pendingMove(pl);}
const AWARDS=[ // fun titles on the results screen: [stat, title, how it reads]
  ['steps','Busiest paws',n=>`walked ${n} ${plural(n,'place','places')}`],
  ['sold','Sharpest haggler',n=>`sold for ${L(n)}`],
  ['paid','Most generous neighbour',n=>`paid rivals ${L(n)}`],
  ['deals','Back-alley regular',n=>`${n} ${plural(n,'deal','deals')} with ${G&&G.x?'the Crow, Fox and Forager':'the Crow and Fox'}`],
  ['caught','Cousin catcher',n=>`caught ${n} ${plural(n,W.family,W.family+'s')}`],
  ['bet','Lucky bones',n=>`won ${L(n)} at the ${SHORT[9]}`]];
function awardsFor(g){
  const out=[];
  for(const[k,title,say]of AWARDS){const v=g.players.map(q=>(q.st&&q.st[k])||0);const m=Math.max(...v);if(m<=0)continue;
    const who=g.players.filter((q,i)=>v[i]===m);if(who.length===g.players.length&&g.players.length>1)continue;
    out.push({title,who,text:say(m)});}
  return out.slice(0,4);
}
function endHTML(g){
  const rows=g.result.map((i,k)=>{const q=g.players[i];const port=PORT(q.color);
    const src=Object.entries(q.fsrc||{}).sort((a,b)=>b[1]-a[1]).map(([w,n])=>{const k=Object.keys(PNAME).find(i=>PNAME[i]===w);return `<span class="es-src"><span class="ruby">◆</span>${n} ${esc(k?SHORT[k]:w)}</span>`;}).join('');
    return `<div class="es-row ${k===0?'win':''}"><span class="es-rk">${k+1}</span>${port?`<span class="portrait c-${q.color}" style="background-image:url('${port}')"></span>`:`<i class="mer c-${q.color}"></i>`}
      <div class="es-mid"><b>${esc(q.name)}</b>${q.ai?` <span class="tag">AI${q.lvl&&q.lvl!=='normal'?' · '+LEVELS[q.lvl]:''}</span>`:''}<div class="es-srcs">${src||'<span class="muted">No feathers this time</span>'}</div></div>
      <div class="es-num"><span class="ruby">◆ ${q.rubies}</span><small>${q.lira} ${W.cur}</small></div></div>`;}).join('');
  const aw=awardsFor(g);
  return `<div class="es">${rows}</div>${aw.length?`<h4 class="es-h">Market awards</h4><div class="es-aw">${aw.map(a=>`<div><b>${a.title}</b><span>${a.who.map(q=>esc(q.name)).join(' & ')}</span><small>${a.text}</small></div>`).join('')}</div>`:''}
  <p class="muted es-tie">Ties go to most ${W.cur}, then goods, then ${W.cards}.</p>`;
}
function canRematch(){return G&&G.over&&(!ON.code||G.players.some(q=>!q.ai&&ownerOf(q)===ME));}
function showEnd(){
  if(!G||!G.over)return;
  const nxt=ON.code&&ON.data&&ON.data.next;
  const btns=[];
  if(canRematch())btns.push({label:nxt?'Join the rematch':'Rematch',value:'again',primary:true});
  btns.push({label:'Back to the menu',value:'new',primary:!canRematch()},{label:'Look at the board',value:null});
  sheet(`${esc(G.players[G.result[0]].name)} wins`,endHTML(G),btns,{wide:true}).then(v=>{if(v==='new')goHome();if(v==='again')rematch();});
}
async function rematch(){
  if(!ON.code){const cfg=clone(G.cfg||{});cfg.players=G.players.map(q=>({name:q.name,ai:q.ai,lvl:q.lvl}));if(G.tut){cfg.layout='short';cfg.exp=false;}startGame(cfg);return;}
  const old=ON.code,d=ON.data;
  if(d&&d.next){enterOnline(d.next);return;}
  const code=rcode();
  const g=newGame({players:G.players.map(q=>({name:q.name,ai:q.ai,lvl:q.lvl,owner:q.ai?'ai':ownerOf(q)})),layout:G.cfg&&G.cfg.layout||'short',exp:!!G.x});
  try{
    await ON.net.set('games/'+code,{host:ME,created:Date.now(),status:'playing',layout:G.cfg&&G.cfg.layout||'short',exp:!!G.x,version:1,started:Date.now(),
      seats:g.players.map(q=>({name:q.name,ai:q.ai,owner:q.owner,lvl:q.lvl||null})),state:JSON.stringify(g)});
    const ok=await ON.net.tx(`games/${old}/next`,c=>c?undefined:code);
    if(!ok){await ON.net.set('games/'+code,null);const nx=ON.data&&ON.data.next;if(nx)enterOnline(nx);return;}
    pingPush(code);enterOnline(code);
  }catch(e){toast("Couldn't start the rematch: "+(e.message||e));}
}
function setupSheet(){
  const prev=(G&&G.cfg&&!ON.code)?G.cfg:{players:[{name:lsGet('riverfair-name')||'Player 1',ai:false},{name:AI_NAMES[1],ai:true},{name:AI_NAMES[2],ai:true}],layout:'short'};
  const names=[lsGet('riverfair-name')||'Player 1',...AI_NAMES.slice(1)];
  const st={n:prev.players.length,players:names.map((n,i)=>prev.players[i]?{name:prev.players[i].name,ai:prev.players[i].ai}:{name:n,ai:true}),layout:prev.layout,exp:!!prev.exp,lvl:prev.lvl||lsGet('riverfair-lvl')||'normal'};
  const w=$('#sheetWrap'),s=$('#sheet');s.className='';
  const draw=()=>{
    s.innerHTML=`<h2>New game on this device</h2><div class="form">
      <div><h4>Players</h4><div class="seg" id="nseg">${[2,3,4,5].map(n=>`<button data-n="${n}" class="${st.n===n?'on':''}">${n}</button>`).join('')}</div></div>
      ${st.players.slice(0,st.n).map((pl,i)=>`<div class="prow"><i class="mer c-${COLORS[i]}"></i><input id="pname${i}" value="${esc(pl.name)}" aria-label="Player ${i+1} name" maxlength="16"><div class="seg">${['Human','AI'].map(k=>`<button data-p="${i}" data-ai="${k==='AI'?1:0}" class="${(pl.ai?'AI':'Human')===k?'on':''}">${k}</button>`).join('')}</div></div>`).join('')}
      <div><h4>Board layout</h4><select id="layoutSel"><option value="short" ${st.layout==='short'?'selected':''}>Short paths (learning)</option><option value="order" ${st.layout==='order'?'selected':''}>In order (similar places together)</option><option value="random" ${st.layout==='random'?'selected':''}>Random</option></select></div>
      ${lvlToggle(st.lvl)}
      ${expToggle(st.exp)}
      <div class="sbtns"><button class="btn primary big" id="goBtn">Start game</button><button class="btn" id="cancelBtn">Cancel</button></div></div>`;
    const keep=()=>st.players.slice(0,st.n).forEach((pl,i)=>{const el=$('#pname'+i);if(el)pl.name=el.value.trim()||('Player '+(i+1));});
    s.querySelectorAll('[data-n]').forEach(b=>b.onclick=()=>{keep();st.n=+b.dataset.n;draw();});
    s.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>{keep();st.players[+b.dataset.p].ai=b.dataset.ai==='1';draw();});
    $('#layoutSel').onchange=e=>st.layout=e.target.value;
    s.querySelectorAll('[data-exp]').forEach(b=>b.onclick=()=>{keep();st.exp=b.dataset.exp==='1';draw();});
    s.querySelectorAll('[data-lvl]').forEach(b=>b.onclick=()=>{keep();st.lvl=b.dataset.lvl;draw();});
    $('#cancelBtn').onclick=()=>{w.hidden=true;};
    $('#goBtn').onclick=()=>{keep();w.hidden=true;lsSet('riverfair-lvl',st.lvl);startGame({players:st.players.slice(0,st.n).map(p=>({name:cleanName(p.name),ai:p.ai,lvl:p.ai?st.lvl:undefined})),layout:st.layout,exp:st.exp,lvl:st.lvl});};
  };
  draw();w.hidden=false;
}

const lvlToggle=v=>`<div><h4>AI skill</h4><div class="seg">${Object.entries(LEVELS).map(([k,l])=>`<button data-lvl="${k}" class="${v===k?'on':''}">${l}</button>`).join('')}</div><p class="muted small">${{easy:'Takes good moves, not always the best. Good for learning.',normal:'Picks the best move it can see this turn.',hard:'Plans two moves ahead and bets smarter at the Tavern.'}[v]}</p></div>`;
const expToggle=on=>`<div><h4>Expansion</h4><div class="seg">${[['0','Base game'],['1',T.expName||'Expansion']].map(([v,l])=>`<button data-exp="${v}" class="${(on?'1':'0')===v?'on':''}">${l}</button>`).join('')}</div><p class="muted small">Adds 4 places on a 5×4 board: ${W.coffeeLong}, ${NS('trader')}, ${W.guildCards}, the ${PNAME[19]} and 9 new ${W.cards}. Games end at 6 ${W.rubies}.</p></div>`;
/* ---------- shared helpers for screens ---------- */
function rid(n){const a='abcdefghijkmnpqrstuvwxyz23456789';let s='';for(let i=0;i<n;i++)s+=a[Math.floor(Math.random()*a.length)];return s;}
function rcode(){const a='ABCDEFGHJKMNPQRSTUVWXYZ23456789';let s='';for(let i=0;i<5;i++)s+=a[Math.floor(Math.random()*a.length)];return s;}
const shareLink=code=>location.origin+location.pathname+'?game='+code;
async function copyText(t){try{await navigator.clipboard.writeText(t);toast('Link copied');}catch(e){toast(t);}}
function showScreen(name){['home','lobby','table'].forEach(n=>$('#'+n).hidden=n!==name);document.body.classList.toggle('on-home',name==='home'||name==='lobby');document.body.classList.toggle('on-lobby',name==='lobby');if(name!=='table'){$('#myStrip').hidden=true;$('#moveBar').hidden=true;fitDock();}if(name!=='table'){$('#roundInfo').textContent='';document.title=T.name;}$('#codeChip').hidden=!ON.code;if(ON.code)$('#codeChip').textContent='Game '+ON.code;renderPushBtn();}

/* ---------- online play (Firebase Realtime Database) ---------- */
const FIREBASE_CONFIG={
  apiKey:"AIzaSyAdmojl8aqsod9PKgs6mLeVOHtin_LuHSA",
  authDomain:"istanbul-8c39c.firebaseapp.com",
  databaseURL:"https://istanbul-8c39c-default-rtdb.firebaseio.com",
  projectId:"istanbul-8c39c",
  storageBucket:"istanbul-8c39c.firebasestorage.app",
  messagingSenderId:"603257531019",
  appId:"1:603257531019:web:7a3c7b4da29694c344428e"};
const FB_VER='10.12.2';
const MOCK=new URLSearchParams(location.search).has('mock');
const ME=(()=>{const k='riverfair-me';try{const st=MOCK?sessionStorage:localStorage;let id=st.getItem(k);if(!id){id=rid(12);st.setItem(k,id);}return id;}catch(e){return rid(12);}})();
const ON={code:null,net:null,data:null,version:0,driving:false,drive:0,liveT:null,lastLive:null,unsub:null,presenceOn:false,shownEnd:false,timer:null};
let netP=null;
function getNet(){if(!netP)netP=(MOCK?Promise.resolve(mockNet()):firebaseNet()).catch(e=>{netP=null;throw e;});return netP;}
async function firebaseNet(){
  const [appM,db]=await Promise.all([import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-app.js`),import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-database.js`)]);
  const d=db.getDatabase(appM.initializeApp(FIREBASE_CONFIG));const R=p=>db.ref(d,p);
  return{
    on:(p,cb,err)=>db.onValue(R(p),s=>cb(s.val()),e=>err&&err(e)),
    set:(p,v)=>db.set(R(p),v),
    tx:async(p,fn)=>(await db.runTransaction(R(p),c=>fn(c),{applyLocally:false})).committed,
    presence:p=>db.onValue(R('.info/connected'),s=>{if(s.val()){db.onDisconnect(R(p)).remove();db.set(R(p),Date.now());}}),
    leave:p=>db.set(R(p),null)};
}
function mockNet(){ // same-browser stand-in used for testing: add ?mock to the URL
  const KEY='riverfair-mockdb',subs=[];
  const cl=v=>v===undefined?null:JSON.parse(JSON.stringify(v));
  const load=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}');}catch(e){return{};}};
  const at=(t,p)=>p.split('/').filter(Boolean).reduce((o,k)=>o==null?undefined:o[k],t);
  const put=(t,p,v)=>{const ks=p.split('/').filter(Boolean);let o=t;for(let i=0;i<ks.length-1;i++){if(o[ks[i]]==null||typeof o[ks[i]]!=='object')o[ks[i]]={};o=o[ks[i]];}if(v==null)delete o[ks.at(-1)];else o[ks.at(-1)]=cl(v);};
  const fire=()=>{const t=load();subs.forEach(s=>s.cb(cl(at(t,s.p))));};
  const write=(p,v)=>{const t=load();put(t,p,v);localStorage.setItem(KEY,JSON.stringify(t));setTimeout(fire,0);};
  addEventListener('storage',e=>{if(e.key===KEY)fire();});
  return{on:(p,cb)=>{const s={p,cb};subs.push(s);setTimeout(()=>cb(cl(at(load(),p))),0);return()=>{const i=subs.indexOf(s);if(i>=0)subs.splice(i,1);};},
    set:async(p,v)=>write(p,v),
    tx:async(p,fn)=>{const r=fn(cl(at(load(),p)));if(r===undefined)return false;write(p,r);return true;},
    presence:p=>{write(p,Date.now());addEventListener('pagehide',()=>write(p,null));},
    leave:p=>write(p,null)};
}
const ownerOf=q=>(ON.data&&ON.data.claims&&ON.data.claims['s'+q.i])||q.owner;
function netError(msg){clearTimeout(ON.timer);showScreen('lobby');$('#lobby').innerHTML=`<div class="card panel"><h2>Can't reach the game</h2><p>${esc(msg)}</p><div class="row"><button class="btn primary" id="retryBtn">Try again</button><button class="btn" id="homeBtn2">Back to the menu</button></div></div>`;$('#retryBtn').onclick=()=>enterOnline(ON.code);$('#homeBtn2').onclick=goHome;}
async function enterOnline(code){
  code=String(code||'').toUpperCase().replace(/[^A-Z0-9]/g,'');if(!code)return;
  leaveOnline();GEN++;$('#sheetWrap').hidden=true;
  ON.code=code;ON.version=0;ON.data=null;ON.shownEnd=false;FX.prev=null;
  history.replaceState(null,'','?game='+code+(MOCK?'&mock':''));
  showScreen('lobby');$('#lobby').innerHTML=`<div class="card panel"><h2>Joining game ${code}…</h2><p class="muted">Connecting to the ${W.market}.</p></div>`;
  let net;try{net=await getNet();}catch(e){netError('The multiplayer service failed to load. Check your connection.');return;}
  if(ON.code!==code)return;ON.net=net;
  ON.timer=setTimeout(()=>{if(!ON.data)netError('No answer from the game server after 12 seconds. Check your connection, or that the database rules allow access.');},12000);
  ON.unsub=net.on('games/'+code,d=>{if(ON.code===code)onGame(d);},e=>netError('The game server refused access ('+(e&&e.message||e)+'). Check the database rules.'));
}
function leaveOnline(){
  if(!ON.code)return;
  try{ON.unsub&&ON.unsub();}catch(e){}
  if(ON.net&&ON.presenceOn)ON.net.leave(`games/${ON.code}/presence/${ME}`);
  if(ON.driving)abortDrive();
  clearTimeout(ON.timer);clearTimeout(ON.liveT);ON.liveT=null;
  Object.assign(ON,{code:null,data:null,unsub:null,presenceOn:false,version:0});
  history.replaceState(null,'',location.pathname+(MOCK?'?mock':''));
}
function onGame(d){
  clearTimeout(ON.timer);
  if(!d||!d.status){const c=ON.code;leaveOnline();goHome();toast(`There's no game with code ${c}.`);return;}
  ON.data=d;
  if(!ON.presenceOn){ON.presenceOn=true;ON.net.presence(`games/${ON.code}/presence/${ME}`);sendVis();pushRegister();renderPushBtn();}
  if(d.status==='lobby'){showScreen('lobby');renderLobby();return;}
  showScreen('table');
  if(d.version>ON.version){
    ON.version=d.version;if(ON.driving)abortDrive();
    G=parseState(d.state);UI={phase:'watch',sel:UI.sel,mode:'normal',busy:false};
  }else if(!ON.driving&&d.live&&d.live.v===ON.version&&d.live.s!==ON.lastLive){ON.lastLive=d.live.s;G=parseState(d.live.s);}
  if(!G)return;
  if(G.over)UI.phase='over';
  render();
  if(G.over&&!ON.shownEnd){ON.shownEnd=true;showEnd();}
  if(G.over&&d.next&&ON.nextSeen!==d.next&&canRematch()){ON.nextSeen=d.next;$('#sheetWrap').hidden=true;
    sheet('Rematch!',`<p>A new game with the same ${W.merchants} has started.</p>`,[{label:'Join the rematch',value:true,primary:true},{label:'Not now',value:false}]).then(v=>{if(v&&ON.data&&ON.data.next)enterOnline(ON.data.next);});}
  maybeDrive();
}
function parseState(s){const g=upgradeState(JSON.parse(s));g.players.forEach(p=>p.name=cleanName(p.name)||W.merchant);return g;}
function abortDrive(){ON.drive++;ON.driving=false;GEN++;$('#sheetWrap').hidden=true;clearTimeout(ON.liveT);ON.liveT=null;pendingMove&&pendingMove(null);pendingEnd&&pendingEnd();}
function amDriver(){
  const p=cur(G);if(!p.ai)return ownerOf(p)===ME;
  const here=(ON.data&&ON.data.presence)||{};
  return G.players.filter(q=>!q.ai).map(ownerOf).find(o=>here[o])===ME;
}
async function maybeDrive(){
  if(!G||G.over||ON.driving||!ON.data||ON.data.status!=='playing'||!amDriver())return;
  ON.driving=true;const tok=++ON.drive,base=ON.version,code=ON.code;GEN++;const ctx={G,sim:false,gen:GEN};
  try{
    await playTurn(ctx);checkGen(ctx);advanceTurn(ctx);
    const out=JSON.stringify(ctx.G),over=ctx.G.over;
    ON.driving=false;clearTimeout(ON.liveT);ON.liveT=null;
    const ok=await ON.net.tx('games/'+code,c=>{if(!c||c.version!==base)return;c.state=out;c.version=base+1;c.live=null;if(over)c.status='over';return c;});
    if(ok)pingPush(code);
    if(!ok&&ON.code===code)toast('Another player moved first. The board has been refreshed.');
  }catch(e){if(e!==ABORT){console.error(e);toast('Something went wrong: '+e.message);}}
  finally{if(ON.drive===tok)ON.driving=false;}
}
function queueLive(){
  if(ON.liveT)return;
  ON.liveT=setTimeout(()=>{ON.liveT=null;if(ON.driving&&ON.code)ON.net.set(`games/${ON.code}/live`,{v:ON.version,s:JSON.stringify(G)});},250);
}
async function rejoinSeat(i){
  const q=G.players[i];
  const ok=await ON.net.tx(`games/${ON.code}/claims`,c=>{c=c||{};c['s'+i]=ME;return c;});
  if(ok)toast(`You're playing as ${q.name}.`);
}

/* ---------- turn alerts (web push through a small Cloudflare Worker, see server/push-worker.js) ---------- */
const PUSH_URL=''; // the worker's address once it is deployed, e.g. 'https://riverfair-push.example.workers.dev'
const PUSH_KEY='BJGQXwNifW7R-b7y8RBtN5h13ehL1O2sLRRoEkDfymoVYFQ36pm6h-u7yEZcIrshlPfMfj1kiS3pWkyXCrBtHqg';
const PUSH_OK=()=>!!PUSH_URL&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
const pushOn=()=>lsGet('riverfair-push')==='on'&&PUSH_OK()&&Notification.permission==='granted';
function pingPush(code){if(!PUSH_URL||!code)return;fetch(PUSH_URL.replace(/\/$/,'')+'/notify',{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({code})}).catch(()=>{});}
async function pushSub(){
  const reg=await navigator.serviceWorker.ready;
  const key=Uint8Array.from(atob(PUSH_KEY.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
  return (await reg.pushManager.getSubscription())||reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
}
async function pushRegister(){ // store this device's alert address with the current game
  if(!ON.code||!ON.net||!pushOn())return;
  try{const sub=await pushSub();await ON.net.set(`games/${ON.code}/push/${ME}`,sub.toJSON());}catch(e){console.warn('push',e);}
}
function sendVis(){if(ON.code&&ON.net&&ON.presenceOn)ON.net.set(`games/${ON.code}/vis/${ME}`,!document.hidden);}
document.addEventListener('visibilitychange',sendVis);
async function togglePush(){
  if(pushOn()){lsSet('riverfair-push','off');if(ON.code&&ON.net)ON.net.set(`games/${ON.code}/push/${ME}`,null);renderPushBtn();toast('Turn alerts are off.');return;}
  if(IS_IOS&&!IS_APP){sheet('Turn alerts on iPhone',`<p>iPhones only allow alerts from installed apps. Install ${T.name} first (Share, then <b>Add to Home Screen</b>), open it from your home screen, and turn alerts on there.</p>`,[{label:'Got it',value:null,primary:true}]);return;}
  if(Notification.permission==='denied'){sheet('Alerts are blocked',`<p>This browser is blocking notifications from ${T.name}. Allow them in the site settings (the icon left of the address), then try again.</p>`,[{label:'Got it',value:null,primary:true}]);return;}
  const perm=await Notification.requestPermission();
  if(perm!=='granted'){toast('No alerts, then. You can turn them on any time.');return;}
  lsSet('riverfair-push','on');renderPushBtn();await pushRegister();
  toast(`You'll get an alert when it's your turn and you're away.`);
}
function renderPushBtn(){const b=$('#pushBtn');if(!b)return;b.hidden=!(ON.code&&PUSH_OK());
  const on=pushOn();b.setAttribute('aria-pressed',String(on));b.title=on?'Turn alerts are on':'Get an alert when it is your turn';
  b.innerHTML=`<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" fill="${on?'currentColor':'none'}" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M10 20a2 2 0 0 0 4 0" stroke="currentColor" stroke-width="2" fill="none"/>${on?'':'<path d="M3 3l18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'}</svg><span class="pb-l">${on?'Alerts on':'Turn alerts'}</span>`;}

/* ---------- lobby ---------- */
function renderLobby(){
  const d=ON.data,seats=d.seats||[];const mine=seats.findIndex(s=>s.owner===ME);const here=d.presence||{};
  const open=seats.filter(s=>s.owner==='-').length;const link=shareLink(ON.code);
  const keepName=$('#joinName')?$('#joinName').value:(lsGet('riverfair-name')||'');
  const seated=seats.filter(s=>s.owner!=='-').length;
  const portrait=(s,i)=>{const art=s.owner==='-'?'art/home/chair.webp':PORT(COLORS[i]);
    return `<span class="lb-por c-${COLORS[i]}">${art?`<img src="${art}" alt="">`:''}<i class="mer c-${COLORS[i]}"></i></span>`;};
  $('#lobby').innerHTML=`<div class="lb-card">
    <p class="lb-code-k">Game ${ON.code}</p>
    <h2 class="lb-h">Gather the ${W.merchants}</h2>
    <p class="lb-sub">Invite your friends. Take a seat. The market will open soon.</p>
    <h3 class="lb-h3">Invite to your table</h3>
    <div class="lb-invite"><span class="lb-code" id="shareLink" data-link="${esc(link)}">${ON.code}</span><button class="btn primary" id="copyBtn">🔗 Copy invite link</button></div>
    <p class="lb-note">Friends can join in their browser. No account needed.</p>
    <div class="hm-or"><span>◆</span></div>
    <div class="lb-tablehead"><h3 class="lb-h3 big">Your table</h3><span>${seated} of ${seats.length} ${W.merchants} here</span></div>
    ${mine<0&&open?`<label class="lb-name" for="joinName">Your name<input id="joinName" maxlength="16" value="${esc(keepName)}" placeholder="Type your name, then take a seat"></label>`:''}
    <div class="lb-seats">${seats.map((s,i)=>{
      const st=s.ai?`<span class="lb-tag">AI${s.lvl&&s.lvl!=='normal'?' · '+LEVELS[s.lvl]:''}</span>`:s.owner==='-'?'<span class="lb-tag">Open seat</span>':`<span class="lb-here ${here[s.owner]?'on':''}"><i></i>${here[s.owner]?'Here':'Away'}</span>`;
      let act='';
      if(s.owner==='-'&&mine<0)act=`<button class="btn primary" data-take="${i}">Take this seat</button>`;
      if(mine>=0&&s.owner==='-')act=`<button class="btn" data-ai="${i}">Fill with AI</button>`;
      if(mine>=0&&s.ai)act=`<button class="btn" data-open="${i}">Open for a friend</button>`;
      return `<div class="lb-seat ${s.owner==='-'?'empty':''}">${portrait(s,i)}<span class="lb-nm">${s.owner==='-'?'Waiting for a friend':esc(s.name)}${s.owner===ME?' <span class="lb-tag you">You</span>':''}</span>${st}<span class="lb-act">${act}</span></div>`;}).join('')}</div>
    ${mine>=0?`<button class="btn primary big lb-start" id="startBtn" ${open?'disabled':''}>${open?`Waiting for ${open} more ${plural(open,'player','players')}`:'Open the market'}</button><p class="lb-note c">Any seated player can start once every seat is filled.</p>`:''}
    <div class="lb-foot"><span>${ICON('crate')?`<img src="${ICON('crate')}" alt="">`:''}Board: ${{short:'Short paths',order:'In order',random:'Random'}[d.layout]||esc(d.layout)}</span><span>${ICON('feather')?`<img src="${ICON('feather')}" alt="">`:''}${d.exp?(T.expName||'Expansion'):'Base game'}</span></div>
  </div>
  <p class="lb-quote">A seat saved. A market waiting.</p>`;
  $('#copyBtn').onclick=()=>copyText(link);
  document.querySelectorAll('[data-take]').forEach(b=>b.onclick=()=>takeSeat(+b.dataset.take));
  document.querySelectorAll('[data-ai]').forEach(b=>b.onclick=()=>ON.net.set(`games/${ON.code}/seats/${b.dataset.ai}`,{name:AI_NAMES[+b.dataset.ai]||W.merchant,ai:true,owner:'ai',lvl:ON.data.lvl||'normal'}));
  document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>ON.net.set(`games/${ON.code}/seats/${b.dataset.open}`,{name:'Friend',ai:false,owner:'-'}));
  const sb=$('#startBtn');if(sb)sb.onclick=startOnline;
}
async function takeSeat(i){
  const name=cleanName($('#joinName')&&$('#joinName').value);
  if(!name){toast('Type your name first.');$('#joinName')&&$('#joinName').focus();return;}
  lsSet('riverfair-name',name);
  const ok=await ON.net.tx(`games/${ON.code}/seats/${i}`,s=>{if(!s||s.owner!=='-')return;return{name,ai:false,owner:ME};});
  if(!ok)toast('Someone just took that seat.');
}
async function startOnline(){
  const d=ON.data;const g=newGame({players:d.seats.map(s=>({name:s.name,ai:s.ai,owner:s.owner,lvl:s.lvl})),layout:d.layout,exp:!!d.exp,lvl:d.lvl});
  const out=JSON.stringify(g);
  await ON.net.tx('games/'+ON.code,c=>{if(!c||c.status!=='lobby'||(c.seats||[]).some(s=>s.owner==='-'))return;c.status='playing';c.state=out;c.version=1;c.started=Date.now();return c;});
  pingPush(ON.code);
}
async function createOnline(cfg){
  const btn=$('#createBtn');if(btn){btn.disabled=true;btn.textContent='Creating…';}
  try{
    const net=await getNet();const code=rcode();
    await net.set('games/'+code,{host:ME,created:Date.now(),status:'lobby',layout:cfg.layout,exp:!!cfg.exp,lvl:cfg.lvl||'normal',version:0,seats:cfg.seats});
    enterOnline(code);
  }catch(e){toast("Couldn't create the game: "+(e.message||e));if(btn){btn.disabled=false;btn.textContent='Create game';}}
}

/* ---------- installable app ---------- */
let INSTALL_EVT=null;
const IS_APP=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const IS_IOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
addEventListener('beforeinstallprompt',e=>{e.preventDefault();INSTALL_EVT=e;if(!$('#home').hidden)renderHome();});
addEventListener('appinstalled',()=>{INSTALL_EVT=null;toast(`${T.name} is installed. Open it from your home screen.`);if(!$('#home').hidden)renderHome();});
async function installApp(){
  if(INSTALL_EVT){INSTALL_EVT.prompt();const r=await INSTALL_EVT.userChoice.catch(()=>null);INSTALL_EVT=null;renderHome();return;}
  sheet(`Install ${T.name}`,IS_IOS?`<p>In Safari, tap the <b>Share</b> button, then <b>Add to Home Screen</b>.</p><p class="muted">${T.name} then opens full screen from its own icon, and local games work offline.</p>`
    :`<p>Open your browser's menu (⋮) and choose <b>Install app</b> or <b>Add to Home screen</b>.</p><p class="muted">${T.name} then opens full screen from its own icon, and local games work offline.</p>`,[{label:'Got it',value:null,primary:true}]);
}
/* ---------- home ---------- */
const HOME={n:2,seats:['friend','friend','ai','ai','ai'],layout:'short',exp:false,lvl:lsGet('riverfair-lvl')||'normal'};
function goHome(){tutStop();leaveOnline();GEN++;pendingMove=pendingEnd=null;$('#sheetWrap').hidden=true;showScreen('home');renderHome();}
function renderHome(){
  let saved=null;try{saved=JSON.parse(lsGet(STORE)||'null');}catch(e){}
  if(saved&&saved.over)saved=null;
  const fe=ICON('feather');
  $('#home').innerHTML=`
  <div class="hm-bg" role="img" aria-label="A busy ${T.name} market street"></div>
  <div class="hm-col">
    <div class="hm-brand">
      ${fe?`<div class="hm-crest" aria-hidden="true">${[-30,-15,0,15,30].map((r,k)=>`<img src="art/home/feather-up.webp" alt="" style="--r:${r}deg;--k:${k}">`).join('')}</div>`:''}
      <h2 class="hm-title">${T.name}</h2>
      <p class="hm-tag">${T.eyebrow}</p>
    </div>
    <p class="hm-head">${esc(T.headline).replace(/\. /,'.<br>')}</p>
    <p class="hm-lede">${T.lede2||T.lede}</p>
    <div class="hm-card">
      <h3>Your market awaits</h3>
      ${saved&&saved.players?`<button class="btn primary big hm-go" id="resumeBtn">Continue your game<small>Round ${saved.round} · ${saved.players.length} players</small></button>`:''}
      <button class="btn ${saved?'':'primary'} big hm-go" id="onlineBtn">Play online<small>Invite friends. No account needed.</small></button>
      <button class="btn big hm-go" id="localBtn">Play on this device<small>Pass-and-play or practise against AI.</small></button>
      <button class="btn big hm-go hm-learn" id="learnBtn">Learn to play<small>A guided first game on the real board. About 5 minutes.</small></button>
      <div class="hm-or"><span>◆</span></div>
      <label class="hm-lbl" for="joinCode">Have a game code?</label>
      <div class="hm-join"><input id="joinCode" maxlength="8" placeholder="Enter code" autocapitalize="characters" autocomplete="off"><button class="btn primary" id="joinBtn">Join</button></div>
    </div>
    <div class="hm-links">
      <button class="hm-link" id="rulesBtn2">Read the rules <span aria-hidden="true">→</span></button>
      ${IS_APP?'':`<button class="hm-link" id="installBtn"><img src="art/app/icon-192.png" alt="" width="18" height="18"> Install the app</button>`}
    </div>
    <p class="hm-foot">2–5 players · Online or around one table</p>
  </div>`;
  const jc=()=>{const c=$('#joinCode').value.trim();if(c)enterOnline(c);else{toast('Type the game code first.');$('#joinCode').focus();}};
  $('#joinBtn').onclick=jc;$('#joinCode').onkeydown=e=>{if(e.key==='Enter')jc();};
  $('#onlineBtn').onclick=onlineSheet;
  $('#localBtn').onclick=setupSheet;
  $('#rulesBtn2').onclick=rulesSheet;
  $('#learnBtn').onclick=startTutorial;
  const ib=$('#installBtn');if(ib)ib.onclick=installApp;
  const rb=$('#resumeBtn');if(rb)rb.onclick=()=>resumeGame(saved);
}
/* online game setup, in a window over the home screen */
function onlineSheet(){
  const w=$('#sheetWrap'),s=$('#sheet');s.className='';
  let name=lsGet('riverfair-name')||'';
  const draw=()=>{
    s.innerHTML=`<h2>Play online</h2><div class="form">
      <p class="muted">Create a game and send the link. Friends join in their browser with no account.</p>
      <label class="fld" for="homeName">Your name<input id="homeName" maxlength="16" value="${esc(name)}" placeholder="Your name"></label>
      <div><h4>Players</h4><div class="seg" id="hn">${[2,3,4,5].map(n=>`<button data-n="${n}" class="${HOME.n===n?'on':''}">${n}</button>`).join('')}</div></div>
      ${[...Array(HOME.n-1)].map((_,k)=>`<div class="prow"><i class="mer c-${COLORS[k+1]}"></i><span>Seat ${k+2}</span><div class="seg">${['friend','ai'].map(v=>`<button data-s="${k+1}" data-v="${v}" class="${HOME.seats[k+1]===v?'on':''}">${v==='ai'?'AI':'Friend'}</button>`).join('')}</div></div>`).join('')}
      <div><h4>Board layout</h4><select id="homeLayout"><option value="short" ${HOME.layout==='short'?'selected':''}>Short paths (learning)</option><option value="order" ${HOME.layout==='order'?'selected':''}>In order</option><option value="random" ${HOME.layout==='random'?'selected':''}>Random</option></select></div>
      ${HOME.seats.slice(1,HOME.n).includes('ai')?lvlToggle(HOME.lvl):''}
      ${expToggle(HOME.exp)}
      <div class="sbtns"><button class="btn primary big" id="createBtn">Create game</button><button class="btn" id="cancelBtn">Cancel</button></div></div>`;
    const keep=()=>{name=$('#homeName').value;};
    s.querySelectorAll('#hn [data-n]').forEach(b=>b.onclick=()=>{keep();HOME.n=+b.dataset.n;draw();});
    s.querySelectorAll('[data-s]').forEach(b=>b.onclick=()=>{keep();HOME.seats[+b.dataset.s]=b.dataset.v;draw();});
    s.querySelectorAll('[data-exp]').forEach(b=>b.onclick=()=>{keep();HOME.exp=b.dataset.exp==='1';draw();});
    s.querySelectorAll('[data-lvl]').forEach(b=>b.onclick=()=>{keep();HOME.lvl=b.dataset.lvl;draw();});
    $('#homeLayout').onchange=e=>HOME.layout=e.target.value;
    $('#cancelBtn').onclick=()=>{w.hidden=true;};
    $('#createBtn').onclick=()=>{
      const nm=cleanName($('#homeName').value);if(!nm){toast('Type your name first.');$('#homeName').focus();return;}
      lsSet('riverfair-name',nm);w.hidden=true;
      const seats=[...Array(HOME.n)].map((_,i)=>i===0?{name:nm,ai:false,owner:ME}:HOME.seats[i]==='ai'?{name:AI_NAMES[i],ai:true,owner:'ai',lvl:HOME.lvl}:{name:'Friend',ai:false,owner:'-'});
      lsSet('riverfair-lvl',HOME.lvl);createOnline({seats,layout:HOME.layout,exp:HOME.exp,lvl:HOME.lvl});
    };
  };
  draw();w.hidden=false;const f=$('#homeName');if(f&&!f.value)f.focus();
}

/* ---------- guided tutorial ----------
   A real two-player game on the learning layout. The opening turns are scripted: the coach card
   explains one idea at a time, only the place being taught can be reached, and the rival's moves
   and the one dice roll that matters are fixed so every lesson lands the same way. When the
   script ends the game simply carries on as normal free play. Tutorial games are never saved. */
const tutStep=()=>TUT&&TUT.steps[TUT.i]||{};
const tutScripted=()=>!!(TUT&&G&&G.tut&&TUT.i<TUT.steps.length);
function tutSetup(){
  const me=cleanName(lsGet('riverfair-name'))||'Hob',rival=AI_NAMES[0];
  const g=newGame({players:[{name:me,ai:false},{name:rival,ai:true}],layout:'short',exp:false});
  g.players.forEach(p=>{g.deck.push(...p.cards);p.cards=[];});
  const take=k=>g.deck.splice(g.deck.indexOf(k),1)[0];
  g.players[0].cards.push(take('lira5'));g.players[1].cards.push(take('dGem'));
  g.start=g.current=0;g.players[0].lira=2;g.players[1].lira=3;
  g.gov=5;g.smug=11;g.neutrals=[{color:'grey',pos:14},{color:'grey',pos:15},{color:'grey',pos:16}];
  for(let k=0;k<5&&g.small[0].join('')!=='rgygg';k++)g.small.push(g.small.shift()); // Riverside wants Wool, Herbs, Honey
  g.log=[{t:`${g.players[0].name} starts. First to ${winTarget(g)} ${W.rubies} ends the game.`,c:g.players[0].color}];
  g.tut=true;
  return g;
}
function tutSteps(){
  const rival=AI_NAMES[0],purse=CARD_DEFS.lira5.name;
  const tile=n=>`.tile[data-pl="${n}"]`;
  const moved=()=>UI.phase==='post';
  const end=(title,text)=>({when:'post',end:true,spot:'#endBtn',title,text:text+' Tap <b>End turn</b>.',until:()=>UI.phase!=='post'});
  return [
    {when:'move',title:`Welcome to ${T.name}`,text:`You're a hedgehog trader in a busy market town, racing to earn ${W.rubies}. In a two-player game the first to ${winTarget(G)} ends it. This lesson plays the opening turns of a real game against ${rival}. When it's done, the game keeps going and you play it out.`,next:'Show me'},
    {when:'move',spot:tile(7),title:'This is you',text:`Your trader starts at the ${PNAME[7]} with 4 ${W.assistants}. Each turn you move 1 or 2 places (up, down, left or right, never diagonally), then take that place's action.`,next:'Next'},
    {when:'move',only:[2],spot:tile(2),title:'Fill your cart',text:`Head to the ${PNAME[2]}, one step up. Tap it, then tap <b>Move here</b>.`,until:moved},
    {when:'post',spot:tile(2),title:`${GNAME.r} loaded`,text:`You left 1 ${W.assistant} behind to mind this stall. That's the little figure on the tile, and it stays here until you come back for it.`,next:'Next'},
    {when:'post',spot:['#myStrip .ms-goods','.pl[data-pi="0"] .cart'],title:'Filled to capacity',text:`A store always fills that good all the way to your ${W.cart}'s limit, so it pays to arrive nearly empty. Right now your ${W.cart} holds 2 of each good.</p><p>At ${PNAME[1]} you can pay 7 ${W.cur} for a crate that adds 1 to every limit, up to 5. Your third crate also earns a ${W.ruby}.`,next:'Next'},
    end('That was a full turn',`Move, leave an ${W.assistant}, take the action. ${rival} goes next.`),
    {when:'move',spot:tile(14),title:`${W.tiles[0].toUpperCase()+W.tiles.slice(1)}`,text:`Lodges hand out ${W.tiles} with handy perks. Hold both badges from one lodge and it gives you a ${W.ruby}. The ${PNAME[14]} wants to see 2 ${GNAME.r} for its ${GNAME.r} badge, and you have them.`,next:'Next'},
    {when:'move',only:[14],spot:tile(14),enter:()=>{TUT.dice=[[3,5]];},title:'Pay the locals',text:`A ${W.neutral} is already standing there. When you arrive where other traders are, you pay each of them 2 ${W.cur}, and you have exactly 2. Move to the lodge, then claim the ${GNAME.r} badge.`,until:moved},
    {when:'post',spot:['.pl[data-pi="0"] .tiles4'],title:'Your first badge',text:`It cost you 1 ${GNAME.r}. Its perk: at the ${SHORT[9]} and ${PNAME[8]} you may turn one die to 4 or re-roll. The ${W.neutral} you paid wandered off to ${PNAME[8]}.`,next:'Next'},
    end('Next, the other badge',`Get 2 ${GNAME.g} and this lodge gives you a ${W.ruby}.`),
    {when:'move',spot:['.pl[data-pi="0"] .hand [data-card]'],title:W.cards[0].toUpperCase()+W.cards.slice(1),text:`You hold a ${W.card}, <b>${purse}</b>. Cards give one-off boosts. Tap it and play it for 5 ${W.cur}.`,until:()=>!G.players[0].cards.includes('lira5')},
    {when:'move',only:[3],spot:tile(3),title:`Fetch ${GNAME.g}`,text:`The ${PNAME[3]} is one step down. Move there to fill up on ${GNAME.g}.`,until:moved},
    {when:'post',spot:['#myStrip .ms-ap','.pl[data-pi="0"] [data-stat="ap"]'],title:`Mind your ${W.assistants}`,text:`Every place you visit keeps one of your ${W.assistants}, and you have 1 left. With none along, arriving somewhere ends your turn with nothing done, so watch this number.`,next:'Next'},
    end('Back to the lodge',`You're carrying 2 ${GNAME.g} now.`),
    {when:'move',only:[14],spot:tile(14),title:`Earn a ${W.ruby}`,text:`Your ${W.assistant} is still waiting at the lodge, so this time you pick it up instead of leaving another. Move there and claim the ${GNAME.g} badge.`,until:moved},
    {when:'post',spot:['#myStrip .ms-feath','.pl[data-pi="0"] .rubies'],title:`Your first ${W.ruby}`,text:`Both badges from one lodge: that's a ${W.ruby}. The ${GNAME.g} badge also lets you buy 1 extra good for 2 ${W.cur} whenever you fill up at a store.`,next:'Next'},
    end('Nicely done',`${rival} is still hunting for a first ${W.ruby}.`),
    {when:'move',only:[7],spot:tile(7),title:'Call them home',text:()=>`Two ${W.assistants} are still out at the ${PNAME[2]} and ${PNAME[3]}. The ${PNAME[7]}, 2 steps away, calls all of them back, needs no ${W.assistant} and charges no fees.${G.players[1].ext?` Notice ${rival} just bought a crate at the ${SHORT[1]}: his ${W.cart} now holds ${cap(G.players[1])} of each good.`:''}`,until:moved},
    end(`All ${W.assistants} home`,`You have all 4 with you again.`),
    {when:'move',only:[11],spot:tile(11),title:'Sell at the market',text:`Markets buy only the goods on their order board. The ${PNAME[11]} wants ${GNAME.r}, ${GNAME.g} and ${GNAME.y}, so sell your ${GNAME.r} and ${GNAME.g}. ${NSC('smug')} the fox smuggler is there too: after your action he offers a good of your choice for 2 ${W.cur} or 1 good.`,until:moved},
    {when:'post',title:'You know the basics',text:`Every turn works this way: move, leave an ${W.assistant}, take the action, deal with whoever is there.</p><p>Other ways to earn ${W.rubies}: deliver goods at the ${PNAME[13]}, buy one at ${PNAME[16]}, add your third crate at ${PNAME[1]}, or take both badges at the ${PNAME[15]}. Your ${W.family} at the ${PNAME[12]} gives a free action anywhere.</p><p>Tap any place to read what it does, and use <b>Suggest</b> when you're stuck. The game is yours now.`,next:'Play on',finish:true}
  ];
}
/* Mushrooms & Guilds: a short tour, shown once per device at the start of your first expansion game.
   It only explains; nothing is restricted. Replay it from How to play. */
function xSteps(){
  const tile=n=>`.tile[data-pl="${n}"]`,C=s=>s[0].toUpperCase()+s.slice(1);
  return [
    {when:'move',spot:'#board',title:T.expName||'The expansion',text:`This game adds four places, a new resource called ${W.coffeeLong}, guild cards, and a wandering forager. Here's a quick tour before you move. The game now ends at 6 ${W.rubies}.`,next:'Show me'},
    {when:'move',spot:tile(17),title:C(W.coffeeLong),text:()=>`You have ${TEA(cur(G).coffee)} right now. At the ${PNAME[17]} you can pay 2 ${W.cur}, 1 good or a ${W.card}, each once per visit, and each gets you 2 ${W.coffee}. The ${PNAME[6]} also gives you 1.`,next:'Next'},
    {when:'move',spot:tile(20),title:`${W.rubies} at the ${PNAME[20]}`,text:()=>`Here ${W.coffee} become ${W.rubies}. The first costs ${TEA(6)}, and every one taken makes the next cost 1 more (now ${chCost(G)}).`,next:'Next'},
    {when:'move',spot:tile(18),title:C(W.guildCards),text:`The ${PNAME[18]} gives you a mushroom and 2 ${W.guildCards}, and you keep 1. On a later turn you can play a ${W.guildCard} <b>instead of moving</b>. It replaces your whole turn with one strong action, so save it for when a normal move would be weak.`,next:'Next'},
    {when:'move',spot:tile(19),title:PNAME[19],text:`Spend ${W.coffee} with the regulars. Put up a ${W.barrier} that only you can cross, buy a favour (the ${W.moveTile} lets you move any distance in a straight line; ${W.encTile} makes encounters free), or pay ${TEA(4)} plus goods to bribe your way to a ${W.ruby}.`,next:'Next'},
    {when:'move',spot:()=>tile(G.trader),title:NT('trader'),text:`${NSC('trader')} wanders the board like ${NS('gov')} and ${NS('smug')}. End your move where she is and you can buy ${TEA(1)} for 2 ${W.cur} or 1 good.`,next:'Got it',finish:true}
  ];
}
function startXLesson(){TUT={kind:'exp',i:0,ai:[],dice:[],steps:xSteps(),seen:-1};lsSet('riverfair-xlesson','1');render();}
function startTutorial(){
  tutStop();leaveOnline();showScreen('table');GEN++;pendingMove=pendingEnd=null;$('#sheetWrap').hidden=true;
  G=tutSetup();UI={phase:'idle',sel:null,mode:'normal',busy:false};
  TUT={i:0,ai:[3,9,7,1,10],dice:[],steps:null,seen:-1}; // the rival's first five moves never get in the lesson's way
  TUT.steps=tutSteps();
  render();gameLoop();
}
function tutAdvance(){ // move past steps whose goal has been met
  if(!TUT||!G||!G.tut)return;
  for(;;){const s=tutStep();if(TUT.i>=TUT.steps.length||!s.until||!s.until())break;TUT.i++;}
}
function tutStop(){TUT=null;const c=$('#coach');if(c)c.hidden=true;document.querySelectorAll('.tut-spot').forEach(e=>e.classList.remove('tut-spot'));}
function tutVisible(el){return el&&el.getClientRects().length>0;}
function tutUpdate(){
  if(!TUT)return;
  if(!G||(!G.tut&&TUT.kind!=='exp')){tutStop();return;}
  const mine=TUT.kind==='exp'?(isMine(cur(G))&&(!ON.code||ON.driving)&&!G.over):(G.current===0&&!G.over);
  tutAdvance();
  let c=$('#coach');if(!c){c=document.createElement('div');c.id='coach';c.setAttribute('role','dialog');c.setAttribute('aria-live','polite');document.body.appendChild(c);}
  document.querySelectorAll('.tut-spot').forEach(e=>e.classList.remove('tut-spot'));
  const s=tutStep();
  if(TUT.i>=TUT.steps.length||!mine||UI.phase!==s.when){c.hidden=true;return;}
  if(TUT.seen!==TUT.i){TUT.seen=TUT.i;if(s.enter)s.enter();TUT.scroll=true;}
  const sels=[].concat((typeof s.spot==='function'?s.spot():s.spot)||[]);let el=null;
  for(const q of sels){const e=document.querySelector(q);if(tutVisible(e)){el=e;break;}}
  if(el)el.classList.add('tut-spot');
  const n=TUT.steps.length;
  c.innerHTML=`<div class="co-top"><span class="co-step">${TUT.kind==='exp'?'Tour':'Lesson'} · ${TUT.i+1} of ${n}</span><span class="co-r"><button class="co-skip co-mus" id="coMus" aria-pressed="${MUS.on}">♪ Music ${MUS.on?'on':'off'}</button><button class="co-skip" id="coSkip">${TUT.kind==='exp'?'Skip':'Skip lesson'}</button></span></div>
    <div class="co-bar"><i style="width:${Math.round(100*(TUT.i+1)/n)}%"></i></div>
    <h3>${s.title}</h3><p>${typeof s.text==='function'?s.text():s.text}</p>
    ${s.next?`<div class="co-btns"><button class="btn primary" id="coNext">${s.next}</button></div>`:`<p class="co-do">${s.end?'Waiting for you to end your turn…':s.only?'Waiting for your move…':'Waiting for you…'}</p>`}`;
  c.hidden=false;
  const r=el?el.getBoundingClientRect():null;
  c.classList.toggle('at-top',!!r&&(r.top+r.height/2)>innerHeight*.52);
  if(el&&TUT.scroll){TUT.scroll=false;const top=r.top<70,low=r.bottom>innerHeight-(c.offsetHeight+40);if(top||low)el.scrollIntoView({behavior:REDUCED?'auto':'smooth',block:'center'});}
  $('#coMus').onclick=()=>{setMusic(!MUS.on);render();};
  $('#coSkip').onclick=()=>{const x=TUT.kind==='exp';tutStop();toast(x?'You can replay the tour from How to play.':'Lesson skipped. Keep playing, or open the Menu.');render();};
  const nb=$('#coNext');if(nb)nb.onclick=()=>{if(s.finish){tutStop();render();return;}TUT.i++;render();};
}

/* ---------- boot ---------- */
$('#newBtn').onclick=goHome;
$('#rulesBtn').onclick=rulesSheet;
$('#soundBtn').onclick=()=>setSound(!SND.on);
$('#musicBtn').onclick=()=>setMusic(!MUS.on);
$('#codeChip').onclick=()=>copyText(shareLink(ON.code));
$('#pushBtn').onclick=togglePush;
(function boot(){
  if(T.fonts){if(T.fonts.link){const l=document.createElement('link');l.rel='stylesheet';l.href='https://fonts.googleapis.com/css2?family='+T.fonts.link+'&display=swap';document.head.appendChild(l);}
    if(T.fonts.display)document.documentElement.style.setProperty('--f-display',T.fonts.display);
    if(T.fonts.tile)document.documentElement.style.setProperty('--f-tile',T.fonts.tile);}
  document.title=T.name;$('#brandName').textContent=T.name;$('#footText').textContent=T.foot;
  renderSoundBtn();renderMusicBtn();
  document.body.classList.add('t-'+T.id);
  initTips();
  const fe=ICON('feather');
  if(fe){const swap=root=>{const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const hits=[];while(w.nextNode())if(w.currentNode.nodeValue.includes('◆'))hits.push(w.currentNode);
      hits.forEach(t=>{const parts=t.nodeValue.split('◆');const f=document.createDocumentFragment();parts.forEach((x,i)=>{if(i){const im=document.createElement('img');im.className='gi fe';im.src=fe;im.alt=W.ruby;f.appendChild(im);}if(x)f.appendChild(document.createTextNode(x));});t.replaceWith(f);});};
    new MutationObserver(ms=>ms.forEach(m=>m.addedNodes.forEach(n=>{if(n.nodeType===1)swap(n);else if(n.nodeType===3&&n.parentNode&&n.nodeValue.includes('◆'))swap(n.parentNode);}))).observe(document.body,{childList:true,subtree:true});}
  const code=new URLSearchParams(location.search).get('game');
  if(code)enterOnline(code);else{showScreen('home');renderHome();}
})();

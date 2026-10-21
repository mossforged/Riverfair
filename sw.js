/* Offline support for the installed app.
   Pages: network first (so updates arrive), falling back to the saved copy.
   Code, art and fonts: served from the saved copy, refreshed in the background.
   Live game data (Firebase) is never touched. */
const VERSION='202610211635';
const CORE=["./", "index.html", "style.css", "game.js", "themes/riverfair.js", "manifest.webmanifest", "art/portraits/crow.webp", "art/portraits/fox.webp", "art/portraits/hedgehog.webp", "art/portraits/jay.webp", "art/portraits/lizard.webp", "art/portraits/mouse.webp", "art/portraits/rat.webp", "art/portraits/squirrel.webp", "art/portraits/toad.webp", "art/app/apple-touch-icon.png", "art/app/favicon-64.png", "art/app/icon-192.png", "art/app/icon-512.png", "art/app/icon-maskable-512.png", "art/standees/crow.webp", "art/standees/fox.webp", "art/standees/hedgehog.webp", "art/standees/jay.webp", "art/standees/lizard.webp", "art/standees/mouse.webp", "art/standees/rat.webp", "art/standees/squirrel.webp", "art/standees/toad.webp", "art/icons/any.webp", "art/icons/apprentice.webp", "art/icons/badge-b.webp", "art/icons/badge-g.webp", "art/icons/badge-r.webp", "art/icons/badge-y.webp", "art/icons/barricade.webp", "art/icons/card.webp", "art/icons/charter.webp", "art/icons/coin.webp", "art/icons/cousin.webp", "art/icons/crate.webp", "art/icons/feather.webp", "art/icons/friends.webp", "art/icons/guild-card.webp", "art/icons/gutter-map.webp", "art/icons/herbs.webp", "art/icons/honey.webp", "art/icons/mushroom.webp", "art/icons/pearls.webp", "art/icons/wool.webp", "art/home/chair.webp", "art/home/feather-up.webp", "art/home/lobby-phone.webp", "art/home/lobby.webp", "art/home/market-phone.webp", "art/home/market.webp", "art/home/table.webp", "art/tiles/01-cartwright.webp", "art/tiles/02-wool-loft.webp", "art/tiles/03-herb-cellar.webp", "art/tiles/04-hive-barn.webp", "art/tiles/05-pigeon-roost.webp", "art/tiles/06-inn.webp", "art/tiles/07-town-well.webp", "art/tiles/08-rat-alley.webp", "art/tiles/09-tavern.webp", "art/tiles/10-grand-market.webp", "art/tiles/11-riverside-stalls.webp", "art/tiles/12-watch-house.webp", "art/tiles/13-envoys-aerie.webp", "art/tiles/14-hall-wool-herbs.webp", "art/tiles/15-hall-honey-pearls.webp", "art/tiles/16-magpies-hoard.webp", "art/tiles/17-mushroom-grotto.webp", "art/tiles/18-guild-hall.webp", "art/tiles/19-gutterlane-snug.webp", "art/tiles/20-roastery.webp"];
const NAME='riverfair-'+VERSION;
self.addEventListener('install',e=>{e.waitUntil(caches.open(NAME).then(c=>Promise.all(CORE.map(u=>c.add(u).catch(()=>{})))).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET')return;
  const u=new URL(r.url);
  if(/firebaseio\.com|firebasedatabase\.app|googleapis\.com\/identitytoolkit/.test(u.host+u.pathname))return;
  if(r.mode==='navigate'){
    e.respondWith(fetch(r).then(res=>{const c=res.clone();caches.open(NAME).then(x=>x.put('index.html',c));return res;})
      .catch(()=>caches.match('index.html').then(m=>m||caches.match('./'))));
    return;
  }
  const same=u.origin===location.origin;
  if(!same&&!/gstatic\.com|fonts\.googleapis\.com/.test(u.host))return;
  e.respondWith(caches.open(NAME).then(async c=>{
    const hit=await c.match(r);
    const net=fetch(r).then(res=>{if(res&&(res.ok||res.type==='opaque'))c.put(r,res.clone());return res;});
    if(hit){net.catch(()=>{});return hit;}               // saved copy now, refreshed in the background
    return net.catch(()=>c.match(r,{ignoreSearch:true})); // offline: any saved version of the file
  }));
});

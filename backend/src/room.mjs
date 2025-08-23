export class Room {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.clients = new Map(); // ws -> { id,name,spectator }
    this.hostId = null;
    this.game = null;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/ws/")) {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      await this.onOpen(server, url);
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response("Room OK");
  }

  async onOpen(ws, url) {
    const name = url.searchParams.get("name") || `Guest-${Math.random().toString(36).slice(2,6)}`;
    const spectator = url.searchParams.get("spectate") === "1";
    const id = crypto.randomUUID();

    this.game = (await this.state.storage.get("state")) || makeInitialState();

    if (!spectator && !this.game.started) {
      this.game.players.push({
        id, name, seat: this.game.players.length, pos: 0, cash: 1500,
        inJail:false, jailTurns:0, bankrupt:false, color: COLORS[this.game.players.length % COLORS.length]
      });
      await this.persist();
    }

    if (!this.hostId) {
      const first = this.game.players.find(p=>!p.bankrupt);
      this.hostId = first?.id || id;
    }

    this.clients.set(ws, { id, name, spectator });

    ws.send(JSON.stringify({ t:"hello", you:id, hostId:this.hostId, state:this.game }));
    ws.addEventListener("message", (ev) => this.onMessage(ws, ev));
    ws.addEventListener("close",   () => this.onClose(ws));

    this.broadcast({ t:"presence", players: this.game.players.map(p=>({id:p.id,name:p.name})) });
  }

  async onClose(ws) {
    const meta = this.clients.get(ws);
    this.clients.delete(ws);
    if (meta && !this.game.started) {
      const i = this.game.players.findIndex(p=>p.id===meta.id);
      if (i>=0) {
        this.game.players.splice(i,1);
        await this.persist();
        if (this.hostId === meta.id) this.hostId = this.game.players[0]?.id || null;
        this.broadcast({ t:"presence", players: this.game.players.map(p=>({id:p.id,name:p.name})) });
      }
    }
  }

  async onMessage(ws, ev) {
    const meta = this.clients.get(ws);
    if (!meta) return;
    const msg = safeParse(ev.data);
    if (!msg) return;

    const isHost = meta.id === this.hostId;

    switch (msg.t) {
      case "start":
        if (!isHost || this.game.started) break;
        if (this.game.players.length < 2) { this.tell(ws, { t:"err", m:"Need at least 2 players." }); break; }
        this.game.started = true;
        this.game.turn = 0;
        this.game.log.push("Game started.");
        await this.persist();
        this.broadcast({ t:"state", state:this.game });
        break;

      case "roll":
        if (!isHost) break;
        this.game = reduceRoll(this.game);
        await this.persist();
        this.broadcast({ t:"state", state:this.game });
        break;

      case "buy":
        if (!isHost) break;
        this.game = reduceBuy(this.game);
        await this.persist();
        this.broadcast({ t:"state", state:this.game });
        break;

      case "end":
        if (!isHost) break;
        this.game = reduceEnd(this.game);
        await this.persist();
        this.broadcast({ t:"state", state:this.game });
        break;

      case "chat":
        this.game.log.push(`${meta.name}: ${String(msg.text||"").slice(0,200)}`);
        await this.persist();
        this.broadcast({ t:"state", state:this.game });
        break;

      case "become-host":
        if (this.hostId === meta.id) break;
        if (!this.clientsHasId(this.hostId)) {
          this.hostId = meta.id;
          this.broadcast({ t:"host", hostId:this.hostId });
        }
        break;
    }
  }

  clientsHasId(id){ for (const v of this.clients.values()) if (v.id===id) return true; return false; }
  tell(ws,obj){ try{ ws.send(JSON.stringify(obj)); }catch{} }
  broadcast(obj){ const s=JSON.stringify(obj); for (const ws of this.clients.keys()) try{ ws.send(s); }catch{} }
  async persist(){ await this.state.storage.put("state", this.game); }
}

/* -------- Minimal Monopoly-like rules -------- */
const COLORS = ["#ff7676","#ffd166","#6ee7b7","#93c5fd","#f5a8ff","#fca5a5"];

const BOARD = [
  { id:0,  kind:"go",         name:"GO" },
  { id:1,  kind:"prop",       name:"Old Town",     cost:60,  rent:2 },
  { id:2,  kind:"chest",      name:"Chest" },
  { id:3,  kind:"prop",       name:"Main Street",  cost:60,  rent:4 },
  { id:4,  kind:"tax",        name:"Income Tax",   amount:200 },
  { id:5,  kind:"rr",         name:"North Station", cost:200, rent:25 },
  { id:6,  kind:"prop",       name:"Harbor Ave",   cost:100, rent:6 },
  { id:7,  kind:"chance",     name:"Chance" },
  { id:8,  kind:"prop",       name:"Park Lane",    cost:100, rent:6 },
  { id:9,  kind:"prop",       name:"Market St",    cost:120, rent:8 },
  { id:10, kind:"jail_visit", name:"Jail / Visit" },
  { id:11, kind:"prop",       name:"Maple Ave",    cost:140, rent:10 },
  { id:12, kind:"util",       name:"Power Co.",    cost:150, rent:12 },
  { id:13, kind:"prop",       name:"Oak Street",   cost:140, rent:10 },
  { id:14, kind:"prop",       name:"Birch Blvd",   cost:160, rent:12 },
  { id:15, kind:"rr",         name:"East Station", cost:200, rent:25 },
  { id:16, kind:"prop",       name:"Seaside Rd",   cost:180, rent:14 },
  { id:17, kind:"chest",      name:"Chest" },
  { id:18, kind:"prop",       name:"Sunset Ave",   cost:180, rent:14 },
  { id:19,  kind:"prop",      name:"Cedar Row",    cost:200, rent:16 },
  { id:20,  kind:"freepark",  name:"Free Parking" },
  { id:21,  kind:"chance",    name:"Chance" },
  { id:22,  kind:"prop",      name:"Hill View",    cost:220, rent:18 },
  { id:23,  kind:"gotojail",  name:"Go to Jail" }
];

function makeInitialState(){
  return { seed: Date.now()>>>0, started:false, turn:0, players:[], props:{}, lastRoll:null, log:["Room created."] };
}
function currentPlayer(s){ const alive=s.players.filter(p=>!p.bankrupt); if(!alive.length) return null; return s.players[s.turn % s.players.length]; }
function nextTurn(s){ let i=s.turn+1, N=s.players.length; for(let k=0;k<N;k++){ const p=s.players[i%N]; if(!p.bankrupt){ s.turn=i%N; return; } i++; } }
function rollDice(seed){ const d1=1+((seed*9301+49297)%233280)%6; const d2=1+((seed*233280+9301)%49297)%6; return [d1,d2]; }

function reduceRoll(s){
  const cur = currentPlayer(s); if(!cur) return s;
  const [d1,d2] = rollDice(s.seed+=7); s.lastRoll=[d1,d2]; const steps=d1+d2;
  const prev=cur.pos; cur.pos=(cur.pos+steps)%BOARD.length; if(cur.pos<prev){ cur.cash+=200; s.log.push(`${cur.name} passed GO +$200`); }
  const tile=BOARD[cur.pos];
  if (["prop","rr","util"].includes(tile.kind)) {
    const k=tile.id, owned=s.props[k];
    if (!owned) { s.pending={kind:"buy",tileId:k,cost:tile.cost,to:cur.id}; s.log.push(`${cur.name} landed on ${tile.name}. Can buy for $${tile.cost}.`); }
    else if (owned.ownerId!==cur.id && !owned.mortgaged) { const rent=tile.rent||0; pay(s,cur,owned.ownerId,rent,`Rent for ${tile.name}`); }
  } else if (tile.kind==="tax") { payBank(s,cur,tile.amount,"Income Tax"); }
  else if (tile.kind==="gotojail") { const jail=BOARD.find(b=>b.kind==="jail_visit"); if(jail){ cur.pos=jail.id; cur.inJail=true; cur.jailTurns=3; } s.log.push(`${cur.name} goes to Jail.`); }
  return s;
}
function reduceBuy(s){
  const cur=currentPlayer(s); if(!cur || !s.pending || s.pending.kind!=="buy" || s.pending.to!==cur.id) return s;
  const id=s.pending.tileId, tile=BOARD[id];
  if (cur.cash>=tile.cost){ cur.cash-=tile.cost; s.props[id]={ownerId:cur.id,mortgaged:false}; s.log.push(`${cur.name} bought ${tile.name} for $${tile.cost}.`); }
  else { s.log.push(`${cur.name} cannot afford ${tile.name}.`); }
  delete s.pending; return s;
}
function reduceEnd(s){ delete s.pending; nextTurn(s); const nxt=currentPlayer(s); s.log.push(`Turn → ${nxt?.name}`); return s; }
function pay(s,from,toId,amt,why){ from.cash-=amt; const to=s.players.find(x=>x.id===toId); if(to) to.cash+=amt; s.log.push(`${from.name} pays $${amt} to ${to?.name||"Bank"} (${why}).`); if(from.cash<0) bankrupt(s,from); }
function payBank(s,from,amt,why){ from.cash-=amt; s.log.push(`${from.name} pays $${amt} to Bank (${why}).`); if(from.cash<0) bankrupt(s,from); }
function bankrupt(s,p){ s.log.push(`${p.name} is bankrupt!`); p.bankrupt=true; for(const [k,v] of Object.entries(s.props)) if(v.ownerId===p.id) delete s.props[k]; }
function safeParse(x){ try{ return JSON.parse(x); }catch{ return null; } }

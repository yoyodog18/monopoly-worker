// Set this to your Worker URL after backend deploy, e.g.:
// localStorage.setItem("api_base","https://monopoly-backend.<acct>.workers.dev");
const API_BASE = localStorage.getItem("api_base") || "";

const $ = s=>document.querySelector(s);
const canvas = $("#board"); const ctx = canvas.getContext("2d");
let ws, me, hostId, state;

$("#join").onclick = () => {
  const name = $("#name").value.trim() || `Guest-${Math.random().toString(36).slice(2,6)}`;
  const room = ($("#room").value.trim() || "ABCD").toUpperCase();
  if (!API_BASE) return alert("Set API_BASE in localStorage (see top of client.js).");
  const url = `${API_BASE.replace(/\/$/,"")}/ws/${room}?name=${encodeURIComponent(name)}`;
  ws = new WebSocket(url);
  ws.onopen = () => $("#status").textContent = `Connected to ${room}`;
  ws.onmessage = (e) => handle(JSON.parse(e.data));
  ws.onclose = () => $("#status").textContent = `Disconnected`;
};
$("#start").onclick = () => ws?.send(JSON.stringify({ t:"start" }));
$("#roll").onclick  = () => ws?.send(JSON.stringify({ t:"roll"  }));
$("#buy").onclick   = () => ws?.send(JSON.stringify({ t:"buy"   }));
$("#end").onclick   = () => ws?.send(JSON.stringify({ t:"end"   }));
$("#chatForm").addEventListener("submit", e=>{
  e.preventDefault();
  const text=$("#chatInput").value.trim(); if(!text) return;
  $("#chatInput").value=""; ws?.send(JSON.stringify({ t:"chat", text }));
});

function handle(msg){
  if (msg.t==="hello"){ me=msg.you; hostId=msg.hostId; state=msg.state; renderAll(); }
  else if (msg.t==="state"){ state=msg.state; renderAll(); }
  else if (msg.t==="host"){ hostId=msg.hostId; renderAll(); }
  else if (msg.t==="err"){ alert(msg.m); }
}

function renderAll(){ drawBoard(state); renderSidebar(); updateButtons(); }
function updateButtons(){
  $(".hostOnly").style.display = me===hostId ? "inline-block" : "none";
  const cur = state.players[state.turn % state.players.length];
  const myTurn = state.started && cur?.id===me;
  $("#roll").disabled = !myTurn;
  $("#end").disabled  = !myTurn;
  const pendingMine = state?.pending && state.pending.kind==="buy" && state.pending.to===me;
  $("#buy").disabled = !myTurn || !pendingMine;
  $("#turn").textContent = state.started ? `Turn: ${cur?.name}` : "Waiting to start…";
}

function drawBoard(s){
  const N=24, r=280, cx=canvas.width/2, cy=canvas.height/2;
  ctx.clearRect(0,0,canvas.width,canvas.height);

  ctx.strokeStyle="#293043"; ctx.lineWidth=2; ctx.fillStyle="#111827";
  for(let i=0;i<N;i++){
    const a=(i/N)*Math.PI*2, x=cx+Math.cos(a)*r, y=cy+Math.sin(a)*r;
    ctx.beginPath(); ctx.arc(x,y,22,0,Math.PI*2); ctx.stroke(); ctx.fill();
    ctx.fillStyle="#cbd5e1"; ctx.font="10px system-ui"; ctx.textAlign="center";
    ctx.fillText(tileName(i), x, y+3);
    ctx.fillStyle="#111827";
  }
  for(const [k,v] of Object.entries(s.props||{})){
    const i=+k, a=(i/N)*Math.PI*2, x=cx+Math.cos(a)*r, y=cy+Math.sin(a)*r;
    ctx.beginPath(); ctx.arc(x,y,12,0,Math.PI*2); ctx.fillStyle = playerColor(v.ownerId); ctx.fill();
  }
  s.players.forEach((p,idx)=>{
    const a=(p.pos/N)*Math.PI*2, x=cx+Math.cos(a)*r, y=cy+Math.sin(a)*r;
    ctx.beginPath(); ctx.arc(x+(idx%3-1)*8, y+(idx>2?10:-10), 6, 0, Math.PI*2);
    ctx.fillStyle=p.color; ctx.fill();
  });
}
function tileName(i){
  const names=["GO","Old","Chest","Main","Tax","Rail","Harbor","Chance","Park","Market","Jail","Maple","Power","Oak","Birch","Rail","Seaside","Chest","Sunset","Cedar","Free","Chance","Hill","ToJail"];
  return names[i]||String(i);
}
function renderSidebar(){
  const ul=$("#players"); ul.innerHTML="";
  state.players.forEach(p=>{
    const li=document.createElement("li");
    li.innerHTML=`<span>${p.name}${p.id===hostId?' <span class="badge">Host</span>':''}${p.id===me?' <span class="badge">You</span>':''}</span><span>${p.bankrupt?'💀':('$'+p.cash)}</span>`;
    ul.appendChild(li);
  });
  const log=$("#log"); log.innerHTML=state.log.slice(-100).map(x=>`<div>${escapeHtml(x)}</div>`).join(""); log.scrollTop=log.scrollHeight;
}
function playerColor(id){ return (state.players.find(p=>p.id===id)||{}).color || "#fff"; }
function escapeHtml(s){ return s.replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m])); }

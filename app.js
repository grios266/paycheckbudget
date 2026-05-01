const SUPABASE_URL = 'https://msiblapjapvoqtophdan.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zaWJsYXBqYXB2b3F0b3BoZGFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1OTY4MzksImV4cCI6MjA5MzE3MjgzOX0.rqbg2Te23AH0B-bRC2D1_llFiFLxH0IdnkYzhWJHVfs';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const CATS = ["Housing","Utilities","Food","Transportation","Insurance","Subscriptions","Debt","Personal","Other"];
const CCOL = {Housing:"#60A5FA",Utilities:"#FFC300",Food:"#00C9A7",Transportation:"#FB923C",Insurance:"#845EC2",Subscriptions:"#F9A8D4",Debt:"#FF6B6B",Personal:"#4D8076",Other:"#9CA3AF"};
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

let USER = null;
let state = {payAmt:0,payDate:'',bills:[],expenses:[],savings:[],alerts:{},calMonth:new Date().getMonth(),calYear:new Date().getFullYear(),selectedDay:null};

function fmt(n){ return '$'+Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }

async function signIn(){
  const email=document.getElementById('auth-email').value.trim();
  const pass=document.getElementById('auth-password').value;
  showAuthLoading(true); hideAuthMessages();
  const {error}=await sb.auth.signInWithPassword({email,password:pass});
  showAuthLoading(false);
  if(error) showAuthError(error.message);
}

async function signUp(){
  const email=document.getElementById('auth-email').value.trim();
  const pass=document.getElementById('auth-password').value;
  if(pass.length<6){showAuthError('Password must be at least 6 characters');return;}
  showAuthLoading(true); hideAuthMessages();
  const {error}=await sb.auth.signUp({email,password:pass});
  showAuthLoading(false);
  if(error) showAuthError(error.message);
  else showAuthSuccess('Account created! You are now signed in.');
}

async function signOut(){
  await sb.auth.signOut();
  USER=null;
  state={payAmt:0,payDate:'',bills:[],expenses:[],savings:[],alerts:{},calMonth:new Date().getMonth(),calYear:new Date().getFullYear(),selectedDay:null};
  document.getElementById('app').style.display='none';
  document.getElementById('auth-screen').style.display='flex';
}

function showAuthError(msg){const el=document.getElementById('auth-error');el.textContent=msg;el.style.display='block';}
function showAuthSuccess(msg){const el=document.getElementById('auth-success');el.textContent=msg;el.style.display='block';}
function hideAuthMessages(){document.getElementById('auth-error').style.display='none';document.getElementById('auth-success').style.display='none';}
function showAuthLoading(v){document.getElementById('auth-loading').style.display=v?'block':'none';}

sb.auth.onAuthStateChange(async(event,session)=>{
  if(session?.user){
    USER=session.user;
    document.getElementById('auth-screen').style.display='none';
    document.getElementById('app').style.display='block';
    await loadAll();
    recalc();
    renderCalendar();
  } else {
    document.getElementById('auth-screen').style.display='flex';
    document.getElementById('app').style.display='none';
  }
});

async function loadAll(){await Promise.all([loadPaycheck(),loadBills(),loadExpenses(),loadSavings()]);}

async function loadPaycheck(){
  const {data}=await sb.from('paycheck').select('*').eq('user_id',USER.id).single();
  if(data){
    state.payAmt=data.amount||0;
    state.payDate=data.pay_date||'';
    document.getElementById('pay-amt').value=state.payAmt||'';
    document.getElementById('pay-date').value=state.payDate||'';
  }
}

async function loadBills(){
  const {data}=await sb.from('bills').select('*').eq('user_id',USER.id).order('created_at');
  state.bills=(data||[]).map(b=>({id:b.id,name:b.name,amount:b.amount,category:b.category,freq:b.frequency}));
  renderBills();
}

async function loadExpenses(){
  const {data}=await sb.from('expenses').select('*').eq('user_id',USER.id).order('date');
  state.expenses=(data||[]).map(e=>({id:e.id,name:e.name,amount:e.amount,category:e.category,date:e.date}));
}

async function loadSavings(){
  const {data}=await sb.from('savings').select('*').eq('user_id',USER.id).order('created_at');
  state.savings=(data||[]).map(g=>({id:g.id,name:g.name,target:g.target,saved:g.saved}));
  renderSavings();
}

let paycheckTimer=null;
async function savePaycheck(){
  state.payAmt=parseFloat(document.getElementById('pay-amt').value)||0;
  state.payDate=document.getElementById('pay-date').value;
  recalc();
  clearTimeout(paycheckTimer);
  paycheckTimer=setTimeout(async()=>{
    await sb.from('paycheck').upsert({user_id:USER.id,amount:state.payAmt,pay_date:state.payDate,updated_at:new Date().toISOString()},{onConflict:'user_id'});
  },800);
}

function totalIncome(){return state.payAmt;}
function billsDue(){
  return state.bills.map(b=>{
    if(b.freq==='biweekly')return{...b,due:b.amount,lbl:'biweekly'};
    if(b.freq==='weekly')return{...b,due:b.amount*2,lbl:'x2 weekly'};
    return{...b,due:b.amount/2,lbl:'½ monthly'};
  });
}
function totalBills(){return billsDue().reduce((s,b)=>s+b.due,0);}
function totalExp(){return state.expenses.reduce((s,e)=>s+e.amount,0);}
function totalSav(){return state.savings.reduce((s,g)=>s+g.saved,0);}
function leftOver(){return totalIncome()-totalBills()-totalExp()-totalSav();}

function recalc(){
  const inc=totalIncome(),bills=totalBills(),exp=totalExp(),sav=totalSav(),left=leftOver();
  document.getElementById('total-income').textContent=fmt(inc);
  document.getElementById('stat-bills').textContent=fmt(bills);
  document.getElementById('stat-spent').textContent=fmt(exp);
  document.getElementById('stat-saving').textContent=fmt(sav);
  const leftEl=document.getElementById('stat-left');
  leftEl.textContent=fmt(left);leftEl.style.color=left>=0?'#00C9A7':'#FF6B6B';
  document.getElementById('header-sub').textContent=state.payDate?'Pay date: '+state.payDate:'Set your paycheck to get started';
  if(inc>0||exp>0){
    document.getElementById('header-left').style.display='block';
    const lo=document.getElementById('header-leftover');
    lo.textContent=fmt(left);lo.style.color=left>=0?'#00C9A7':'#FF6B6B';
  }
  drawPie([{label:'Bills',value:bills,color:'#FFC300'},{label:'Expenses',value:exp,color:'#FF6B6B'},{label:'Savings',value:sav,color:'#845EC2'},{label:'Left Over',value:Math.max(left,0),color:'#00C9A7'}]);
  renderCatSpend();
  checkAlerts();
}

function drawPie(data){
  const canvas=document.getElementById('pie-chart');
  const ctx=canvas.getContext('2d');
  const W=canvas.width,H=canvas.height;
  ctx.clearRect(0,0,W,H);
  const filtered=data.filter(d=>d.value>0);
  if(!filtered.length){document.getElementById('pie-legend').innerHTML='';return;}
  const total=filtered.reduce((s,d)=>s+d.value,0);
  const cx=W/2,cy=H/2,r=Math.min(W,H)/2-20,ir=r*.55;
  let angle=-Math.PI/2;
  filtered.forEach(d=>{
    const slice=(d.value/total)*Math.PI*2;
    ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r,angle,angle+slice);ctx.closePath();
    ctx.fillStyle=d.color;ctx.fill();
    ctx.beginPath();ctx.arc(cx,cy,ir,0,Math.PI*2);ctx.fillStyle='#151820';ctx.fill();
    angle+=slice;
  });
  document.getElementById('pie-legend').innerHTML=filtered.map(d=>`<span style="display:flex;align-items:center;gap:5px"><span style="width:8px;height:8px;border-radius:50%;background:${d.color};display:inline-block"></span>${d.label}</span>`).join('');
}

function renderCatSpend(){
  const catData=CATS.map(c=>({name:c,value:state.expenses.filter(e=>e.category===c).reduce((s,e)=>s+e.amount,0)})).filter(c=>c.value>0);
  const card=document.getElementById('cat-spend-card');
  if(!catData.length){card.style.display='none';return;}
  card.style.display='block';
  document.getElementById('cat-spend-list').innerHTML=catData.map(cat=>{
    const lim=state.alerts[cat.name]||0,pct=lim?(cat.value/lim)*100:0,col=CCOL[cat.name]||'#9CA3AF';
    const fillCol=pct>=100?'#FF6B6B':pct>=90?'#FFC300':col;
    return `<div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
        <div style="display:flex;align-items:center;gap:6px"><span style="width:7px;height:7px;border-radius:50%;background:${col};display:inline-block"></span>${cat.name}</div>
        <span style="color:${col};font-weight:700">${fmt(cat.value)}${lim?' / '+fmt(lim):''}</span>
      </div>
      ${lim>0?`<div class="progress-track"><div class="progress-fill" style="width:${Math.min(pct,100)}%;background:${fillCol}"></div></div>`:''}
    </div>`;
  }).join('');
}

function checkAlerts(){
  const triggered=CATS.filter(c=>{
    const lim=state.alerts[c]||0;if(!lim)return false;
    const spent=state.expenses.filter(e=>e.category===c).reduce((s,e)=>s+e.amount,0);
    return spent>=lim*.9;
  });
  const banner=document.getElementById('alert-banner');
  if(triggered.length){banner.style.display='block';banner.innerHTML='⚠️ Near limit: <strong>'+triggered.join(', ')+'</strong>';}
  else banner.style.display='none';
}

function openAlertsModal(){
  document.getElementById('alert-inputs').innerHTML=CATS.map(c=>`
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
      <span style="width:8px;height:8px;border-radius:50%;background:${CCOL[c]};display:inline-block;flex-shrink:0"></span>
      <span style="flex:1;font-size:13px">${c}</span>
      <input type="number" id="alert-${c}" style="width:100px" placeholder="No limit" value="${state.alerts[c]||''}">
    </div>`).join('');
  openModal('modal-alerts');
}

function saveAlerts(){
  CATS.forEach(c=>{state.alerts[c]=parseFloat(document.getElementById('alert-'+c).value)||0;});
  closeModal('modal-alerts');recalc();
}

function showScreen(name){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('screen-'+name).classList.add('active');
  document.getElementById('nav-'+name).classList.add('active');
  if(name==='calendar')renderCalendar();
  if(name==='bills')renderBills();
  if(name==='savings')renderSavings();
}

function openModal(id){document.getElementById(id).classList.add('open');}
function closeModal(id){document.getElementById(id).classList.remove('open');}

async function addBill(){
  const name=document.getElementById('bill-name').value.trim();
  const amt=parseFloat(document.getElementById('bill-amt').value)||0;
  if(!name||!amt)return;
  const {data,error}=await sb.from('bills').insert({user_id:USER.id,name,amount:amt,category:document.getElementById('bill-cat').value,frequency:document.getElementById('bill-freq').value}).select().single();
  if(!error){
    state.bills.push({id:data.id,name,amount:amt,category:data.category,freq:data.frequency});
    document.getElementById('bill-name').value='';document.getElementById('bill-amt').value='';
    closeModal('modal-add-bill');renderBills();recalc();
  }
}

async function removeBill(id){
  await sb.from('bills').delete().eq('id',id);
  state.bills=state.bills.filter(b=>b.id!==id);
  renderBills();recalc();
}

function renderBills(){
  const bd=billsDue();
  document.getElementById('bills-list').innerHTML=bd.map(b=>`
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div><div style="font-weight:700;font-size:15px">${b.name}</div><div style="font-size:11px;color:#6B7280;margin-top:3px">${b.category} · <span class="pill">${b.lbl}</span></div></div>
        <div style="text-align:right"><div style="font-weight:800;font-size:18px;color:#FFC300">${fmt(b.due)}</div><div style="font-size:11px;color:#6B7280">of ${fmt(b.amount)}</div></div>
      </div>
      <div style="margin-top:10px;display:flex;justify-content:flex-end"><button class="btn-danger" onclick="removeBill('${b.id}')">Remove</button></div>
    </div>`).join('');
  document.getElementById('bills-total').textContent=fmt(totalBills());
}

function calPrev(){if(state.calMonth===0){state.calMonth=11;state.calYear--;}else state.calMonth--;renderCalendar();}
function calNext(){if(state.calMonth===11){state.calMonth=0;state.calYear++;}else state.calMonth++;renderCalendar();}
function dKey(y,m,d){return`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
function getExpDay(d){return state.expenses.filter(e=>e.date===dKey(state.calYear,state.calMonth,d));}
function dayTotal(d){return getExpDay(d).reduce((s,e)=>s+e.amount,0);}

function renderCalendar(){
  const m=state.calMonth,y=state.calYear;
  document.getElementById('cal-title').textContent=MONTHS[m]+' '+y;
  const dim=new Date(y,m+1,0).getDate(),fd=new Date(y,m,1).getDay();
  const mTotal=state.expenses.filter(e=>e.date.startsWith(`${y}-${String(m+1).padStart(2,'0')}`)).reduce((s,e)=>s+e.amount,0);
  document.getElementById('cal-month-total').textContent='Total spent: '+fmt(mTotal);
  const maxD=Math.max(...Array.from({length:dim},(_,i)=>dayTotal(i+1)),1);
  const today=new Date();
  let html='';
  DAYS.forEach(d=>{html+=`<div class="cal-day-name">${d}</div>`;});
  for(let i=0;i<fd;i++)html+=`<div></div>`;
  for(let d=1;d<=dim;d++){
    const dt=dayTotal(d),de=getExpDay(d),has=de.length>0;
    const isT=d===today.getDate()&&m===today.getMonth()&&y===today.getFullYear();
    const intensity=has?Math.max(.2,dt/maxD):0;
    const bg=has?`rgba(255,107,107,${intensity*.55})`:'#151820';
    const border=isT?'2px solid #00C9A7':has?'1px solid #FF6B6B50':'1px solid #1E2130';
    const dots=de.slice(0,4).map(e=>`<div class="cal-dot" style="background:${CCOL[e.category]||'#9CA3AF'}"></div>`).join('');
    html+=`<button class="cal-day" style="background:${bg};border:${border}" onclick="openDay(${d})">
      <span class="cal-day-num" style="color:${isT?'#00C9A7':'#E8EAF0'};font-weight:${isT?800:600}">${d}</span>
      ${has?`<span class="cal-day-amt">${dt>=1000?'$'+(dt/1000).toFixed(1)+'k':'$'+dt.toFixed(0)}</span><div class="cal-dots">${dots}</div>`:''}
    </button>`;
  }
  document.getElementById('cal-grid').innerHTML=html;
  document.getElementById('dot-legend').innerHTML=CATS.map(c=>`<div class="dot-item"><div class="cal-dot" style="background:${CCOL[c]}"></div>${c}</div>`).join('');
  const catData=CATS.map(c=>({name:c,value:state.expenses.filter(e=>e.category===c).reduce((s,e)=>s+e.amount,0)})).filter(c=>c.value>0);
  const sumCard=document.getElementById('cal-summary-card');
  if(catData.length){
    sumCard.style.display='block';
    document.getElementById('cal-summary-list').innerHTML=catData.map(cat=>`
      <div class="row"><div style="display:flex;align-items:center;gap:8px"><span class="cdot" style="background:${CCOL[cat.name]||'#9CA3AF'}"></span><span style="font-size:13px">${cat.name}</span></div><span style="font-weight:700;color:${CCOL[cat.name]||'#9CA3AF'};font-size:13px">${fmt(cat.value)}</span></div>`).join('');
  } else sumCard.style.display='none';
}

function openDay(d){
  state.selectedDay=d;
  document.getElementById('day-modal-title').textContent=MONTHS[state.calMonth]+' '+d;
  document.getElementById('add-exp-btn').textContent='Add to '+MONTHS[state.calMonth]+' '+d;
  document.getElementById('exp-name').value='';document.getElementById('exp-amt').value='';
  renderDayExps();openModal('modal-day');
}

function renderDayExps(){
  const d=state.selectedDay,exps=getExpDay(d),dt=dayTotal(d);
  document.getElementById('day-modal-total').textContent=dt>0?'Total: '+fmt(dt):'No expenses yet';
  document.getElementById('day-modal-total').style.color=dt>0?'#FF6B6B':'#6B7280';
  document.getElementById('day-exp-list').innerHTML=exps.map(e=>`
    <div class="exp-item">
      <div class="exp-info"><div class="cdot" style="background:${CCOL[e.category]||'#9CA3AF'};width:9px;height:9px"></div>
        <div><div class="exp-name">${e.name}</div><div class="exp-cat">${e.category}</div></div>
      </div>
      <div class="exp-right"><span style="font-weight:700;color:#FF6B6B">${fmt(e.amount)}</span><button class="btn-danger" onclick="removeExp('${e.id}')">✕</button></div>
    </div>`).join('');
}

async function addExpense(){
  const name=document.getElementById('exp-name').value.trim();
  const amt=parseFloat(document.getElementById('exp-amt').value)||0;
  if(!name||!amt)return;
  const date=dKey(state.calYear,state.calMonth,state.selectedDay);
  const {data,error}=await sb.from('expenses').insert({user_id:USER.id,name,amount:amt,category:document.getElementById('exp-cat').value,date}).select().single();
  if(!error){
    state.expenses.push({id:data.id,name,amount:amt,category:data.category,date});
    document.getElementById('exp-name').value='';document.getElementById('exp-amt').value='';
    renderDayExps();renderCalendar();recalc();
  }
}

async function removeExp(id){
  await sb.from('expenses').delete().eq('id',id);
  state.expenses=state.expenses.filter(e=>e.id!==id);
  renderDayExps();renderCalendar();recalc();
}

async function addSaving(){
  const name=document.getElementById('sav-name').value.trim();
  const target=parseFloat(document.getElementById('sav-target').value)||0;
  if(!name||!target)return;
  const saved=parseFloat(document.getElementById('sav-saved').value)||0;
  const {data,error}=await sb.from('savings').insert({user_id:USER.id,name,target,saved}).select().single();
  if(!error){
    state.savings.push({id:data.id,name,target,saved});
    document.getElementById('sav-name').value='';document.getElementById('sav-target').value='';document.getElementById('sav-saved').value='';
    closeModal('modal-add-sav');renderSavings();recalc();
  }
}

async function removeSaving(id){
  await sb.from('savings').delete().eq('id',id);
  state.savings=state.savings.filter(s=>s.id!==id);
  renderSavings();recalc();
}

let savTimers={};
async function updateSaved(id,val){
  const saved=parseFloat(val)||0;
  state.savings=state.savings.map(s=>s.id===id?{...s,saved}:s);
  recalc();
  clearTimeout(savTimers[id]);
  savTimers[id]=setTimeout(async()=>{await sb.from('savings').update({saved}).eq('id',id);},800);
}

function renderSavings(){
  document.getElementById('savings-list').innerHTML=state.savings.map(g=>{
    const pct=Math.min((g.saved/(g.target||1))*100,100);
    return `<div class="card">
      <div style="display:flex;justify-content:space-between"><div style="font-weight:700">${g.name}</div><button class="btn-danger" onclick="removeSaving('${g.id}')">✕</button></div>
      <div class="sav-meta"><span>Saved: <strong style="color:#845EC2">${fmt(g.saved)}</strong></span><span>Goal: <strong style="color:#E8EAF0">${fmt(g.target)}</strong></span></div>
      <div class="sav-bar"><div class="sav-fill" style="width:${pct}%;background:${pct>=100?'#00C9A7':'#845EC2'}"></div></div>
      <div class="sav-pct">${pct.toFixed(0)}% complete</div>
      <div style="margin-top:8px"><label>Update Saved Amount</label><input type="number" placeholder="0.00" value="${g.saved||''}" oninput="updateSaved('${g.id}',this.value)"></div>
    </div>`;
  }).join('');
}

const BRACKETS={
  single:{std:16100,b:[{r:.10,max:12400},{r:.12,max:50400},{r:.22,max:105700},{r:.24,max:201775},{r:.32,max:256225},{r:.35,max:640600},{r:.37,max:Infinity}]},
  mfj:{std:32200,b:[{r:.10,max:24800},{r:.12,max:100800},{r:.22,max:211400},{r:.24,max:403550},{r:.32,max:512450},{r:.35,max:768700},{r:.37,max:Infinity}]},
  hoh:{std:24150,b:[{r:.10,max:17700},{r:.12,max:67450},{r:.22,max:105700},{r:.24,max:201750},{r:.32,max:256200},{r:.35,max:640600},{r:.37,max:Infinity}]},
  mfs:{std:16100,b:[{r:.10,max:12400},{r:.12,max:50400},{r:.22,max:105700},{r:.24,max:201775},{r:.32,max:256225},{r:.35,max:384350},{r:.37,max:Infinity}]},
};

function calcTax(){
  const gross=parseFloat(document.getElementById('tax-gross').value)||0;
  const freq=parseInt(document.getElementById('tax-freq').value)||26;
  const filing=document.getElementById('tax-filing').value;
  if(!gross){document.getElementById('tax-results').style.display='none';return;}
  const annual=gross*freq,cfg=BRACKETS[filing];
  const taxable=Math.max(0,annual-cfg.std);
  let fed=0,prev=0,bkd=[];
  for(const b of cfg.b){
    if(taxable<=prev)break;
    const chunk=Math.min(taxable,b.max)-prev,amt=chunk*b.r;
    fed+=amt;bkd.push({r:b.r,chunk,amt});prev=b.max;
  }
  const ss=Math.min(annual,176100)*.062,med=annual*.0145;
  const total=fed+ss+med,perCheck=total/freq;
  const takeHomeYr=annual-total,takeHomeCheck=takeHomeYr/freq;
  const eff=annual>0?fed/annual:0;
  const marginal=bkd.length?bkd[bkd.length-1].r:0;
  document.getElementById('tax-results').style.display='block';
  document.getElementById('t-annual').textContent=fmt(annual);
  document.getElementById('t-takehome-yr').textContent=fmt(takeHomeYr);
  document.getElementById('t-per-check').textContent=fmt(perCheck);
  document.getElementById('t-takehome-check').textContent=fmt(takeHomeCheck);
  document.getElementById('t-fed').textContent=fmt(fed);
  document.getElementById('t-ss').textContent=fmt(ss);
  document.getElementById('t-med').textContent=fmt(med);
  document.getElementById('t-total').textContent=fmt(total);
  document.getElementById('t-eff').textContent=(eff*100).toFixed(1)+'%';
  document.getElementById('t-marginal').textContent=(marginal*100).toFixed(0)+'%';
  document.getElementById('t-std').textContent=fmt(cfg.std);
  document.getElementById('t-taxable').textContent='Taxable income: '+fmt(taxable);
  document.getElementById('tax-bracket-rows').innerHTML=bkd.map(b=>`<div class="bracket-row"><span style="color:#9CA3AF">${(b.r*100).toFixed(0)}% on ${fmt(b.chunk)}</span><span style="font-weight:700;color:#FF6B6B">${fmt(b.amt)}</span></div>`).join('');
}

function toggleBracketDetail(){
  const el=document.getElementById('tax-bracket-detail');
  el.style.display=el.style.display==='none'?'block':'none';
}

/* P Tracker (formerly Gulabi) - Period & Health Tracker
   Privacy-first: sab data sirf is device ke localStorage me rehta hai. */

const LS_KEY = 'gulabi_data_v1';
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

const DEFAULT_STATE = {
  onboarded: false, name: '', avgCycle: 28, periodLen: 5, lastPeriod: '',
  logs: {}, pin: '', theme: 'light', disguise: false, geminiKey: '',
  reminderDays: 2, teenMode: false, aiConsent: false, createdAt: null
};
let S = load();
let unlocked = !S.pin;
let calCursor = new Date(); calCursor.setDate(1);
let logDate = todayStr();
let tipCat = 'all';
let draft = {};

function load(){ try{ const d = JSON.parse(localStorage.getItem(LS_KEY)); return d ? Object.assign({}, DEFAULT_STATE, d) : {...DEFAULT_STATE}; }catch(e){ return {...DEFAULT_STATE}; } }
function save(){ localStorage.setItem(LS_KEY, JSON.stringify(S)); }
function todayStr(){ return toStr(new Date()); }
function toStr(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function fromStr(s){ const[a,b,c]=s.split('-').map(Number); return new Date(a,b-1,c); }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function diffDays(a,b){ return Math.round((stripTime(b)-stripTime(a))/86400000); }
function stripTime(d){ return new Date(d.getFullYear(),d.getMonth(),d.getDate()); }
const HI_DAYS=['Ravivar','Somvar','Mangalvar','Budhvar','Guruvar','Shukravar','Shanivar'];
const HI_MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
function prettyDate(d){ return HI_DAYS[d.getDay()]+', '+d.getDate()+' '+HI_MONTHS[d.getMonth()]; }

/* ---------------- PREDICTION ENGINE ----------------
   Method (evidence-based calendar method):
   - Cycle lengths = gap between consecutive period START dates (logged).
   - Prediction = last start + mean of up to last 6 cycle lengths.
   - Ovulation = predicted next period - 14 days (luteal phase ~14d clinical default).
   - Fertile window = ovulation-4 .. ovulation+1 (sperm survival ~5d + egg ~24h).
   - Uncertainty = sample SD of cycle lengths (min +/-2d, wider when data scarce).
   With <2 logged cycles the user's stated average is used and the range is
   honestly shown as wider. More logs => tighter (more accurate) range. */
function periodDaysList(){
  return Object.keys(S.logs).filter(d=>{const f=S.logs[d].flow; return f==='light'||f==='medium'||f==='heavy';}).sort();
}
function periodStarts(){
  const days = periodDaysList();
  const starts = [];
  let prev = null;
  for(const ds of days){
    const d = fromStr(ds);
    if(!prev || diffDays(prev,d) > 1) starts.push(d);
    prev = d;
  }
  if(S.lastPeriod){
    const lp = fromStr(S.lastPeriod);
    // include onboarding start unless a logged start already covers it (any order)
    if(!starts.some(st => Math.abs(diffDays(st, lp)) <= 1)) starts.push(lp);
  }
  starts.sort((a,b)=>a-b);
  return starts;
}
function cycleStats(){
  const starts = periodStarts();
  const lens = [];
  for(let i=1;i<starts.length;i++){ const l=diffDays(starts[i-1],starts[i]); if(l>=15&&l<=90) lens.push(l); }
  const recent = lens.slice(-6);
  let avg, sd, source;
  if(recent.length>=1){ avg = recent.reduce((a,b)=>a+b,0)/recent.length; source='logged'; }
  else { avg = S.avgCycle||28; source='default'; }
  if(recent.length>=2){ const m=avg; sd=Math.sqrt(recent.reduce((a,b)=>a+(b-m)*(b-m),0)/(recent.length-1)); }
  else sd = recent.length===1 ? 2.5 : 3.5;
  const unc = Math.max(2, Math.round(sd));
  return {starts, lens, avg:Math.round(avg*10)/10, avgR:Math.round(avg), sd:Math.round(sd*10)/10, unc, source, count:recent.length};
}
function predict(){
  const st = cycleStats();
  const today = stripTime(new Date());
  let lastStart = st.starts.length ? st.starts[st.starts.length-1] : fromStr(S.lastPeriod);
  const nextStart = addDays(lastStart, st.avgR); // late period: estimate stays until user logs - no silent shift
  const cycleDay = diffDays(lastStart, today)+1;
  const daysLeft = diffDays(today, nextStart);
  const ovu = addDays(nextStart,-14);
  const fertileA = addDays(ovu,-4), fertileB = addDays(ovu,1);
  const periodEnd = addDays(nextStart, (S.periodLen||5)-1);
  return {...st, lastStart, nextStart, nextStartRange:[addDays(nextStart,-st.unc), addDays(nextStart,st.unc)], cycleDay, daysLeft, ovu, fertileA, fertileB, periodEnd};
}
function dayStatus(ds){ // returns set of flags for a date string
  const d = fromStr(ds), p = predict();
  const f = {period:false, pPeriod:false, fertile:false, ovu:false, today: ds===todayStr(), pms:false, spotting:false};
  const log = S.logs[ds];
  if(log && (log.flow==='light'||log.flow==='medium'||log.flow==='heavy')) f.period = true;
  if(log && log.flow==='spotting') f.spotting = true;
  // predicted period days (next 2 predicted windows)
  let ns = p.nextStart;
  for(let k=0;k<2;k++){
    const pe = addDays(ns,(S.periodLen||5)-1);
    if(d>=addDays(ns,-0) && d<=pe) f.pPeriod = true;
    ns = addDays(ns, p.avgR);
  }
  let o = p.ovu, fa = p.fertileA, fb = p.fertileB;
  for(let k=0;k<2;k++){
    if(toStr(d)===toStr(o)) f.ovu = true;
    if(d>=fa && d<=fb && !f.ovu) f.fertile = true;
    o = addDays(o,p.avgR); fa = addDays(fa,p.avgR); fb = addDays(fb,p.avgR);
  }
  if(!f.period && !f.pPeriod && d>=addDays(p.nextStart,-5) && d<p.nextStart) f.pms = true;
  return f;
}

/* ---------------- ROUTER ---------------- */
function go(route){
  if(S.pin && !unlocked && route!=='lock'){ location.hash='#/lock'; return; }
  if(!S.onboarded && route!=='onboarding'){ location.hash='#/onboarding'; return; }
  render(route);
}
window.addEventListener('hashchange',()=>go(location.hash.replace('#/','')||'home'));
function render(route){
  $$('.screen').forEach(e=>e.classList.remove('active'));
  const nav = $('#navbar');
  const withNav = ['home','calendar','log','tips','settings','report','library'];
  nav.style.display = withNav.includes(route)?'flex':'none';
  $$('.nav-item').forEach(n=>n.classList.toggle('active', n.dataset.route===route));
  const el = $('#scr-'+route) || $('#scr-home');
  el.classList.add('active');
  if(route==='home') renderHome();
  if(route==='calendar') renderCalendar();
  if(route==='log') renderLog();
  if(route==='tips') renderTips();
  if(route==='settings') renderSettings();
  if(route==='report') renderReport();
  if(route==='library') renderLibrary();
  if(route==='onboarding') renderOnboarding();
  if(route==='lock') renderLock();
}
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2200); }

/* ---------------- HOME ---------------- */
function renderHome(){
  const p = predict();
  const today = new Date();
  $('#greet-title').textContent = S.name ? 'Namaste, '+S.name+'!' : (S.teenMode ? 'Hi! Kaise ho?' : 'Namaste!');
  $('#greet-date').textContent = prettyDate(today)+' \u00b7 aapka din kaisa hai?';
  $('#ring-day').textContent = 'Day '+p.cycleDay;
  $('#ring-len').textContent = 'of ~'+p.avgR+'-day cycle';
  const circ = 2*Math.PI*56;
  const frac = Math.min(1, p.cycleDay/p.avgR);
  $('#ring-arc').setAttribute('stroke-dashoffset', String(circ*(1-frac)));
  const fmt = d => d.getDate()+' '+HI_MONTHS[d.getMonth()];
  if(p.daysLeft > 0){
    $('#home-next').textContent = 'Agla period ~'+p.daysLeft+' din me';
    $('#home-next-sub').textContent = 'Expected start: '+fmt(p.nextStart)+' (\u00b1'+p.unc+' din ka range: '+fmt(p.nextStartRange[0])+' \u2013 '+fmt(p.nextStartRange[1])+'). Calendar pe bhi yahi date hai. Jitna zyada log karogi, utna accurate hoga.';
  } else if(p.daysLeft===0){
    $('#home-next').textContent = 'Period aaj expected hai';
    $('#home-next-sub').textContent = 'Aaj ya agle 1\u20132 din me aa sakta hai. Log karna na bhoolo.';
  } else {
    $('#home-next').textContent = 'Period ' + Math.abs(p.daysLeft) + ' din late lag raha hai';
    $('#home-next-sub').textContent = 'Late hona kabhi kabhi normal hai \u2014 stress, travel, diet sab affect karta hai. App khud dates shift nahi karta: jab period aaye, log karo, tab estimate update hogi. 2+ hafte late ho toh doctor se mil lena.';
  }
  $('#range-pill').textContent = '\u00b1'+p.unc+' din ka range \u00b7 '+(p.source==='logged'? (p.count<2 ? 'sirf '+p.count+' cycle ka data \u2014 rough estimate' : p.count+' cycles ka data') : 'default estimate \u2014 rough');
  const ovuD = diffDays(today, p.ovu);
  $('#chip-ovu').textContent = (ovuD>0 ? '~'+ovuD+' din baad' : (ovuD===0?'aaj ke aas-paas':'ho chuka'))+' (est.)';
  $('#chip-fert').textContent = fmt(p.fertileA)+'\u2013'+p.fertileB.getDate()+' (est.)';
  $('#chip-cyc').textContent = '~'+p.avgR+' din';
  // reminder notice
  const nb = $('#notice-bar');
  if(p.daysLeft>0 && p.daysLeft<=S.reminderDays){ nb.style.display='flex'; $('#notice-text').textContent = 'Reminder: period ~'+p.daysLeft+' din me expected hai. Pads/essentials ready rakho.'; }
  else nb.style.display='none';
  const inotes = irregularNote();
  const ic = $('#irreg-card');
  if(inotes.length){ ic.style.display='block'; $('#irreg-text').textContent = inotes[0]; }
  else ic.style.display='none';
  renderWeek(p);
  renderHomeTip(p);
}
function renderWeek(p){
  const row = $('#week-row'); row.innerHTML='';
  const today = stripTime(new Date());
  const monday = addDays(today, -((today.getDay()+6)%7));
  const DOW=['MON','TUE','WED','THU','FRI','SAT','SUN'];
  for(let i=0;i<7;i++){
    const d = addDays(monday,i), ds=toStr(d), f=dayStatus(ds);
    let dot='transparent';
    if(f.period) dot='#FF6B93'; else if(f.ovu) dot='#B07FD4'; else if(f.fertile) dot='#D9B8EC'; else if(f.pPeriod) dot='#FFB3C9';
    row.innerHTML += '<div class="day-cell'+(f.today?' today':'')+'"><span class="d">'+DOW[i]+'</span><span class="n">'+d.getDate()+'</span><span class="dot" style="background:'+dot+'"></span></div>';
  }
}
function renderHomeTip(p){
  $('#home-tip-text').textContent = localTip(p);
}
function phaseOf(p){
  if(p.daysLeft<=0 || p.cycleDay<=(S.periodLen||5)) return 'period';
  if(p.daysLeft<=5) return 'pms';
  const ovuD = diffDays(stripTime(new Date()), p.ovu);
  if(ovuD>=-1 && ovuD<=5) return 'fertile';
  if(ovuD<-1 && ovuD>=-8) return 'luteal';
  return 'follicular';
}
const TIPS = {
  period:[
    'Heating pad ya garam paani ki bottle pet pe rakho \u2014 bahut se logon ko cramps me turant rahat milti hai.',
    'Halki stretching ya 10 min walk se kai logon ko cramps kam lagte hain.',
    'Iron-rich khana khao: palak, chana, dates \u2014 period me iron kam hota hai.',
    'Caffeine thoda kam karo, gunguna paani ya ajwain ka paani zyada piyo.',
    'Rest ka poora haq hai \u2014 aaj body ko dheere chalne do.'
  ],
  pms:[
    'PMS me mood swings normal hain \u2014 deep breathing (4 sec andar, 6 sec bahar) try karo.',
    'Namkeen craving ho toh roasted chana ya makhana lo \u2014 bloating kam hoga.',
    'Chocolate mann kare toh dark chocolate (70%+) 2 piece \u2014 magnesium milta hai, cramps kam hote hain.',
    'Neend poori karo \u2014 PMS me 7\u20138 ghante ki sleep mood ko stable rakhti hai.',
    'Halki acidity ya heaviness normal hai. Chhote meals, gunguna paani, aur 10 min walk help karegi.'
  ],
  fertile:[
    'Ye fertile window hai \u2014 body me energy zyada feel ho sakti hai, workout ke liye best time!',
    'Ovulation ke time halka one-side pain (mittelschmerz) normal hai, ghabrane ki baat nahi.',
    'Paani zyada piyo aur protein-rich khana lo \u2014 energy peak pe ho.',
    'Skin glow kar rahi hai? Estrogen high hai \u2014 selfies ka best week!'
  ],
  luteal:[
    'Luteal phase hai \u2014 energy dheere dheere kam hogi, heavy workout ki jagah yoga try karo.',
    'Complex carbs (oats, brown rice, daliya) lo \u2014 sugar craving control rahegi.',
    'Magnesium-rich khana (banana, nuts, seeds) PMS ko pehle se kam karta hai.'
  ],
  follicular:[
    'Follicular phase \u2014 energy aur focus badh raha hai. Naye kaam shuru karne ka best time!',
    'Is week skin aur hair better feel honge \u2014 estrogen rise ho raha hai.',
    'Strength training ke liye perfect week hai \u2014 body recover fast karti hai.'
  ]
};
const GENERAL_TIPS = [
  'Cycle log karne se predictions har month zyada accurate hoti hain.',
  'Period irregular ho (3+ mahine se 35+ din ka cycle) toh ek baar doctor se milna theek rahega.',
  'Track karo: cramps kis din zyada hote hain \u2014 pattern dikhne lagega.',
  'Period ke dauraan bhi halka exercise safe aur helpful hai.'
];
const TEEN_TIPS = [
  'Pehle 1-2 saal cycle irregular rehta hai \u2014 ye normal hai, tension mat lo.',
  'School bag me hamesha ek pad aur spare underwear rakho \u2014 emergency ready!',
  'Period me bhi sports khel sakte ho \u2014 actually cramps kam hote hain.',
  'Period ke baare me baat karna sharmane wali baat NAHI hai. Mummy/didi se khul ke poocho.',
  'Cramps ho toh hot water bag + thoda rest \u2014 aur ye bilkul okay hai.'
];
function localTip(p){
  if(S.teenMode){ return TEEN_TIPS[Math.floor(Date.now()/86400000)%TEEN_TIPS.length]; }
  const ph = phaseOf(p);
  const arr = TIPS[ph]||GENERAL_TIPS;
  const dayIdx = Math.floor(Date.now()/86400000);
  return arr[dayIdx % arr.length];
}

/* ---------------- CALENDAR ---------------- */
function renderCalendar(){
  const y = calCursor.getFullYear(), m = calCursor.getMonth();
  $('#cal-title').textContent = HI_MONTHS[m]+' '+y;
  const grid = $('#cal-grid'); grid.innerHTML='';
  ['S','M','T','W','T','F','S'].forEach(d=> grid.innerHTML += '<div class="cal-dow">'+d+'</div>');
  const first = new Date(y,m,1).getDay();
  const daysIn = new Date(y,m+1,0).getDate();
  for(let i=0;i<first;i++) grid.innerHTML += '<div class="cal-day empty"></div>';
  for(let d=1;d<=daysIn;d++){
    const ds = toStr(new Date(y,m,d));
    const f = dayStatus(ds);
    let cls='cal-day';
    if(f.period) cls+=' period'; else if(f.ovu) cls+=' ovu'; else if(f.pPeriod) cls+=' p-period';
    if(f.today) cls+=' today';
    let dot='';
    if(f.spotting) dot='<span class="dot" style="background:#C4756B"></span>';
    else if(f.fertile && !f.period && !f.ovu) dot='<span class="dot" style="background:#D9B8EC"></span>';
    else if(f.pms) dot='<span class="dot" style="background:#F5C86B"></span>';
    else dot='<span class="dot" style="background:transparent"></span>';
    grid.innerHTML += '<button class="'+cls+'" onclick="openDay(\''+ds+'\')">'+d+dot+'</button>';
  }
  renderInsights();
  // cycle history
  const p = predict();
  const hist = $('#cal-history'); hist.innerHTML='<h4 style="padding:14px 16px 4px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:var(--faint)">Cycle history</h4>';
  const starts = p.starts.slice(-6).reverse();
  if(starts.length===0){ hist.innerHTML += '<div class="hist-row"><span class="s">Abhi koi cycle logged nahi hai</span></div>'; }
  starts.forEach((st,i)=>{
    const idx = p.starts.length-1-i;
    const len = idx>0 ? diffDays(p.starts[idx-1], p.starts[idx]) : null;
    hist.innerHTML += '<div class="hist-row"><span class="d">'+prettyDate(st)+'</span><span class="s">'+(len? len+' din ka cycle':'pehla record')+'</span></div>';
  });
}
function openDay(ds){ logDate=ds; location.hash='#/log'; }

/* ---------------- INSIGHTS (symptom trends) ---------------- */
function renderInsights(){
  const el = $('#insights-card'); if(!el) return;
  const since = addDays(stripTime(new Date()), -90);
  const counts = {}; let loggedDays = 0;
  Object.keys(S.logs).forEach(ds=>{
    if(fromStr(ds) < since) return;
    const l = S.logs[ds]; if(!l) return;
    loggedDays++;
    (l.symptoms||[]).forEach(x=> counts[x]=(counts[x]||0)+1);
  });
  const top = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,5);
  let h = '<h4 style="padding:14px 16px 4px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:var(--faint)">Symptom trends (90 din)</h4>';
  if(top.length===0){ h += '<div class="hist-row"><span class="s">Symptoms log karo \u2014 yahan pattern dikhega</span></div>'; }
  else{
    const mx = top[0][1];
    top.forEach(([name,c])=>{
      const pct = Math.round(c/mx*100);
      h += '<div class="hist-row" style="display:block"><div style="display:flex;justify-content:space-between;font-size:12.5px;font-weight:600"><span>'+name+'</span><span class="s">'+c+' din</span></div><div style="height:6px;border-radius:4px;background:var(--primary-soft);margin-top:5px"><div style="height:6px;border-radius:4px;width:'+pct+'%;background:linear-gradient(90deg,var(--primary2),var(--primary))"></div></div></div>';
    });
    h += '<div class="hist-row"><span class="s">Doctor ko dikhane ke liye: neeche "Doctor report" banao</span></div>';
  }
  el.innerHTML = h;
}

/* ---------------- IRREGULAR CYCLE GUIDANCE ---------------- */
function irregularNote(){
  const st = cycleStats();
  const notes = [];
  if(st.count>=2 && st.sd>=7) notes.push('Aapke cycles ka variation zyada hai (\u00b1'+Math.round(st.sd)+' din). Stress, weight change, travel ya hormones se hota hai. 2-3 mahine tak aisa rahe toh ek baar gynecologist se milna theek rahega.');
  if(st.count>=1 && st.avg>35) notes.push('Average cycle '+st.avgR+' din ka hai \u2014 35 din se zyada ko irregular maana jata hai. PCOS jaise common causes ho sakte hain; doctor se consult karna helpful rahega.');
  if(st.count>=1 && st.avg<21) notes.push('Average cycle '+st.avgR+' din ka hai \u2014 21 din se kam frequent hai. Ek baar doctor se check karwana better rahega.');
  return notes;
}

/* ---------------- DOCTOR REPORT ---------------- */
function renderReport(){
  const p = predict();
  const fmt = d => d.getDate()+' '+HI_MONTHS[d.getMonth()]+' '+d.getFullYear();
  $('#rep-date').textContent = 'Generated: '+fmt(new Date());
  $('#rep-summary').innerHTML =
    '<div class="rep-grid"><div><b>'+p.starts.length+'</b><span>period starts logged</span></div>'+
    '<div><b>'+p.lens.length+'</b><span>completed cycles</span></div>'+
    '<div><b>~'+p.avgR+' din'+(p.source==='logged'?'':'*')+'</b><span>avg cycle'+(p.source==='logged'?'':' (estimate)')+'</span></div>'+
    '<div><b>'+(p.lens.length>=2 ? '\u00b1'+p.sd+' din' : '\u2014')+'</b><span>variation'+(p.lens.length>=2?'':' (not enough data)')+'</span></div></div>';
  const reg = p.lens.length<2 ? 'Not enough data \u2014 variation ke liye kam se kam 2 completed cycles chahiye.' : (p.sd>=7 ? 'Cycles irregular lag rahe hain (variation zyada) \u2014 doctor se discuss karna useful ho sakta hai.' : 'Cycles typical range me lag rahe hain.');
  $('#rep-reg').textContent = reg;
  const notes = irregularNote();
  $('#rep-flags').innerHTML = notes.length ? '<b>Notes for doctor:</b><ul style="margin:6px 0 0 18px">'+notes.map(n=>'<li>'+n+'</li>').join('')+'</ul>' : '';
  let rows='';
  const starts = p.starts.slice(-6).reverse();
  starts.forEach((st,i)=>{
    const idx = p.starts.length-1-i;
    const len = idx>0 ? diffDays(p.starts[idx-1], p.starts[idx]) : null;
    const symCount = {};
    for(let d=0; d<(len||p.avgR); d++){
      const l = S.logs[toStr(addDays(st,d))];
      if(l) (l.symptoms||[]).forEach(x=> symCount[x]=(symCount[x]||0)+1);
    }
    const tops = Object.entries(symCount).sort((a,b)=>b[1]-a[1]).slice(0,3).map(e=>e[0]).join(', ');
    rows += '<tr><td>'+fmt(st)+'</td><td>'+(len? len+' din':'\u2014')+'</td><td>'+(tops||'\u2014')+'</td></tr>';
  });
  $('#rep-rows').innerHTML = rows || '<tr><td colspan="3">Koi cycle logged nahi</td></tr>';
}
function printReport(){ if(window.Android){ Android.print(); return; } window.print(); }

/* ---------------- HEALTH LIBRARY ---------------- */
const LIBRARY = [
 {t:'Period 101: kya hota hai?', c:'Har month uterus apni lining banata hai possible pregnancy ke liye. Jab pregnancy nahi hoti, lining bahar nikalti hai \u2014 yehi period hai. 21-35 din typical range hai, lekin thoda upar-neeche bhi normal ho sakta hai \u2014 har body alag hai. Pehle 1-2 saal (teen years) me irregular hona bilkul normal hai.'},
 {t:'Cramps kyon hote hain?', c:'Prostaglandins naam ke chemicals uterus ko contract karwate hain \u2014 isi se cramps. Heat (hot water bag), halka exercise, ajwain/adrak wala garam paani aur magnesium-rich khana (nuts, banana, dark chocolate) se kai logon ko relief milta hai. Bahut zyada dard ho jo kaam na karne de, toh doctor se milein \u2014 endometriosis jaise reasons ho sakte hain.'},
 {t:'PMS samjho', c:'Period se 5-7 din pehle mood swings, bloating, cravings, irritability \u2014 ye PMS hai, hormones ki wajah se. Regular sleep, kam namkeen/caffeine, complex carbs aur halka exercise se kai logon ko noticeable relief milta hai \u2014 har body alag hoti hai. PMDD (bahut severe PMS) ho toh doctor se baat karo.'},
 {t:'Hygiene basics', c:'Pad har 4-6 ghante me badlo, menstrual cup 8-12 ghante me. Hamesha front-to-back wipe. Scented products avoid karo \u2014 vagina self-cleaning hoti hai. Itching, unusual discharge ya badbu ho toh doctor se milein.'},
 {t:'Irregular cycles & PCOS signs', c:'Cycle 35+ din ka ho, mahine skip ho, ya bahut heavy bleeding ho \u2014 common causes: stress, thyroid, PCOS, weight change. PCOS ke signs: irregular periods + acne/facial hair + weight gain. 2-3 mahine irregular rahe toh gynecologist visit karo \u2014 early checkup se sab manageable hai.'},
 {t:'Kab doctor se milna chahiye (warning signs)', c:'Ye signs ho toh doctor visit delay mat karo: (1) 3+ mahine period na aaye (pregnancy nahi hai toh bhi), (2) bleeding 7+ din chale ya bahut heavy ho (1-2 ghante me pad bhare), (3) periods ke beech bleeding, (4) severe pain jo normal na lage, (5) fever ke saath period symptoms, (6) unusual discharge ya smell.'},
 {t:'Pehla period? (teen guide)', c:'Pehla period 10-15 saal me aata hai \u2014 ghabrane wali baat nahi, ye healthy hai! Shuru ke 1-2 saal irregular rahega. School bag me hamesha ek pad rakho. Kisi trusted adult (mummy, didi, teacher) se baat karo \u2014 sharmane wali koi baat nahi. Ye app tumhe apna cycle samajhne me help karegi.'},
 {t:'Myths vs facts', c:'MYTH: Period me exercise nahi karna chahiye. FACT: Halka exercise cramps kam karta hai. MYTH: Period me baal nahi dhone chahiye. FACT: Koi medical reason nahi. MYTH: Irregular period ka matlab serious bimari. FACT: Aksar stress/lifestyle se hota hai, but check karwana smart hai. MYTH: Ye app pregnancy prevention ke liye use ho sakta hai. FACT: BILKUL NAHI \u2014 fertile window sirf information ke liye hai, contraception nahi.'}
];
function renderLibrary(){
  const el = $('#lib-list'); el.innerHTML='';
  LIBRARY.forEach((a,i)=>{
    el.innerHTML += '<div class="tipitem" style="display:block"><h4 style="cursor:pointer" onclick="toggleLib('+i+')">'+a.t+' <span id="lib-arrow-'+i+'" style="float:right;color:var(--primary)">+</span></h4><p id="lib-'+i+'" style="display:none;margin-top:8px">'+a.c+'</p></div>';
  });
}
function toggleLib(i){
  const p = document.getElementById('lib-'+i), a = document.getElementById('lib-arrow-'+i);
  const open = p.style.display==='block';
  p.style.display = open?'none':'block'; a.textContent = open?'+':'\u2212';
}
function calNav(n){ calCursor.setMonth(calCursor.getMonth()+n); renderCalendar(); }

/* ---------------- LOG ---------------- */
const SYMPTOMS=['Cramps','Headache','Bloating','Backache','Fatigue','Acne','Nausea','Breast pain','Mood swings','Cravings','Dizziness','Insomnia'];
const MOODS=[['Happy','#F5C86B'],['Calm','#7FC8A9'],['Sad','#8FA8D8'],['Irritated','#F08668'],['Anxious','#B07FD4'],['Energetic','#FFB347'],['Tired','#9BA7B4'],['Romantic','#F470A3']];
const FLOWS=[['spotting','Spotting'],['light','Light'],['medium','Medium'],['heavy','Heavy']];
function renderLog(){
  const d = fromStr(logDate);
  $('#log-date-title').textContent = prettyDate(d);
  const f = dayStatus(logDate);
  const bits=[];
  if(f.period) bits.push('period day');
  if(f.pPeriod) bits.push('predicted period');
  if(f.fertile) bits.push('fertile window');
  if(f.ovu) bits.push('ovulation day');
  if(f.pms) bits.push('PMS window');
  $('#log-date-sub').textContent = bits.length? bits.join(' \u00b7 ') : 'regular day';
  const saved = S.logs[logDate]||{};
  draft = {flow: saved.flow||'', symptoms:[...(saved.symptoms||[])], mood: saved.mood||'', note: saved.note||''};
  // flow
  const fr = $('#flow-row'); fr.innerHTML='';
  FLOWS.forEach(([k,label])=>{
    fr.innerHTML += '<button class="opt'+(draft.flow===k?' sel':'')+'" data-flow="'+k+'">'+label+'</button>';
  });
  fr.innerHTML += '<button class="opt" data-flow="period-start">Period start</button>';
  if(saved.flow==='period-start') fr.lastChild.classList.add('sel');
  $$('#flow-row .opt').forEach(b=>b.onclick=()=>{ draft.flow = draft.flow===b.dataset.flow?'':b.dataset.flow; renderLog(); });
  // symptoms
  const sg = $('#sym-grid'); sg.innerHTML='';
  SYMPTOMS.forEach(s=>{
    const on = draft.symptoms.includes(s);
    sg.innerHTML += '<button class="opt'+(on?' sel purple':'')+'" data-sym="'+s+'">'+s+'</button>';
  });
  $$('#sym-grid .opt').forEach(b=>b.onclick=()=>{
    const i = draft.symptoms.indexOf(b.dataset.sym);
    if(i>=0) draft.symptoms.splice(i,1); else draft.symptoms.push(b.dataset.sym);
    renderLog();
  });
  // moods
  const mg = $('#mood-grid'); mg.innerHTML='';
  MOODS.forEach(([m,c])=>{
    mg.innerHTML += '<button class="opt'+(draft.mood===m?' sel':'')+'" data-mood="'+m+'"><i style="width:8px;height:8px;border-radius:50%;background:'+c+';display:inline-block;margin-right:5px"></i>'+m+'</button>';
  });
  $$('#mood-grid .opt').forEach(b=>b.onclick=()=>{ draft.mood = draft.mood===b.dataset.mood?'':b.dataset.mood; renderLog(); });
  $('#log-note').value = draft.note;
}
function saveLog(){
  const note = $('#log-note').value.trim();
  let flow = draft.flow;
  if(flow==='period-start') flow='medium'; // period-start counts as a period day
  if(!flow && !draft.symptoms.length && !draft.mood && !note){ delete S.logs[logDate]; }
  else S.logs[logDate] = {flow: flow||'', symptoms:draft.symptoms, mood:draft.mood, note};
  save(); toast('Log save ho gaya'); location.hash='#/home';
}
function clearLog(){ delete S.logs[logDate]; save(); toast('Log clear'); location.hash='#/home'; }

/* ---------------- TIPS ---------------- */
function renderTips(){
  const cats=[['all','Sab'],['cramps','Cramps'],['diet','Diet'],['exercise','Exercise'],['sleep','Sleep'],['mood','Mood']];
  const row = $('#tip-cats'); row.innerHTML='';
  cats.forEach(([k,l])=>{ row.innerHTML += '<button class="opt'+(tipCat===k?' sel':'')+'" data-cat="'+k+'">'+l+'</button>'; });
  $$('#tip-cats .opt').forEach(b=>b.onclick=()=>{ tipCat=b.dataset.cat; renderTips(); });
  const p = predict();
  const ph = phaseOf(p);
  $('#tip-phase').textContent = 'AI TIP \u00b7 '+ph.toUpperCase()+' PHASE';
  $('#bigtip-text').textContent = localTip(p);
  const lib = buildTipLib().filter(t=> tipCat==='all' || t.cat===tipCat);
  const list = $('#tip-list'); list.innerHTML='';
  lib.slice(0,8).forEach(t=>{
    list.innerHTML += '<div class="tipitem"><div class="ic" style="background:'+t.bg+'">'+t.icon+'</div><div><h4>'+t.title+'</h4><p>'+t.body+'</p></div></div>';
  });
}
function buildTipLib(){
  const I = {
    drop:'<svg width="20" height="20" viewBox="0 0 24 24" fill="#E2548A"><path d="M12 2.7C12 2.7 5.5 10 5.5 14.5a6.5 6.5 0 0 0 13 0C18.5 10 12 2.7 12 2.7z"/></svg>',
    food:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F0A04B" stroke-width="2" stroke-linecap="round"><path d="M4 3v7a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3M6 3v18M18 3c-2 0-3 2-3 5v4h3v9"/></svg>',
    run:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4FAF82" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 4a1.8 1.8 0 1 0 0 .01M5 12l3-2 3 2 4-1 4 3M11 12l-2 5 4 2 1 3"/></svg>',
    moon:'<svg width="20" height="20" viewBox="0 0 24 24" fill="#B07FD4"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>',
    heart:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E2548A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7.5-4.7-9.5-9C1 8.5 3 5 6.5 5c2.2 0 3.9 1.3 5.5 3.4C13.6 6.3 15.3 5 17.5 5 21 5 23 8.5 21.5 12c-2 4.3-9.5 9-9.5 9z"/></svg>'
  };
  return [
    {cat:'cramps',icon:I.drop,bg:'var(--primary-soft)',title:'Garam seko',body:'Heating pad ya garam paani ki bottle lower abdomen pe 15-20 min rakho. Heat muscles ko relax karti hai \u2014 bahut se logon ko cramps me isi se sabse zyada relief milta hai.'},
    {cat:'cramps',icon:I.drop,bg:'var(--primary-soft)',title:'Ajwain ka paani',body:'1 chammach ajwain garam paani me ubal ke piyo. Traditional remedy \u2014 kai logon ko gas aur cramps me is se relief milta hai.'},
    {cat:'cramps',icon:I.drop,bg:'var(--primary-soft)',title:'Child pose (yoga)',body:'Balasana 2-3 min \u2014 lower back aur abdomen ki tension release hoti hai. Din me 2-3 baar karo.'},
    {cat:'diet',icon:I.food,bg:'var(--orange-soft)',title:'Iron wapas lao',body:'Period me blood loss se iron kam ho sakta hai. Palak, chana, jaggery, dates khaane se kai logon ko weakness kam feel hoti hai.'},
    {cat:'diet',icon:I.food,bg:'var(--orange-soft)',title:'Magnesium = less cramps',body:'Dark chocolate, banana, nuts, seeds me magnesium hai \u2014 kai studies me ise kam cramps se joda gaya hai, har kisi pe same effect nahi hota.'},
    {cat:'diet',icon:I.food,bg:'var(--orange-soft)',title:'Namkeen kam, paani zyada',body:'Zyada salt se bloating badhti hai. PMS week me namkeen kam aur 8-10 glass paani rakho.'},
    {cat:'exercise',icon:I.run,bg:'var(--green-soft)',title:'Period me bhi halka exercise',body:'Heavy workout zaroori nahi, lekin 15-20 min walk ya light yoga se kai logon ko relief milta hai (endorphins \u2014 natural feel-good chemicals).'},
    {cat:'exercise',icon:I.run,bg:'var(--green-soft)',title:'Follicular phase = power week',body:'Period ke baad wala week energy ka peak hai. Strength training ya naya workout isi week try karo.'},
    {cat:'sleep',icon:I.moon,bg:'var(--purple-soft)',title:'7-8 ghante ki neend',body:'Sleep kam hone se PMS aur cramps dono zyada feel hote hain. Period week me 30 min extra sleep lo.'},
    {cat:'sleep',icon:I.moon,bg:'var(--purple-soft)',title:'Phone 30 min pehle band',body:'Screen light se melatonin kam hota hai. Sone se pehle half hour no-phone rakho, neend deep hogi.'},
    {cat:'mood',icon:I.heart,bg:'var(--primary-soft)',title:'Mood swings normal hain',body:'PMS me irritability ya udaasi hormones ki wajah se hoti hai \u2014 ye tumhari galti nahi hai. 4-7-8 breathing try karo.'},
    {cat:'mood',icon:I.heart,bg:'var(--primary-soft)',title:'Journal karo',body:'Notes me likhne se pattern samajh aata hai: kaunse din mood low hota hai, kya trigger hai. Next month prepared rahogi.'}
  ];
}
function showAiConsent(){ const m=$('#ai-consent'); if(m) m.style.display='flex'; }
function hideAiConsent(){ const m=$('#ai-consent'); if(m) m.style.display='none'; }
function aiConsentYes(){ S.aiConsent=true; save(); hideAiConsent(); aiTip(); }
async function aiTip(){
  const btn = $('#ai-tip-btn');
  if(!S.geminiKey){ toast('Settings me Gemini API key add karo'); location.hash='#/settings'; return; }
  if(!S.aiConsent){ showAiConsent(); return; }
  btn.textContent = 'Soch raha hai...'; btn.disabled = true;
  const p = predict();
  const recentSym = Object.keys(S.logs).sort().slice(-7).flatMap(d=>S.logs[d].symptoms||[]);
  const prompt = 'You are a warm, caring women\'s health assistant inside a period tracker app for a young Indian woman. Give ONE short practical health tip (2-3 sentences) in simple Hinglish (Roman Hindi + English mix). Context: cycle day '+p.cycleDay+' of ~'+p.avgR+', next period in '+p.daysLeft+' days, phase: '+phaseOf(p)+'. Recent symptoms logged: '+(recentSym.length?recentSym.join(', '):'none')+'. Focus: '+tipCat+'. Be encouraging, never medical-diagnosis. No markdown.';
  try{
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key='+encodeURIComponent(S.geminiKey),{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({contents:[{parts:[{text:prompt}]}]})
    });
    const data = await res.json();
    const txt = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
    if(txt){ $('#bigtip-text').textContent = txt.trim(); toast('Naya AI tip ready'); }
    else { $('#bigtip-text').textContent = localTip(p); toast('AI busy hai \u2014 offline tip diya'); }
  }catch(e){ $('#bigtip-text').textContent = localTip(p); toast('Internet nahi \u2014 offline tip diya'); }
  btn.textContent = 'Naya AI tip'; btn.disabled = false;
}

/* ---------------- SETTINGS ---------------- */
function renderSettings(){
  $('#set-name').value = S.name||'';
  $('#set-cycle').value = S.avgCycle;
  $('#set-plen').value = S.periodLen;
  $('#set-lastp').value = S.lastPeriod||'';
  $('#set-key').value = S.geminiKey||'';
  $('#set-remind').value = S.reminderDays;
  $('#sw-theme').classList.toggle('on', S.theme==='dark');
  $('#sw-teen').classList.toggle('on', !!S.teenMode);
  $('#sw-disguise').classList.toggle('on', !!S.disguise);
  $('#pin-status').textContent = S.pin ? 'PIN set hai' : 'PIN nahi hai';
}
function bindSettings(){
  $('#set-name').onchange = e=>{ S.name=e.target.value.trim(); save(); };
  $('#set-cycle').onchange = e=>{ S.avgCycle=Math.min(45,Math.max(20,parseInt(e.target.value)||28)); e.target.value=S.avgCycle; save(); toast('Cycle length save'); };
  $('#set-plen').onchange = e=>{ S.periodLen=Math.min(10,Math.max(2,parseInt(e.target.value)||5)); e.target.value=S.periodLen; save(); toast('Period length save'); };
  $('#set-lastp').onchange = e=>{ S.lastPeriod=e.target.value; save(); toast('Last period save'); };
  $('#set-key').onchange = e=>{ S.geminiKey=e.target.value.trim(); save(); toast(S.geminiKey?'API key save ho gayi (sirf is phone pe)':'API key hata di'); };
  $('#set-remind').onchange = e=>{ S.reminderDays=parseInt(e.target.value)||2; save(); };
  $('#sw-theme').onclick = ()=>{ S.theme = S.theme==='dark'?'light':'dark'; applyTheme(); save(); renderSettings(); };
  $('#sw-teen').onclick = ()=>{ S.teenMode=!S.teenMode; save(); renderSettings(); toast(S.teenMode?'Teen mode on \u2014 simple language + teen tips':'Teen mode off'); };
  $('#sw-disguise').onclick = ()=>{ S.disguise=!S.disguise; applyDisguise(); save(); renderSettings(); toast(S.disguise?'Disguise on \u2014 lock screen calculator dikhegi':'Disguise off'); };
  $('#btn-setpin').onclick = ()=>{
    const v = $('#set-pin').value.trim();
    if(!/^\d{4}$/.test(v)){ toast('4-digit PIN daalo'); return; }
    S.pin=v; unlocked=true; save(); $('#set-pin').value=''; renderSettings(); toast('PIN lock set ho gaya');
  };
  $('#btn-removepin').onclick = ()=>{ S.pin=''; save(); renderSettings(); toast('PIN lock hata diya'); };
  $('#btn-export').onclick = ()=>{
    const ex = Object.assign({}, S); delete ex.pin; delete ex.geminiKey;
    const blob = new Blob([JSON.stringify(ex,null,2)],{type:'application/json'});
    if(window.Android){ const r=new FileReader(); r.onload=()=>Android.save(String(r.result).split(',')[1],'ptracker-backup.json','application/json'); r.readAsDataURL(blob); }
    else { const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='ptracker-backup.json'; a.click(); toast('Backup download ho raha hai'); }
  };
  $('#import-file').onchange = e=>{
    const f=e.target.files[0]; if(!f) return;
    const r=new FileReader();
    r.onload=()=>{ try{ const d=JSON.parse(r.result); S=Object.assign({},DEFAULT_STATE,d); save(); applyTheme(); toast('Backup restore ho gaya'); go('home'); }catch(err){ toast('Backup file sahi nahi hai'); } };
    r.readAsText(f);
  };
  $('#btn-erase').onclick = ()=>{
    if(confirm('Pakka? Saara data is phone se delete ho jayega.')){ localStorage.removeItem(LS_KEY); S={...DEFAULT_STATE}; unlocked=true; applyTheme(); location.hash='#/onboarding'; go('onboarding'); }
  };
}
function applyTheme(){ document.documentElement.setAttribute('data-theme', S.theme==='dark'?'dark':'light'); const mt=$('#theme-meta'); if(mt) mt.content = S.theme==='dark'?'#2A1520':'#FFF6F9'; }
function applyDisguise(){
  const t = S.disguise ? 'Calculator' : 'P Tracker';
  document.title = t;
  const fav = $('#favicon');
  fav.href = S.disguise ? 'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#333"/><rect x="10" y="8" width="44" height="14" rx="3" fill="#9FE6B8"/><rect x="10" y="28" width="9" height="9" rx="2" fill="#666"/><rect x="23" y="28" width="9" height="9" rx="2" fill="#666"/><rect x="36" y="28" width="9" height="9" rx="2" fill="#666"/><rect x="10" y="41" width="9" height="9" rx="2" fill="#666"/><rect x="23" y="41" width="9" height="9" rx="2" fill="#666"/><rect x="36" y="41" width="18" height="9" rx="2" fill="#FF9F2E"/></svg>')
    : 'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30"><g fill="#F86FA0"><ellipse cx="15" cy="7.5" rx="4" ry="5.5"/><ellipse cx="15" cy="22.5" rx="4" ry="5.5"/><ellipse cx="7.5" cy="15" rx="5.5" ry="4"/><ellipse cx="22.5" cy="15" rx="5.5" ry="4"/><ellipse cx="9.7" cy="9.7" rx="3.4" ry="4.6" transform="rotate(-45 9.7 9.7)"/><ellipse cx="20.3" cy="9.7" rx="3.4" ry="4.6" transform="rotate(45 20.3 9.7)"/><ellipse cx="9.7" cy="20.3" rx="3.4" ry="4.6" transform="rotate(45 9.7 20.3)"/><ellipse cx="20.3" cy="20.3" rx="3.4" ry="4.6" transform="rotate(-45 20.3 20.3)"/></g><circle cx="15" cy="15" r="4.5" fill="#FFD3E2"/></svg>');
}

/* ---------------- ONBOARDING ---------------- */
function renderOnboarding(){
  const t=new Date();
  $('#ob-lastp').value = S.lastPeriod || toStr(addDays(t,-16));
}
function finishOnboarding(){
  const lp = $('#ob-lastp').value;
  if(!lp){ toast('Last period date daalo'); return; }
  S.lastPeriod = lp;
  S.avgCycle = Math.min(45,Math.max(20,parseInt($('#ob-cycle').value)||28));
  S.periodLen = Math.min(10,Math.max(2,parseInt($('#ob-plen').value)||5));
  S.name = $('#ob-name').value.trim();
  S.onboarded = true; S.createdAt = new Date().toISOString();
  S.logs[S.lastPeriod] = {flow:'medium',symptoms:[],mood:'',note:''};
  save(); toast('Setup ho gaya \u2014 welcome!'); location.hash='#/home'; go('home');
}

/* ---------------- LOCK ---------------- */
let pinEntry=''; let calcExpr='';
function renderLock(){
  pinEntry=''; calcExpr='';
  document.body.classList.toggle('calc-mode', !!S.disguise);
  $('#lock-normal').style.display = S.disguise?'none':'block';
  $('#lock-calc').style.display = S.disguise?'block':'none';
  updPinDots();
  if(S.disguise) $('#calc-screen').textContent='0';
}
function updPinDots(){ $$('#pin-dots i').forEach((d,i)=>d.classList.toggle('f', i<pinEntry.length)); }
function pinKey(k){
  if(k==='clr'){ pinEntry=''; }
  else if(k==='ok'){ if(pinEntry===S.pin){ unlocked=true; location.hash='#/home'; go('home'); } else { toast('Galat PIN'); pinEntry=''; } }
  else if(pinEntry.length<4) pinEntry+=k;
  updPinDots();
}
function calcKey(k){
  const scr=$('#calc-screen');
  if(k==='C'){ calcExpr=''; scr.textContent='0'; return; }
  if(k==='='){
    if(calcExpr===S.pin){ unlocked=true; location.hash='#/home'; go('home'); return; }
    try{
      if(!/^[0-9+\-*/.()% ]+$/.test(calcExpr)||!calcExpr) throw 0;
      const v = Function('"use strict";return('+calcExpr+')')();
      scr.textContent = (v===undefined||v===null||Number.isNaN(v))?'Error':String(Math.round(v*1e8)/1e8);
    }catch(e){ scr.textContent='Error'; }
    calcExpr=''; return;
  }
  calcExpr+=k; scr.textContent=calcExpr;
}

/* ---------------- DEMO SEED (for preview/testing) ---------------- */
function seedDemo(){
  if(S.onboarded) return;
  const t = stripTime(new Date());
  S.avgCycle=28; S.periodLen=5;
  S.lastPeriod = toStr(addDays(t,-16));
  const mk=(off,flow)=>({flow,symptoms:[],mood:'',note:''});
  for(const back of [44,16]){
    const start = addDays(t,-back);
    for(let i=0;i<5;i++){
      const l = mk(0, i<1?'heavy':(i<3?'medium':'light'));
      l.symptoms = i===0?['Cramps','Fatigue','Backache'] : (i===1?['Cramps','Bloating']:[]);
      S.logs[toStr(addDays(start,i))] = l;
    }
    S.logs[toStr(addDays(start,-2))] = {flow:'',symptoms:['Mood swings','Headache'],mood:'Irritated',note:''};
  }
  S.logs[toStr(addDays(t,-1))] = {flow:'',symptoms:['Cramps','Fatigue'],mood:'Calm',note:'Halka headache tha'};
  S.logs[toStr(t)] = {flow:'',symptoms:['Bloating'],mood:'Happy',note:''};
  S.onboarded=true;
}

/* ---------------- INIT ---------------- */
function applyNav(){
  $$('#navbar .nav-item[data-route]').forEach(n=> n.onclick = ()=>{ location.hash='#/'+n.dataset.route; });
}
document.addEventListener('DOMContentLoaded',()=>{
  const q = new URLSearchParams(location.search);
  if(q.get('demo')==='1') seedDemo();
  if(q.get('reset')==='1'){ localStorage.removeItem(LS_KEY); S={...DEFAULT_STATE}; }
  if(q.get('theme')) S.theme=q.get('theme');
  if(q.get('pin')){ S.pin=q.get('pin'); unlocked=false; }
  if(q.get('disguise')) S.disguise = q.get('disguise')==='1';
  if(q.get('showconsent')==='1') setTimeout(showAiConsent, 300);
  applyTheme(); applyDisguise(); bindSettings(); applyNav();
  const st=$('#sb-time'); if(st){ const n=new Date(); st.textContent = ((n.getHours()%12)||12)+':'+String(n.getMinutes()).padStart(2,'0'); }
  const start = location.hash.replace('#/','') || 'home';
  go(start);
  render(start==='lock'&&!S.pin?'home':start);
});

/* ---------------- ANDROID BRIDGE HOOKS ---------------- */
window.androidBack = function(){
  const m = document.getElementById('ai-consent');
  if(m && m.style.display==='flex'){ hideAiConsent(); return; }
  const route = (location.hash.replace('#/','')||'home');
  if(route==='lock'){ if(window.Android) Android.exit(); return; }
  if(route!=='home'){ location.hash='#/home'; return; }
  if(window.Android) Android.exit();
};
if(window.Android){
  const syncTheme = ()=>Android.theme(S.theme==='dark');
  new MutationObserver(syncTheme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  document.addEventListener('DOMContentLoaded', syncTheme);
}

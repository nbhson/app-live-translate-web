// SidePanel - Tab Audio (kể cả iframe) qua tabCapture + Web Speech FREE + broadcast tới server room để web UI hiển thị
let recognition=null, isListening=false, activeAudioTrack=null, ws=null;
let lastFinalIndex=-1, finalizedOffset=0, silenceTimer=null;
const SILENCE_THRESHOLD=1500, MAX_INTERIM_LENGTH=100;
const toggleBtn=document.getElementById('toggleBtn'), playIcon=document.getElementById('playIcon'), stopIcon=document.getElementById('stopIcon'), btnText=document.getElementById('btnText'), clearBtn=document.getElementById('clearBtn'), statusText=document.getElementById('statusText'), audioSourceSelect=document.getElementById('audioSourceSelect');
const englishLog=document.getElementById('englishLog'), englishInterim=document.getElementById('englishInterim'), enPlaceholder=document.getElementById('enPlaceholder'), vietnameseLog=document.getElementById('vietnameseLog'), vietnameseInterim=document.getElementById('vietnameseInterim'), viPlaceholder=document.getElementById('viPlaceholder'), permissionOverlay=document.getElementById('permissionOverlay'), grantPermissionBtn=document.getElementById('grantPermissionBtn');
let finalizedEnPhrases=[], finalizedViPhrases=[];

function ensureWS(){ if(ws && ws.readyState===WebSocket.OPEN) return ws; ws=new WebSocket("ws://localhost:8000/ws"); ws.binaryType="arraybuffer"; ws.onopen=()=>ws.send(JSON.stringify({type:"join",sourceLang:"en",targetLangs:["vi"],roomId:"default"})); return ws; }
function broadcastToRoom(text){ ensureWS(); const send=()=>{ if(ws && ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify({type:"translate:request",text,sourceLang:"en",targetLangs:["vi"]})); }; if(ws.readyState===WebSocket.OPEN) send(); else ws.addEventListener("open",send,{once:true}); }

toggleBtn.addEventListener('click', toggleListening);
clearBtn.addEventListener('click', clearContent);
grantPermissionBtn?.addEventListener('click', ()=> chrome.tabs.create({ url: chrome.runtime.getURL('permission.html') }));

async function toggleListening(){ if(isListening){ stopListening(); return; } const source=audioSourceSelect.value; if(source==='tab') startTabCapture(); else startListening(); }

function startTabCapture(){
  showStatus('Đang lấy streamId tab (kể cả iframe)...');
  chrome.runtime.sendMessage({ type: 'get-tab-stream-id' }, async (response)=>{
    if(!response || response.error){ showStatus('Không thể thu tab, fallback mic'); audioSourceSelect.value='mic'; startListening(); return; }
    try{
      const stream=await navigator.mediaDevices.getUserMedia({ audio:{ mandatory:{ chromeMediaSource:'tab', chromeMediaSourceId: response.streamId }}, video:false });
      window.capturedAudioContext=new (window.AudioContext||window.webkitAudioContext)();
      window.capturedSource=window.capturedAudioContext.createMediaStreamSource(stream);
      window.capturedSource.connect(window.capturedAudioContext.destination);
      const tracks=stream.getAudioTracks(); if(!tracks.length) throw new Error('No audio tracks');
      activeAudioTrack=tracks[0]; window.capturedStream=stream; ensureWS(); startListening();
    }catch(err){ console.error(err); showStatus('Lỗi tab audio, dùng mic'); audioSourceSelect.value='mic'; cleanupTabCapture(); startListening(); }
  });
}
function cleanupTabCapture(){ if(window.capturedStream){ window.capturedStream.getTracks().forEach(t=>t.stop()); window.capturedStream=null; } activeAudioTrack=null; if(window.capturedAudioContext){ try{window.capturedAudioContext.close();}catch{} window.capturedAudioContext=null; } }

function startListening(){
  if(!recognition) initRecognition();
  if(recognition){
    try{ lastFinalIndex=-1; finalizedOffset=0; if(activeAudioTrack) recognition.start(activeAudioTrack); else recognition.start(); }catch(e){ console.error(e); if(activeAudioTrack){ activeAudioTrack=null; try{recognition.start();}catch(err){console.error(err);} } }
  }
}
function stopListening(){ isListening=false; if(recognition) try{recognition.stop();}catch{} if(silenceTimer){clearTimeout(silenceTimer); silenceTimer=null;} cleanupTabCapture(); updateUI(false); showStatus('Đã dừng'); }

function initRecognition(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){ showStatus('Trình duyệt không hỗ trợ SpeechRecognition'); return; }
  recognition=new SR(); recognition.continuous=true; recognition.interimResults=true; recognition.lang='en-US';
  recognition.onstart=()=>{ isListening=true; updateUI(true); showStatus(activeAudioTrack?'Đang dịch âm thanh Tab (kể cả iframe)...':'Đang nghe mic...'); };
  recognition.onresult=async (event)=>{
    let interimEn=''; if(silenceTimer){clearTimeout(silenceTimer); silenceTimer=null;}
    for(let i=event.resultIndex;i<event.results.length;i++){
      const res=event.results[i];
      if(res.isFinal){ if(i>lastFinalIndex){ lastFinalIndex=i; const raw=res[0].transcript; const remaining=raw.substring(finalizedOffset).trim(); finalizedOffset=0; if(remaining) await finalizeText(remaining); } }
      else { const raw=res[0].transcript; if(finalizedOffset>raw.length) finalizedOffset=raw.length; interimEn=raw.substring(finalizedOffset).trim(); }
    }
    if(interimEn){
      enPlaceholder.style.display='none'; englishInterim.innerText=interimEn+'...'; broadcastInterim(interimEn);
      const lastIdx=event.results.length-1; const len=event.results[lastIdx][0].transcript.length;
      if(interimEn.length>=MAX_INTERIM_LENGTH) await forceFinalize(interimEn,len); else silenceTimer=setTimeout(async()=>await forceFinalize(interimEn,len), SILENCE_THRESHOLD);
    }
  };
  recognition.onerror=(e)=>{ console.error(e); if(e.error==='not-allowed'){ permissionOverlay.style.display='flex'; stopListening(); } };
  recognition.onend=()=>{ if(isListening){ try{lastFinalIndex=-1; finalizedOffset=0; if(activeAudioTrack) recognition.start(activeAudioTrack); else recognition.start();}catch(e){console.error(e);} } else updateUI(false); };
}
async function finalizeText(text){
  const clean=text.trim(); if(!clean) return;
  enPlaceholder.style.display='none'; viPlaceholder.style.display='none';
  finalizedEnPhrases.push(clean); englishLog.innerHTML=finalizedEnPhrases.map(p=>`<p>${p}</p>`).join(''); englishInterim.innerText='';
  broadcastToRoom(clean);
  const vi=await translateText(clean); finalizedViPhrases.push(vi||'[Không dịch]'); vietnameseLog.innerHTML=finalizedViPhrases.map(p=>`<p>${p}</p>`).join(''); vietnameseInterim.innerText=''; showStatus(activeAudioTrack?'Đang dịch Tab...':'Đang nghe...');
}
async function forceFinalize(text,rawLen){ if(silenceTimer){clearTimeout(silenceTimer); silenceTimer=null;} finalizedOffset=rawLen; englishInterim.innerText=''; vietnameseInterim.innerText=''; await finalizeText(text); }
let interimTimeout=null;
function broadcastInterim(text){ if(interimTimeout) clearTimeout(interimTimeout); interimTimeout=setTimeout(async()=>{ const vi=await translateText(text); vietnameseInterim.innerText=vi+'...'; },300); }
async function translateText(text){ const url=`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t&q=${encodeURIComponent(text)}`; try{ const r=await fetch(url); const data=await r.json(); if(data && data[0]) return data[0].map(x=>x[0]).join(''); }catch(e){console.error(e);} return ''; }
function updateUI(active){ if(active){ toggleBtn.className='btn btn-danger'; playIcon.style.display='none'; stopIcon.style.display='block'; btnText.innerText='Dừng'; } else { toggleBtn.className='btn btn-primary'; playIcon.style.display='block'; stopIcon.style.display='none'; btnText.innerText='Bắt đầu'; } }
function clearContent(){ finalizedEnPhrases=[]; finalizedViPhrases=[]; englishLog.innerHTML=''; vietnameseLog.innerHTML=''; englishInterim.innerText=''; vietnameseInterim.innerText=''; enPlaceholder.style.display='flex'; viPlaceholder.style.display='flex'; showStatus('Đã xóa'); }
function showStatus(m){ statusText.innerText=m; }

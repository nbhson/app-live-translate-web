// background service worker (MV3) - tabCapture -> offscreen bridge
let offscreenCreated = false;
let currentStreamId: string | null = null;

const WS_URL = "ws://localhost:8000/ws";

async function ensureOffscreen() {
  if (offscreenCreated) return;
  // @ts-ignore
  if (chrome.offscreen && chrome.offscreen.hasDocument) {
    // @ts-ignore
    if (await chrome.offscreen.hasDocument()) { offscreenCreated = true; return; }
  }
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["USER_MEDIA" as any],
    justification: "Hold audio stream from tab capture and resample to PCM 16k"
  });
  offscreenCreated = true;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.cmd === "start") {
      try {
        await ensureOffscreen();
        // tabCapture requires active tab
        const stream = await (chrome.tabCapture as any).capture({ audio: true, video: false });
        // stream is MediaStream in SW context, but MV3 SW cannot hold AudioContext -> send to offscreen
        // We use streamId via chrome.tabCapture.getMediaStreamId (if available) or transfer via messaging
        // Fallback: offscreen will request tabCapture again via getUserMedia with chromeMediaSource
        const sourceLang = msg.sourceLang ?? "en";
        const targetLangs = msg.targetLangs ?? ["vi"];
        await chrome.runtime.sendMessage({ cmd: "offscreen:start", sourceLang, targetLangs, wsUrl: WS_URL });
        sendResponse({ ok: true });
      } catch (e:any) {
        sendResponse({ ok:false, error: e.message ?? String(e) });
      }
    } else if (msg?.cmd === "stop") {
      await chrome.runtime.sendMessage({ cmd: "offscreen:stop" });
      // close offscreen if needed
      try { await chrome.offscreen.closeDocument(); offscreenCreated=false; } catch {}
      sendResponse({ ok: true });
    } else if (msg?.cmd === "offscreen:ready") {
      sendResponse({ ok:true });
    }
  })();
  return true;
});

// Keep WS settings in storage for popup
chrome.storage.onChanged.addListener((changes)=>{
  if (changes.sourceLang || changes.targetLangs) {
    chrome.runtime.sendMessage({ cmd: "offscreen:updateSettings", sourceLang: changes.sourceLang?.newValue, targetLangs: changes.targetLangs?.newValue }).catch(()=>{});
  }
});

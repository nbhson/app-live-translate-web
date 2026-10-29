"use client";
// Thin wrapper around native WebSocket + Socket.io fallback
// Keeps API close to ARCHITECTURE.md:9.1 (join, audio:chunk, etc.)
// Adds reconnect + heartbeat per spec.

export type SocketOpts = {
  url: string;
  sourceLang: string;
  targetLangs: string[];
  sttProvider?: string;
  translateProvider?: string;
  /** Room id for shared sessions (?room= links). Server broadcasts to everyone in the room. */
  roomId?: string;
};

export function createLiveSocket(opts: SocketOpts) {
  const url = opts.url.endsWith("/ws") ? opts.url : `${opts.url.replace(/\/$/,"")}/ws`;
  let ws: WebSocket | null = null;
  let hb: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempts = 0;
  let closedByUser = false;

  const listeners = new Map<string, Set<(data:any)=>void>>();
  const on = (ev:string, cb:(data:any)=>void) => {
    if(!listeners.has(ev)) listeners.set(ev,new Set());
    listeners.get(ev)!.add(cb);
    return () => listeners.get(ev)!.delete(cb);
  };
  const emit = (type:string, payload: Record<string,unknown> = {}) => {
    if(ws?.readyState===WebSocket.OPEN) ws.send(JSON.stringify({ type, ...payload }));
  };
  const sendBinary = (buf:ArrayBuffer) => {
    if(ws?.readyState===WebSocket.OPEN) ws.send(buf);
  };
  const trigger = (type:string, data:any) => {
    for(const cb of listeners.get(type) ?? []) cb(data);
    for(const cb of listeners.get("*") ?? []) cb({ type, ...data });
  };

  const connect = () => {
    closedByUser=false;
    ws = new WebSocket(url);
    ws.binaryType="arraybuffer";
    ws.onopen = () => {
      reconnectAttempts = 0; // kết nối thành công — reset backoff
      trigger("open",{});
      emit("join",{ sourceLang: opts.sourceLang, targetLangs: opts.targetLangs, sttProvider: opts.sttProvider ?? "deepgram", translateProvider: opts.translateProvider ?? "ai", roomId: opts.roomId ?? "default" });
      if(hb) clearInterval(hb);
      hb=setInterval(()=> emit("ping",{}), 25000);
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        const t = msg.type ?? "message";
        trigger(t, msg);
      } catch { /* binary from server not expected */ }
    };
    ws.onclose = () => {
      if(hb) { clearInterval(hb); hb=null; }
      trigger("close",{});
      if(!closedByUser){
        // Exponential backoff + jitter, cap 15s — fixed 1500ms trước đây biến
        // server down thành reconnect-storm (client tự DDoS server của mình).
        const delay = Math.min(1500 * Math.pow(2, reconnectAttempts), 15000);
        reconnectAttempts += 1;
        reconnectTimer=setTimeout(connect, delay + Math.floor(Math.random() * 400));
      }
    };
    ws.onerror = (e)=> trigger("error",e);
  };
  const close = () => {
    closedByUser=true;
    if(hb) clearInterval(hb);
    if(reconnectTimer) clearTimeout(reconnectTimer);
    ws?.close(); ws=null;
  };
  const updateSettings = (src:string, tgts:string[], extra?: { translateProvider?: string; sttProvider?: string }) => {
    opts.sourceLang=src; opts.targetLangs=tgts;
    if (extra?.translateProvider) opts.translateProvider = extra.translateProvider;
    if (extra?.sttProvider) opts.sttProvider = extra.sttProvider;
    emit("settings:update",{ sourceLang: src, targetLangs: tgts, ...extra });
  };
  connect();
  return { on, emit, sendBinary, close, updateSettings, get ws(){return ws;} };
}

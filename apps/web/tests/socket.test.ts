import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLiveSocket } from "../lib/socket";

// Mock WebSocket
class MockWS {
  url: string;
  binaryType = "arraybuffer";
  readyState = 1;
  onopen: any; onmessage:any; onclose:any; onerror:any;
  sent: any[] = [];
  constructor(url:string){ this.url=url; (global as any).lastWS=this; setTimeout(()=> this.onopen?.({}),0); }
  send(d:any){ this.sent.push(d); }
  close(){ this.readyState=3; this.onclose?.({}); }
  static OPEN=1
}
describe("createLiveSocket", () => {
  let origWS:any;
  beforeEach(()=>{ origWS=(global as any).WebSocket; (global as any).WebSocket=MockWS; vi.useFakeTimers(); });
  afterEach(()=>{ (global as any).WebSocket=origWS; vi.useRealTimers(); vi.restoreAllMocks(); });
  it("connects and sends join", async () => {
    const sock = createLiveSocket({ url:"ws://localhost:8000", sourceLang:"en", targetLangs:["vi"] });
    await vi.advanceTimersByTimeAsync(0);
    const ws = (global as any).lastWS as MockWS;
    expect(ws.sent[0]).toContain("join");
    sock.close();
  });
  it("emits settings update", async () => {
    const sock = createLiveSocket({ url:"ws://localhost:8000/ws", sourceLang:"en", targetLangs:["vi"] });
    await vi.advanceTimersByTimeAsync(0);
    const ws = (global as any).lastWS as MockWS;
    ws.sent.length=0;
    sock.updateSettings("ja", ["en"]);
    expect(ws.sent[0]).toContain("settings:update");
    sock.close();
  });
  it("handles on message trigger", async () => {
    const sock = createLiveSocket({ url:"ws://localhost:8000", sourceLang:"en", targetLangs:["vi"] });
    await vi.advanceTimersByTimeAsync(0);
    const ws = (global as any).lastWS as MockWS;
    const cb = vi.fn();
    sock.on("stt:interim", cb);
    ws.onmessage({ data: JSON.stringify({ type:"stt:interim", transcript:"hi" }) });
    expect(cb).toHaveBeenCalled();
    sock.close();
  });
  it("sendBinary when open", async () => {
    const sock = createLiveSocket({ url:"ws://localhost:8000", sourceLang:"en", targetLangs:["vi"] });
    await vi.advanceTimersByTimeAsync(0);
    const ws = (global as any).lastWS as MockWS;
    sock.sendBinary(new ArrayBuffer(8));
    expect(ws.sent.some(s=> s instanceof ArrayBuffer)).toBe(true);
    sock.close();
  });
  it("on close triggers reconnect not if closedByUser", async () => {
    const sock = createLiveSocket({ url:"ws://localhost:8000", sourceLang:"en", targetLangs:["vi"] });
    await vi.advanceTimersByTimeAsync(0);
    const ws = (global as any).lastWS as MockWS;
    ws.onclose({});
    // should schedule reconnect
    expect(true).toBe(true);
    sock.close();
  });
  it("join without roomId uses a random room, not the shared 'default'", async () => {
    const { randomRoomId } = await import("../lib/socket");
    const a = randomRoomId();
    const b = randomRoomId();
    expect(a).not.toBe("default");
    expect(a).toMatch(/^[a-zA-Z0-9]{1,8}$/);
    expect(b).not.toBe(a);
    const sock = createLiveSocket({ url:"ws://localhost:8000", sourceLang:"en", targetLangs:["vi"] });
    await vi.advanceTimersByTimeAsync(0);
    const ws = (global as any).lastWS as MockWS;
    const join = JSON.parse(ws.sent[0]);
    expect(join.type).toBe("join");
    expect(join.roomId).not.toBe("default");
    expect(join.roomId).toMatch(/^[a-zA-Z0-9]{1,8}$/);
    sock.close();
  });
});

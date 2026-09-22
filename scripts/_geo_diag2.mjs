const list = await (await fetch("http://127.0.0.1:9333/json/list")).json()
const mini = list.find(t => t.url.includes('mini'))
const ws = new WebSocket(mini.webSocketDebuggerUrl)
await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j})
let id=0; const pend=new Map()
ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}}
const send=(m,p={})=>new Promise(res=>{const i=++id;pend.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:p}))})
const ev = async (e) => {
  const r = await send('Runtime.evaluate', { expression:`(async()=>{${e}})()`, awaitPromise:true, returnByValue:true })
  if (r.result?.exceptionDetails) return 'EXC: '+(r.result.exceptionDetails.exception?.description||'').slice(0,200)
  return r.result?.result?.value
}
await send('Runtime.enable')
console.log('可用方法(含 Monitor/Size/Position):', await ev(`
  const w = window.__TAURI__.window.getCurrentWindow();
  const proto = Object.getPrototypeOf(w);
  return Object.getOwnPropertyNames(proto).filter(n => /monitor|Monitor|Position|Size|Scale/i.test(n)).join(', ');
`))
console.log('primaryMonitor:', await ev(`
  const w = window.__TAURI__.window.getCurrentWindow();
  if (typeof w.primaryMonitor !== 'function') return 'no-fn';
  const m = await w.primaryMonitor();
  return m ? JSON.stringify({pos:m.position, size:m.size, work:m.workArea, scale:m.scaleFactor}) : 'null';
`))
console.log('缩放后的逻辑工作区:', await ev(`
  const w = window.__TAURI__.window.getCurrentWindow();
  const m = await w.primaryMonitor();
  if (!m) return 'no-monitor';
  const s = m.scaleFactor || 1;
  const wa = m.workArea;
  return JSON.stringify({ x: wa.position.x/s, y: wa.position.y/s, w: wa.size.width/s, h: wa.size.height/s, scale: s });
`))
ws.close(); process.exit(0)

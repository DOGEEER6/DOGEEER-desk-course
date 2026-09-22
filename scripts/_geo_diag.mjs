const list = await (await fetch("http://127.0.0.1:9333/json/list")).json()
const mini = list.find(t => t.url.includes('mini'))
const ws = new WebSocket(mini.webSocketDebuggerUrl)
await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j})
let id=0; const pend=new Map()
ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}}
const send=(m,p={})=>new Promise(res=>{const i=++id;pend.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:p}))})
const ev = async (e) => {
  const r = await send('Runtime.evaluate', { expression:`(async()=>{${e}})()`, awaitPromise:true, returnByValue:true })
  if (r.result?.exceptionDetails) return 'EXC: '+(r.result.exceptionDetails.exception?.description||'').slice(0,220)
  return r.result?.result?.value
}
await send('Runtime.enable')
console.log('innerSize:', await ev(`return innerWidth+'x'+innerHeight`))
console.log('dpr:', await ev(`return devicePixelRatio`))
console.log('screen:', await ev(`return JSON.stringify({w:screen.width,h:screen.height,aw:screen.availWidth,ah:screen.availHeight,ax:screen.availLeft,ay:screen.availTop})`))
console.log('currentMonitor:', await ev(`
  const w = window.__TAURI__.window.getCurrentWindow();
  const m = await w.currentMonitor();
  return m ? JSON.stringify({pos:m.position, size:m.size, work:m.workArea, scale:m.scaleFactor}) : 'null';
`))
console.log('outerPosition:', await ev(`const w=window.__TAURI__.window.getCurrentWindow(); const p=await w.outerPosition(); return JSON.stringify(p)`))
console.log('outerSize:', await ev(`const w=window.__TAURI__.window.getCurrentWindow(); const s=await w.outerSize(); return JSON.stringify(s)`))
console.log('scaleFactor:', await ev(`const w=window.__TAURI__.window.getCurrentWindow(); return await w.scaleFactor()`))
ws.close(); process.exit(0)

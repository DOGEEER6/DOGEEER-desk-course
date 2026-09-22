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
console.log('dpr:', await ev(`return devicePixelRatio`), 'screen:', await ev(`return screen.width+'x'+screen.height`))
console.log('outerPosition 前:', await ev(`const w=window.__TAURI__.window.getCurrentWindow(); return JSON.stringify(await w.outerPosition())`))
console.log('直接 set_position Physical(3200,24):', await ev(`
  try {
    await window.__TAURI_INTERNALS__.invoke('plugin:window|set_position', { label:'mini', value:{ Physical:{ x:3200, y:24 } } });
    return 'invoked';
  } catch(e){ return 'ERR '+String(e && (e.message||e)); }
`))
await new Promise(r=>setTimeout(r,800))
console.log('outerPosition 后:', await ev(`const w=window.__TAURI__.window.getCurrentWindow(); return JSON.stringify(await w.outerPosition())`))
console.log('outerSize:', await ev(`const w=window.__TAURI__.window.getCurrentWindow(); return JSON.stringify(await w.outerSize())`))
ws.close(); process.exit(0)

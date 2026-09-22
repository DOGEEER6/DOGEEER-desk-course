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
console.log('workArea:', await ev(`return JSON.stringify({left:screen.availLeft,top:screen.availTop,w:screen.availWidth,h:screen.availHeight})`))
console.log('outerSize(before):', await ev(`const w=window.__TAURI__.window.getCurrentWindow(); return JSON.stringify(await w.outerSize())`))
console.log('outerPosition(before):', await ev(`const w=window.__TAURI__.window.getCurrentWindow(); return JSON.stringify(await w.outerPosition())`))
// 直接设置一个明确的位置，看看是否生效
console.log('setPosition(2000,300):', await ev(`
  const w = window.__TAURI__.window.getCurrentWindow();
  await w.setPosition({ x: 2000, y: 300 });
  return 'sent';
`))
await new Promise(r=>setTimeout(r,600))
console.log('outerPosition(after):', await ev(`const w=window.__TAURI__.window.getCurrentWindow(); return JSON.stringify(await w.outerPosition())`))
console.log('setSize(400,500):', await ev(`
  const w = window.__TAURI__.window.getCurrentWindow();
  await w.setSize({ width: 400, height: 500 });
  return 'sent';
`))
await new Promise(r=>setTimeout(r,600))
console.log('outerSize(after):', await ev(`const w=window.__TAURI__.window.getCurrentWindow(); return JSON.stringify(await w.outerSize())`))
console.log('innerSize:', await ev(`return innerWidth+'x'+innerHeight`))
ws.close(); process.exit(0)

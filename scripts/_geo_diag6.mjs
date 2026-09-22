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
console.log('调用命令的返回:', await ev(`
  try { const r = await window.__TAURI_INTERNALS__.invoke('snap_mini_top_right', { width: 400, height: 420, gap: 16 }); return 'ok:'+JSON.stringify(r); }
  catch(e){ return 'ERR '+String(e && (e.message||e)); }
`))
await new Promise(r=>setTimeout(r,900))
console.log('调用后位置:', await ev(`const w=window.__TAURI__.window.getCurrentWindow(); return JSON.stringify(await w.outerPosition())`))
console.log('工作区高度命令:', await ev(`return await window.__TAURI_INTERNALS__.invoke('mini_work_area_height')`))
ws.close(); process.exit(0)

const list = await (await fetch("http://127.0.0.1:9333/json/list")).json()
const mini = list.find(t => t.url.includes('mini'))
const ws = new WebSocket(mini.webSocketDebuggerUrl)
await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j})
let id=0; const pend=new Map()
ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}}
const send=(m,p={})=>new Promise(res=>{const i=++id;pend.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:p}))})
const ev = async (e) => {
  const r = await send('Runtime.evaluate', { expression:`(async()=>{${e}})()`, awaitPromise:true, returnByValue:true })
  if (r.result?.exceptionDetails) {
    const d = r.result.exceptionDetails
    return 'EXC: ' + JSON.stringify({ text: d.text, desc: d.exception?.description, value: d.exception?.value }).slice(0, 400)
  }
  return r.result?.result?.value
}
await send('Runtime.enable')
console.log('setSize 错误:', await ev(`
  try {
    const w = window.__TAURI__.window.getCurrentWindow();
    await w.setSize({ width: 400, height: 500 });
    return 'ok';
  } catch (e) { return String(e && (e.message || e)); }
`))
console.log('setPosition 错误:', await ev(`
  try {
    const w = window.__TAURI__.window.getCurrentWindow();
    await w.setPosition({ x: 2000, y: 300 });
    return 'ok';
  } catch (e) { return String(e && (e.message || e)); }
`))
console.log('直接 invoke setSize:', await ev(`
  try {
    await window.__TAURI_INTERNALS__.invoke('plugin:window|set_size', { label: 'mini', value: { Logical: { width: 400, height: 500 } } });
    return 'ok';
  } catch (e) { return String(e && (e.message || e)); }
`))
ws.close(); process.exit(0)

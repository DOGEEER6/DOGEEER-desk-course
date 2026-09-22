const list = await (await fetch("http://127.0.0.1:9333/json/list")).json()
const mini = list.find(t => t.url.includes('mini'))
const main = list.find(t => t.url.endsWith('/'))
const ws = new WebSocket(mini.webSocketDebuggerUrl)
await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j})
let id=0; const pend=new Map()
ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}}
const send=(m,p={})=>new Promise(res=>{const i=++id;pend.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:p}))})
const ev = async (e) => {
  const r = await send('Runtime.evaluate', { expression:`(async()=>{${e}})()`, awaitPromise:true, returnByValue:true })
  if (r.result?.exceptionDetails) return 'EXC: '+(r.result.exceptionDetails.exception?.description||'').slice(0,180)
  return r.result?.result?.value
}
await send('Runtime.enable')
console.log('窗口内尺寸:', await ev(`return innerWidth+'x'+innerHeight`))
console.log('卡片尺寸:', await ev(`const r=document.querySelector('.frost-card').getBoundingClientRect(); return Math.round(r.width)+'x'+Math.round(r.height)`))
console.log('content 高度(scrollHeight):', await ev(`return document.querySelector('.frost-card').scrollHeight`))
console.log('主题:', await ev(`return document.documentElement.dataset.theme`))
console.log('卡片背景:', await ev(`return getComputedStyle(document.querySelector('.frost-card')).backgroundColor`))
console.log('毛玻璃:', await ev(`return getComputedStyle(document.querySelector('.frost-card')).backdropFilter`))
ws.close(); process.exit(0)

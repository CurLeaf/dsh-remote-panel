window.__ModuleLoader__.load({id:"dsh-remote-panel",chunk:"client.console.cc2a790a.js",factory(require){const module={exports:{}};const exports=module.exports;
var ve=Object.defineProperty;var Ve=Object.getOwnPropertyDescriptor;var We=Object.getOwnPropertyNames;var Ke=Object.prototype.hasOwnProperty;var Xe=(t,e)=>{for(var a in e)ve(t,a,{get:e[a],enumerable:!0})},Ye=(t,e,a,s)=>{if(e&&typeof e=="object"||typeof e=="function")for(let r of We(e))!Ke.call(t,r)&&r!==a&&ve(t,r,{get:()=>e[r],enumerable:!(s=Ve(e,r))||s.enumerable});return t};var Je=t=>Ye(ve({},"__esModule",{value:!0}),t);var Ot={};Xe(Ot,{mountConsole:()=>qt,normalizeSession:()=>le,parseExit:()=>ye,parseTests:()=>$e});module.exports=Je(Ot);var W=(t,e)=>({header:t,lines:e}),be={task:{id:"task-auth-race",title:"\u4FEE\u590D\u767B\u5F55\u6001\u5076\u53D1\u5931\u6548",branch:"fix/auth-race",workdir:"~/WorkSpace/acme-web",intent:"\u767B\u5F55\u5076\u53D1\u5931\u6548\uFF1A\u6709\u65F6 401 \u4E4B\u540E\u4F1A\u88AB\u76F4\u63A5\u767B\u51FA\u3002\u5148\u67E5\u4E00\u4E0B\u539F\u56E0\uFF0C\u522B\u52A8\u751F\u4EA7\u914D\u7F6E\u3002",previewUrl:"http://127.0.0.1:4173/login",totalSteps:7},steps:[{id:"s1",index:1,title:"\u590D\u73B0\u767B\u5F55\u6001\u5931\u6548",expect:"\u80FD\u7A33\u5B9A\u590D\u73B0 401 \u540E\u4F1A\u8BDD\u88AB\u6E05\u7A7A"},{id:"s2",index:2,title:"\u5B9A\u4F4D\u7ADE\u6001\u70B9",expect:"\u627E\u5230 refresh \u4E0E logout \u7684\u4EA4\u53E0\u7A97\u53E3"},{id:"s3",index:3,title:"\u7B2C\u4E00\u6B21\u4FEE\u590D session \u6062\u590D",expect:"401 \u65F6\u5148\u5237\u65B0\uFF0C\u5237\u65B0\u5931\u8D25\u624D\u767B\u51FA"},{id:"s4",index:4,title:"\u8DD1\u8BA4\u8BC1\u6D4B\u8BD5",expect:"auth \u76F8\u5173\u7528\u4F8B\u5168\u7EFF"},{id:"s5",index:5,title:"\u6362\u65B9\u6848\uFF1A\u52A0\u9501",expect:"\u5E76\u53D1 refresh \u53EA\u53D1\u4E00\u6B21"},{id:"s6",index:6,title:"\u518D\u6B21\u91CD\u8BD5",expect:"\u540C\u4E00\u7528\u4F8B\u5E94\u5F53\u901A\u8FC7"},{id:"s7",index:7,title:"\u4FEE\u6389\u771F\u6B63\u7684\u7ADE\u6001",expect:"\u4F1A\u8BDD\u6062\u590D\u4E14\u4E0D\u4E71\u767B\u51FA"}],events:[{t:0,type:"step.start",step:"s1"},{t:2,type:"file.read",path:"src/auth/session.ts"},{t:4,type:"file.read",path:"src/auth/token.ts"},{t:6,type:"file.read",path:"package.json"},{t:9,type:"note",text:"\u5728 auth.spec.ts \u91CC\u627E\u5230\u300C401 \u540E\u7ACB\u5373\u767B\u51FA\u300D\u7684\u65AD\u8A00\uFF0C\u5148\u8DD1\u5230\u5931\u8D25\u3002"},{t:11,type:"cmd.start",id:"c1",cmd:"pnpm vitest run src/auth"},{t:12,type:"cmd.line",id:"c1",stream:"out",line:"RUN  v3.2.1  /home/yxw/WorkSpace/acme-web"},{t:13,type:"cmd.line",id:"c1",stream:"out",line:" \u276F src/auth/auth.spec.ts (6 tests | 2 failed) 412ms"},{t:14,type:"cmd.line",id:"c1",stream:"err",line:"   \xD7 refreshes the token on 401  18ms"},{t:15,type:"cmd.line",id:"c1",stream:"err",line:"   \xD7 keeps the session when refresh succeeds  9ms"},{t:19,type:"cmd.end",id:"c1",exit:1,dur:8},{t:20,type:"test.result",id:"c1",spec:"src/auth/auth.spec.ts",passed:4,failed:2,cases:[{name:"refreshes the token on 401",ok:!1,ms:18},{name:"keeps the session when refresh succeeds",ok:!1,ms:9},{name:"clears session on refresh failure",ok:!0,ms:6},{name:"logout clears cookies",ok:!0,ms:4}]},{t:22,type:"step.end",step:"s1",ok:!1},{t:26,type:"step.start",step:"s2"},{t:28,type:"file.read",path:"src/auth/store.ts"},{t:33,type:"note",text:"refresh \u662F\u5E76\u53D1\u7684\uFF1A\u4E24\u4E2A 401 \u540C\u65F6\u5230\u8FBE\u4F1A\u5404\u53D1\u4E00\u6B21 refresh\uFF0C\u540E\u5230\u7684\u628A\u5148\u5230\u7684 token \u8986\u76D6\u6210\u5931\u6548\u503C\u3002"},{t:36,type:"step.end",step:"s2",ok:!0},{t:40,type:"step.start",step:"s3"},{t:42,type:"file.edit",path:"src/auth/session.ts",attempt:1,add:18,del:4,hunk:W("@@ -12,7 +12,21 @@ export async function restoreSession(req: Request) {",[{type:"ctx",text:"  const token = readCookie(req, 'sid')"},{type:"ctx",text:"  if (!token) return null"},{type:"del",text:"  const session = await store.get(token)"},{type:"add",text:"  let session = await store.get(token)"},{type:"add",text:"  if (!session) {"},{type:"add",text:"    const refreshed = await refresh(token)"},{type:"add",text:"    session = refreshed ? await store.get(refreshed) : null"},{type:"add",text:"  }"},{type:"ctx",text:"  if (!session) return null"},{type:"ctx",text:"  return session"}])},{t:45,type:"file.edit",path:"src/auth/token.ts",attempt:1,add:6,del:2,hunk:W("@@ -3,6 +3,10 @@ export function readCookie(req: Request, name: string) {",[{type:"ctx",text:"  const raw = req.headers.cookie ?? ''"},{type:"del",text:"  return parse(raw)[name]"},{type:"add",text:"  const value = parse(raw)[name]"},{type:"add",text:"  if (value === 'undefined' || value === 'null') return null"},{type:"add",text:"  return value"}])},{t:47,type:"file.edit",path:"src/config/feature-flags.ts",attempt:1,add:3,del:1,hunk:W("@@ -8,4 +8,6 @@ export const flags = {",[{type:"ctx",text:"  newCheckout: false,"},{type:"del",text:"  refreshOn401: false,"},{type:"add",text:"  refreshOn401: true,"},{type:"add",text:"  refreshLock: false,"}])},{t:49,type:"step.end",step:"s3",ok:!0},{t:52,type:"step.start",step:"s4"},{t:54,type:"cmd.start",id:"c2",cmd:"pnpm vitest run src/auth"},{t:55,type:"cmd.line",id:"c2",stream:"out",line:"RUN  v3.2.1  /home/yxw/WorkSpace/acme-web"},{t:56,type:"cmd.line",id:"c2",stream:"out",line:" \u276F src/auth/auth.spec.ts (6 tests | 2 failed) 388ms"},{t:57,type:"cmd.line",id:"c2",stream:"err",line:"   \xD7 refreshes the token on 401  21ms"},{t:58,type:"cmd.line",id:"c2",stream:"err",line:"     \u2192 expected 200, received 401"},{t:59,type:"cmd.line",id:"c2",stream:"err",line:"   \xD7 keeps the session when refresh succeeds  11ms"},{t:63,type:"cmd.end",id:"c2",exit:1,dur:9},{t:64,type:"test.result",id:"c2",spec:"src/auth/auth.spec.ts",passed:4,failed:2,cases:[{name:"refreshes the token on 401",ok:!1,ms:21},{name:"keeps the session when refresh succeeds",ok:!1,ms:11}]},{t:66,type:"step.end",step:"s4",ok:!1},{t:70,type:"step.start",step:"s5"},{t:72,type:"note",text:"\u5E76\u53D1 refresh \u9700\u8981\u4E32\u884C\u5316\u3002\u52A0\u4E00\u4E2A\u6309 token \u7684\u4E92\u65A5\u3002"},{t:75,type:"file.edit",path:"src/auth/session.ts",attempt:2,add:9,del:3,hunk:W("@@ -12,10 +12,16 @@ export async function restoreSession(req: Request) {",[{type:"ctx",text:"  let session = await store.get(token)"},{type:"del",text:"  if (!session) {"},{type:"del",text:"    const refreshed = await refresh(token)"},{type:"add",text:"  if (!session) {"},{type:"add",text:"    const refreshed = await withLock(`refresh:${token}`, async () => {"},{type:"add",text:"      const again = await store.get(token)"},{type:"add",text:"      if (again) return token"},{type:"add",text:"      return (await refresh(token)) ?? null"},{type:"add",text:"    })"},{type:"ctx",text:"    session = refreshed ? await store.get(refreshed) : null"},{type:"ctx",text:"  }"}])},{t:79,type:"step.end",step:"s5",ok:!0},{t:82,type:"step.start",step:"s6"},{t:84,type:"cmd.start",id:"c3",cmd:"pnpm vitest run src/auth"},{t:85,type:"cmd.line",id:"c3",stream:"out",line:"RUN  v3.2.1  /home/yxw/WorkSpace/acme-web"},{t:86,type:"cmd.line",id:"c3",stream:"err",line:"   \xD7 refreshes the token on 401  24ms"},{t:87,type:"cmd.line",id:"c3",stream:"err",line:"     \u2192 expected 200, received 401"},{t:91,type:"cmd.end",id:"c3",exit:1,dur:9},{t:92,type:"test.result",id:"c3",spec:"src/auth/auth.spec.ts",passed:5,failed:1,cases:[{name:"refreshes the token on 401",ok:!1,ms:24},{name:"keeps the session when refresh succeeds",ok:!0,ms:8}]},{t:96,type:"file.read",path:"src/auth/session.ts"},{t:140,type:"file.read",path:"src/auth/session.ts"},{t:188,type:"file.read",path:"src/auth/session.ts"},{t:236,type:"file.read",path:"src/auth/store.ts"},{t:300,type:"file.read",path:"src/auth/session.ts"},{t:340,type:"note",text:"\u9501\u53EA\u9632\u4F4F\u4E86\u540C\u4E00\u8FDB\u7A0B\uFF1B\u6D4B\u8BD5\u91CC\u4E24\u4E2A\u8BF7\u6C42\u8D70\u4E0D\u540C\u7684 worker\uFF0C\u9501\u6CA1\u751F\u6548\u3002"},{t:360,type:"step.end",step:"s6",ok:!1},{t:364,type:"step.start",step:"s7"},{t:366,type:"note",text:"\u628A refresh \u7684\u53BB\u91CD\u4ECE\u8FDB\u7A0B\u5185\u9501\u6362\u6210 store \u5C42\u7684\u6761\u4EF6\u5199\u3002"},{t:370,type:"file.edit",path:"src/auth/session.ts",attempt:3,add:12,del:7,hunk:W("@@ -12,16 +12,21 @@ export async function restoreSession(req: Request) {",[{type:"del",text:"    const refreshed = await withLock(`refresh:${token}`, async () => {"},{type:"del",text:"      const again = await store.get(token)"},{type:"del",text:"      if (again) return token"},{type:"del",text:"      return (await refresh(token)) ?? null"},{type:"del",text:"    })"},{type:"add",text:"    const refreshed = await store.compareAndSwap(token, async (current) => {"},{type:"add",text:"      if (current) return current.value"},{type:"add",text:"      const next = await refresh(token)"},{type:"add",text:"      return next ?? null"},{type:"add",text:"    })"},{type:"ctx",text:"    session = refreshed ? await store.get(refreshed) : null"}])},{t:374,type:"file.edit",path:"src/auth/store.ts",attempt:1,add:14,del:2,hunk:W("@@ -21,8 +21,20 @@ export class SessionStore {",[{type:"ctx",text:"  async get(token: string) {"},{type:"del",text:"    return this.rows.get(token) ?? null"},{type:"add",text:"    return this.rows.get(token) ?? null"},{type:"add",text:"  }"},{type:"add",text:""},{type:"add",text:"  async compareAndSwap(token: string, next: (cur: Row | null) => Promise<string | null>) {"},{type:"add",text:"    const cur = this.rows.get(token) ?? null"},{type:"add",text:"    const value = await next(cur)"},{type:"add",text:"    if (value) this.rows.set(token, { value, at: Date.now() })"},{type:"add",text:"    return value"}])},{t:380,type:"cmd.start",id:"c4",cmd:"pnpm vitest run src/auth"},{t:381,type:"cmd.line",id:"c4",stream:"out",line:"RUN  v3.2.1  /home/yxw/WorkSpace/acme-web"},{t:382,type:"cmd.line",id:"c4",stream:"out",line:" \u2713 src/auth/auth.spec.ts (6 tests) 392ms"},{t:384,type:"cmd.line",id:"c4",stream:"out",line:"Test Files  1 passed (1)"},{t:385,type:"cmd.line",id:"c4",stream:"out",line:"     Tests  6 passed (6)"},{t:389,type:"cmd.end",id:"c4",exit:0,dur:9},{t:390,type:"test.result",id:"c4",spec:"src/auth/auth.spec.ts",passed:6,failed:0,cases:[{name:"refreshes the token on 401",ok:!0,ms:19},{name:"keeps the session when refresh succeeds",ok:!0,ms:7},{name:"clears session on refresh failure",ok:!0,ms:5},{name:"logout clears cookies",ok:!0,ms:4}]},{t:396,type:"cmd.start",id:"c5",cmd:"pnpm exec tsc --noEmit"},{t:402,type:"cmd.end",id:"c5",exit:0,dur:6},{t:406,type:"step.end",step:"s7",ok:!0},{t:410,type:"artifact",title:"\u767B\u5F55\u6001\u6062\u590D\u4FEE\u590D",files:5,add:62,del:19}]};function Q(t,e){let a=t.length,s=e.length,r=Array.from({length:a+1},()=>new Int32Array(s+1));for(let c=a-1;c>=0;c--)for(let d=s-1;d>=0;d--)r[c][d]=t[c]===e[d]?r[c+1][d+1]+1:Math.max(r[c+1][d],r[c][d+1]);let i=[],l=0,o=0;for(;l<a&&o<s;)t[l]===e[o]?(i.push({type:"ctx",text:t[l]}),l++,o++):r[l+1][o]>=r[l][o+1]?(i.push({type:"del",text:t[l]}),l++):(i.push({type:"add",text:e[o]}),o++);for(;l<a;)i.push({type:"del",text:t[l++]});for(;o<s;)i.push({type:"add",text:e[o++]});return i}function ne(t,e=2){let a=new Array(t.length).fill(!1);t.forEach((i,l)=>{if(i.type!=="ctx")for(let o=Math.max(0,l-e);o<=Math.min(t.length-1,l+e);o++)a[o]=!0});let s=[],r=0;return t.forEach((i,l)=>{a[l]?(r&&s.push({type:"gap",text:`\u2026 \u6298\u53E0 ${r} \u884C\u672A\u53D8 \u2026`}),r=0,s.push(i)):r++}),r&&s.push({type:"gap",text:`\u2026 \u6298\u53E0 ${r} \u884C\u672A\u53D8 \u2026`}),s}function ae(t){let e=0,a=0;for(let s of t)s.type==="add"?e++:s.type==="del"&&a++;return{add:e,del:a}}var Te=180,Ge=3,Qe=3,Ze=3,et=2;function D(t){if(!Number.isFinite(t)||t<0)return"\u2014";if(t<60)return`${Math.round(t)} \u79D2`;let e=Math.floor(t/60),a=Math.round(t%60);return a?`${e} \u5206 ${a} \u79D2`:`${e} \u5206\u949F`}function ee(t){let e=Math.max(0,Math.round(t)),a=Math.floor(e/3600),s=Math.floor(e%3600/60),r=e%60;return a>0?`${a}:${String(s).padStart(2,"0")}:${String(r).padStart(2,"0")}`:`${String(s).padStart(2,"0")}:${String(r).padStart(2,"0")}`}var Le={read:"\u8BFB\u53D6",editing:"\u4FEE\u6539\u4E2D",done:"\u5DF2\u5B8C\u6210"};function ze(t,e,a,s=[],r={}){let i=s.filter(n=>!n.undone),l=e.filter(n=>n.t<=a),o=t.steps.map(n=>({...n,status:"pending",startT:null,endT:null,ok:null})),c=new Map(o.map(n=>[n.id,n])),d=new Map,w=new Map,j=new Map,M=[],z=[],m=null,b=null,E=null,T=new Set(i.filter(n=>n.kind==="ignore-file").map(n=>n.target)),L=new Set(i.filter(n=>n.kind==="block-cmd").map(n=>n.target)),N=new Set(i.filter(n=>n.kind==="sensitive-file").map(n=>n.target)),v=new Set(i.filter(n=>n.kind==="revert-file").map(n=>n.target)),g=new Set(i.filter(n=>n.kind==="kill-cmd").map(n=>n.target)),$=new Set(i.filter(n=>n.kind==="reject-hunk").map(n=>n.target)),f=new Set(i.filter(n=>n.kind==="skip-step").map(n=>n.target)),x=new Set(i.filter(n=>n.kind==="skip-test").map(n=>n.target)),h=i.find(n=>n.kind==="fix-only")?.target??null,k=i.some(n=>n.kind==="request-proof"),y=r.takeover===!0,C=n=>{E=n};for(let n of l)switch(n.type){case"step.start":{let p=c.get(n.step);p&&(p.status="running",p.startT=n.t),C(n),M.push({t:n.t,kind:"step",text:`\u5F00\u59CB\u7B2C ${p?.index??"?"} \u6B65 \xB7 ${p?.title??""}`,anchor:`step-${n.step}`,target:{kind:"step",id:n.step}});break}case"step.end":{let p=c.get(n.step);p&&(p.status=n.ok?"done":"failed",p.ok=n.ok,p.endT=n.t),C(n);break}case"file.read":{let p=je(d,n.path);p.reads++,p.lastT=n.t,p.lastKind="read",C(n),M.push({t:n.t,kind:"read",text:`\u8BFB\u53D6 ${Z(n.path)}`,anchor:`file-${K(n.path)}`,target:{kind:"file",id:n.path}});break}case"file.edit":{let p=je(d,n.path);p.attempts.push({n:n.attempt,add:n.add,del:n.del,hunk:n.hunk,t:n.t}),p.add+=n.add,p.del+=n.del,p.lastT=n.t,p.lastKind="edit",C(n),M.push({t:n.t,kind:"edit",text:`\u7F16\u8F91 ${Z(n.path)} +${n.add} \u2212${n.del}`,anchor:`file-${K(n.path)}`,target:{kind:"file",id:n.path}});break}case"cmd.start":{let p=L.has(n.cmd);w.set(n.id,{id:n.id,cmd:n.cmd,startT:n.t,endT:null,exit:null,lines:[],status:p?"blocked":"running"}),C(n),p||M.push({t:n.t,kind:"cmd",text:`\u8FD0\u884C ${n.cmd}`,anchor:`cmd-${n.id}`,target:{kind:"command",id:n.id}});break}case"cmd.line":{let p=w.get(n.id);p&&p.status!=="blocked"&&(p.lines.push({stream:n.stream,line:n.line}),C(n));break}case"cmd.end":{let p=w.get(n.id);p&&(p.endT=n.t,p.exit=n.exit,p.dur=n.dur,p.status!=="blocked"&&(p.status=n.exit===0?"ok":"fail")),C(n),M.push({t:n.t,kind:"exit",text:`${xe(w.get(n.id)?.cmd??"\u547D\u4EE4")} \u7ED3\u675F \xB7 exit ${n.exit}`,anchor:`cmd-${n.id}`,target:{kind:"command",id:n.id}});break}case"test.result":m={...n,t:n.t,cases:n.cases??[]},C(n),M.push({t:n.t,kind:"test",text:`\u6D4B\u8BD5 ${n.passed} \u901A\u8FC7 / ${n.failed} \u5931\u8D25`,anchor:"test-result"});break;case"note":z.push({t:n.t,text:n.text}),C(n),M.push({t:n.t,kind:"note",text:n.text,anchor:"notes"});break;case"artifact":b={...n,t:n.t},C(n),M.push({t:n.t,kind:"artifact",text:"\u4EA7\u51FA\u53EF\u9A8C\u6536\u7ED3\u679C",anchor:"artifact"});break;case"tool.start":{let p={id:n.id,name:n.name,summary:n.summary,t:n.t,endT:null,ok:null,dur:null,text:""};j.set(n.id,p),M.push({t:n.t,kind:"tool",text:`${n.name} \xB7 ${n.summary} \xB7 \u8FD0\u884C\u4E2D`,anchor:`tool-${n.id}`}),C(n);break}case"tool.end":{let p=j.get(n.id)??{id:n.id,name:n.name,summary:"",t:n.t,endT:null,ok:null,dur:null,text:""};p.endT=n.t,p.ok=n.ok,p.dur=n.dur??Math.max(0,n.t-p.t),p.text=n.text??"",j.set(n.id,p);let V=(p.text||"").split(`
`).map(H=>H.trim()).filter(Boolean)[0]??"";M.push({t:n.t,kind:"tool",text:`${n.name} \xB7 ${p.summary||""} \xB7 ${p.ok?"":"\u5931\u8D25 "}${D(p.dur)}${V?` \xB7 ${V.slice(0,60)}`:""}`.replace(" \xB7  \xB7 "," \xB7 "),anchor:`tool-${n.id}`}),C(n);break}default:break}for(let n of w.values())L.has(n.cmd)&&(n.status="blocked"),g.has(n.id)&&(n.status="killed");let B=[...d.values()].map(n=>{let p="read";n.attempts.length&&(p=n.lastKind==="edit"&&!tt(n.lastT,a,o)?"editing":"done"),n.attempts.length===0&&(p="read"),v.has(n.path)&&(p="done");let V=n.attempts[n.attempts.length-1];return{...n,status:p,sensitive:N.has(n.path),ignored:T.has(n.path),reverted:v.has(n.path),rejectedCount:n.attempts.filter(H=>$.has(`${n.path}#${H.n}`)).length,lastAttempt:V}}).sort((n,p)=>(p.lastT??0)-(n.lastT??0)),q=B.filter(n=>!n.ignored),F=q.filter(n=>!n.reverted),O={files:F.filter(n=>n.attempts.length).length,add:F.reduce((n,p)=>n+p.add,0),del:F.reduce((n,p)=>n+p.del,0),sensitive:F.filter(n=>n.sensitive).length,reads:q.reduce((n,p)=>n+p.reads,0),reverted:q.filter(n=>n.reverted).length},R=[...o].reverse().find(n=>n.status==="running")??[...o].reverse().find(n=>n.status!=="pending")??null;for(let n of o){f.has(n.id)&&n.status!=="done"&&(n.skipped=!0);let p=n.startT??1/0,V=n.endT??a,H=l.filter(_=>_.t>=p&&_.t<=V),he=H.filter(_=>_.type==="file.edit"),fe=H.filter(_=>_.type==="cmd.end"),me=[...H].reverse().find(_=>_.type==="test.result");n.facts={files:new Set(he.map(_=>_.path)).size,add:he.reduce((_,ge)=>_+ge.add,0),del:he.reduce((_,ge)=>_+ge.del,0),exit:fe.length?fe[fe.length-1].exit:null,tests:me?{passed:me.passed,failed:me.failed}:null},n.facts.calls=H.filter(_=>_.type==="tool.start").length+H.filter(_=>_.type==="cmd.start").length,n.elapsed=n.startT===null?0:Math.max(0,(n.endT??a)-n.startT),n.stale=n.status==="running"&&n.elapsed>Te,n.calls=nt(H)}let U=!!b,P=[],Se=[...l].reverse().find(n=>n.type!=="file.read")?.t??0,X=Math.max(0,a-Se),pe=0,Y=0,ue=0,J=0;for(let n of w.values())n.exit==null||n.status==="blocked"||(n.exit===0?pe=0:(pe++,Y=Math.max(Y,pe)));for(let n of l)n.type==="test.result"&&(n.failed>0?(ue++,J=Math.max(J,ue)):ue=0);if(!U){X>=Te&&P.push({kind:"silence",level:"warn",text:`\u5DF2 ${D(X)}\u6CA1\u6709\u65B0\u8FDB\u5C55`,anchor:R?`step-${R.id}`:"activity"}),Y>=Qe&&P.push({kind:"repeat-cmd",level:"warn",text:`\u540C\u4E00\u547D\u4EE4\u8FDE\u7EED\u5931\u8D25 ${Y} \u6B21\uFF1A${[...w.values()].find(n=>n.status==="fail")?.cmd??""}`,anchor:R?`step-${R.id}`:"activity"});for(let n of q)n.attempts.length>=Ze&&P.push({kind:"churn-file",level:"warn",text:`${Z(n.path)} \u5DF2\u6539 ${n.attempts.length} \u7248`,anchor:`file-${K(n.path)}`}),n.reads>=Ge&&!n.attempts.length&&P.push({kind:"churn-read",level:"warn",text:`${Z(n.path)} \u5DF2\u88AB\u91CD\u8BFB ${n.reads} \u6B21`,anchor:`file-${K(n.path)}`});J>=et&&P.push({kind:"repeat-fail",level:"warn",text:`\u540C\u4E00\u7528\u4F8B\u8FDE\u7EED\u5931\u8D25 ${J} \u6B21\uFF1A${m?.cases.find(n=>!n.ok)?.name??""}`,anchor:R?`step-${R.id}`:"activity"})}let Me=[...w.values()].find(n=>n.status==="running"&&!y),De=y?"\u5DF2\u63A5\u7BA1 \xB7 agent \u5DF2\u6682\u505C":U?"\u5DF2\u5B8C\u6210 \xB7 \u7B49\u5F85\u9A8C\u6536":Me?`\u8FD0\u884C ${Me.cmd}`:q.find(n=>n.status==="editing")?`\u7F16\u8F91 ${Z(q.find(n=>n.status==="editing").path)}`:R?`\u7B2C ${R.index}/${t.steps.length} \u6B65 \xB7 ${R.title}`:"\u7B49\u5F85\u5F00\u59CB",Be=`${O.files} \u4E2A\u6587\u4EF6 +${O.add} \u2212${O.del}${O.sensitive?` \xB7 ${O.sensitive} \u4E2A\u654F\u611F\u6587\u4EF6`:""}`,G=P[0],Ue=U?`\u5DF2\u5B8C\u6210 \xB7 ${m?m.passed:0} \u7528\u4F8B\u901A\u8FC7`:G?G.kind==="silence"?`\u505C\u6EDE ${D(X)}`:G.kind==="repeat-cmd"?`\u8FDE\u7EED\u5931\u8D25 ${Y} \u6B21`:G.kind==="repeat-fail"?`\u540C\u4E00\u7528\u4F8B\u5931\u8D25 ${J} \u6B21`:G.kind==="churn-read"?"\u53CD\u590D\u91CD\u8BFB\u540C\u4E00\u6587\u4EF6":"\u53CD\u590D\u4FEE\u6539\u540C\u4E00\u6587\u4EF6":`\u63A8\u8FDB\u6B63\u5E38 \xB7 \u8DDD\u4E0A\u6B21\u8FDB\u5C55 ${D(X)}`;return{t:a,task:t.task,steps:o,current:R,files:B,totals:O,commands:[...w.values()],tests:m,activity:M.slice(-60),notes:z,artifact:b?{...b,files:O.files,add:O.add,del:O.del}:null,signals:P,takeover:y,focus:h,skippedCases:x,proofRequested:k,interventions:s.map(n=>({...n})),now:{doing:De,scope:Be,momentum:Ue,level:P.some(n=>n.level==="warn")?"warn":"ok",silence:X},lastEventT:Se}}function je(t,e){return t.has(e)||t.set(e,{path:e,reads:0,attempts:[],add:0,del:0,lastT:0,lastKind:"read"}),t.get(e)}function tt(t,e,a){let s=a.find(r=>r.status==="running");return s?t<s.startT:!0}function Z(t){let e=t.split("/");return e.length>2?"\u2026/"+e.slice(-2).join("/"):t}function xe(t){return t.length>26?t.slice(0,24)+"\u2026":t}function K(t){return t.replace(/[^a-zA-Z0-9]+/g,"-")}function se(t){let e=t.attempts[t.attempts.length-1];return e?e.hunk:null}function Ce(t){let e=t.attempts.length;if(e<2)return null;let a=t.attempts[e-2].hunk.lines.map(i=>i.text),s=t.attempts[e-1].hunk.lines.map(i=>i.text);return{lines:ne(Q(a,s),2),changes:ae(Q(a,s)),from:e-1,to:e}}function nt(t){let e=[],a=new Map,s=r=>(e.push(r),r.id&&a.set(r.id,r),r);for(let r of t)if(r.type==="tool.start")s({id:r.id,t:r.t,name:r.name,summary:r.summary,dur:null,ok:null,text:""});else if(r.type==="tool.end"){let i=a.get(r.id);i&&(i.dur=r.dur??Math.max(0,r.t-i.t),i.ok=r.ok,i.text=r.text??"")}else if(r.type==="cmd.start")s({id:r.id,t:r.t,name:"bash",summary:r.cmd,dur:null,ok:null,text:""});else if(r.type==="cmd.end"){let i=a.get(r.id);i&&(i.dur=r.dur??Math.max(0,r.t-i.t),i.ok=r.exit===0,i.text=`exit ${r.exit}`)}else r.type==="file.edit"?s({id:`${r.path}#${r.attempt??0}`,t:r.t,name:"edit",summary:r.path,dur:null,ok:!0,text:`+${r.add} \u2212${r.del}`}):r.type==="file.read"&&s({id:`read-${r.path}-${r.t}`,t:r.t,name:"read",summary:r.path,dur:null,ok:!0,text:""});return e.sort((r,i)=>r.t-i.t)}var at=0,Ie=t=>`${t}-${++at}`,ie=class{constructor(){this.scenario=be,this.events=be.events,this.duration=Math.max(...this.events.map(e=>e.t))+6,this.listeners=new Set,this.ui={t:300,playing:!1,speed:20,view:"now",detail:null,openStep:null,interventions:[],takeover:!1,toast:null,highlight:null,sheet:null,drawer:null,acceptance:{status:"pending",reason:"",excluded:new Set,at:null},scroll:new Map},this.ui.openStepManual=!1,this.lastFrame=null,this.raf=null,this.live=!1,this.following=!0,this.overview=null,this.currentSessionId=null,this.approvals=[],this.watching=[]}setLive(e){if(e){if(e.overview&&(this.overview=e.overview),typeof e.currentId=="string"&&(this.currentSessionId=e.currentId),!e.scenario){this.emit();return}this.live=!0,this.scenario=e.scenario,this.events=e.events,this.duration=Math.max(1,e.scenario.duration??0),this.following&&(this.ui.t=this.duration),this.emit()}}subscribe(e){return this.listeners.add(e),()=>this.listeners.delete(e)}emit(){let e=this.derive();this.ui.openStepManual||(this.ui.openStep=(e.current??e.steps[0])?.id??null);for(let a of this.listeners)a(e,this.ui)}derive(){return ze(this.scenario,this.events,this.ui.t,this.ui.interventions,{takeover:this.ui.takeover})}stop(){this.raf!==null&&cancelAnimationFrame(this.raf),this.raf=null}start(){let e=a=>{this.lastFrame==null&&(this.lastFrame=a);let s=Math.min(.25,(a-this.lastFrame)/1e3);this.lastFrame=a,this.ui.playing&&!this.ui.sheet&&this.advance(s*this.ui.speed),this.emit(),this.raf=requestAnimationFrame(e)};this.raf=requestAnimationFrame(e)}advance(e){let a=Math.min(this.duration,this.ui.t+e);a>=this.duration&&(this.ui.playing=!1),this.ui.t=a}seek(e){this.ui.t=Math.max(0,Math.min(this.duration,e)),this.ui.openStepManual=!1,this.live?this.following=this.ui.t>=this.duration-.5:this.ui.t<this.duration&&(this.ui.playing=!1)}togglePlay(){if(this.live){this.following=!0,this.ui.t=this.duration,this.ui.playing=!1;return}this.ui.t>=this.duration&&(this.ui.t=0),this.ui.playing=!this.ui.playing}go(e,a=null){this.ui.view=e,this.ui.detail=null,this.ui.sheet=null,a&&this.highlight(a)}openDetail(e,a){this.ui.detail={kind:e,id:a},this.ui.sheet=null,this.ui.drawer=null}back(){this.ui.detail=null}toggleStep(e){this.ui.openStepManual=!0,this.ui.openStep=this.ui.openStep===e?null:e}highlight(e){this.ui.highlight=e,clearTimeout(this._hl),this._hl=setTimeout(()=>{this.ui.highlight=null,this.emit()},2200)}openSheet(e){this.ui.sheet=e}closeSheet(){this.ui.sheet=null}openDrawer(e="term"){this.ui.drawer=e}closeDrawer(){this.ui.drawer=null}setDrawerTab(e){this.ui.drawer=e}toast(e,a="info"){this.ui.toast={text:e,kind:a,id:Ie("toast")};let s=this.ui.toast.id;clearTimeout(this._toast),this._toast=setTimeout(()=>{this.ui.toast?.id===s&&(this.ui.toast=null,this.emit())},2400)}intervene({tier:e,kind:a,target:s,sub:r="",label:i}){let l={id:Ie("iv"),tier:e,kind:a,target:s,sub:r,label:i,at:this.ui.t,undone:!1};if(this.ui.interventions.push(l),a==="takeover"&&(this.ui.takeover=!0,this.ui.playing=!1),a==="rerun-step"){let o=this.derive().steps.find(c=>c.id===s);o?.startT!=null&&(this.ui.openStep=o.id,this.seek(o.startT),this.ui.playing=!0)}this.ui.sheet=null,this.toast(`${st[e]}\uFF1A${i}`,e)}releaseTakeover(){this.ui.takeover=!1,this.ui.playing=!0,this.toast("\u5DF2\u91CA\u653E\u63A7\u5236\u6743\uFF0Cagent \u7EE7\u7EED","constrain")}toggleExclude(e){let a=this.ui.acceptance.excluded;a.has(e)?a.delete(e):a.add(e)}acceptedFiles(e){let a=this.ui.acceptance.excluded;return e.files.filter(s=>s.attempts.length&&!s.reverted&&!s.ignored&&!a.has(s.path))}accept(e){let a=this.acceptedFiles(e);this.ui.acceptance={status:"accepted",reason:"",excluded:this.ui.acceptance.excluded,at:this.ui.t},this.toast(`\u5DF2\u63A5\u53D7 ${a.length} \u4E2A\u6587\u4EF6`,"ok")}reject(e){this.ui.acceptance={status:"rejected",reason:e,excluded:this.ui.acceptance.excluded,at:this.ui.t},this.toast("\u5DF2\u6253\u56DE\uFF0C\u7406\u7531\u5DF2\u9644\u7ED9 agent","takeover")}resetAcceptance(){this.ui.acceptance={status:"pending",reason:"",excluded:new Set,at:null}}scrollKey(){let e=this.ui.detail;return[this.ui.view,e?`${e.kind}:${e.id}`:""].join("/")}},st={mark:"\u5DF2\u6807\u8BB0",constrain:"\u5DF2\u7EA6\u675F",takeover:"\u5DF2\u63A5\u7BA1"};var u=t=>String(t).replace(/[&<>"']/g,e=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[e]),oe=t=>String(t).split("/").pop(),re=t=>String(t).split("/").slice(0,-1).join("/")||".",S=t=>it[t]??"",I=t=>`<svg viewBox="0 0 24 24" aria-hidden="true">${t}</svg>`,it={wave:I('<path d="M2.6 12h3.1l1.7-4.1 2.9 8.2 1.9-4.8 1.3 2.7h8"/>'),gauge:I('<path d="M4.7 17.8a8.5 8.5 0 1 1 14.6 0"/><path d="M12 17.8l3.7-5.4"/><circle cx="12" cy="17.8" r="1.15" fill="currentColor" stroke="none"/>'),doc:I('<path d="M7 3.5h6.6L18 8v12.5H7z"/><path d="M13.4 3.6V8H18"/><path d="M9.4 12.4h5.4M9.4 15.8h3.8"/>'),check:I('<circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.6 2.6 5.4-5.6"/>'),play:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.4v13.2L19 12z" fill="currentColor"/></svg>',pause:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="5" width="3.6" height="14" rx="1.2" fill="currentColor"/><rect x="13.4" y="5" width="3.6" height="14" rx="1.2" fill="currentColor"/></svg>',hand:I('<path d="M9 11.2V5.6a1.5 1.5 0 0 1 3 0v5.6m0-1V4.7a1.5 1.5 0 0 1 3 0v6.9m0-2.1V6.7a1.5 1.5 0 0 1 3 0v6.8a5.6 5.6 0 0 1-5.6 5.6h-.8a5.2 5.2 0 0 1-4.1-2l-1.9-2.5a1.5 1.5 0 0 1 2.3-1.9L9 14"/>'),more:I('<circle cx="5.4" cy="12" r="1.75" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.75" fill="currentColor" stroke="none"/><circle cx="18.6" cy="12" r="1.75" fill="currentColor" stroke="none"/>'),chevron:I('<path d="M9.5 4.5L17 12l-7.5 7.5"/>'),back:I('<path d="M14.5 4.5L7 12l7.5 7.5"/>'),warn:I('<path d="M12 3.6l9.2 16.4H2.8z"/><path d="M12 9.6v4.2M12 17.2v.2"/>'),terminal:I('<rect x="3" y="4.8" width="18" height="14.4" rx="2.6"/><path d="M7 10.2l3 2-3 2M13 14.4h4"/>'),image:I('<rect x="3.5" y="5" width="17" height="14" rx="2.6"/><circle cx="9" cy="10" r="1.6"/><path d="M4.5 16.6l4.4-4 3.4 2.8 3-2.4 4.2 3.6"/>'),undo:I('<path d="M4 9.5h9.4a5.2 5.2 0 1 1 0 10.4H9.2"/><path d="M7.8 5.3L4 9.5l3.8 4.2"/>'),eyeOff:I('<path d="M3.5 12s3.2-5.4 8.5-5.4S20.5 12 20.5 12s-3.2 5.4-8.5 5.4S3.5 12 3.5 12z"/><path d="M4.5 4.5l15 15"/>'),flag:I('<path d="M6 21V4h11.2l-2.6 4 2.6 4H6"/>'),stop:I('<circle cx="12" cy="12" r="8.6"/><rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" stroke="none"/>'),no:I('<circle cx="12" cy="12" r="8.6"/><path d="M6.4 6.4l11.2 11.2"/>'),skip:I('<path d="M6 5.4l7.4 6.6L6 18.6z"/><path d="M17 5v14"/>'),rerun:I('<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4.5V10h-5.4"/>'),bookmark:I('<path d="M7 3.5h10v17l-5-3.6-5 3.6z"/>'),list:I('<path d="M4.5 7h15M4.5 12h15M4.5 17h10"/>')},ke={file:()=>[{tier:"mark",kind:"mark-file",label:"\u7A0D\u540E\u56DE\u770B",hint:"\u53EA\u8BB0\u5F55\uFF0C\u4E0D\u6539\u53D8\u6267\u884C",icon:"bookmark"},{tier:"constrain",kind:"revert-file",label:"\u56DE\u6EDA\u6B64\u6587\u4EF6",hint:"\u64A4\u9500\u6539\u52A8\uFF0C\u6062\u590D\u539F\u6837",icon:"undo"},{tier:"constrain",kind:"ignore-file",label:"\u5FFD\u7565\u6B64\u6587\u4EF6",hint:"\u540E\u7EED\u4E0D\u518D\u6539\u5B83",icon:"eyeOff"},{tier:"constrain",kind:"sensitive-file",label:"\u6807\u8BB0\u4E3A\u654F\u611F",hint:"\u6539\u52A8\u5C06\u8FDB\u5165\u9A8C\u6536\u5FC5\u770B",icon:"flag"},{tier:"takeover",kind:"takeover",label:"\u63A5\u7BA1",hint:"\u505C\u6389 agent\uFF0C\u6211\u6765\u5904\u7406",icon:"hand"}],command:t=>[{tier:"mark",kind:"mark-cmd",label:"\u8BB0\u5F55\u8FD9\u6761\u547D\u4EE4",hint:"\u5199\u8FDB\u672C\u6B21\u4F1A\u8BDD",icon:"bookmark"},...t.status==="running"?[{tier:"constrain",kind:"kill-cmd",label:"\u7EC8\u6B62\u672C\u6B21",hint:"\u5411 worker \u53D1 SIGINT",icon:"stop"}]:[],{tier:"constrain",kind:"block-cmd",label:"\u7981\u6B62\u518D\u8DD1",hint:`\u540E\u7EED\u62D2\u7EDD\u6267\u884C\u300C${t.cmd}\u300D`,icon:"no"},{tier:"takeover",kind:"takeover",label:"\u63A5\u7BA1",hint:"\u505C\u6389 agent\uFF0C\u6211\u6765\u5904\u7406",icon:"hand"}],step:()=>[{tier:"mark",kind:"mark-step",label:"\u6807\u8BB0\u6B64\u6B65",hint:"\u53EA\u8BB0\u5F55",icon:"bookmark"},{tier:"constrain",kind:"skip-step",label:"\u8DF3\u8FC7\u6B64\u6B65",hint:"\u540E\u7EED\u4E0D\u518D\u6267\u884C\u5B83",icon:"skip"},{tier:"constrain",kind:"rerun-step",label:"\u91CD\u8DD1\u6B64\u6B65",hint:"\u8BA9 agent \u91CD\u6765\u4E00\u6B21",icon:"rerun"},{tier:"takeover",kind:"takeover",label:"\u63A5\u7BA1",hint:"\u505C\u6389 agent\uFF0C\u6211\u6765\u5904\u7406",icon:"hand"}]},rt={mark:"\u6807\u8BB0",constrain:"\u7EA6\u675F",takeover:"\u63A5\u7BA1"},A={diffMode:"current",previewSide:"after",sig:"",key:"",flatSig:"",toastId:"",suppressClick:!1};function Ee(t,e,a={}){t.classList.add("pc");let s=()=>{t.classList.toggle("pc-dark",document.body?.hasAttribute("data-ds-dark-theme")===!0)};s();let r=typeof MutationObserver>"u"?null:new MutationObserver(s);r?.observe(document.body,{attributes:!0,attributeFilter:["data-ds-dark-theme"]}),t.innerHTML=`
    <div class="app">
      <header class="navbar" id="navbar"></header>
      <main class="screen" id="screen"></main>
      <div class="action-bar" id="actionBar"></div>
      <nav class="tabbar" id="tabbar"></nav>
      <div class="flat-layer" id="flatLayer"></div>
      <div class="toast-layer" id="toastLayer"></div>
    </div>`;let i={nav:t.querySelector("#navbar"),screen:t.querySelector("#screen"),tabbar:t.querySelector("#tabbar"),bar:t.querySelector("#actionBar"),flat:t.querySelector("#flatLayer"),toast:t.querySelector("#toastLayer"),app:t.querySelector(".app")},l=()=>{let m=matchMedia("(prefers-color-scheme: dark)").matches,b=document.querySelector('meta[name="theme-color"]');b||(b=document.createElement("meta"),b.name="theme-color",document.head.appendChild(b)),b.content=m?"#000000":"#f2f2f7"};l(),matchMedia("(prefers-color-scheme: dark)").addEventListener("change",l),i.screen.addEventListener("scroll",()=>{i.app.dataset.scrolled=i.screen.scrollTop>34?"1":"0"},{passive:!0});let o=null,c=null,d=0,w=0;i.screen.addEventListener("pointerdown",m=>{let b=m.target.closest("[data-long]");b&&(d=m.clientX,w=m.clientY,clearTimeout(o),o=setTimeout(()=>{c=b,A.suppressClick=!0,M(b.dataset.long,b.dataset.id)},430))});let j=()=>{clearTimeout(o),o=null};i.screen.addEventListener("pointermove",m=>{o&&Math.hypot(m.clientX-d,m.clientY-w)>8&&j()}),i.screen.addEventListener("pointerup",j),i.screen.addEventListener("pointercancel",j),i.screen.addEventListener("contextmenu",m=>{m.target.closest("[data-long]")&&m.preventDefault()}),t.addEventListener("click",m=>{if(A.suppressClick&&(A.suppressClick=!1,c&&c.contains(m.target))){m.stopPropagation();return}let b=m.target.closest("[data-act]");if(!b)return;let{act:E,id:T,kind:L,target:N,tier:v,label:g,view:$,mode:f,anchor:x}=b.dataset;switch(E){case"takeover":e.ui.takeover?e.releaseTakeover():(e.intervene({tier:"takeover",kind:"takeover",target:"agent",label:"\u505C\u6389 agent\uFF0C\u6211\u6765\u5904\u7406"}),a.onTakeover?.()),e.emit();break;case"nav":e.go($),e.emit();break;case"approve":case"reject":{let h=E==="approve"?"allowed-once":"rejected";Promise.resolve(a.onApprove?.(T,h)).then(k=>e.toast(k?.ok===!0?E==="approve"?"\u5DF2\u6279\u51C6":"\u5DF2\u62D2\u7EDD":"\u6CA1\u9001\u8FBE\uFF1A\u5BBF\u4E3B\u8FD8\u6CA1\u91CD\u542F",k?.ok===!0?"ok":"mark")).catch(()=>e.toast("\u6CA1\u9001\u8FBE\uFF1A\u5BBF\u4E3B\u8FD8\u6CA1\u91CD\u542F","mark")).finally(()=>e.emit());break}case"watch":{let h=!(e.watching??[]).includes(e.currentSessionId);Promise.resolve(a.onWatch?.(e.currentSessionId,h)).then(()=>{e.watching=h?[...e.watching??[],e.currentSessionId]:(e.watching??[]).filter(k=>k!==e.currentSessionId),e.emit()}).catch(()=>{});break}case"say":{let h=b.dataset.text??"",k=a.onSend?.(h)===!0;e.toast(k?`\u5DF2\u53D1\u9001\uFF1A${h}`:"\u53D1\u4E0D\u51FA\u53BB\uFF1A\u4F1A\u8BDD\u6CA1\u63A5\u4E0A",k?"ok":"mark"),e.emit();break}case"session":{typeof a.onSelectSession=="function"&&a.onSelectSession(T),e.ui.view="now",e.emit();break}case"open":e.openDetail(L,T),e.emit();break;case"back":e.back(),e.emit();break;case"step":{e.toggleStep(T);let h=e.derive().steps.find(k=>k.id===T);h&&Promise.resolve(a.onSeen?.({sessionId:e.currentSessionId,stepId:h.id,index:h.index,title:h.title})).catch(()=>{}),e.emit();break}case"mark":{let h=e.derive().current,k=h?`\u7B2C ${h.index} \u6B65\uFF1A${h.title}`:"\u56DE\u53BB\u770B\u770B\u8FD9\u4E2A\u4F1A\u8BDD";Promise.resolve(a.onMark?.(e.currentSessionId,k)).then(y=>e.toast(y?.ok===!0?"\u5DF2\u6807\u8BB0\uFF0C\u684C\u9762\u80FD\u770B\u5230":"\u6807\u8BB0\u6CA1\u4FDD\u5B58\uFF1A\u5BBF\u4E3B\u8FD8\u6CA1\u91CD\u542F",y?.ok===!0?"ok":"mark")).catch(()=>e.toast("\u6807\u8BB0\u6CA1\u4FDD\u5B58\uFF1A\u5BBF\u4E3B\u8FD8\u6CA1\u91CD\u542F","mark")).finally(()=>e.emit());break}case"notify":{try{Notification.requestPermission().then(h=>{e.toast(h==="granted"?"\u901A\u77E5\u5DF2\u5F00":"\u6D4F\u89C8\u5668\u6CA1\u7ED9\u901A\u77E5\u6743\u9650",h==="granted"?"ok":"mark"),e.emit()})}catch{e.toast("\u8FD9\u4E2A\u73AF\u5883\u4E0D\u652F\u6301\u901A\u77E5","mark"),e.emit()}break}case"focus":e.ui.detail=null,e.ui.view=x?.startsWith("file-")?"changes":"now",x?.startsWith("step-")&&(e.ui.openStep=x.slice(5),e.ui.openStepManual=!0),e.highlight(x),e.emit();break;case"sheet":M(b.dataset.long,b.dataset.id);break;case"sheet-close":e.closeSheet(),e.emit();break;case"iv":e.intervene({tier:v,kind:L,target:N,label:g}),L==="takeover"&&(e.ui.detail=null),e.emit();break;case"play":e.togglePlay(),e.emit();break;case"detail-tab":A.diffMode=f,e.emit();break;case"preview-side":A.previewSide=f,e.emit();break;case"exclude":e.toggleExclude(T),e.emit();break;case"accept":e.accept(e.derive()),e.emit();break;case"reset-accept":e.resetAcceptance(),e.emit();break;case"open-reject":e.openSheet({type:"reject"}),e.emit();break;case"reject-send":e.reject(e.ui.acceptance.reason.trim()),e.closeSheet(),e.emit();break;case"quick-reason":e.ui.acceptance.reason=b.dataset.reason;{let h=i.flat.querySelector("#rejectReason");h&&(h.value=b.dataset.reason)}break;case"preview-click":e.toast(A.previewSide==="after"?"\u5DF2\u8FDB\u5165\u9996\u9875 \xB7 \u4F1A\u8BDD\u4FDD\u6301":"\u88AB\u91CD\u5B9A\u5411\u5230\u767B\u5F55\u9875",A.previewSide==="after"?"ok":"takeover"),e.emit();break;case"drawer":e.openDrawer(b.dataset.tab??"term"),e.emit();break;case"drawer-tab":e.setDrawerTab(b.dataset.tab),e.emit();break;case"drawer-close":e.closeDrawer(),e.emit();break;case"back-chat":{if(typeof a.onExit=="function"){a.onExit();break}let h=new URLSearchParams(location.search).get("chat");if(h){location.href=h;break}e.toast("\u771F\u5B9E\u90E8\u7F72\u91CC\uFF0C\u8FD9\u91CC\u56DE\u5230\u539F\u6765\u7684\u5BF9\u8BDD","mark"),e.emit();break}default:break}}),t.addEventListener("input",m=>{m.target.id==="scrub"&&e.seek(Number(m.target.value)),m.target.id==="rejectReason"&&(e.ui.acceptance.reason=m.target.value)});function M(m,b){let E=e.derive(),T="",L="",N=[],v=b;if(m==="file"){let g=E.files.find($=>$.path===b);if(!g)return;T=oe(g.path),L=`${re(g.path)} \xB7 ${g.attempts.length} \u7248 \xB7 +${g.add} \u2212${g.del}`,N=ke.file(g)}else if(m==="command"){let g=E.commands.find($=>$.id===b);if(!g)return;T=xe(g.cmd),L=g.status==="running"?"\u8FD0\u884C\u4E2D":`exit ${g.exit} \xB7 ${D(g.dur??0)}`,N=ke.command(g).map($=>({...$,target:$.kind==="kill-cmd"?g.id:g.cmd})),v=g.cmd}else if(m==="step"){let g=E.steps.find($=>$.id===b);if(!g)return;T=`\u7B2C ${g.index} \u6B65 \xB7 ${g.title}`,L=g.status==="done"?"\u5DF2\u5B8C\u6210":g.status==="failed"?"\u672A\u8FBE\u9884\u671F":"\u8FDB\u884C\u4E2D",N=ke.step(g)}else return;e.openSheet({type:m,id:b,title:T,sub:L,actions:N.map(g=>({...g,target:g.target??v}))}),e.emit()}let z=e.subscribe(m=>{ot(i.nav,m,e),ct(i.tabbar,m,e),xt(i.bar,i.app,m,e);let b=[e.ui.view,e.ui.detail?.kind,e.ui.detail?.id,e.ui.openStep,m.activity.length,m.commands.length,m.files.length,m.takeover,e.ui.acceptance.status,e.ui.interventions.length,A.diffMode,A.previewSide,e.ui.highlight,e.ui.acceptance.excluded.size,m.files.map(T=>`${T.path}${T.ignored}${T.reverted}${T.sensitive}`).join(",")].join("|");if(b!==A.sig){A.sig=b;let T=e.scrollKey();A.key&&e.ui.scroll.set(A.key,i.screen.scrollTop);try{i.screen.innerHTML=lt(m,e)}catch(L){console.error(L),i.screen.innerHTML=`<div class="empty">\u6E32\u67D3\u5931\u8D25\uFF1A${u(L.message)}</div>`}if(i.screen.scrollTop=e.ui.scroll.get(T)??0,i.app.dataset.scrolled=i.screen.scrollTop>34?"1":"0",A.key=T,e.ui.highlight){let L=i.screen.querySelector("#"+CSS.escape(e.ui.highlight));L&&(L.classList.add("hl"),requestAnimationFrame(()=>L.scrollIntoView({block:"center",behavior:"smooth"})))}}St(i.flat,m,e);let E=(e.ui.toast?.id??"")+(e.ui.sheet||e.ui.drawer?":modal":"");E!==A.toastId&&(A.toastId=E,i.toast.innerHTML=e.ui.toast&&!e.ui.sheet&&!e.ui.drawer?`<div class="toast ${e.ui.toast.kind}">${u(e.ui.toast.text)}</div>`:"")});return e.start(),()=>{r?.disconnect(),z(),e.stop(),t.innerHTML="",t.classList.remove("pc")}}function ot(t,e,a){let{detail:s,takeover:r,view:i}=a.ui,l={sessions:"\u4F1A\u8BDD",now:"\u73B0\u5728",changes:"\u53D8\u66F4",accept:"\u9A8C\u6536"}[i]??"\u76D1\u770B",o=s?s.kind==="preview"?"\u9A8C\u6536":"\u53D8\u66F4":"\u5BF9\u8BDD",c=s?s.kind==="preview"?"\u7ED3\u679C\u9884\u89C8":oe(s.id):l,d=[o,c,r,!!s].join("|");t._sig!==d&&(t._sig=d,t.innerHTML=`
    <button class="nav-back" data-act="${s?"back":"back-chat"}">
      ${S("back")}<span>${u(o)}</span>
    </button>
    <div class="nav-title" ${s?'data-always="1"':""}>${u(c)}</div>
    ${s?s.kind==="preview"?'<span class="nav-action" aria-hidden="true"></span>':`<button class="nav-action" data-act="sheet" data-long="${s.kind}" data-id="${u(s.id)}" aria-label="\u66F4\u591A">${S("more")}</button>`:`<button class="nav-action ${r?"destructive":""}" data-act="takeover">${r?"\u91CA\u653E":"\u63A5\u7BA1"}</button>`}
  `)}function ct(t,e,a){let s=a.live?[["sessions","\u4F1A\u8BDD","list"],["now","\u73B0\u5728","gauge"],["changes","\u53D8\u66F4","doc"]]:[["now","\u73B0\u5728","gauge"],["changes","\u53D8\u66F4","doc"],["accept","\u9A8C\u6536","check"]],r=a.ui.view+"|"+s.map(i=>i[0]).join(",")+"|"+a.ui.acceptance.status;t._sig!==r&&(t._sig=r,t.style.gridTemplateColumns=`repeat(${s.length}, 1fr)`,t.innerHTML=s.map(([i,l,o])=>`
    <button class="tab ${a.ui.view===i?"active":""}" data-act="nav" data-view="${i}">
      ${S(o)}<span>${l}</span>
      ${i==="accept"&&e.artifact&&a.ui.acceptance.status==="pending"?'<i class="tab-dot"></i>':""}
    </button>`).join(""))}function lt(t,e){let{ui:a}=e;if(a.detail){if(a.detail.kind==="preview")return $t();if(a.detail.kind==="file")return kt(t,a.detail.id,e)}return a.view==="sessions"?pt(t,e):a.view==="now"?e.live&&t.steps.length===0?ht(t,e):ut(t,e):a.view==="changes"?vt(t,e):bt(t,e)}var Ae={pending:["warn","orange"],done:["check","green"],stale:["warn","red"],running:["wave","blue"],idle:["doc","gray"]};function te(t){return t==null?"":t<6e4?"\u521A\u521A":t<36e5?`${Math.round(t/6e4)} \u5206\u949F\u524D`:t<864e5?`${Math.round(t/36e5)} \u5C0F\u65F6\u524D`:`${Math.round(t/864e5)} \u5929\u524D`}function dt(t){return t.level==="pending"?`\u7B49\u4F60\u5904\u7406 \xB7 ${t.pending??"\u5F85\u786E\u8BA4"}`:t.level==="stale"?`\u53EF\u80FD\u5361\u4F4F \xB7 ${te(t.ageMs)}\u6CA1\u6709\u65B0\u52A8\u4F5C`:t.level==="done"?`\u5DF2\u5B8C\u6210 \xB7 \u672A\u67E5\u770B\uFF08${te(t.ageMs)}\uFF09`:t.level==="running"?`\u8FD0\u884C\u4E2D \xB7 ${te(t.ageMs)}\u6709\u52A8\u4F5C`:`\u7A7A\u95F2 \xB7 ${te(t.ageMs)}`}function pt(t,e){let a=e.overview;if(a==null)return'<div class="page"><h1>\u4F1A\u8BDD</h1><p>\u6B63\u5728\u8BFB\u53D6\u4F1A\u8BDD\u5217\u8868\u2026</p></div>';let{counts:s,inbox:r,sessions:i}=a,l=c=>{let[d,w]=Ae[c.level]??Ae.idle;return`<button class="row" data-act="session" data-id="${u(c.id)}">
      <span class="row-icon ${w}">${S(d)}</span>
      <div class="row-main">
        <span class="row-title">${u(c.title)}${c.current?" \xB7 \u5F53\u524D":""}</span>
        <span class="row-sub">${u(dt(c))}</span>
      </div>
      <span class="chevron">${S("chevron")}</span>
    </button>`},o=i.filter(c=>c.level==="running"||c.level==="idle");return`
    <div class="page">
      <h1>\u4F1A\u8BDD</h1>
      <p>${s.pending>0?`${s.pending} \u4E2A\u7B49\u4F60\u5904\u7406`:s.running>0?`${s.running} \u4E2A\u5728\u8DD1`:"\u90FD\u5728\u95F2\u7740"} \xB7 \u5171 ${s.total} \u4E2A</p>
    </div>
    ${r.length===0?"":`<div class="section-title">\u5F85\u5904\u7406</div><div class="group">${r.slice(0,20).map(l).join("")}</div>`}
    <div class="section-title">\u5168\u90E8\u4F1A\u8BDD</div>
    <div class="group">${o.slice(0,30).map(l).join("")||'<div class="empty">\u6CA1\u6709\u5176\u5B83\u4F1A\u8BDD</div>'}</div>
  `}function _e(t){let e=t.approvals??[],a=(t.watching??[]).includes(t.currentSessionId),s=["\u7EE7\u7EED","\u5148\u505C\u4E0B","\u53EA\u770B\u4E0D\u6539","\u6362\u4E2A\u65B9\u6848"];return`${e.length===0?"":`<div class="section-title">\u7B49\u4F60\u6279\u51C6\uFF08${e.length}\uFF09</div>
    <div class="group">${e.map(i=>`
      <div class="row static">
        <span class="row-icon orange">${S("warn")}</span>
        <div class="row-main">
          <span class="row-title">${u(i.toolName)}${i.reason?` \xB7 ${u(i.reason)}`:""}</span>
          <span class="row-sub">${u(String(i.sessionId).replace(/^session-/,"").slice(0,8))} \xB7 ${u(te(i.ageMs))}</span>
        </div>
      </div>
      <div class="row static" style="gap:14px">
        <button class="link-btn" data-act="approve" data-id="${u(i.id)}">\u6279\u51C6\u8FD9\u6B21</button>
        <button class="link-btn" data-act="reject" data-id="${u(i.id)}" style="color:var(--red)">\u62D2\u7EDD</button>
      </div>`).join("")}</div>`}
    <div class="group">
      <div class="row static">
        <span class="row-icon ${a?"green":"gray"}">${S("hand")}</span>
        <div class="row-main">
          <span class="row-title">\u624B\u673A\u6279\u51C6\uFF1A${a?"\u5F00":"\u5173"}</span>
          <span class="row-sub">${a?"\u8FD9\u4E2A\u4F1A\u8BDD\u7684\u5BA1\u6279\u4F1A\u505C\u4E0B\u6765\u7B49\u4F60\u5728\u624B\u673A\u4E0A\u70B9":"\u9ED8\u8BA4\u5173\uFF1A\u5BA1\u6279\u7167\u65E7\u5728\u684C\u9762\u5F39"}</span>
        </div>
        <button class="link-btn" data-act="watch">${a?"\u5173\u95ED":"\u6253\u5F00"}</button>
      </div>
    </div>
    <div class="chips">${s.map(i=>`<button class="chip" data-act="say" data-text="${u(i)}">${u(i)}</button>`).join("")}</div>
    <div class="group">
      <div class="row static">
        <span class="row-icon blue">${S("bookmark")}</span>
        <div class="row-main">
          <span class="row-title">\u65AD\u70B9\u63A5\u529B</span>
          <span class="row-sub">\u6807\u8BB0\u540E\uFF0C\u684C\u9762\u300C\u8BBE\u7F6E \u2192 \u8FDC\u7A0B\u8BBF\u95EE\u300D\u80FD\u770B\u5230\u4F60\u6807\u7684\u4F4D\u7F6E</span>
        </div>
        <button class="link-btn" data-act="mark">\u6807\u8BB0\u5F85\u5904\u7406</button>
      </div>
      <div class="row static">
        <span class="row-icon gray">${S("warn")}</span>
        <div class="row-main">
          <span class="row-title">\u5B8C\u6210/\u5F85\u6279\u901A\u77E5</span>
          <span class="row-sub">\u9875\u9762\u5728\u540E\u53F0\u65F6\u5F39\u7CFB\u7EDF\u901A\u77E5\uFF08PWA / \u5B89\u5353\u58F3\u540C\u4E00\u6761\u8DEF\uFF09</span>
        </div>
        <button class="link-btn" data-act="notify">\u5F00\u542F\u901A\u77E5</button>
      </div>
    </div>`}function ut(t,e){let{ui:a}=e,s=t.current,r=t.now.level==="warn",i=[t.task.branch,t.task.workdir.replace(/^.*\//,"")].filter(Boolean).join(" \xB7 "),l=a.takeover?"\u5DF2\u63A5\u7BA1 \xB7 agent \u5DF2\u6682\u505C":i||"\u7B49\u5F85\u4F1A\u8BDD",o=_e(e);return`
    <div class="page">
      <h1>\u73B0\u5728</h1>
      <p>${u(l)}</p>
    </div>
${o}

    <div class="group status">
      <div class="row static">
        <span class="row-icon blue">${S("wave")}</span>
        <div class="row-main">
          <span class="row-title">${u(t.now.doing)}</span>
          <span class="row-sub">\u5728\u505A\u4EC0\u4E48</span>
        </div>
      </div>
      <button class="row" data-act="nav" data-view="changes">
        <span class="row-icon gray">${S("doc")}</span>
        <div class="row-main">
          <span class="row-title">${u(t.now.scope)}</span>
          <span class="row-sub">\u6539\u52A8\u8303\u56F4</span>
        </div>
        <span class="chevron">${S("chevron")}</span>
      </button>
      <button class="row" data-act="focus" data-anchor="${u(s?`step-${s.id}`:"")}">
        <span class="row-icon ${r?"orange":"gray"}">${S(r?"warn":"check")}</span>
        <div class="row-main">
          <span class="row-title" ${r?'style="color: var(--orange)"':""}>${u(t.now.momentum)}</span>
          <span class="row-sub">\u8282\u594F</span>
        </div>
        <span class="chevron">${S("chevron")}</span>
      </button>
      <div class="row replay">
        <button class="play" data-act="play" aria-label="\u64AD\u653E\u6216\u6682\u505C">${a.playing?S("pause"):S("play")}</button>
        <input id="scrub" type="range" min="0" max="${e.duration}" step="1" value="${Math.round(a.t)}" aria-label="\u56DE\u653E" />
        <span class="time">${ee(a.t)}</span>
      </div>
    </div>

    <p class="section-title">\u6B65\u9AA4</p>
    <div class="group steps">
      ${t.steps.map(c=>mt(c,t,e)).join("")}
    </div>

    <div class="group">
      <button class="row" data-act="drawer" data-tab="term">
        <span class="row-icon gray">${S("terminal")}</span>
        <div class="row-main">
          <span class="row-title">\u539F\u59CB\u8F93\u51FA</span>
          <span class="row-sub">\u7EC8\u7AEF \xB7 git status \xB7 \u6700\u8FD1 patch</span>
        </div>
        <span class="chevron">${S("chevron")}</span>
      </button>
    </div>
`}function ht(t,e){let a=[t.task.branch,t.task.workdir.replace(/^.*\//,"")].filter(Boolean).join(" \xB7 ");return`
    <div class="page">
      <h1>\u73B0\u5728</h1>
      <p>${u(a||"\u7B49\u5F85\u4F1A\u8BDD")}</p>
    </div>
    ${_e(e)}
    <div class="group">
      <div class="row static">
        <span class="row-icon gray">${S("wave")}</span>
        <div class="row-main">
          <span class="row-title">\u8FD8\u6CA1\u6709\u53EF\u770B\u7684\u6267\u884C</span>
          <span class="row-sub">\u53D1\u4E00\u6761\u6D88\u606F\uFF0C\u6B65\u9AA4\u3001\u6539\u52A8\u548C\u547D\u4EE4\u4F1A\u5B9E\u65F6\u51FA\u73B0\u5728\u8FD9\u91CC</span>
        </div>
      </div>
    </div>`}function ft(t){let e=t.slice(-8),a=i=>String(i??"").replace(/\s+/g," ").trim(),s=i=>{let l=`${i.name} \xB7 ${a(i.summary).slice(0,56)}`,o=i.dur==null?"\u8FD0\u884C\u4E2D":`${D(i.dur)}${i.ok===!1?" \xB7 \u5931\u8D25":""}`;return`<div class="step-act"><span class="step-act-t">${ee(i.t)}</span><span class="step-act-x">${u(l)} \xB7 ${u(o)}</span></div>`},r=t.length>e.length?`<div class="step-more">\u8FD8\u6709 ${t.length-e.length} \u6761\u66F4\u65E9\u7684\u8C03\u7528</div>`:"";return`<div class="step-expect">\u8C03\u7528\u94FE\uFF08${t.length}\uFF09</div>${r}${e.map(s).join("")}`}function mt(t,e,a){let s=a.ui.openStep===t.id,r=t.facts??{},i=e.activity.filter(d=>d.t>=(t.startT??1/0)&&d.t<=(t.endT??1/0)&&d.kind!=="step"),l=[gt(t)];t.stale&&l.push(`\u5361\u4F4F ${D(t.elapsed)}`),r.calls&&l.push(`${r.calls} \u6B21\u8C03\u7528`),r.files&&l.push(`${r.files} \u4E2A\u6587\u4EF6 +${r.add} \u2212${r.del}`),r.exit!=null&&l.push(`exit ${r.exit}`),r.tests&&l.push(`${r.tests.passed} \u901A\u8FC7 / ${r.tests.failed} \u5931\u8D25`);let o=Math.max(1,e.duration||1),c=Math.max(2,Math.min(100,Math.round((t.elapsed??0)/o*100)));return`<div class="step ${t.status} ${s?"open":""}">
    <div class="step-head" data-act="step" data-id="${t.id}" id="step-${t.id}">
      <span class="step-idx">${t.index}</span>
      <div class="step-main">
        <span class="step-title">${u(t.title)}${t.skipped?" \xB7 \u5DF2\u8DF3\u8FC7":""}</span>
        <span class="step-meta">${l.map(d=>u(d)).join(" \xB7 ")}</span>
      </div>
      <span class="step-chevron">${S("chevron")}</span>
    </div>
    ${s?`<div class="step-body">
      ${t.startT===null?"":`<div class="step-act"><span class="step-act-x muted">\u8017\u65F6 ${D(t.elapsed??0)}${t.stale?" \xB7 \u5DF2\u8D85\u8FC7 3 \u5206\u949F\u6CA1\u6709\u65B0\u52A8\u4F5C":""}</span></div>
      <div class="bar"><div class="${t.stale||t.status==="failed"?"bar-del":"bar-add"}" style="width:${c}%"></div></div>`}
      ${(t.calls??[]).length?ft(t.calls):""}
      ${t.expect?`<div class="step-expect">\u9884\u671F\uFF1A${u(t.expect)}</div>`:""}
      ${(t.calls??[]).length?"":i.length?i.slice(-8).map(d=>`
        <div class="step-act ${d.target?"tappable":""}" ${d.target?`data-act="open" data-kind="${d.target.kind}" data-id="${u(d.target.id)}" data-long="${d.target.kind}"`:""}>
          <span class="step-act-t">${ee(d.t)}</span>
          <span class="step-act-x">${u(d.text)}</span>
        </div>`).join(""):'<div class="step-act"><span class="step-act-x muted">\u8FD9\u4E00\u6B65\u6CA1\u6709\u52A8\u4F5C</span></div>'}
      ${i.length>8?`<div class="step-more">\u8FD8\u6709 ${i.length-8} \u6761\u66F4\u65E9\u7684\u52A8\u4F5C</div>`:""}
      <div class="step-foot"><button class="link-btn" data-act="sheet" data-long="step" data-id="${t.id}">\u91CD\u8DD1\u6216\u8DF3\u8FC7\u8FD9\u4E00\u6B65</button></div>
    </div>`:""}
  </div>`}function gt(t){return t.status==="done"?"\u5DF2\u5B8C\u6210":t.status==="failed"?"\u672A\u8FBE\u9884\u671F":t.status==="running"?"\u8FDB\u884C\u4E2D":"\u672A\u5F00\u59CB"}function vt(t,e){let a=t.files.filter(o=>o.attempts.length),s=t.files.filter(o=>!o.attempts.length),r=new Set(e.acceptedFiles(t).map(o=>o.path)),i=Math.max(1,...a.map(o=>o.add+o.del)),l=o=>[o.sensitive?"\u654F\u611F":"",o.ignored?"\u5DF2\u5FFD\u7565":"",o.reverted?"\u5DF2\u56DE\u6EDA":""].filter(Boolean);return`
    <div class="page">
      <h1>\u53D8\u66F4</h1>
      <p>${t.totals.files} \u4E2A\u6587\u4EF6 \xB7 <span style="color: var(--green)">+${t.totals.add}</span> <span style="color: var(--red)">\u2212${t.totals.del}</span>${t.totals.sensitive?` \xB7 ${t.totals.sensitive} \u4E2A\u654F\u611F`:""}</p>
    </div>

    <p class="section-title">\u5DF2\u4FEE\u6539</p>
    <div class="group">
      ${a.length?a.map(o=>{let c=r.has(o.path),d=re(o.path),w=[d==="."?null:d,`${o.attempts.length} \u7248`,...l(o)].filter(Boolean).join(" \xB7 ");return`<div class="row" data-act="open" data-kind="file" data-id="${u(o.path)}" data-long="file" id="file-${K(o.path)}">
          <button class="file-check ${c?"on":""}" data-act="exclude" data-id="${u(o.path)}" aria-label="\u7EB3\u5165\u9A8C\u6536">
            ${c?'<svg viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.3L19 7"/></svg>':""}
          </button>
          <div class="row-main">
            <span class="row-title mono">${u(oe(o.path))}</span>
            <span class="row-sub">${u(w)}</span>
            <span class="bar"><i class="bar-add" style="width:${o.add/i*100}%"></i><i class="bar-del" style="width:${o.del/i*100}%"></i></span>
          </div>
          <span class="delta"><span class="add">+${o.add}</span><span class="del">\u2212${o.del}</span></span>
          <span class="chevron">${S("chevron")}</span>
        </div>`}).join(""):'<div class="row static"><span class="row-title muted">\u8FD8\u6CA1\u6709\u6539\u52A8</span></div>'}
    </div>

    ${s.length?`
    <p class="section-title">\u53EA\u8BFB\u53D6</p>
    <div class="group">
      ${s.map(o=>`<div class="row static">
        <div class="row-main"><span class="row-title mono">${u(oe(o.path))}</span><span class="row-sub">${re(o.path)==="."?"":u(re(o.path))+" \xB7 "}\u8BFB\u53D6 ${o.reads} \u6B21</span></div>
      </div>`).join("")}
    </div>`:""}
`}function bt(t,e){let a=e.ui.acceptance,s=t.artifact,r=e.acceptedFiles(t),i=t.tests&&t.tests.failed===0;return`
    <div class="page">
      <h1>\u9A8C\u6536</h1>
      <p class="${a.status==="accepted"?"ok":a.status==="rejected"?"warn":""}">
        ${a.status==="accepted"?"\u5DF2\u9A8C\u6536\uFF0C\u7B49\u5F85\u5408\u5E76":a.status==="rejected"?`\u5DF2\u6253\u56DE\uFF1A${u(a.reason||"\u672A\u586B\u7406\u7531")}`:s?"\u6539\u52A8\u5DF2\u5B8C\u6210\uFF0C\u7B49\u4F60\u786E\u8BA4":"agent \u8FD8\u5728\u8DD1"}
      </p>
    </div>

    <div class="artifact">
      <div class="art-top">
        <div class="art-ico">${S("image")}</div>
        <div class="row-main">
          <div class="art-title">${u(s?.title??"\u7B49\u5F85\u4EA4\u4ED8")}</div>
          <div class="art-sub">${s?`${s.files} \u4E2A\u6587\u4EF6 \xB7 +${s.add} \u2212${s.del} \xB7 ${ee(s.t)}`:"\u5C1A\u672A\u4EA7\u51FA"}</div>
        </div>
      </div>
      <div class="art-actions">
        <button class="btn secondary" data-act="open" data-kind="preview" data-id="result" ${s?"":"disabled"}>\u4F53\u9A8C\u7ED3\u679C</button>
      </div>
    </div>

    <p class="section-title">\u8BC1\u636E</p>
    <div class="group">
      <div class="row static">
        <span class="row-icon ${i?"green":"orange"}">${S(i?"check":"warn")}</span>
        <div class="row-main"><span class="row-title">\u7528\u4F8B</span><span class="row-sub">${t.tests?`${t.tests.passed} \u901A\u8FC7 / ${t.tests.failed} \u5931\u8D25`:"\u6682\u65E0\u6D4B\u8BD5"}</span></div>
        <span class="row-value ${i?"":"warn"}">${t.tests?`${t.tests.passed}/${t.tests.passed+t.tests.failed}`:"\u2014"}</span>
      </div>
      <div class="row static">
        <span class="row-icon blue">${S("doc")}</span>
        <div class="row-main"><span class="row-title">\u63A5\u53D7\u8303\u56F4</span><span class="row-sub">${a.excluded.size?`\u5DF2\u6392\u9664 ${a.excluded.size} \u4E2A\u6587\u4EF6`:"\u5728\u300C\u53D8\u66F4\u300D\u91CC\u53EF\u4EE5\u53D6\u6D88\u52FE\u9009"}</span></div>
        <span class="row-value">${r.length} \u4E2A\u6587\u4EF6</span>
      </div>
    </div>

    ${a.status==="accepted"?`<div class="banner ok">
      <span class="row-icon green">${S("check")}</span>
      <span class="banner-main">\u5DF2\u63A5\u53D7 ${r.length} \u4E2A\u6587\u4EF6</span>
      <button class="link-btn" data-act="reset-accept">\u91CD\u65B0\u9A8C\u6536</button>
    </div>`:""}
    ${a.status==="rejected"?`<div class="banner danger">
      <span class="row-icon red">${S("warn")}</span>
      <span class="banner-main">\u5DF2\u6253\u56DE</span>
      <button class="link-btn" data-act="reset-accept">\u91CD\u65B0\u9A8C\u6536</button>
    </div>`:""}

    ${a.status==="pending"?`<div class="actions">
      <button class="btn primary" data-act="accept" ${s?"":"disabled"}>\u63A5\u53D7 ${r.length} \u4E2A\u6587\u4EF6</button>
      <button class="btn ghost destructive" data-act="open-reject" ${s?"":"disabled"}>\u6253\u56DE\u2026</button>
    </div>`:""}
`}function xt(t,e,a,s){let{ui:r}=s,i=r.view==="accept"&&!r.detail&&r.acceptance.status==="pending"&&!!a.artifact,l=i?`${s.acceptedFiles(a).length}`:"0";if(t._sig!==l){if(t._sig=l,t.dataset.open=i?"1":"0",e.dataset.bar=i?"1":"0",!i){t.innerHTML="";return}t.innerHTML=`
    <button class="reject-link" data-act="open-reject">\u6253\u56DE</button>
    <button class="btn primary" data-act="accept">\u63A5\u53D7 ${s.acceptedFiles(a).length} \u4E2A\u6587\u4EF6</button>`}}function kt(t,e,a){let s=t.files.find(d=>d.path===e);if(!s)return'<div class="empty">\u6CA1\u6709\u8FD9\u4E2A\u6587\u4EF6</div>';let r=se(s),i=Ce(s),l=[["current","\u672C\u8F6E"],["prev","\u4E0A\u6B21\u5C1D\u8BD5"],["content","\u6B63\u6587"]],o="";if(A.diffMode==="current")o=s.reverted?'<div class="empty">\u5DF2\u56DE\u6EDA\u5230\u539F\u59CB\u7248\u672C</div>':r?wt(s,r):'<div class="empty">\u53EA\u8BFB\u53D6\u8FC7\uFF0C\u6CA1\u6709\u6539\u52A8</div>';else if(A.diffMode==="prev")o=i?`<div class="diff-meta">\u7B2C ${i.from} \u7248 \u2192 \u7B2C ${i.to} \u7248 \xB7 +${i.changes.add} \u2212${i.changes.del}</div>
         <div class="hunk">${i.lines.map(d=>Fe(d)).join("")}</div>`:'<div class="empty">\u53EA\u6709\u4E00\u7248\u6539\u52A8\uFF0C\u6CA1\u6709\u53EF\u5BF9\u6BD4\u7684\u4E0A\u4E00\u6B21</div>';else{let d=yt(s);o=d?`<div class="diff-meta">\u76F4\u63A5\u8BFB\u6587\u4EF6\uFF0C\u4E0D\u7ECF\u8FC7 agent \u8F6C\u8FF0</div>
         <div class="hunk">${d.map(w=>`<div class="line"><span class="ln">${w.n}</span><span class="lt">${u(w.text)||" "}</span></div>`).join("")}</div>`:'<div class="empty">\u8FD8\u6CA1\u6709\u53EF\u8BFB\u5185\u5BB9</div>'}let c=a.ui.acceptance.excluded.has(s.path);return`
    <div class="detail-path mono">${u(s.path)}</div>
    <div class="detail-meta">
      <span class="mono">${s.attempts.length} \u7248</span>
      <span class="mono" style="color: var(--green)">+${s.reverted?0:s.add}</span>
      <span class="mono" style="color: var(--red)">\u2212${s.reverted?0:s.del}</span>
      <span>${Le[s.status]}</span>
    </div>
    <div class="segmented">
      ${l.map(([d,w])=>`<button class="${A.diffMode===d?"on":""}" data-act="detail-tab" data-mode="${d}">${w}</button>`).join("")}
    </div>
    <div class="diff">${o}</div>
    ${s.attempts.length?`<div class="group">
      <button class="row" data-act="exclude" data-id="${u(s.path)}">
        <span class="row-icon ${c?"gray":"green"}">${S(c?"no":"check")}</span>
        <div class="row-main"><span class="row-title">${c?"\u5DF2\u6392\u9664\u5728\u9A8C\u6536\u4E4B\u5916":"\u5DF2\u7EB3\u5165\u9A8C\u6536"}</span><span class="row-sub">\u70B9\u4E00\u4E0B\u5207\u6362</span></div>
      </button>
    </div>`:""}
`}function wt(t,e){return`<div class="hunk-head" data-long="file" data-id="${u(t.path)}">${u(e.header)}</div>
    <div class="hunk">${ne(e.lines,2).map(a=>Fe(a)).join("")}</div>`}function Fe(t){if(t.type==="gap")return`<div class="line gap">${u(t.text)}</div>`;let e=t.type==="add"?"+":t.type==="del"?"\u2212":" ";return`<div class="line ${t.type}"><span class="ln">${e}</span><span class="lt">${u(t.text)||" "}</span></div>`}function yt(t){let e=se(t);if(!e)return null;let a=/\+(\d+)/.exec(e.header),s=a?Number(a[1]):1,r=[];for(let i of e.lines)i.type!=="del"&&r.push({n:s++,text:i.text});return r}function $t(){let t=A.previewSide;return`
    <div class="segmented" style="margin-top: 12px">
      <button class="${t==="before"?"on":""}" data-act="preview-side" data-mode="before">\u4FEE\u590D\u524D</button>
      <button class="${t==="after"?"on":""}" data-act="preview-side" data-mode="after">\u4FEE\u590D\u540E</button>
    </div>
    <div class="preview">
      <div class="browser-bar"><span class="dots"></span><span class="url">127.0.0.1:4173/login</span></div>
      <div class="mock ${t}">
        <div class="mock-avatar"></div>
        <div class="mock-title">${t==="after"?"\u5DF2\u6062\u590D\u767B\u5F55":"\u767B\u5F55\u5DF2\u5931\u6548"}</div>
        <div class="mock-sub">${t==="after"?"\u4F1A\u8BDD\u5DF2\u5237\u65B0\uFF0C\u7EE7\u7EED\u64CD\u4F5C":"401 \xB7 \u88AB\u91CD\u5B9A\u5411\u5230\u767B\u5F55\u9875"}</div>
        <div class="mock-btn" data-act="preview-click">${t==="after"?"\u7EE7\u7EED":"\u91CD\u65B0\u767B\u5F55"}</div>
        <div class="mock-net ${t==="after"?"ok":"bad"}">${t==="after"?"POST /auth/refresh \u2192 200":"POST /auth/refresh \u2192 401"}</div>
      </div>
      <div class="preview-foot">\u771F\u5B9E\u4EA7\u7269 \xB7 \u53EF\u76F4\u63A5\u70B9\u6309</div>
    </div>
`}function St(t,e,a){let s=a.ui.sheet,r=a.ui.drawer;if(!s&&!r){t.innerHTML="",t._sig="";return}let i=[s?.type,s?.id,s?.actions?.length,r].join("|");if(t._sig!==i){if(t._sig=i,s?.type==="reject"){t.innerHTML=`
      <div class="modal" role="dialog" aria-modal="true">
        <div class="sheet-wrap">
          <div class="sheet">
            <div class="sheet-head"><div class="sheet-title">\u6253\u56DE\u8FD9\u6B21\u6539\u52A8</div><div class="sheet-sub">\u7406\u7531\u4F1A\u9644\u7ED9 agent</div></div>
            <div class="reject-body">
              <textarea id="rejectReason" class="reject-input" rows="3" placeholder="\u4E00\u53E5\u8BDD\u8BF4\u660E\u4E3A\u4EC0\u4E48\u6253\u56DE\u2026">${u(a.ui.acceptance.reason)}</textarea>
              <div class="chips">
                ${["\u8986\u76D6\u4E0D\u5168","\u98CE\u683C\u4E0D\u4E00\u81F4","\u7F3A\u5C11\u6D4B\u8BD5","\u6362\u4E2A\u601D\u8DEF"].map(l=>`<button class="chip" data-act="quick-reason" data-reason="${l}">${l}</button>`).join("")}
              </div>
              <button class="btn primary" style="background: var(--red)" data-act="reject-send">\u53D1\u9001\u6253\u56DE</button>
            </div>
          </div>
          <button class="sheet-cancel" data-act="sheet-close">\u53D6\u6D88</button>
        </div>
        <div class="scrim" data-act="sheet-close"></div>
      </div>`;return}if(s){let l=["mark","constrain","takeover"].filter(o=>s.actions.some(c=>c.tier===o));t.innerHTML=`
      <div class="modal" role="dialog" aria-modal="true">
        <div class="sheet-wrap">
          <div class="sheet">
            <div class="sheet-head"><div class="sheet-title">${u(s.title)}</div><div class="sheet-sub">${u(s.sub)}</div></div>
            ${l.map(o=>`
              <div class="sheet-section">${rt[o]}</div>
              ${s.actions.filter(c=>c.tier===o).map(c=>`
                <button class="sheet-item ${c.tier==="takeover"?"destructive":""}"
                  data-act="iv" data-tier="${c.tier}" data-kind="${c.kind}" data-target="${u(c.target)}" data-label="${u(c.label)}">
                  <span class="row-icon">${S(c.icon)}</span>
                  <span class="sheet-item-main"><b>${u(c.label)}</b><small>${u(c.hint)}</small></span>
                </button>`).join("")}
            `).join("")}
          </div>
          <button class="sheet-cancel" data-act="sheet-close">\u53D6\u6D88</button>
        </div>
        <div class="scrim" data-act="sheet-close"></div>
      </div>`;return}t.innerHTML=`
    <div class="modal" role="dialog" aria-modal="true">
      <div class="sheet-wrap">
        <div class="sheet drawer-sheet">
          <div class="sheet-head"><div class="sheet-title">\u539F\u59CB\u8F93\u51FA</div><div class="sheet-sub">\u53EA\u8BFB \xB7 \u76F4\u8FDE worker</div></div>
          <div class="sheet-seg">
            <div class="segmented" style="margin: 0">
              ${[["term","\u7EC8\u7AEF"],["status","git status"],["patch","\u6700\u8FD1 patch"]].map(([l,o])=>`<button class="${r===l?"on":""}" data-act="drawer-tab" data-tab="${l}">${o}</button>`).join("")}
            </div>
          </div>
          <div class="raw">${r==="term"?Mt(e):r==="status"?Tt(e):jt(e)}</div>
        </div>
        <button class="sheet-cancel" data-act="drawer-close">\u5B8C\u6210</button>
      </div>
      <div class="scrim" data-act="drawer-close"></div>
    </div>`}}function Mt(t){let e=[];for(let a of t.commands){e.push(`<div class="raw-cmd">$ ${u(a.cmd)}</div>`);for(let s of a.lines)e.push(`<div class="raw-line ${s.stream==="err"?"err":""}">${u(s.line)}</div>`);a.exit!=null&&e.push(`<div class="raw-exit ${a.exit===0?"ok":"bad"}">[exit ${a.exit}]</div>`)}return e.join("")||'<div class="raw-line">\u8FD8\u6CA1\u6709\u6267\u884C\u8BB0\u5F55</div>'}function Tt(t){let e=t.files.map(a=>{let s=a.attempts.length?"M":" ";return`<div class="raw-line"><span class="gs-code ${a.attempts.length?"mod":""}">${s}</span> ${u(a.path)}</div>`});return`<div class="raw-line">On branch ${u(t.task.branch)}</div>
    <div class="raw-line" style="opacity:.6">Changes not staged for commit:</div>${e.join("")}`}function jt(t){let e=t.files.filter(a=>a.attempts.length&&!a.ignored&&!a.reverted);return e.length?e.map(a=>{let s=se(a),r=s.lines.map(i=>`<div class="raw-line ${i.type==="add"?"add":i.type==="del"?"del":""}">${i.type==="add"?"+":i.type==="del"?"-":" "}${u(i.text)}</div>`).join("");return`<div class="patch-file"><div class="raw-cmd">--- a/${u(a.path)}
+++ b/${u(a.path)}</div>
      <div class="raw-line" style="opacity:.6">${u(s.header)}</div>${r}</div>`}).join(""):'<div class="raw-line">\u8FD8\u6CA1\u6709\u8865\u4E01</div>'}var Lt=new Set(["bash","read","edit","write","str_replace_editor","todo_write"]);function zt(t,e){let a=e??{},s=[a.command,a.query,a.file_path,a.path,a.pattern,a.url,a.prompt,a.description,a.goal,a.task];for(let r of s)if(typeof r=="string"&&r.trim()!=="")return r.trim().replace(/\s+/g," ").slice(0,80);if(e&&typeof e=="object"){let r=Object.keys(e);if(r.length>0)return`${r.slice(0,3).join(", ")}`}return t}var Ct=300,It=/\bTests?\s+(\d+)\s+passed(?:\s*\|\s*(\d+)\s+failed)?/i,At=/Tests:\s*(?:(\d+)\s+failed,\s*)?(\d+)\s+passed/i;function ye(t){let e=/\[exit code: (-?\d+)\]/.exec(t??"");return e===null?null:Number(e[1])}function $e(t){let e=t??"",a=It.exec(e);return a!==null?{passed:Number(a[1]),failed:Number(a[2]??0)}:(a=At.exec(e),a!==null?{passed:Number(a[2]),failed:Number(a[1]??0)}:null)}function ce(t){return!t||!Array.isArray(t.content)?"":t.content.filter(e=>e?.type==="text"&&typeof e.text=="string").map(e=>e.text).join(`
`)}function Et(t){if(typeof t!="string")return{};try{let e=JSON.parse(t);return e&&typeof e=="object"?e:{}}catch{return{}}}function we(t){let e=String(t??"");return e===""?[]:e.replace(/\n$/,"").split(`
`)}function le(t,e){let a=(e??[]).filter(f=>f&&typeof f.time=="number").slice().sort((f,x)=>(f.seq??0)-(x.seq??0)||f.time-x.time),s=a.length?a[0].time:Date.now(),r=f=>Math.max(0,Math.round((f-s)/100)/10),i=a.some(f=>f.type==="todo/write"||f.type==="tool/call"&&f.data?.name==="todo_write"),l=[],o=[],c=new Map,d=null,w=new Map,j=new Map,M="",z=null,m=f=>{let x=c.get(f);return x===void 0&&(x={id:`todo-${o.length+1}`,index:o.length+1,title:f,status:"pending",startT:null,endT:null,started:!1},o.push(x),c.set(f,x)),x},b=(f,x)=>{f.started||(f.started=!0,f.startT=x,l.push({type:"step.start",step:f.id,t:x}))},E=(f,x)=>{if(!(!Array.isArray(f)||f.length===0))for(let h of f){let k=typeof h?.content=="string"?h.content:"";if(k==="")continue;let y=m(k);h.status==="in_progress"?(b(y,x),d=y.id):h.status==="completed"&&(b(y,x),y.endT===null&&(y.endT=x,l.push({type:"step.end",step:y.id,ok:!0,t:x})))}};for(let f of a){let x=r(f.time),h=f.data??{};switch(f.type){case"turn/start":{if(!i){let k={id:`turn-${h.turn}`,index:o.length+1,title:"",status:"running",startT:x,endT:null,started:!0};o.push(k),z=k,d=k.id,l.push({type:"step.start",step:k.id,t:x})}break}case"turn/end":{!i&&z!==null&&z.endT===null&&(z.endT=x,l.push({type:"step.end",step:z.id,ok:!0,t:x})),z=null,M="";break}case"user/message":{let k=ce(h).trim();k!==""&&M===""&&(M=k.slice(0,80)),!i&&z!==null&&z.title===""&&k!==""&&(z.title=k.slice(0,40));break}case"todo/write":{E(h.todos,x);break}case"tool/call":{let k={id:h.callId,name:h.name,args:Et(h.arguments),t:x,text:""};if(w.set(h.callId,k),Lt.has(h.name)||l.push({type:"tool.start",id:h.callId,name:h.name,summary:zt(h.name,k.args),t:x}),h.name==="read"){let y=k.args.file_path;typeof y=="string"&&l.push({type:"file.read",path:y,t:x})}else if(h.name==="bash"){let y=typeof k.args.command=="string"?k.args.command:"";y!==""&&l.push({type:"cmd.start",id:h.callId,cmd:y,t:x})}break}case"tool/result":{let k=h.message??{},y=w.get(k.toolCallId);if(y===void 0)break;let C=ce(k);if(y.name==="bash"){let B=we(C);for(let O of B.slice(0,Ct))l.push({type:"cmd.line",id:y.id,stream:k.isError?"err":"out",line:O,t:x});let q=ye(C)??(k.isError?1:0);l.push({type:"cmd.end",id:y.id,exit:q,dur:Math.max(0,x-y.t),t:x});let F=$e(C);F!==null&&l.push({type:"test.result",passed:F.passed,failed:F.failed,t:x})}else if(y.name==="edit"||y.name==="write"||y.name==="str_replace_editor"){let B=h.meta&&Array.isArray(h.meta.diffs)?h.meta.diffs:[];for(let q of B){let F=typeof q?.path=="string"?q.path:y.args.file_path;if(typeof F!="string"||F==="")continue;let O=we(q?.oldText),R=we(q?.newText),U=Q(O,R),P=ae(U),de=(j.get(F)??0)+1;j.set(F,de),l.push({type:"file.edit",path:F,attempt:de,add:P.add,del:P.del,hunk:{header:`@@ ${F} @@`,lines:U},t:x})}}else y.name==="todo_write"?E(y.args.todos,x):l.push({type:"tool.end",id:y.id,name:y.name,ok:k.isError!==!0,dur:Math.max(0,x-y.t),text:ce(k).trim().slice(0,220),t:x});break}default:break}}let T=[...o].reverse().find(f=>f.startT!==null&&f.endT===null),L=[...o].reverse().find(f=>f.endT!==null),N=T?.id??L?.id??null,v=a.find(f=>f.type==="user/message"),g=v?ce(v.data?.message).trim().slice(0,40):"";for(let f of o)f.title===""&&(f.title=`\u7B2C ${f.index} \u8F6E`),delete f.started;return{scenario:{task:{id:t?.id??"",title:t?.title||g||"\u672A\u547D\u540D\u4F1A\u8BDD",intent:t?.title||g||"",branch:"",workdir:typeof t?.cwd=="string"?t.cwd:""},steps:o,duration:a.length?r(a[a.length-1].time):0},events:l,startMs:s,endMs:a.length?a[a.length-1].time:s,activeStepId:N}}var Ne={pending:0,done:1,stale:2,running:3,idle:4};function _t(t){if(t===null||typeof t!="object")return null;let e=[t.title,t.label,t.summary,t.kind,t.request?.title,t.request?.toolName,t.request?.name,t.toolName];for(let a of e)if(typeof a=="string"&&a.trim()!=="")return a.trim().slice(0,60);return"\u7B49\u4F60\u5904\u7406"}function qe({rows:t,status:e,now:a=Date.now(),currentId:s=null}={}){let r=e instanceof Map?e:new Map(Object.entries(e??{})),i=[];for(let c of t??[]){if(!c||typeof c.id!="string")continue;let d=r.get(c.id)??{},w=d.pendingInteraction??null,j=typeof c.updatedAt=="number"?c.updatedAt:null,M=j===null?null:Math.max(0,a-j),z=d.running===!0||c.running===!0,m=d.completionUnread===!0,b=z&&M!==null&&M>18e4,E=w!==null?"pending":m?"done":b?"stale":z?"running":"idle";i.push({id:c.id,title:typeof c.title=="string"&&c.title!==""?c.title:c.displayTitle??"\u672A\u547D\u540D\u4F1A\u8BDD",cwd:typeof c.cwd=="string"?c.cwd:"",updatedAt:j,ageMs:M,running:z,completionUnread:m,stale:b,level:E,pending:_t(w),current:c.id===s})}i.sort((c,d)=>{let w=Ne[c.level]-Ne[d.level];return w!==0?w:(d.updatedAt??0)-(c.updatedAt??0)});let l=i.filter(c=>c.level==="pending"||c.level==="done"||c.level==="stale"),o={pending:i.filter(c=>c.level==="pending").length,done:i.filter(c=>c.level==="done").length,stale:i.filter(c=>c.level==="stale").length,running:i.filter(c=>c.level==="running").length,total:i.length};return{sessions:i,inbox:l,counts:o}}function Oe(t,e=null){let a=new Set,s=null,r=null,i=null,l=null,o=null,c=null,d=null,w=null,j=0,M=!0,z=()=>{let v=[],g=null;try{let $=t.list.getSnapshot();v=$&&$.byId?Object.values($.byId):[],g=e?.sessionStatus?.getSnapshot?.()??null}catch{}return qe({rows:v,status:g,currentId:c})},m=()=>{if(s===null){let v=z();for(let g of a)g({scenario:null,events:[],overview:v,currentId:c});return}for(let v of a)v({...s,overview:z(),currentId:c})},b=()=>{j===0&&(j=requestAnimationFrame(()=>{j=0,m()}))},E=()=>{if(w!==null)return w;try{let v=t.list.getSnapshot(),$=(v&&v.byId?Object.values(v.byId):[]).find(f=>(f.retainedBy?.mainView??0)>0)?.id??null;return $!==null&&(d=$),$??d}catch{return null}},T=()=>{if(l!==null){try{l()}catch{}l=null}if(o!==null){try{o.release()}catch{}o=null}s=null},L=v=>{if(T(),c=v,v===null)return;let g=t.retain(v,{source:"remoteConsole"});o=g,Promise.resolve(g.ready).then($=>{if(M||c!==v)return;let f=$.eventSource,x=()=>{try{let k=(f.getSnapshot()?.entries??[]).filter(C=>C.type==="event").map(C=>C.event),y=t.list.getSnapshot()?.byId?.[v]??{};s=le({id:v,cwd:y.cwd,title:y.displayTitle},k),b()}catch(h){console.warn("[remote-panel] live normalize failed",h)}};l=f.subscribe(x),x()}).catch($=>console.warn("[remote-panel] live session failed",$))},N=()=>{let v=E();v!==c&&L(v)};return{subscribe(v){return a.add(v),s!==null&&v(s),()=>a.delete(v)},start(){M&&(M=!1,r=t.list.subscribe(()=>{N(),b()}),e?.sessionStatus?.subscribe&&(i=e.sessionStatus.subscribe(()=>b())),N())},select(v){let g=typeof v=="string"&&v!==""?v:null;g!==w&&(w=g,d=g??d,N(),m())},send(v){let g=typeof v=="string"?v.trim():"";if(g==="")return!1;try{let $=o?.binding?.session;if($&&typeof $.prompt=="function")return Promise.resolve($.prompt([{type:"text",text:g}],"queue")).catch(f=>{console.warn("[remote-panel] prompt failed",f)}),!0}catch{}return!1},cancel(){try{let v=o?.binding?.session;if(v&&typeof v.cancel=="function")return Promise.resolve(v.cancel()).catch(()=>{}),!0}catch{}return!1},stop(){if(M=!0,j!==0&&(cancelAnimationFrame(j),j=0),r!==null){try{r()}catch{}r=null}if(i!==null){try{i()}catch{}i=null}T(),c=null,a.clear()}}}function Ft(t,e){try{let a=globalThis.DSHPocket;if(a&&typeof a.notify=="function")return a.notify(t,e??""),!0}catch{}try{return typeof Notification>"u"||Notification.permission!=="granted"?!1:(new Notification(t,{body:e??"",tag:"dsh-remote-panel"}),!0)}catch{return!1}}function Re(t,e={}){let a=new ie,s=e.live??(e.sessions?Oe(e.sessions,e.uiSession??null):null);s!==null&&e.sessions&&(a.live=!0,a.scenario={task:{title:"",branch:"",workdir:"",intent:""},steps:[],duration:0},a.events=[],a.duration=0,a.ui.t=0,a.ui.playing=!1);let r=s&&typeof s.subscribe=="function"?s.subscribe(o=>a.setLive(o)):null,i=Ee(t,a,{...e,onTakeover:()=>{s&&typeof s.cancel=="function"&&s.cancel()},onSelectSession:o=>{s&&typeof s.select=="function"&&s.select(o)},onSend:o=>s&&typeof s.send=="function"?s.send(o):!1,onApprove:(o,c)=>e.approvals?.decide?.(o,c),onWatch:(o,c)=>e.approvals?.watch?.(o,c),onMark:(o,c)=>e.approvals?.relay?.mark?.({sessionId:o,text:c}),onSeen:o=>e.approvals?.relay?.seen?.(o)});s&&typeof s.start=="function"&&s.start();let l=0;if(e.approvals&&typeof e.approvals.list=="function"){let o=()=>{Promise.resolve().then(()=>e.approvals.list()).then(c=>{let d=Array.isArray(c?.entries)?c.entries:[],w=a.approvals.length;a.approvals=d,d.length>w&&typeof document<"u"&&document.hidden===!0&&Ft(`\u6709 ${d.length} \u4E2A\u4EFB\u52A1\u7B49\u4F60\u6279\u51C6`,d.map(j=>j.toolName).slice(0,3).join("\u3001")),a.watching=Array.isArray(c?.watching)?c.watching:[],a.emit()}).catch(()=>{})};o(),l=setInterval(o,3e3)}return{store:a,dispose:()=>{l!==0&&clearInterval(l),r!==null&&r(),s&&typeof s.stop=="function"&&s.stop(),i()}}}var Pe=`.pc{
  --blue: #007aff;
  --green: #34c759;
  --red: #ff3b30;
  --orange: #ff9500;
  --purple: #af52de;

  --bg: #f2f2f7;
  --card: #ffffff;
  --card-2: #f2f2f7;
  --sep: rgba(60, 60, 67, 0.24);
  --label: #000000;
  --label-2: rgba(60, 60, 67, 0.6);
  --label-3: rgba(60, 60, 67, 0.3);
  --fill: rgba(120, 120, 128, 0.12);
  --fill-2: rgba(120, 120, 128, 0.08);
  --nav: rgba(249, 249, 249, 0.86);
  --tab: rgba(249, 249, 249, 0.9);
  --sheet: #ffffff;
  --shadow: 0 12px 34px rgba(0, 0, 0, 0.14);
  --diff-add-bg: rgba(52, 199, 89, 0.1);
  --diff-add-fg: #248a3d;
  --diff-del-bg: rgba(255, 59, 48, 0.08);
  --diff-del-fg: #c4271f;
  --scrim: rgba(0, 0, 0, 0.32);
}@media (prefers-color-scheme: dark){.pc{
    --blue: #0a84ff;
    --green: #30d158;
    --red: #ff453a;
    --orange: #ff9f0a;
    --purple: #bf5af2;

    --bg: #000000;
    --card: #1c1c1e;
    --card-2: #2c2c2e;
    --sep: rgba(84, 84, 88, 0.6);
    --label: #ffffff;
    --label-2: rgba(235, 235, 245, 0.6);
    --label-3: rgba(235, 235, 245, 0.3);
    --fill: rgba(120, 120, 128, 0.24);
    --fill-2: rgba(120, 120, 128, 0.16);
    --nav: rgba(22, 22, 24, 0.82);
    --tab: rgba(22, 22, 24, 0.86);
    --sheet: #1c1c1e;
    --shadow: 0 12px 34px rgba(0, 0, 0, 0.5);
    --diff-add-bg: rgba(48, 209, 88, 0.16);
    --diff-add-fg: #7ee787;
    --diff-del-bg: rgba(255, 69, 58, 0.16);
    --diff-del-fg: #ff9b95;
    --scrim: rgba(0, 0, 0, 0.55);
  }
}.pc.pc-dark{
    --blue: #0a84ff;
    --green: #30d158;
    --red: #ff453a;
    --orange: #ff9f0a;
    --purple: #bf5af2;

    --bg: #000000;
    --card: #1c1c1e;
    --card-2: #2c2c2e;
    --sep: rgba(84, 84, 88, 0.6);
    --label: #ffffff;
    --label-2: rgba(235, 235, 245, 0.6);
    --label-3: rgba(235, 235, 245, 0.3);
    --fill: rgba(120, 120, 128, 0.24);
    --fill-2: rgba(120, 120, 128, 0.16);
    --nav: rgba(22, 22, 24, 0.82);
    --tab: rgba(22, 22, 24, 0.86);
    --sheet: #1c1c1e;
    --shadow: 0 12px 34px rgba(0, 0, 0, 0.5);
    --diff-add-bg: rgba(48, 209, 88, 0.16);
    --diff-add-fg: #7ee787;
    --diff-del-bg: rgba(255, 69, 58, 0.16);
    --diff-del-fg: #ff9b95;
    --scrim: rgba(0, 0, 0, 0.55);
  }
.pc *{ box-sizing: border-box; -webkit-tap-highlight-color: transparent; }.pc{ margin: 0; height: 100%; background: var(--bg); }.pc{
  display: flex;
  justify-content: center;
  overflow-x: hidden;
  color: var(--label);
  font: 17px/1.35 -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Inter", "PingFang SC", "Noto Sans CJK SC", "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  overscroll-behavior: none;
}.pc #app{ display: flex; width: 100%; min-width: 0; justify-content: center; }.pc button, .pc input, .pc textarea{ font: inherit; color: inherit; background: none; border: 0; padding: 0; margin: 0; }.pc button{ cursor: pointer; }.pc .app{
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 520px;
  height: 100dvh;
  overflow: hidden;
  background: var(--bg);
}.pc .navbar{
  position: relative;
  z-index: 10;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  height: calc(44px + env(safe-area-inset-top));
  padding: env(safe-area-inset-top) 8px 0;
  background: var(--nav);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
}.pc .navbar::after{
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 0.5px;
  background: var(--sep);
  opacity: 0;
  transition: opacity 0.18s ease;
}.pc .app[data-scrolled="1"] .navbar::after{ opacity: 1; }.pc .nav-back, .pc .nav-action{
  display: flex;
  align-items: center;
  gap: 1px;
  min-width: 44px;
  height: 44px;
  padding: 0 6px;
  color: var(--blue);
  font-size: 17px;
  flex: none;
}.pc .nav-back{ margin-left: -4px; }.pc .nav-back:active, .pc .nav-action:active{ opacity: 0.45; }.pc .nav-back svg{ width: 11px; height: 19px; fill: none; stroke: currentColor; stroke-width: 2.3; stroke-linecap: round; stroke-linejoin: round; }.pc .nav-action{ justify-content: flex-end; font-weight: 400; }.pc .nav-action.destructive{ color: var(--red); }.pc .nav-title{
  position: absolute;
  left: 50%;
  top: calc(env(safe-area-inset-top) + 11px);
  transform: translateX(-50%);
  max-width: 52%;
  font-size: 17px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0;
  transition: opacity 0.18s ease;
}.pc .app[data-scrolled="1"] .nav-title, .pc .nav-title[data-always="1"]{ opacity: 1; }.pc .screen > :last-child{ margin-bottom: 0; }.pc .screen::-webkit-scrollbar, .pc .sheet::-webkit-scrollbar, .pc .raw::-webkit-scrollbar, .pc .chips::-webkit-scrollbar, .pc .hunk::-webkit-scrollbar{ display: none; }.pc .screen{
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  padding-bottom: calc(64px + max(env(safe-area-inset-bottom, 0px), var(--dsh-safe-bottom, 0px)));
}.pc .page{ padding: 12px 16px 16px; }.pc .page h1{
  margin: 0;
  font-size: 32px;
  line-height: 1.12;
  font-weight: 700;
  letter-spacing: -0.024em;
}.pc .page p{ margin: 6px 0 0; font-size: 15px; color: var(--label-2); }.pc .page p.warn{ color: var(--orange); }.pc .page p.ok{ color: var(--green); }.pc .section-title{
  margin: 0 16px 7px;
  font-size: 13px;
  color: var(--label-2);
  letter-spacing: 0.01em;
}.pc .group{
  margin: 0 16px 26px;
  border-radius: 12px;
  background: var(--card);
  overflow: hidden;
}.pc .row{
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 44px;
  padding: 10px 16px;
  text-align: left;
  color: var(--label);
}.pc .row + .row::before{
  content: "";
  position: absolute;
  left: 16px;
  right: 0;
  top: 0;
  height: 0.5px;
  background: var(--sep);
}.pc .row:active{ background: var(--fill-2); }.pc .row.static:active{ background: transparent; }.pc .row-icon{ flex: none; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; }.pc .row-icon svg{ width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }.pc .row-icon.blue{ color: var(--blue); }.pc .row-icon.gray{ color: var(--label-2); }.pc .row-icon.orange{ color: var(--orange); }.pc .row-icon.green{ color: var(--green); }.pc .row-icon.red{ color: var(--red); }.pc .row-main{ flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }.pc .row-title{ font-size: 17px; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }.pc .row-sub{ font-size: 13px; color: var(--label-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }.pc .row-title.mono, .pc .row-sub.mono{ font-family: ui-monospace, "SF Mono", Menlo, monospace; }.pc .row-value{ flex: none; max-width: 56%; font-size: 15px; color: var(--label-2); text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }.pc .row-value.warn{ color: var(--orange); }.pc .row-value.strong{ color: var(--label); font-weight: 500; }.pc .chevron{ flex: none; width: 8px; height: 13px; color: var(--label-3); }.pc .chevron svg{ width: 8px; height: 13px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }.pc .status .row{ min-height: 46px; }.pc .status .row-title{ font-size: 16px; }.pc .replay{ gap: 12px; padding-top: 12px; padding-bottom: 12px; }.pc .replay .play{
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--fill);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--label);
}.pc .replay .play svg{ width: 13px; height: 13px; fill: currentColor; stroke: none; }.pc .replay input[type="range"]{
  flex: 1;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: transparent;
  outline: none;
}.pc .replay input[type="range"]::-webkit-slider-runnable-track{ height: 4px; border-radius: 2px; background: var(--fill); }.pc .replay input[type="range"]::-webkit-slider-thumb{
  -webkit-appearance: none;
  width: 26px;
  height: 26px;
  margin-top: -11px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25), 0 0 0 0.5px rgba(0, 0, 0, 0.04);
}@media (prefers-color-scheme: dark){.pc .replay input[type="range"]::-webkit-slider-thumb{ background: #8e8e93; }
}.pc.pc-dark .replay input[type="range"]::-webkit-slider-thumb{ background: #8e8e93; }
.pc .replay .time{ flex: none; font: 13px ui-monospace, "SF Mono", monospace; color: var(--label-2); font-variant-numeric: tabular-nums; }.pc .step{ position: relative; }.pc .step + .step::before{
  content: "";
  position: absolute;
  left: 16px;
  right: 0;
  top: 0;
  height: 0.5px;
  background: var(--sep);
}.pc .step-head{
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 56px;
  padding: 11px 16px;
  text-align: left;
}.pc .step-head:active{ background: var(--fill-2); }.pc .step.open .step-head{ background: var(--fill-2); }.pc .step-idx{
  flex: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--label-2);
  background: var(--fill);
  font-variant-numeric: tabular-nums;
}.pc .step.done .step-idx{ background: var(--green); color: #fff; }.pc .step.failed .step-idx{ background: var(--red); color: #fff; }.pc .step.running .step-idx{ background: var(--blue); color: #fff; }.pc .step.skipped{ opacity: 0.5; }.pc .step-main{ flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }.pc .step-title{ font-size: 17px; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }.pc .step-meta{ font-size: 13px; color: var(--label-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }.pc .step.running .step-meta{ color: var(--blue); }.pc .step-chevron{ flex: none; display: flex; width: 12px; height: 16px; align-items: center; justify-content: center; color: var(--label-3); transition: transform 0.2s ease; }.pc .step-chevron svg{ width: 8px; height: 13px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }.pc .step.open .step-chevron{ transform: rotate(90deg); }.pc .step-body{ padding: 4px 16px 14px 52px; background: var(--fill-2); font-size: 13px; }.pc .step-expect{ color: var(--label-2); padding: 6px 0 8px; line-height: 1.45; }.pc .step-act{ display: flex; gap: 10px; padding: 5px 0; align-items: baseline; color: var(--label); }.pc .step-act.tappable:active{ opacity: 0.5; }.pc .step-act-t{ flex: none; width: 34px; font: 11px ui-monospace, "SF Mono", monospace; color: var(--label-3); font-variant-numeric: tabular-nums; }.pc .step-act-x{ font-size: 13px; line-height: 1.45; word-break: break-word; }.pc .step-more{ color: var(--label-3); padding: 4px 0; }.pc .step-foot{ padding-top: 8px; }.pc .link-btn{ color: var(--blue); font-size: 15px; padding: 4px 0; }.pc .link-btn:active{ opacity: 0.45; }.pc .file-check{
  flex: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 1.6px solid var(--label-3);
  display: flex;
  align-items: center;
  justify-content: center;
}.pc .file-check.on{ background: var(--blue); border-color: var(--blue); }.pc .file-check svg{ width: 13px; height: 13px; fill: none; stroke: #fff; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; }.pc .delta{ flex: none; display: flex; align-items: baseline; gap: 6px; font: 13px ui-monospace, "SF Mono", monospace; font-variant-numeric: tabular-nums; }.pc .delta .add{ color: var(--green); }.pc .delta .del{ color: var(--red); }.pc .bar{ display: flex; height: 3px; margin-top: 6px; border-radius: 1.5px; overflow: hidden; background: var(--fill); }.pc .bar-add{ background: var(--green); flex: none; }.pc .bar-del{ background: var(--red); flex: none; }.pc .artifact{ margin: 0 16px 22px; padding: 16px; border-radius: 16px; background: var(--card); }.pc .art-top{ display: flex; gap: 14px; align-items: flex-start; }.pc .art-ico{
  flex: none;
  width: 54px;
  height: 54px;
  border-radius: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: linear-gradient(160deg, #5ac8fa, #007aff 62%, #5856d6);
  box-shadow: 0 6px 14px rgba(0, 122, 255, 0.28);
}.pc .art-ico svg{ width: 26px; height: 26px; fill: none; stroke: currentColor; stroke-width: 1.7; }.pc .art-title{ font-size: 17px; font-weight: 600; letter-spacing: -0.01em; }.pc .art-sub{ margin-top: 3px; font-size: 13px; color: var(--label-2); }.pc .art-actions{ margin-top: 14px; }.pc .btn{
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 50px;
  border-radius: 12px;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.01em;
}.pc .btn:active{ opacity: 0.82; }.pc .btn.primary{ background: var(--blue); color: #fff; }.pc .btn.secondary{ background: rgba(0, 122, 255, 0.12); color: var(--blue); }.pc .btn.ghost{ color: var(--blue); font-weight: 400; }.pc .btn.destructive{ color: var(--red); font-weight: 400; }.pc .btn svg{ width: 19px; height: 19px; fill: none; stroke: currentColor; stroke-width: 1.9; }.pc .btn[disabled]{ opacity: 0.35; }.pc .actions{ display: flex; flex-direction: column; gap: 10px; margin: 0 16px 22px; }.pc .banner{
  margin: 0 16px 22px;
  padding: 12px 16px;
  border-radius: 12px;
  background: var(--card);
  font-size: 15px;
  display: flex;
  align-items: center;
  gap: 10px;
}.pc .banner .row-icon{ width: 20px; height: 20px; }.pc .banner .row-icon svg{ width: 20px; height: 20px; }.pc .banner.ok{ color: var(--green); }.pc .banner.danger{ color: var(--red); }.pc .banner .banner-main{ flex: 1; min-width: 0; color: var(--label); }.pc .banner .link-btn{ font-size: 15px; }.pc .detail-path{ margin: 12px 16px 6px; font-size: 13px; color: var(--label-2); word-break: break-all; }.pc .detail-meta{ margin: 0 16px 16px; font-size: 13px; color: var(--label-2); display: flex; gap: 10px; }.pc .detail-meta .mono{ font-family: ui-monospace, "SF Mono", monospace; }.pc .segmented{ display: flex; gap: 2px; margin: 0 16px 16px; padding: 2px; border-radius: 9px; background: var(--fill); }.pc .segmented button{
  flex: 1;
  height: 30px;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 500;
  color: var(--label);
  white-space: nowrap;
}.pc .segmented button.on{ background: var(--card); font-weight: 600; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12); }@media (prefers-color-scheme: dark){.pc .segmented button.on{ background: #636366; }.pc .btn.secondary{ background: rgba(10, 132, 255, 0.18); }
}.pc.pc-dark .segmented button.on{ background: #636366; }.pc.pc-dark .btn.secondary{ background: rgba(10, 132, 255, 0.18); }
.pc .diff{ margin: 0 16px 16px; border-radius: 12px; background: var(--card); overflow: hidden; }.pc .hunk-head{
  padding: 9px 14px;
  font: 11px ui-monospace, "SF Mono", monospace;
  color: var(--label-2);
  background: var(--fill-2);
  border-bottom: 0.5px solid var(--sep);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}.pc .hunk{ overflow-x: auto; padding: 6px 0; font: 12px/1.55 ui-monospace, "SF Mono", Menlo, monospace; scrollbar-width: none; }.pc .hunk::-webkit-scrollbar{ display: none; }.pc .line{ display: flex; gap: 8px; padding: 0 12px; white-space: pre; }.pc .line .ln{ flex: none; width: 22px; text-align: right; color: var(--label-3); font-size: 11px; padding-right: 4px; }.pc .line .lt{ flex: 1; min-width: 0; }.pc .line.add{ background: var(--diff-add-bg); }.pc .line.add .lt{ color: var(--diff-add-fg); }.pc .line.del{ background: var(--diff-del-bg); }.pc .line.del .lt{ color: var(--diff-del-fg); }.pc .line.gap{ justify-content: center; color: var(--label-3); font-size: 11px; padding: 5px 0; }.pc .diff-meta{ padding: 10px 14px; font-size: 12px; color: var(--label-2); border-bottom: 0.5px solid var(--sep); }.pc .empty{ padding: 28px 16px; text-align: center; font-size: 15px; color: var(--label-2); }.pc .preview{ margin: 0 16px 22px; border-radius: 16px; background: var(--card); overflow: hidden; }.pc .browser-bar{ display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 0.5px solid var(--sep); }.pc .dots{ width: 8px; height: 8px; border-radius: 50%; background: #ff5f57; box-shadow: 14px 0 0 #febc2e, 28px 0 0 #28c840; }.pc .url{ margin-left: 40px; font-size: 12px; color: var(--label-2); }.pc .mock{
  margin: 16px;
  min-height: 250px;
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 9px;
  background: var(--card-2);
  border: 0.5px solid var(--sep);
  transition: filter 0.2s ease;
}.pc .mock.before{ filter: saturate(0.35); }.pc .mock-avatar{ width: 52px; height: 52px; border-radius: 50%; background: linear-gradient(160deg, #5ac8fa, #007aff); }.pc .mock-title{ font-size: 17px; font-weight: 600; }.pc .mock.after .mock-title{ color: var(--green); }.pc .mock-sub{ font-size: 13px; color: var(--label-2); }.pc .mock-btn{ margin-top: 8px; padding: 9px 22px; border-radius: 10px; background: var(--blue); color: #fff; font-size: 15px; font-weight: 600; }.pc .mock.before .mock-btn{ background: var(--fill); color: var(--label-2); }.pc .mock-net{ margin-top: 4px; padding: 5px 10px; border-radius: 7px; font: 11px ui-monospace, monospace; }.pc .mock-net.ok{ color: var(--green); background: rgba(52, 199, 89, 0.12); }.pc .mock-net.bad{ color: var(--red); background: rgba(255, 59, 48, 0.1); }.pc .preview-foot{ padding: 0 0 14px; text-align: center; font-size: 12px; color: var(--label-3); }.pc .action-bar{
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(49px + max(env(safe-area-inset-bottom, 0px), var(--dsh-safe-bottom, 0px)));
  z-index: 9;
  display: none;
  align-items: center;
  gap: 14px;
  padding: 10px 16px;
  background: var(--tab);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  border-top: 0.5px solid var(--sep);
}.pc .action-bar[data-open="1"]{ display: flex; }.pc .action-bar .btn{ flex: 1; height: 50px; }.pc .action-bar .reject-link{ flex: none; color: var(--red); font-size: 17px; padding: 0 4px; }.pc .app[data-bar="1"] .screen{ padding-bottom: calc(134px + max(env(safe-area-inset-bottom, 0px), var(--dsh-safe-bottom, 0px))); }.pc .actions-hint{ height: 0; }.pc .tabbar{
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  height: calc(49px + max(env(safe-area-inset-bottom, 0px), var(--dsh-safe-bottom, 0px)));
  padding-bottom: max(env(safe-area-inset-bottom, 0px), var(--dsh-safe-bottom, 0px));
  background: var(--tab);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  border-top: 0.5px solid var(--sep);
}.pc .tab{ position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; color: var(--label-2); }.pc .tab svg{ width: 25px; height: 25px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }.pc .tab span{ font-size: 10px; letter-spacing: 0.01em; }.pc .tab.active{ color: var(--blue); }.pc .tab-dot{ position: absolute; top: 7px; right: calc(50% - 16px); width: 7px; height: 7px; border-radius: 50%; background: var(--red); }.pc .flat-layer{ position: absolute; inset: 0; z-index: 20; pointer-events: none; }.pc .modal{ position: absolute; inset: 0; pointer-events: auto; display: flex; flex-direction: column; justify-content: flex-end; }.pc .scrim{ position: absolute; inset: 0; background: var(--scrim); animation: pc-fade 0.2s ease; }.pc .sheet-wrap{ position: relative; z-index: 2; padding: 0 8px calc(8px + max(env(safe-area-inset-bottom, 0px), var(--dsh-safe-bottom, 0px))); }.pc .sheet{
  overflow: hidden;
  border-radius: 14px;
  background: var(--sheet);
  max-height: 72vh;
  overflow-y: auto;
  scrollbar-width: none;
  animation: pc-sheet-up 0.28s cubic-bezier(0.32, 0.72, 0, 1);
}@keyframes pc-sheet-up{ from { transform: translateY(24px); opacity: 0; } to { transform: none; opacity: 1; } }@keyframes pc-fade{ from { opacity: 0; } to { opacity: 1; } }.pc .sheet-head{ padding: 14px 16px 12px; text-align: center; border-bottom: 0.5px solid var(--sep); }.pc .sheet-title{ font-size: 15px; font-weight: 600; }.pc .sheet-sub{ margin-top: 3px; font-size: 13px; color: var(--label-2); word-break: break-all; }.pc .sheet-grabber{ width: 36px; height: 5px; border-radius: 3px; background: var(--label-3); margin: 8px auto 0; }.pc .sheet-section{ padding: 12px 16px 6px; font-size: 13px; color: var(--label-2); background: var(--fill-2); }.pc .sheet-item{
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 48px;
  padding: 10px 16px;
  text-align: left;
  color: var(--label);
  background: var(--sheet);
}.pc .sheet-item + .sheet-item::before{
  content: "";
  position: absolute;
  left: 16px;
  right: 0;
  top: 0;
  height: 0.5px;
  background: var(--sep);
}.pc .sheet-item:active{ background: var(--fill-2); }.pc .sheet-item .row-icon{ width: 24px; height: 24px; }.pc .sheet-item .row-icon svg{ width: 22px; height: 22px; }.pc .sheet-item-main{ flex: 1; min-width: 0; }.pc .sheet-item b{ display: block; font-size: 17px; font-weight: 400; letter-spacing: -0.01em; }.pc .sheet-item small{ display: block; margin-top: 1px; font-size: 12px; color: var(--label-2); }.pc .sheet-item.destructive, .pc .sheet-item.destructive .row-icon{ color: var(--red); }.pc .sheet-cancel{
  width: 100%;
  height: 56px;
  margin-top: 8px;
  border-radius: 14px;
  background: var(--sheet);
  color: var(--blue);
  font-size: 17px;
  font-weight: 600;
}.pc .sheet-cancel:active{ opacity: 0.7; }.pc .reject-body{ padding: 14px 16px 16px; background: var(--sheet); }.pc .reject-input{
  width: 100%;
  min-height: 74px;
  padding: 11px 12px;
  border-radius: 10px;
  background: var(--fill-2);
  font-size: 15px;
  resize: none;
  outline: none;
}.pc .reject-input:focus{ box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.18); }.pc .chips{ display: flex; gap: 8px; overflow-x: auto; padding: 12px 0 14px; scrollbar-width: none; }.pc .chips::-webkit-scrollbar{ display: none; }.pc .chip{ flex: none; padding: 7px 12px; border-radius: 99px; background: var(--fill); color: var(--label); font-size: 13px; }.pc .drawer-sheet{ max-height: 82vh; }.pc .raw{
  margin: 0 16px 16px;
  scrollbar-width: none;
  padding: 12px;
  border-radius: 12px;
  background: #1c1c1e;
  color: #e5e5ea;
  font: 11.5px/1.6 ui-monospace, "SF Mono", Menlo, monospace;
  max-height: 54vh;
  overflow: auto;
  color-scheme: dark;
}.pc .raw-line{ white-space: pre-wrap; word-break: break-word; }.pc .raw-line.err{ color: #ff9b95; }.pc .raw-line.add{ color: #7ee787; }.pc .raw-line.del{ color: #ff9b95; }.pc .raw-cmd{ color: #64d2ff; margin: 8px 0 2px; white-space: pre-wrap; }.pc .raw-cmd:first-child{ margin-top: 0; }.pc .raw-exit{ padding: 2px 0 4px; }.pc .raw-exit.ok{ color: #30d158; }.pc .raw-exit.bad{ color: #ff453a; }.pc .gs-code{ display: inline-block; width: 13px; color: #30d158; }.pc .gs-code.mod{ color: #ff9f0a; }.pc .patch-file + .patch-file{ margin-top: 16px; }.pc .sheet-seg{ padding: 12px 16px; background: var(--sheet); }.pc .toast-layer{
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(72px + max(env(safe-area-inset-bottom, 0px), var(--dsh-safe-bottom, 0px)));
  z-index: 30;
  display: flex;
  justify-content: center;
  pointer-events: none;
}.pc .toast{
  padding: 10px 18px;
  border-radius: 14px;
  background: rgba(0, 0, 0, 0.82);
  color: #fff;
  font-size: 14px;
  backdrop-filter: blur(10px);
  animation: pc-toast-in 0.22s ease;
}@keyframes pc-toast-in{ from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }.pc .toast.ok{ color: #7ee787; }.pc .toast.constrain{ color: #ffd60a; }.pc .toast.takeover{ color: #ff9b95; }.pc .hl{ animation: pc-hl 2s ease; }@keyframes pc-hl{ 0%, 55% { box-shadow: inset 0 0 0 2px rgba(0, 122, 255, 0.6); } 100% { box-shadow: inset 0 0 0 2px rgba(0, 122, 255, 0); } }.pc .mono{ font-family: ui-monospace, "SF Mono", Menlo, monospace; }.pc .muted{ color: var(--label-2); }.pc .small{ font-size: 13px; }.pc .pad{ height: 0; }

.pc{height:100%;min-height:0;overflow:hidden}
.pc .app{height:100%}
.pc-host{height:100%;min-height:0;display:flex}
.pc-host>.pc{flex:1;min-width:0}
`;var He="dsh-remote-panel/console";function Nt(){if(typeof document>"u"||document.querySelector(`style[data-plugin-css="${He}"]`)!==null)return;let t=document.createElement("style");t.dataset.plugin="dsh-remote-panel",t.dataset.pluginCss=He,t.textContent=Pe,document.head.appendChild(t)}function qt(t,e){return Nt(),Re(t,e)}

return module.exports;}});

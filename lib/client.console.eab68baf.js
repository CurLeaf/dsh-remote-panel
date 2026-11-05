window.__ModuleLoader__.load({id:"dsh-remote-panel",chunk:"client.console.eab68baf.js",factory(require){const module={exports:{}};const exports=module.exports;
var ce=Object.defineProperty;var _e=Object.getOwnPropertyDescriptor;var qe=Object.getOwnPropertyNames;var Oe=Object.prototype.hasOwnProperty;var Re=(n,e)=>{for(var a in e)ce(n,a,{get:e[a],enumerable:!0})},He=(n,e,a,i)=>{if(e&&typeof e=="object"||typeof e=="function")for(let r of qe(e))!Oe.call(n,r)&&r!==a&&ce(n,r,{get:()=>e[r],enumerable:!(i=_e(e,r))||i.enumerable});return n};var Pe=n=>He(ce({},"__esModule",{value:!0}),n);var vt={};Re(vt,{mountConsole:()=>xt,normalizeSession:()=>te,parseExit:()=>me,parseTests:()=>xe});module.exports=Pe(vt);var V=(n,e)=>({header:n,lines:e}),pe={task:{id:"task-auth-race",title:"\u4FEE\u590D\u767B\u5F55\u6001\u5076\u53D1\u5931\u6548",branch:"fix/auth-race",workdir:"~/WorkSpace/acme-web",intent:"\u767B\u5F55\u5076\u53D1\u5931\u6548\uFF1A\u6709\u65F6 401 \u4E4B\u540E\u4F1A\u88AB\u76F4\u63A5\u767B\u51FA\u3002\u5148\u67E5\u4E00\u4E0B\u539F\u56E0\uFF0C\u522B\u52A8\u751F\u4EA7\u914D\u7F6E\u3002",previewUrl:"http://127.0.0.1:4173/login",totalSteps:7},steps:[{id:"s1",index:1,title:"\u590D\u73B0\u767B\u5F55\u6001\u5931\u6548",expect:"\u80FD\u7A33\u5B9A\u590D\u73B0 401 \u540E\u4F1A\u8BDD\u88AB\u6E05\u7A7A"},{id:"s2",index:2,title:"\u5B9A\u4F4D\u7ADE\u6001\u70B9",expect:"\u627E\u5230 refresh \u4E0E logout \u7684\u4EA4\u53E0\u7A97\u53E3"},{id:"s3",index:3,title:"\u7B2C\u4E00\u6B21\u4FEE\u590D session \u6062\u590D",expect:"401 \u65F6\u5148\u5237\u65B0\uFF0C\u5237\u65B0\u5931\u8D25\u624D\u767B\u51FA"},{id:"s4",index:4,title:"\u8DD1\u8BA4\u8BC1\u6D4B\u8BD5",expect:"auth \u76F8\u5173\u7528\u4F8B\u5168\u7EFF"},{id:"s5",index:5,title:"\u6362\u65B9\u6848\uFF1A\u52A0\u9501",expect:"\u5E76\u53D1 refresh \u53EA\u53D1\u4E00\u6B21"},{id:"s6",index:6,title:"\u518D\u6B21\u91CD\u8BD5",expect:"\u540C\u4E00\u7528\u4F8B\u5E94\u5F53\u901A\u8FC7"},{id:"s7",index:7,title:"\u4FEE\u6389\u771F\u6B63\u7684\u7ADE\u6001",expect:"\u4F1A\u8BDD\u6062\u590D\u4E14\u4E0D\u4E71\u767B\u51FA"}],events:[{t:0,type:"step.start",step:"s1"},{t:2,type:"file.read",path:"src/auth/session.ts"},{t:4,type:"file.read",path:"src/auth/token.ts"},{t:6,type:"file.read",path:"package.json"},{t:9,type:"note",text:"\u5728 auth.spec.ts \u91CC\u627E\u5230\u300C401 \u540E\u7ACB\u5373\u767B\u51FA\u300D\u7684\u65AD\u8A00\uFF0C\u5148\u8DD1\u5230\u5931\u8D25\u3002"},{t:11,type:"cmd.start",id:"c1",cmd:"pnpm vitest run src/auth"},{t:12,type:"cmd.line",id:"c1",stream:"out",line:"RUN  v3.2.1  /home/yxw/WorkSpace/acme-web"},{t:13,type:"cmd.line",id:"c1",stream:"out",line:" \u276F src/auth/auth.spec.ts (6 tests | 2 failed) 412ms"},{t:14,type:"cmd.line",id:"c1",stream:"err",line:"   \xD7 refreshes the token on 401  18ms"},{t:15,type:"cmd.line",id:"c1",stream:"err",line:"   \xD7 keeps the session when refresh succeeds  9ms"},{t:19,type:"cmd.end",id:"c1",exit:1,dur:8},{t:20,type:"test.result",id:"c1",spec:"src/auth/auth.spec.ts",passed:4,failed:2,cases:[{name:"refreshes the token on 401",ok:!1,ms:18},{name:"keeps the session when refresh succeeds",ok:!1,ms:9},{name:"clears session on refresh failure",ok:!0,ms:6},{name:"logout clears cookies",ok:!0,ms:4}]},{t:22,type:"step.end",step:"s1",ok:!1},{t:26,type:"step.start",step:"s2"},{t:28,type:"file.read",path:"src/auth/store.ts"},{t:33,type:"note",text:"refresh \u662F\u5E76\u53D1\u7684\uFF1A\u4E24\u4E2A 401 \u540C\u65F6\u5230\u8FBE\u4F1A\u5404\u53D1\u4E00\u6B21 refresh\uFF0C\u540E\u5230\u7684\u628A\u5148\u5230\u7684 token \u8986\u76D6\u6210\u5931\u6548\u503C\u3002"},{t:36,type:"step.end",step:"s2",ok:!0},{t:40,type:"step.start",step:"s3"},{t:42,type:"file.edit",path:"src/auth/session.ts",attempt:1,add:18,del:4,hunk:V("@@ -12,7 +12,21 @@ export async function restoreSession(req: Request) {",[{type:"ctx",text:"  const token = readCookie(req, 'sid')"},{type:"ctx",text:"  if (!token) return null"},{type:"del",text:"  const session = await store.get(token)"},{type:"add",text:"  let session = await store.get(token)"},{type:"add",text:"  if (!session) {"},{type:"add",text:"    const refreshed = await refresh(token)"},{type:"add",text:"    session = refreshed ? await store.get(refreshed) : null"},{type:"add",text:"  }"},{type:"ctx",text:"  if (!session) return null"},{type:"ctx",text:"  return session"}])},{t:45,type:"file.edit",path:"src/auth/token.ts",attempt:1,add:6,del:2,hunk:V("@@ -3,6 +3,10 @@ export function readCookie(req: Request, name: string) {",[{type:"ctx",text:"  const raw = req.headers.cookie ?? ''"},{type:"del",text:"  return parse(raw)[name]"},{type:"add",text:"  const value = parse(raw)[name]"},{type:"add",text:"  if (value === 'undefined' || value === 'null') return null"},{type:"add",text:"  return value"}])},{t:47,type:"file.edit",path:"src/config/feature-flags.ts",attempt:1,add:3,del:1,hunk:V("@@ -8,4 +8,6 @@ export const flags = {",[{type:"ctx",text:"  newCheckout: false,"},{type:"del",text:"  refreshOn401: false,"},{type:"add",text:"  refreshOn401: true,"},{type:"add",text:"  refreshLock: false,"}])},{t:49,type:"step.end",step:"s3",ok:!0},{t:52,type:"step.start",step:"s4"},{t:54,type:"cmd.start",id:"c2",cmd:"pnpm vitest run src/auth"},{t:55,type:"cmd.line",id:"c2",stream:"out",line:"RUN  v3.2.1  /home/yxw/WorkSpace/acme-web"},{t:56,type:"cmd.line",id:"c2",stream:"out",line:" \u276F src/auth/auth.spec.ts (6 tests | 2 failed) 388ms"},{t:57,type:"cmd.line",id:"c2",stream:"err",line:"   \xD7 refreshes the token on 401  21ms"},{t:58,type:"cmd.line",id:"c2",stream:"err",line:"     \u2192 expected 200, received 401"},{t:59,type:"cmd.line",id:"c2",stream:"err",line:"   \xD7 keeps the session when refresh succeeds  11ms"},{t:63,type:"cmd.end",id:"c2",exit:1,dur:9},{t:64,type:"test.result",id:"c2",spec:"src/auth/auth.spec.ts",passed:4,failed:2,cases:[{name:"refreshes the token on 401",ok:!1,ms:21},{name:"keeps the session when refresh succeeds",ok:!1,ms:11}]},{t:66,type:"step.end",step:"s4",ok:!1},{t:70,type:"step.start",step:"s5"},{t:72,type:"note",text:"\u5E76\u53D1 refresh \u9700\u8981\u4E32\u884C\u5316\u3002\u52A0\u4E00\u4E2A\u6309 token \u7684\u4E92\u65A5\u3002"},{t:75,type:"file.edit",path:"src/auth/session.ts",attempt:2,add:9,del:3,hunk:V("@@ -12,10 +12,16 @@ export async function restoreSession(req: Request) {",[{type:"ctx",text:"  let session = await store.get(token)"},{type:"del",text:"  if (!session) {"},{type:"del",text:"    const refreshed = await refresh(token)"},{type:"add",text:"  if (!session) {"},{type:"add",text:"    const refreshed = await withLock(`refresh:${token}`, async () => {"},{type:"add",text:"      const again = await store.get(token)"},{type:"add",text:"      if (again) return token"},{type:"add",text:"      return (await refresh(token)) ?? null"},{type:"add",text:"    })"},{type:"ctx",text:"    session = refreshed ? await store.get(refreshed) : null"},{type:"ctx",text:"  }"}])},{t:79,type:"step.end",step:"s5",ok:!0},{t:82,type:"step.start",step:"s6"},{t:84,type:"cmd.start",id:"c3",cmd:"pnpm vitest run src/auth"},{t:85,type:"cmd.line",id:"c3",stream:"out",line:"RUN  v3.2.1  /home/yxw/WorkSpace/acme-web"},{t:86,type:"cmd.line",id:"c3",stream:"err",line:"   \xD7 refreshes the token on 401  24ms"},{t:87,type:"cmd.line",id:"c3",stream:"err",line:"     \u2192 expected 200, received 401"},{t:91,type:"cmd.end",id:"c3",exit:1,dur:9},{t:92,type:"test.result",id:"c3",spec:"src/auth/auth.spec.ts",passed:5,failed:1,cases:[{name:"refreshes the token on 401",ok:!1,ms:24},{name:"keeps the session when refresh succeeds",ok:!0,ms:8}]},{t:96,type:"file.read",path:"src/auth/session.ts"},{t:140,type:"file.read",path:"src/auth/session.ts"},{t:188,type:"file.read",path:"src/auth/session.ts"},{t:236,type:"file.read",path:"src/auth/store.ts"},{t:300,type:"file.read",path:"src/auth/session.ts"},{t:340,type:"note",text:"\u9501\u53EA\u9632\u4F4F\u4E86\u540C\u4E00\u8FDB\u7A0B\uFF1B\u6D4B\u8BD5\u91CC\u4E24\u4E2A\u8BF7\u6C42\u8D70\u4E0D\u540C\u7684 worker\uFF0C\u9501\u6CA1\u751F\u6548\u3002"},{t:360,type:"step.end",step:"s6",ok:!1},{t:364,type:"step.start",step:"s7"},{t:366,type:"note",text:"\u628A refresh \u7684\u53BB\u91CD\u4ECE\u8FDB\u7A0B\u5185\u9501\u6362\u6210 store \u5C42\u7684\u6761\u4EF6\u5199\u3002"},{t:370,type:"file.edit",path:"src/auth/session.ts",attempt:3,add:12,del:7,hunk:V("@@ -12,16 +12,21 @@ export async function restoreSession(req: Request) {",[{type:"del",text:"    const refreshed = await withLock(`refresh:${token}`, async () => {"},{type:"del",text:"      const again = await store.get(token)"},{type:"del",text:"      if (again) return token"},{type:"del",text:"      return (await refresh(token)) ?? null"},{type:"del",text:"    })"},{type:"add",text:"    const refreshed = await store.compareAndSwap(token, async (current) => {"},{type:"add",text:"      if (current) return current.value"},{type:"add",text:"      const next = await refresh(token)"},{type:"add",text:"      return next ?? null"},{type:"add",text:"    })"},{type:"ctx",text:"    session = refreshed ? await store.get(refreshed) : null"}])},{t:374,type:"file.edit",path:"src/auth/store.ts",attempt:1,add:14,del:2,hunk:V("@@ -21,8 +21,20 @@ export class SessionStore {",[{type:"ctx",text:"  async get(token: string) {"},{type:"del",text:"    return this.rows.get(token) ?? null"},{type:"add",text:"    return this.rows.get(token) ?? null"},{type:"add",text:"  }"},{type:"add",text:""},{type:"add",text:"  async compareAndSwap(token: string, next: (cur: Row | null) => Promise<string | null>) {"},{type:"add",text:"    const cur = this.rows.get(token) ?? null"},{type:"add",text:"    const value = await next(cur)"},{type:"add",text:"    if (value) this.rows.set(token, { value, at: Date.now() })"},{type:"add",text:"    return value"}])},{t:380,type:"cmd.start",id:"c4",cmd:"pnpm vitest run src/auth"},{t:381,type:"cmd.line",id:"c4",stream:"out",line:"RUN  v3.2.1  /home/yxw/WorkSpace/acme-web"},{t:382,type:"cmd.line",id:"c4",stream:"out",line:" \u2713 src/auth/auth.spec.ts (6 tests) 392ms"},{t:384,type:"cmd.line",id:"c4",stream:"out",line:"Test Files  1 passed (1)"},{t:385,type:"cmd.line",id:"c4",stream:"out",line:"     Tests  6 passed (6)"},{t:389,type:"cmd.end",id:"c4",exit:0,dur:9},{t:390,type:"test.result",id:"c4",spec:"src/auth/auth.spec.ts",passed:6,failed:0,cases:[{name:"refreshes the token on 401",ok:!0,ms:19},{name:"keeps the session when refresh succeeds",ok:!0,ms:7},{name:"clears session on refresh failure",ok:!0,ms:5},{name:"logout clears cookies",ok:!0,ms:4}]},{t:396,type:"cmd.start",id:"c5",cmd:"pnpm exec tsc --noEmit"},{t:402,type:"cmd.end",id:"c5",exit:0,dur:6},{t:406,type:"step.end",step:"s7",ok:!0},{t:410,type:"artifact",title:"\u767B\u5F55\u6001\u6062\u590D\u4FEE\u590D",files:5,add:62,del:19}]};function de(n,e){let a=n.length,i=e.length,r=Array.from({length:a+1},()=>new Int32Array(i+1));for(let l=a-1;l>=0;l--)for(let k=i-1;k>=0;k--)r[l][k]=n[l]===e[k]?r[l+1][k+1]+1:Math.max(r[l+1][k],r[l][k+1]);let o=[],d=0,c=0;for(;d<a&&c<i;)n[d]===e[c]?(o.push({type:"ctx",text:n[d]}),d++,c++):r[d+1][c]>=r[d][c+1]?(o.push({type:"del",text:n[d]}),d++):(o.push({type:"add",text:e[c]}),c++);for(;d<a;)o.push({type:"del",text:n[d++]});for(;c<i;)o.push({type:"add",text:e[c++]});return o}function ue(n){let e=0,a=0;for(let i of n)i.type==="add"?e++:i.type==="del"&&a++;return{add:e,del:a}}var we=180,De=3,Be=3,Ue=3,Ve=2;function W(n){if(!Number.isFinite(n)||n<0)return"\u2014";if(n<60)return`${Math.round(n)} \u79D2`;let e=Math.floor(n/60),a=Math.round(n%60);return a?`${e} \u5206 ${a} \u79D2`:`${e} \u5206\u949F`}function $e(n,e,a,i=[],r={}){let o=i.filter(t=>!t.undone),d=e.filter(t=>t.t<=a),c=n.steps.map(t=>({...t,status:"pending",startT:null,endT:null,ok:null})),l=new Map(c.map(t=>[t.id,t])),k=new Map,y=new Map,T=new Map,M=[],C=[],h=null,m=null,I=null,$=new Set(o.filter(t=>t.kind==="ignore-file").map(t=>t.target)),j=new Set(o.filter(t=>t.kind==="block-cmd").map(t=>t.target)),A=new Set(o.filter(t=>t.kind==="sensitive-file").map(t=>t.target)),g=new Set(o.filter(t=>t.kind==="revert-file").map(t=>t.target)),u=new Set(o.filter(t=>t.kind==="kill-cmd").map(t=>t.target)),S=new Set(o.filter(t=>t.kind==="reject-hunk").map(t=>t.target)),f=new Set(o.filter(t=>t.kind==="skip-step").map(t=>t.target)),x=new Set(o.filter(t=>t.kind==="skip-test").map(t=>t.target)),s=o.find(t=>t.kind==="fix-only")?.target??null,v=o.some(t=>t.kind==="request-proof"),b=r.takeover===!0,L=t=>{I=t};for(let t of d)switch(t.type){case"step.start":{let p=l.get(t.step);p&&(p.status="running",p.startT=t.t),L(t),M.push({t:t.t,kind:"step",text:`\u5F00\u59CB\u7B2C ${p?.index??"?"} \u6B65 \xB7 ${p?.title??""}`,anchor:`step-${t.step}`,target:{kind:"step",id:t.step}});break}case"step.end":{let p=l.get(t.step);p&&(p.status=t.ok?"done":"failed",p.ok=t.ok,p.endT=t.t),L(t);break}case"file.read":{let p=ye(k,t.path);p.reads++,p.lastT=t.t,p.lastKind="read",L(t),M.push({t:t.t,kind:"read",text:`\u8BFB\u53D6 ${G(t.path)}`,anchor:`file-${Z(t.path)}`,target:{kind:"file",id:t.path}});break}case"file.edit":{let p=ye(k,t.path);p.attempts.push({n:t.attempt,add:t.add,del:t.del,hunk:t.hunk,t:t.t}),p.add+=t.add,p.del+=t.del,p.lastT=t.t,p.lastKind="edit",L(t),M.push({t:t.t,kind:"edit",text:`\u7F16\u8F91 ${G(t.path)} +${t.add} \u2212${t.del}`,anchor:`file-${Z(t.path)}`,target:{kind:"file",id:t.path}});break}case"cmd.start":{let p=j.has(t.cmd);y.set(t.id,{id:t.id,cmd:t.cmd,startT:t.t,endT:null,exit:null,lines:[],status:p?"blocked":"running"}),L(t),p||M.push({t:t.t,kind:"cmd",text:`\u8FD0\u884C ${t.cmd}`,anchor:`cmd-${t.id}`,target:{kind:"command",id:t.id}});break}case"cmd.line":{let p=y.get(t.id);p&&p.status!=="blocked"&&(p.lines.push({stream:t.stream,line:t.line}),L(t));break}case"cmd.end":{let p=y.get(t.id);p&&(p.endT=t.t,p.exit=t.exit,p.dur=t.dur,p.status!=="blocked"&&(p.status=t.exit===0?"ok":"fail")),L(t),M.push({t:t.t,kind:"exit",text:`${fe(y.get(t.id)?.cmd??"\u547D\u4EE4")} \u7ED3\u675F \xB7 exit ${t.exit}`,anchor:`cmd-${t.id}`,target:{kind:"command",id:t.id}});break}case"test.result":h={...t,t:t.t,cases:t.cases??[]},L(t),M.push({t:t.t,kind:"test",text:`\u6D4B\u8BD5 ${t.passed} \u901A\u8FC7 / ${t.failed} \u5931\u8D25`,anchor:"test-result"});break;case"note":C.push({t:t.t,text:t.text}),L(t),M.push({t:t.t,kind:"note",text:t.text,anchor:"notes"});break;case"artifact":m={...t,t:t.t},L(t),M.push({t:t.t,kind:"artifact",text:"\u4EA7\u51FA\u53EF\u9A8C\u6536\u7ED3\u679C",anchor:"artifact"});break;case"tool.start":{let p={id:t.id,name:t.name,summary:t.summary,t:t.t,endT:null,ok:null,dur:null,text:""};T.set(t.id,p),M.push({t:t.t,kind:"tool",text:`${t.name} \xB7 ${t.summary} \xB7 \u8FD0\u884C\u4E2D`,anchor:`tool-${t.id}`}),L(t);break}case"tool.end":{let p=T.get(t.id)??{id:t.id,name:t.name,summary:"",t:t.t,endT:null,ok:null,dur:null,text:""};p.endT=t.t,p.ok=t.ok,p.dur=t.dur??Math.max(0,t.t-p.t),p.text=t.text??"",T.set(t.id,p);let U=(p.text||"").split(`
`).map(P=>P.trim()).filter(Boolean)[0]??"";M.push({t:t.t,kind:"tool",text:`${t.name} \xB7 ${p.summary||""} \xB7 ${p.ok?"":"\u5931\u8D25 "}${W(p.dur)}${U?` \xB7 ${U.slice(0,60)}`:""}`.replace(" \xB7  \xB7 "," \xB7 "),anchor:`tool-${t.id}`}),L(t);break}default:break}for(let t of y.values())j.has(t.cmd)&&(t.status="blocked"),u.has(t.id)&&(t.status="killed");let D=[...k.values()].map(t=>{let p="read";t.attempts.length&&(p=t.lastKind==="edit"&&!We(t.lastT,a,c)?"editing":"done"),t.attempts.length===0&&(p="read"),g.has(t.path)&&(p="done");let U=t.attempts[t.attempts.length-1];return{...t,status:p,sensitive:A.has(t.path),ignored:$.has(t.path),reverted:g.has(t.path),rejectedCount:t.attempts.filter(P=>S.has(`${t.path}#${P.n}`)).length,lastAttempt:U}}).sort((t,p)=>(p.lastT??0)-(t.lastT??0)),q=D.filter(t=>!t.ignored),N=q.filter(t=>!t.reverted),O={files:N.filter(t=>t.attempts.length).length,add:N.reduce((t,p)=>t+p.add,0),del:N.reduce((t,p)=>t+p.del,0),sensitive:N.filter(t=>t.sensitive).length,reads:q.reduce((t,p)=>t+p.reads,0),reverted:q.filter(t=>t.reverted).length},R=[...c].reverse().find(t=>t.status==="running")??[...c].reverse().find(t=>t.status!=="pending")??null;for(let t of c){f.has(t.id)&&t.status!=="done"&&(t.skipped=!0);let p=t.startT??1/0,U=t.endT??a,P=d.filter(E=>E.t>=p&&E.t<=U),se=P.filter(E=>E.type==="file.edit"),re=P.filter(E=>E.type==="cmd.end"),oe=[...P].reverse().find(E=>E.type==="test.result");t.facts={files:new Set(se.map(E=>E.path)).size,add:se.reduce((E,le)=>E+le.add,0),del:se.reduce((E,le)=>E+le.del,0),exit:re.length?re[re.length-1].exit:null,tests:oe?{passed:oe.passed,failed:oe.failed}:null},t.facts.calls=P.filter(E=>E.type==="tool.start").length+P.filter(E=>E.type==="cmd.start").length,t.elapsed=t.startT===null?0:Math.max(0,(t.endT??a)-t.startT),t.stale=t.status==="running"&&t.elapsed>we,t.calls=Ke(P)}let B=!!m,H=[],be=[...d].reverse().find(t=>t.type!=="file.read")?.t??0,K=Math.max(0,a-be),ae=0,X=0,ie=0,Y=0;for(let t of y.values())t.exit==null||t.status==="blocked"||(t.exit===0?ae=0:(ae++,X=Math.max(X,ae)));for(let t of d)t.type==="test.result"&&(t.failed>0?(ie++,Y=Math.max(Y,ie)):ie=0);if(!B){K>=we&&H.push({kind:"silence",level:"warn",text:`\u5DF2 ${W(K)}\u6CA1\u6709\u65B0\u8FDB\u5C55`,anchor:R?`step-${R.id}`:"activity"}),X>=Be&&H.push({kind:"repeat-cmd",level:"warn",text:`\u540C\u4E00\u547D\u4EE4\u8FDE\u7EED\u5931\u8D25 ${X} \u6B21\uFF1A${[...y.values()].find(t=>t.status==="fail")?.cmd??""}`,anchor:R?`step-${R.id}`:"activity"});for(let t of q)t.attempts.length>=Ue&&H.push({kind:"churn-file",level:"warn",text:`${G(t.path)} \u5DF2\u6539 ${t.attempts.length} \u7248`,anchor:`file-${Z(t.path)}`}),t.reads>=De&&!t.attempts.length&&H.push({kind:"churn-read",level:"warn",text:`${G(t.path)} \u5DF2\u88AB\u91CD\u8BFB ${t.reads} \u6B21`,anchor:`file-${Z(t.path)}`});Y>=Ve&&H.push({kind:"repeat-fail",level:"warn",text:`\u540C\u4E00\u7528\u4F8B\u8FDE\u7EED\u5931\u8D25 ${Y} \u6B21\uFF1A${h?.cases.find(t=>!t.ok)?.name??""}`,anchor:R?`step-${R.id}`:"activity"})}let ke=[...y.values()].find(t=>t.status==="running"&&!b),Ee=b?"\u5DF2\u63A5\u7BA1 \xB7 agent \u5DF2\u6682\u505C":B?"\u5DF2\u5B8C\u6210 \xB7 \u7B49\u5F85\u9A8C\u6536":ke?`\u8FD0\u884C ${ke.cmd}`:q.find(t=>t.status==="editing")?`\u7F16\u8F91 ${G(q.find(t=>t.status==="editing").path)}`:R?`\u7B2C ${R.index}/${n.steps.length} \u6B65 \xB7 ${R.title}`:"\u7B49\u5F85\u5F00\u59CB",Fe=`${O.files} \u4E2A\u6587\u4EF6 +${O.add} \u2212${O.del}${O.sensitive?` \xB7 ${O.sensitive} \u4E2A\u654F\u611F\u6587\u4EF6`:""}`,J=H[0],Ne=B?`\u5DF2\u5B8C\u6210 \xB7 ${h?h.passed:0} \u7528\u4F8B\u901A\u8FC7`:J?J.kind==="silence"?`\u505C\u6EDE ${W(K)}`:J.kind==="repeat-cmd"?`\u8FDE\u7EED\u5931\u8D25 ${X} \u6B21`:J.kind==="repeat-fail"?`\u540C\u4E00\u7528\u4F8B\u5931\u8D25 ${Y} \u6B21`:J.kind==="churn-read"?"\u53CD\u590D\u91CD\u8BFB\u540C\u4E00\u6587\u4EF6":"\u53CD\u590D\u4FEE\u6539\u540C\u4E00\u6587\u4EF6":`\u63A8\u8FDB\u6B63\u5E38 \xB7 \u8DDD\u4E0A\u6B21\u8FDB\u5C55 ${W(K)}`;return{t:a,task:n.task,steps:c,current:R,files:D,totals:O,commands:[...y.values()],tests:h,activity:M.slice(-60),notes:C,artifact:m?{...m,files:O.files,add:O.add,del:O.del}:null,signals:H,takeover:b,focus:s,skippedCases:x,proofRequested:v,interventions:i.map(t=>({...t})),now:{doing:Ee,scope:Fe,momentum:Ne,level:H.some(t=>t.level==="warn")?"warn":"ok",silence:K},lastEventT:be}}function ye(n,e){return n.has(e)||n.set(e,{path:e,reads:0,attempts:[],add:0,del:0,lastT:0,lastKind:"read"}),n.get(e)}function We(n,e,a){let i=a.find(r=>r.status==="running");return i?n<i.startT:!0}function G(n){let e=n.split("/");return e.length>2?"\u2026/"+e.slice(-2).join("/"):n}function fe(n){return n.length>26?n.slice(0,24)+"\u2026":n}function Z(n){return n.replace(/[^a-zA-Z0-9]+/g,"-")}function Se(n){let e=n.attempts[n.attempts.length-1];return e?e.hunk:null}function Ke(n){let e=[],a=new Map,i=r=>(e.push(r),r.id&&a.set(r.id,r),r);for(let r of n)if(r.type==="tool.start")i({id:r.id,t:r.t,name:r.name,summary:r.summary,dur:null,ok:null,text:""});else if(r.type==="tool.end"){let o=a.get(r.id);o&&(o.dur=r.dur??Math.max(0,r.t-o.t),o.ok=r.ok,o.text=r.text??"")}else if(r.type==="cmd.start")i({id:r.id,t:r.t,name:"bash",summary:r.cmd,dur:null,ok:null,text:""});else if(r.type==="cmd.end"){let o=a.get(r.id);o&&(o.dur=r.dur??Math.max(0,r.t-o.t),o.ok=r.exit===0,o.text=`exit ${r.exit}`)}else r.type==="file.edit"?i({id:`${r.path}#${r.attempt??0}`,t:r.t,name:"edit",summary:r.path,dur:null,ok:!0,text:`+${r.add} \u2212${r.del}`}):r.type==="file.read"&&i({id:`read-${r.path}-${r.t}`,t:r.t,name:"read",summary:r.path,dur:null,ok:!0,text:""});return e.sort((r,o)=>r.t-o.t)}var Xe=0,Me=n=>`${n}-${++Xe}`,Q=class{constructor(){this.scenario=pe,this.events=pe.events,this.duration=Math.max(...this.events.map(e=>e.t))+6,this.listeners=new Set,this.ui={t:300,playing:!1,speed:20,view:"now",detail:null,openStep:null,interventions:[],takeover:!1,toast:null,highlight:null,sheet:null,drawer:null,acceptance:{status:"pending",reason:"",excluded:new Set,at:null},scroll:new Map},this.ui.openStepManual=!1,this.lastFrame=null,this.raf=null,this.live=!1,this.following=!0,this.overview=null,this.currentSessionId=null,this.approvals=[],this.watching=[],this.watchInFlight=0}setLive(e){if(e){if(e.overview&&(this.overview=e.overview),typeof e.currentId=="string"&&(this.currentSessionId=e.currentId),!e.scenario){this.emit();return}this.live=!0,this.scenario=e.scenario,this.events=e.events,this.duration=Math.max(1,e.scenario.duration??0),this.following&&(this.ui.t=this.duration),this.emit()}}subscribe(e){return this.listeners.add(e),()=>this.listeners.delete(e)}emit(){let e=this.derive();this.ui.openStepManual||(this.ui.openStep=(e.current??e.steps[0])?.id??null);for(let a of this.listeners)a(e,this.ui)}derive(){return $e(this.scenario,this.events,this.ui.t,this.ui.interventions,{takeover:this.ui.takeover})}stop(){this.raf!==null&&cancelAnimationFrame(this.raf),this.raf=null}start(){let e=a=>{this.lastFrame==null&&(this.lastFrame=a);let i=Math.min(.25,(a-this.lastFrame)/1e3);this.lastFrame=a,this.ui.playing&&!this.ui.sheet&&this.advance(i*this.ui.speed),this.emit(),this.raf=requestAnimationFrame(e)};this.raf=requestAnimationFrame(e)}advance(e){let a=Math.min(this.duration,this.ui.t+e);a>=this.duration&&(this.ui.playing=!1),this.ui.t=a}seek(e){this.ui.t=Math.max(0,Math.min(this.duration,e)),this.ui.openStepManual=!1,this.live?this.following=this.ui.t>=this.duration-.5:this.ui.t<this.duration&&(this.ui.playing=!1)}togglePlay(){if(this.live){this.following=!0,this.ui.t=this.duration,this.ui.playing=!1;return}this.ui.t>=this.duration&&(this.ui.t=0),this.ui.playing=!this.ui.playing}go(e,a=null){this.ui.view=e,this.ui.detail=null,this.ui.sheet=null,a&&this.highlight(a)}openDetail(e,a){this.ui.detail={kind:e,id:a},this.ui.sheet=null,this.ui.drawer=null}back(){this.ui.detail=null}toggleStep(e){this.ui.openStepManual=!0,this.ui.openStep=this.ui.openStep===e?null:e}highlight(e){this.ui.highlight=e,clearTimeout(this._hl),this._hl=setTimeout(()=>{this.ui.highlight=null,this.emit()},2200)}openSheet(e){this.ui.sheet=e}closeSheet(){this.ui.sheet=null}openDrawer(e="term"){this.ui.drawer=e}closeDrawer(){this.ui.drawer=null}setDrawerTab(e){this.ui.drawer=e}toast(e,a="info"){this.ui.toast={text:e,kind:a,id:Me("toast")};let i=this.ui.toast.id;clearTimeout(this._toast),this._toast=setTimeout(()=>{this.ui.toast?.id===i&&(this.ui.toast=null,this.emit())},2400)}intervene({tier:e,kind:a,target:i,sub:r="",label:o}){let d={id:Me("iv"),tier:e,kind:a,target:i,sub:r,label:o,at:this.ui.t,undone:!1};if(this.ui.interventions.push(d),a==="takeover"&&(this.ui.takeover=!0,this.ui.playing=!1),a==="rerun-step"){let c=this.derive().steps.find(l=>l.id===i);c?.startT!=null&&(this.ui.openStep=c.id,this.seek(c.startT),this.ui.playing=!0)}this.ui.sheet=null,this.toast(`${Ye[e]}\uFF1A${o}`,e)}releaseTakeover(){this.ui.takeover=!1,this.ui.playing=!0,this.toast("\u5DF2\u91CA\u653E\u63A7\u5236\u6743\uFF0Cagent \u7EE7\u7EED","constrain")}toggleExclude(e){let a=this.ui.acceptance.excluded;a.has(e)?a.delete(e):a.add(e)}acceptedFiles(e){let a=this.ui.acceptance.excluded;return e.files.filter(i=>i.attempts.length&&!i.reverted&&!i.ignored&&!a.has(i.path))}accept(e){let a=this.acceptedFiles(e);this.ui.acceptance={status:"accepted",reason:"",excluded:this.ui.acceptance.excluded,at:this.ui.t},this.toast(`\u5DF2\u63A5\u53D7 ${a.length} \u4E2A\u6587\u4EF6`,"ok")}reject(e){this.ui.acceptance={status:"rejected",reason:e,excluded:this.ui.acceptance.excluded,at:this.ui.t},this.toast("\u5DF2\u6253\u56DE\uFF0C\u7406\u7531\u5DF2\u9644\u7ED9 agent","takeover")}resetAcceptance(){this.ui.acceptance={status:"pending",reason:"",excluded:new Set,at:null}}scrollKey(){let e=this.ui.detail;return[this.ui.view,e?`${e.kind}:${e.id}`:""].join("/")}},Ye={mark:"\u5DF2\u6807\u8BB0",constrain:"\u5DF2\u7EA6\u675F",takeover:"\u5DF2\u63A5\u7BA1"};var w=n=>String(n).replace(/[&<>"']/g,e=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[e]),Te=n=>String(n).split("/").pop(),Je=n=>String(n).split("/").slice(0,-1).join("/")||".",_=n=>Ge[n]??"",z=n=>`<svg viewBox="0 0 24 24" aria-hidden="true">${n}</svg>`,Ge={wave:z('<path d="M2.6 12h3.1l1.7-4.1 2.9 8.2 1.9-4.8 1.3 2.7h8"/>'),gauge:z('<path d="M4.7 17.8a8.5 8.5 0 1 1 14.6 0"/><path d="M12 17.8l3.7-5.4"/><circle cx="12" cy="17.8" r="1.15" fill="currentColor" stroke="none"/>'),doc:z('<path d="M7 3.5h6.6L18 8v12.5H7z"/><path d="M13.4 3.6V8H18"/><path d="M9.4 12.4h5.4M9.4 15.8h3.8"/>'),check:z('<circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.6 2.6 5.4-5.6"/>'),play:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.4v13.2L19 12z" fill="currentColor"/></svg>',pause:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="5" width="3.6" height="14" rx="1.2" fill="currentColor"/><rect x="13.4" y="5" width="3.6" height="14" rx="1.2" fill="currentColor"/></svg>',hand:z('<path d="M9 11.2V5.6a1.5 1.5 0 0 1 3 0v5.6m0-1V4.7a1.5 1.5 0 0 1 3 0v6.9m0-2.1V6.7a1.5 1.5 0 0 1 3 0v6.8a5.6 5.6 0 0 1-5.6 5.6h-.8a5.2 5.2 0 0 1-4.1-2l-1.9-2.5a1.5 1.5 0 0 1 2.3-1.9L9 14"/>'),more:z('<circle cx="5.4" cy="12" r="1.75" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.75" fill="currentColor" stroke="none"/><circle cx="18.6" cy="12" r="1.75" fill="currentColor" stroke="none"/>'),chevron:z('<path d="M9.5 4.5L17 12l-7.5 7.5"/>'),back:z('<path d="M14.5 4.5L7 12l7.5 7.5"/>'),warn:z('<path d="M12 3.6l9.2 16.4H2.8z"/><path d="M12 9.6v4.2M12 17.2v.2"/>'),terminal:z('<rect x="3" y="4.8" width="18" height="14.4" rx="2.6"/><path d="M7 10.2l3 2-3 2M13 14.4h4"/>'),image:z('<rect x="3.5" y="5" width="17" height="14" rx="2.6"/><circle cx="9" cy="10" r="1.6"/><path d="M4.5 16.6l4.4-4 3.4 2.8 3-2.4 4.2 3.6"/>'),undo:z('<path d="M4 9.5h9.4a5.2 5.2 0 1 1 0 10.4H9.2"/><path d="M7.8 5.3L4 9.5l3.8 4.2"/>'),eyeOff:z('<path d="M3.5 12s3.2-5.4 8.5-5.4S20.5 12 20.5 12s-3.2 5.4-8.5 5.4S3.5 12 3.5 12z"/><path d="M4.5 4.5l15 15"/>'),flag:z('<path d="M6 21V4h11.2l-2.6 4 2.6 4H6"/>'),stop:z('<circle cx="12" cy="12" r="8.6"/><rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" stroke="none"/>'),no:z('<circle cx="12" cy="12" r="8.6"/><path d="M6.4 6.4l11.2 11.2"/>'),skip:z('<path d="M6 5.4l7.4 6.6L6 18.6z"/><path d="M17 5v14"/>'),rerun:z('<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4.5V10h-5.4"/>'),bookmark:z('<path d="M7 3.5h10v17l-5-3.6-5 3.6z"/>'),list:z('<path d="M4.5 7h15M4.5 12h15M4.5 17h10"/>')},he={file:()=>[{tier:"mark",kind:"mark-file",label:"\u7A0D\u540E\u56DE\u770B",hint:"\u53EA\u8BB0\u5F55\uFF0C\u4E0D\u6539\u53D8\u6267\u884C",icon:"bookmark"},{tier:"constrain",kind:"revert-file",label:"\u56DE\u6EDA\u6B64\u6587\u4EF6",hint:"\u64A4\u9500\u6539\u52A8\uFF0C\u6062\u590D\u539F\u6837",icon:"undo"},{tier:"constrain",kind:"ignore-file",label:"\u5FFD\u7565\u6B64\u6587\u4EF6",hint:"\u540E\u7EED\u4E0D\u518D\u6539\u5B83",icon:"eyeOff"},{tier:"constrain",kind:"sensitive-file",label:"\u6807\u8BB0\u4E3A\u654F\u611F",hint:"\u6539\u52A8\u5C06\u8FDB\u5165\u9A8C\u6536\u5FC5\u770B",icon:"flag"},{tier:"takeover",kind:"takeover",label:"\u63A5\u7BA1",hint:"\u505C\u6389 agent\uFF0C\u6211\u6765\u5904\u7406",icon:"hand"}],command:n=>[{tier:"mark",kind:"mark-cmd",label:"\u8BB0\u5F55\u8FD9\u6761\u547D\u4EE4",hint:"\u5199\u8FDB\u672C\u6B21\u4F1A\u8BDD",icon:"bookmark"},...n.status==="running"?[{tier:"constrain",kind:"kill-cmd",label:"\u7EC8\u6B62\u672C\u6B21",hint:"\u5411 worker \u53D1 SIGINT",icon:"stop"}]:[],{tier:"constrain",kind:"block-cmd",label:"\u7981\u6B62\u518D\u8DD1",hint:`\u540E\u7EED\u62D2\u7EDD\u6267\u884C\u300C${n.cmd}\u300D`,icon:"no"},{tier:"takeover",kind:"takeover",label:"\u63A5\u7BA1",hint:"\u505C\u6389 agent\uFF0C\u6211\u6765\u5904\u7406",icon:"hand"}],step:()=>[{tier:"mark",kind:"mark-step",label:"\u6807\u8BB0\u6B64\u6B65",hint:"\u53EA\u8BB0\u5F55",icon:"bookmark"},{tier:"constrain",kind:"skip-step",label:"\u8DF3\u8FC7\u6B64\u6B65",hint:"\u540E\u7EED\u4E0D\u518D\u6267\u884C\u5B83",icon:"skip"},{tier:"constrain",kind:"rerun-step",label:"\u91CD\u8DD1\u6B64\u6B65",hint:"\u8BA9 agent \u91CD\u6765\u4E00\u6B21",icon:"rerun"},{tier:"takeover",kind:"takeover",label:"\u63A5\u7BA1",hint:"\u505C\u6389 agent\uFF0C\u6211\u6765\u5904\u7406",icon:"hand"}]},Ze={mark:"\u6807\u8BB0",constrain:"\u7EA6\u675F",takeover:"\u63A5\u7BA1"},F={diffMode:"current",previewSide:"after",sig:"",key:"",flatSig:"",toastId:"",suppressClick:!1};function je(n,e,a={}){n.classList.add("pc");let i=()=>{n.classList.toggle("pc-dark",document.body?.hasAttribute("data-ds-dark-theme")===!0)};i();let r=typeof MutationObserver>"u"?null:new MutationObserver(i);r?.observe(document.body,{attributes:!0,attributeFilter:["data-ds-dark-theme"]}),n.innerHTML=`
    <div class="app">
      <header class="navbar" id="navbar"></header>
      <main class="screen" id="screen"></main>
      <div class="action-bar" id="actionBar"></div>
      <div class="flat-layer" id="flatLayer"></div>
      <div class="toast-layer" id="toastLayer"></div>
    </div>`;let o={nav:n.querySelector("#navbar"),screen:n.querySelector("#screen"),bar:n.querySelector("#actionBar"),flat:n.querySelector("#flatLayer"),toast:n.querySelector("#toastLayer"),app:n.querySelector(".app")},d=()=>{let h=matchMedia("(prefers-color-scheme: dark)").matches,m=document.querySelector('meta[name="theme-color"]');m||(m=document.createElement("meta"),m.name="theme-color",document.head.appendChild(m)),m.content=h?"#000000":"#f2f2f7"};d(),matchMedia("(prefers-color-scheme: dark)").addEventListener("change",d),o.screen.addEventListener("scroll",()=>{o.app.dataset.scrolled=o.screen.scrollTop>34?"1":"0"},{passive:!0});let c=null,l=null,k=0,y=0;o.screen.addEventListener("pointerdown",h=>{let m=h.target.closest("[data-long]");m&&(k=h.clientX,y=h.clientY,clearTimeout(c),c=setTimeout(()=>{l=m,F.suppressClick=!0,M(m.dataset.long,m.dataset.id)},430))});let T=()=>{clearTimeout(c),c=null};o.screen.addEventListener("pointermove",h=>{c&&Math.hypot(h.clientX-k,h.clientY-y)>8&&T()}),o.screen.addEventListener("pointerup",T),o.screen.addEventListener("pointercancel",T),o.screen.addEventListener("contextmenu",h=>{h.target.closest("[data-long]")&&h.preventDefault()}),n.addEventListener("click",h=>{if(F.suppressClick&&(F.suppressClick=!1,l&&l.contains(h.target))){h.stopPropagation();return}let m=h.target.closest("[data-act]");if(!m)return;let{act:I,id:$,kind:j,target:A,tier:g,label:u,view:S,mode:f,anchor:x}=m.dataset;switch(I){case"stop-run":{a.onTakeover?.()===!1?e.toast("\u73B0\u5728\u6CA1\u6709\u5728\u8DD1\u7684\u4EFB\u52A1","mark"):e.toast("\u5DF2\u8BF7 agent \u505C\u624B","ok"),e.emit();break}case"takeover":e.ui.takeover?e.releaseTakeover():(e.intervene({tier:"takeover",kind:"takeover",target:"agent",label:"\u505C\u6389 agent\uFF0C\u6211\u6765\u5904\u7406"}),a.onTakeover?.()),e.emit();break;case"nav":e.go(S),e.emit();break;case"approve":case"reject":{let s=I==="approve"?"allowed-once":"rejected";Promise.resolve(a.onApprove?.($,s)).then(v=>e.toast(v?.ok===!0?I==="approve"?"\u5DF2\u6279\u51C6":"\u5DF2\u62D2\u7EDD":"\u6CA1\u9001\u8FBE\uFF1A\u5BBF\u4E3B\u8FD8\u6CA1\u91CD\u542F",v?.ok===!0?"ok":"mark")).catch(()=>e.toast("\u6CA1\u9001\u8FBE\uFF1A\u5BBF\u4E3B\u8FD8\u6CA1\u91CD\u542F","mark")).finally(()=>e.emit());break}case"watch":{let s=e.currentSessionId;if(typeof s!="string"||s===""){e.toast("\u8FD8\u6CA1\u63A5\u4E0A\u4F1A\u8BDD\uFF0C\u5148\u6253\u5F00\u4E00\u4E2A\u4F1A\u8BDD\u518D\u5F00\u624B\u673A\u6279\u51C6","mark"),e.emit();break}if(typeof a.onWatch!="function"){e.toast("\u8FD9\u4E2A\u73AF\u5883\u6CA1\u6709\u5BA1\u6279\u901A\u9053","mark"),e.emit();break}let v=!(e.watching??[]).includes(s);e.watchInFlight+=1,Promise.resolve(a.onWatch(s,v)).then(b=>{if(b&&b.ok===!1)throw new Error(b.error??"\u670D\u52A1\u7AEF\u62D2\u7EDD");e.watching=v?[...e.watching??[],s]:(e.watching??[]).filter(L=>L!==s),e.toast(v?"\u624B\u673A\u6279\u51C6\u5DF2\u5F00\uFF1A\u8FD9\u4E2A\u4F1A\u8BDD\u7684\u5BA1\u6279\u4F1A\u7B49\u4F60":"\u624B\u673A\u6279\u51C6\u5DF2\u5173","ok"),e.emit()}).catch(b=>{e.toast(`\u624B\u673A\u6279\u51C6\u6CA1\u5207\u6210\u529F\uFF1A${b?.message??"\u672A\u77E5\u539F\u56E0"}`,"mark"),e.emit()}).finally(()=>{e.watchInFlight=Math.max(0,e.watchInFlight-1)});break}case"say":{let s=m.dataset.text??"",v=a.onSend?.(s)===!0;e.toast(v?`\u5DF2\u53D1\u9001\uFF1A${s}`:"\u53D1\u4E0D\u51FA\u53BB\uFF1A\u4F1A\u8BDD\u6CA1\u63A5\u4E0A",v?"ok":"mark"),e.emit();break}case"session":{typeof a.onSelectSession=="function"&&a.onSelectSession($),e.ui.view="now",e.emit();break}case"open":e.openDetail(j,$),e.emit();break;case"back":e.back(),e.emit();break;case"step":{e.toggleStep($);let s=e.derive().steps.find(v=>v.id===$);s&&Promise.resolve(a.onSeen?.({sessionId:e.currentSessionId,stepId:s.id,index:s.index,title:s.title})).catch(()=>{}),e.emit();break}case"mark":{let s=e.derive().current,v=s?`\u7B2C ${s.index} \u6B65\uFF1A${s.title}`:"\u56DE\u53BB\u770B\u770B\u8FD9\u4E2A\u4F1A\u8BDD";Promise.resolve(a.onMark?.(e.currentSessionId,v)).then(b=>e.toast(b?.ok===!0?"\u5DF2\u6807\u8BB0\uFF0C\u684C\u9762\u80FD\u770B\u5230":"\u6807\u8BB0\u6CA1\u4FDD\u5B58\uFF1A\u5BBF\u4E3B\u8FD8\u6CA1\u91CD\u542F",b?.ok===!0?"ok":"mark")).catch(()=>e.toast("\u6807\u8BB0\u6CA1\u4FDD\u5B58\uFF1A\u5BBF\u4E3B\u8FD8\u6CA1\u91CD\u542F","mark")).finally(()=>e.emit());break}case"notify":{let s=typeof globalThis=="object"?globalThis.DSHPocket:null;if(s&&typeof s.notify=="function"){try{s.notify("DSH \u901A\u77E5\u6D4B\u8BD5","\u80FD\u770B\u5230\u8FD9\u6761\uFF0C\u8BF4\u660E\u901A\u77E5\u901A\u9053\u662F\u901A\u7684"),e.toast("\u5DF2\u901A\u8FC7 App \u901A\u77E5\u901A\u9053\u53D1\u9001","ok")}catch{e.toast("App \u901A\u77E5\u901A\u9053\u6CA1\u54CD\u5E94","mark")}e.emit();break}if(typeof Notification>"u"){e.toast("\u8FD9\u4E2A\u73AF\u5883\u6CA1\u6709\u901A\u77E5\u80FD\u529B\uFF1A\u6D4F\u89C8\u5668\u8981 HTTPS + \u6388\u6743\uFF0C\u5B89\u5353\u8BF7\u7528 App \u6253\u5F00","mark"),e.emit();break}let v=b=>{e.toast(b==="granted"?"\u901A\u77E5\u5DF2\u5F00":"\u6D4F\u89C8\u5668\u6CA1\u7ED9\u901A\u77E5\u6743\u9650",b==="granted"?"ok":"mark"),e.emit()};if(Notification.permission==="granted"){try{new Notification("DSH \u901A\u77E5\u6D4B\u8BD5",{body:"\u80FD\u770B\u5230\u8FD9\u6761\u5C31\u8BF4\u660E\u901A\u4E86",tag:"dsh-remote-panel"}),v("granted")}catch{e.toast("\u7CFB\u7EDF\u628A\u901A\u77E5\u6321\u6389\u4E86","mark"),e.emit()}break}Promise.resolve(Notification.requestPermission()).then(v).catch(()=>{e.toast("\u8BF7\u6C42\u901A\u77E5\u6743\u9650\u5931\u8D25","mark"),e.emit()});break}case"focus":e.ui.detail=null,e.ui.view=x?.startsWith("file-")?"changes":"now",x?.startsWith("step-")&&(e.ui.openStep=x.slice(5),e.ui.openStepManual=!0),e.highlight(x),e.emit();break;case"sheet":M(m.dataset.long,m.dataset.id);break;case"sheet-close":e.closeSheet(),e.emit();break;case"iv":e.intervene({tier:g,kind:j,target:A,label:u}),j==="takeover"&&(e.ui.detail=null),e.emit();break;case"play":e.togglePlay(),e.emit();break;case"detail-tab":F.diffMode=f,e.emit();break;case"preview-side":F.previewSide=f,e.emit();break;case"exclude":e.toggleExclude($),e.emit();break;case"accept":e.accept(e.derive()),e.emit();break;case"reset-accept":e.resetAcceptance(),e.emit();break;case"open-reject":e.openSheet({type:"reject"}),e.emit();break;case"reject-send":e.reject(e.ui.acceptance.reason.trim()),e.closeSheet(),e.emit();break;case"quick-reason":e.ui.acceptance.reason=m.dataset.reason;{let s=o.flat.querySelector("#rejectReason");s&&(s.value=m.dataset.reason)}break;case"preview-click":e.toast(F.previewSide==="after"?"\u5DF2\u8FDB\u5165\u9996\u9875 \xB7 \u4F1A\u8BDD\u4FDD\u6301":"\u88AB\u91CD\u5B9A\u5411\u5230\u767B\u5F55\u9875",F.previewSide==="after"?"ok":"takeover"),e.emit();break;case"drawer":e.openDrawer(m.dataset.tab??"term"),e.emit();break;case"drawer-tab":e.setDrawerTab(m.dataset.tab),e.emit();break;case"drawer-close":e.closeDrawer(),e.emit();break;case"back-chat":{if(typeof a.onExit=="function"){a.onExit();break}let s=new URLSearchParams(location.search).get("chat");if(s){location.href=s;break}e.toast("\u771F\u5B9E\u90E8\u7F72\u91CC\uFF0C\u8FD9\u91CC\u56DE\u5230\u539F\u6765\u7684\u5BF9\u8BDD","mark"),e.emit();break}default:break}}),n.addEventListener("input",h=>{h.target.id==="scrub"&&e.seek(Number(h.target.value)),h.target.id==="rejectReason"&&(e.ui.acceptance.reason=h.target.value)});function M(h,m){let I=e.derive(),$="",j="",A=[],g=m;if(h==="file"){let u=I.files.find(S=>S.path===m);if(!u)return;$=Te(u.path),j=`${Je(u.path)} \xB7 ${u.attempts.length} \u7248 \xB7 +${u.add} \u2212${u.del}`,A=he.file(u)}else if(h==="command"){let u=I.commands.find(S=>S.id===m);if(!u)return;$=fe(u.cmd),j=u.status==="running"?"\u8FD0\u884C\u4E2D":`exit ${u.exit} \xB7 ${W(u.dur??0)}`,A=he.command(u).map(S=>({...S,target:S.kind==="kill-cmd"?u.id:u.cmd})),g=u.cmd}else if(h==="step"){let u=I.steps.find(S=>S.id===m);if(!u)return;$=`\u7B2C ${u.index} \u6B65 \xB7 ${u.title}`,j=u.status==="done"?"\u5DF2\u5B8C\u6210":u.status==="failed"?"\u672A\u8FBE\u9884\u671F":"\u8FDB\u884C\u4E2D",A=he.step(u)}else return;e.openSheet({type:h,id:m,title:$,sub:j,actions:A.map(u=>({...u,target:u.target??g}))}),e.emit()}let C=e.subscribe(h=>{Qe(o.nav,h,e),at(o.bar,o.app,h,e);let m=[e.ui.view,e.ui.detail?.kind,e.ui.detail?.id,e.ui.openStep,h.activity.length,h.commands.length,h.files.length,h.takeover,e.ui.acceptance.status,e.ui.interventions.length,F.diffMode,F.previewSide,e.ui.highlight,e.ui.acceptance.excluded.size,h.files.map($=>`${$.path}${$.ignored}${$.reverted}${$.sensitive}`).join(","),e.currentSessionId??"",(e.watching??[]).join(","),(e.approvals??[]).map($=>$.id).join(","),(e.overview&&e.overview.sessions||[]).map($=>`${$.id}:${$.level}`).join(",")].join("|");if(m!==F.sig){F.sig=m;let $=e.scrollKey();F.key&&e.ui.scroll.set(F.key,o.screen.scrollTop);try{o.screen.innerHTML=et(h,e)}catch(j){console.error(j),o.screen.innerHTML=`<div class="empty">\u6E32\u67D3\u5931\u8D25\uFF1A${w(j.message)}</div>`}if(o.screen.scrollTop=e.ui.scroll.get($)??0,o.app.dataset.scrolled=o.screen.scrollTop>34?"1":"0",F.key=$,e.ui.highlight){let j=o.screen.querySelector("#"+CSS.escape(e.ui.highlight));j&&(j.classList.add("hl"),requestAnimationFrame(()=>j.scrollIntoView({block:"center",behavior:"smooth"})))}}it(o.flat,h,e);let I=(e.ui.toast?.id??"")+(e.ui.sheet||e.ui.drawer?":modal":"");I!==F.toastId&&(F.toastId=I,o.toast.innerHTML=e.ui.toast&&!e.ui.sheet&&!e.ui.drawer?`<div class="toast ${e.ui.toast.kind}">${w(e.ui.toast.text)}</div>`:"")});return e.start(),()=>{r?.disconnect(),C(),e.stop(),n.innerHTML="",n.classList.remove("pc")}}function Qe(n,e,a){let{detail:i,takeover:r,view:o}=a.ui,d={sessions:"\u4F1A\u8BDD",now:"\u73B0\u5728",changes:"\u53D8\u66F4",accept:"\u9A8C\u6536"}[o]??"\u76D1\u770B",c=i?i.kind==="preview"?"\u9A8C\u6536":"\u53D8\u66F4":"\u5BF9\u8BDD",l=i?i.kind==="preview"?"\u7ED3\u679C\u9884\u89C8":Te(i.id):d,k=a.live===!0,y=[c,l,r,!!i,k].join("|");n._sig!==y&&(n._sig=y,n.innerHTML=`
    <button class="nav-back" data-act="${i?"back":"back-chat"}">
      ${_("back")}<span>${w(c)}</span>
    </button>
    <div class="nav-title" ${i?'data-always="1"':""}>${w(l)}</div>
    ${i?i.kind==="preview"?'<span class="nav-action" aria-hidden="true"></span>':`<button class="nav-action" data-act="sheet" data-long="${i.kind}" data-id="${w(i.id)}" aria-label="\u66F4\u591A">${_("more")}</button>`:k?'<button class="nav-action destructive" data-act="stop-run">\u505C\u624B</button>':`<button class="nav-action ${r?"destructive":""}" data-act="takeover">${r?"\u91CA\u653E":"\u63A5\u7BA1"}</button>`}
  `)}function et(n,e){let{ui:a}=e;return nt(n,e)}function tt(n){return n==null?"":n<6e4?"\u521A\u521A":n<36e5?`${Math.round(n/6e4)} \u5206\u949F\u524D`:n<864e5?`${Math.round(n/36e5)} \u5C0F\u65F6\u524D`:`${Math.round(n/864e5)} \u5929\u524D`}function nt(n,e){let{ui:a}=e,i=e.approvals??[],r=(e.watching??[]).includes(e.currentSessionId),o=[n.task.branch,n.task.workdir.replace(/^.*\//,"")].filter(Boolean).join(" \xB7 "),c=!!(n.steps&&n.steps.length?n.steps[n.steps.length-1]:null)||i.length>0||!!a.takeover,l=n.totals??{files:0,add:0,del:0},k=a.takeover?"\u5DF2\u63A5\u7BA1 \xB7 agent \u5DF2\u6682\u505C":o||"\u7B49\u5F85\u4F1A\u8BDD",y=i.length===0?"":`<p class="section-title">\u7B49\u4F60\u6279\u51C6\uFF08${i.length}\uFF09</p>
    <div class="group">${i.map(s=>`
      <div class="row static">
        <span class="row-icon orange">${_("warn")}</span>
        <div class="row-main">
          <span class="row-title">${w(s.toolName)}${s.reason?` \xB7 ${w(s.reason)}`:""}</span>
          <span class="row-sub">${w(String(s.sessionId).replace(/^session-/,"").slice(0,8))} \xB7 ${w(tt(s.ageMs))}</span>
        </div>
      </div>
      <div class="row static" style="gap:14px">
        <button class="link-btn" data-act="approve" data-id="${w(s.id)}">\u6279\u51C6\u8FD9\u6B21</button>
        <button class="link-btn" data-act="reject" data-id="${w(s.id)}" style="color:var(--red)">\u62D2\u7EDD</button>
      </div>`).join("")}</div>`,T=`<div class="group">
      <div class="row static">
        <span class="row-icon gray">${_("wave")}</span>
        <div class="row-main">
          <span class="row-title">\u8FD8\u6CA1\u6709\u53EF\u770B\u7684\u6267\u884C</span>
          <span class="row-sub">\u53D1\u4E00\u6761\u6D88\u606F\uFF0C\u8FD9\u91CC\u4F1A\u663E\u793A\u5B83\u6B63\u5728\u505A\u4EC0\u4E48</span>
        </div>
      </div>
    </div>`,M=`<p class="section-title">\u72B6\u6001</p>
    <div class="group status">
      <div class="row static">
        <span class="row-icon blue">${_("wave")}</span>
        <div class="row-main">
          <span class="row-title">${w(n.now.doing)}</span>
          <span class="row-sub">\u5728\u505A\u4EC0\u4E48</span>
        </div>
      </div>
      <div class="row static">
        <span class="row-icon gray">${_("doc")}</span>
        <div class="row-main">
          <span class="row-title">${w(n.now.scope)}</span>
          <span class="row-sub">\u6539\u52A8\u8303\u56F4</span>
        </div>
      </div>
      <div class="row static">
        <span class="row-icon ${n.now.level==="warn"?"orange":"gray"}">${_(n.now.level==="warn"?"warn":"check")}</span>
        <div class="row-main">
          <span class="row-title" ${n.now.level==="warn"?'style="color: var(--orange)"':""}>${w(n.now.momentum)}</span>
          <span class="row-sub">\u8282\u594F</span>
        </div>
      </div>
    </div>`,C=l.files===0?"":`<p class="section-title">\u6539\u52A8</p>
    <div class="group">
      <div class="row static">
        <span class="row-icon gray">${_("doc")}</span>
        <div class="row-main">
          <span class="row-title">${l.files} \u4E2A\u6587\u4EF6</span>
          <span class="row-sub"><span style="color: var(--green)">+${l.add}</span> <span style="color: var(--red)">\u2212${l.del}</span>${l.sensitive?` \xB7 ${l.sensitive} \u4E2A\u654F\u611F`:""}</span>
        </div>
      </div>
    </div>`,h=e.overview,m=(h&&h.sessions||[]).filter(s=>s.id!==e.currentSessionId),I=s=>s.level==="pending"?`\u7B49\u4F60\u5904\u7406${s.pending?` \xB7 ${s.pending}`:""}`:s.level==="done"?"\u5DF2\u5B8C\u6210\uFF0C\u8FD8\u6CA1\u770B":s.level==="stale"?"\u53EF\u80FD\u5361\u4F4F\u4E86":s.level==="running"?"\u5728\u8DD1":"\u7A7A\u95F2",$=s=>s.level==="pending"?"orange":s.level==="done"?"green":s.level==="stale"?"orange":s.level==="running"?"blue":"gray",j=s=>String(s.cwd||"").replace(/\/+$/,"").split("/").filter(Boolean).pop()||"\u672A\u547D\u540D\u5DE5\u4F5C\u533A",A=m.filter(s=>s.level==="pending"||s.level==="done"||s.level==="stale"),g=m.filter(s=>s.level==="running"),u=[...A,...g].slice(0,3),S=u.length===0?"":`<p class="section-title">\u5176\u4ED6\u4F1A\u8BDD${A.length>0?`\uFF08${A.length} \u4E2A\u7B49\u4F60\uFF09`:`\uFF08${g.length} \u4E2A\u5728\u8DD1\uFF09`}</p>
    <div class="group">${u.map(s=>`
      <button class="row" data-act="session" data-id="${w(s.id)}">
        <span class="row-icon ${$(s)}">${_(s.level==="pending"?"warn":s.level==="done"?"check":"wave")}</span>
        <div class="row-main">
          <span class="row-title">${w(s.title)}</span>
          <span class="row-sub">${w(j(s))} \xB7 ${w(I(s))}</span>
        </div>
        <span class="chevron">${_("chevron")}</span>
      </button>`).join("")}</div>`,f=c?`<div class="group">
      <button class="row" data-act="say" data-text="\u5148\u505C\u4E0B">
        <span class="row-icon gray">${_("stop")}</span>
        <div class="row-main">
          <span class="row-title">\u5148\u505C\u4E0B</span>
          <span class="row-sub">\u8BA9 agent \u505C\u624B\uFF0C\u7B49\u4F60\u7684\u4E0B\u4E00\u6B65</span>
        </div>
      </button>
    </div>`:"",x=`<div class="group">
      <div class="row static">
        <span class="row-icon ${r?"green":"gray"}">${_("hand")}</span>
        <div class="row-main">
          <span class="row-title">\u624B\u673A\u6279\u51C6\uFF1A${r?"\u5F00":"\u5173"}</span>
          <span class="row-sub">${r?"\u8FD9\u4E2A\u4F1A\u8BDD\u7684\u5BA1\u6279\u505C\u4E0B\u6765\u7B49\u4F60\u5728\u624B\u673A\u4E0A\u70B9":"\u5173\u7740\u7684\u65F6\u5019\uFF0C\u5BA1\u6279\u7167\u65E7\u5728\u684C\u9762\u5F39"}</span>
        </div>
        <button class="link-btn" data-act="watch">${r?"\u5173\u95ED":"\u6253\u5F00"}</button>
      </div>
      <div class="row static">
        <span class="row-icon gray">${_("flag")}</span>
        <div class="row-main">
          <span class="row-title">\u540E\u53F0\u901A\u77E5</span>
          <span class="row-sub">\u9875\u9762\u5728\u540E\u53F0\u65F6\u5F39\u7CFB\u7EDF\u901A\u77E5</span>
        </div>
        <button class="link-btn" data-act="notify">\u5F00\u542F</button>
      </div>
    </div>`;return`
    <div class="page">
      <h1>\u73B0\u5728</h1>
      <p>${w(k)}</p>
    </div>
    ${y}
    ${o?M:T}
    ${S}
    ${C}
    ${f}
    <p class="section-title">\u8BBE\u7F6E</p>
    ${x}
  `}function at(n,e,a,i){let{ui:r}=i,o=r.view==="accept"&&!r.detail&&r.acceptance.status==="pending"&&!!a.artifact,d=o?`${i.acceptedFiles(a).length}`:"0";if(n._sig!==d){if(n._sig=d,n.dataset.open=o?"1":"0",e.dataset.bar=o?"1":"0",!o){n.innerHTML="";return}n.innerHTML=`
    <button class="reject-link" data-act="open-reject">\u6253\u56DE</button>
    <button class="btn primary" data-act="accept">\u63A5\u53D7 ${i.acceptedFiles(a).length} \u4E2A\u6587\u4EF6</button>`}}function it(n,e,a){let i=a.ui.sheet,r=a.ui.drawer;if(!i&&!r){n.innerHTML="",n._sig="";return}let o=[i?.type,i?.id,i?.actions?.length,r].join("|");if(n._sig!==o){if(n._sig=o,i?.type==="reject"){n.innerHTML=`
      <div class="modal" role="dialog" aria-modal="true">
        <div class="sheet-wrap">
          <div class="sheet">
            <div class="sheet-head"><div class="sheet-title">\u6253\u56DE\u8FD9\u6B21\u6539\u52A8</div><div class="sheet-sub">\u7406\u7531\u4F1A\u9644\u7ED9 agent</div></div>
            <div class="reject-body">
              <textarea id="rejectReason" class="reject-input" rows="3" placeholder="\u4E00\u53E5\u8BDD\u8BF4\u660E\u4E3A\u4EC0\u4E48\u6253\u56DE\u2026">${w(a.ui.acceptance.reason)}</textarea>
              <div class="chips">
                ${["\u8986\u76D6\u4E0D\u5168","\u98CE\u683C\u4E0D\u4E00\u81F4","\u7F3A\u5C11\u6D4B\u8BD5","\u6362\u4E2A\u601D\u8DEF"].map(d=>`<button class="chip" data-act="quick-reason" data-reason="${d}">${d}</button>`).join("")}
              </div>
              <button class="btn primary" style="background: var(--red)" data-act="reject-send">\u53D1\u9001\u6253\u56DE</button>
            </div>
          </div>
          <button class="sheet-cancel" data-act="sheet-close">\u53D6\u6D88</button>
        </div>
        <div class="scrim" data-act="sheet-close"></div>
      </div>`;return}if(i){let d=["mark","constrain","takeover"].filter(c=>i.actions.some(l=>l.tier===c));n.innerHTML=`
      <div class="modal" role="dialog" aria-modal="true">
        <div class="sheet-wrap">
          <div class="sheet">
            <div class="sheet-head"><div class="sheet-title">${w(i.title)}</div><div class="sheet-sub">${w(i.sub)}</div></div>
            ${d.map(c=>`
              <div class="sheet-section">${Ze[c]}</div>
              ${i.actions.filter(l=>l.tier===c).map(l=>`
                <button class="sheet-item ${l.tier==="takeover"?"destructive":""}"
                  data-act="iv" data-tier="${l.tier}" data-kind="${l.kind}" data-target="${w(l.target)}" data-label="${w(l.label)}">
                  <span class="row-icon">${_(l.icon)}</span>
                  <span class="sheet-item-main"><b>${w(l.label)}</b><small>${w(l.hint)}</small></span>
                </button>`).join("")}
            `).join("")}
          </div>
          <button class="sheet-cancel" data-act="sheet-close">\u53D6\u6D88</button>
        </div>
        <div class="scrim" data-act="sheet-close"></div>
      </div>`;return}n.innerHTML=`
    <div class="modal" role="dialog" aria-modal="true">
      <div class="sheet-wrap">
        <div class="sheet drawer-sheet">
          <div class="sheet-head"><div class="sheet-title">\u539F\u59CB\u8F93\u51FA</div><div class="sheet-sub">\u53EA\u8BFB \xB7 \u76F4\u8FDE worker</div></div>
          <div class="sheet-seg">
            <div class="segmented" style="margin: 0">
              ${[["term","\u7EC8\u7AEF"],["status","git status"],["patch","\u6700\u8FD1 patch"]].map(([d,c])=>`<button class="${r===d?"on":""}" data-act="drawer-tab" data-tab="${d}">${c}</button>`).join("")}
            </div>
          </div>
          <div class="raw">${r==="term"?st(e):r==="status"?rt(e):ot(e)}</div>
        </div>
        <button class="sheet-cancel" data-act="drawer-close">\u5B8C\u6210</button>
      </div>
      <div class="scrim" data-act="drawer-close"></div>
    </div>`}}function st(n){let e=[];for(let a of n.commands){e.push(`<div class="raw-cmd">$ ${w(a.cmd)}</div>`);for(let i of a.lines)e.push(`<div class="raw-line ${i.stream==="err"?"err":""}">${w(i.line)}</div>`);a.exit!=null&&e.push(`<div class="raw-exit ${a.exit===0?"ok":"bad"}">[exit ${a.exit}]</div>`)}return e.join("")||'<div class="raw-line">\u8FD8\u6CA1\u6709\u6267\u884C\u8BB0\u5F55</div>'}function rt(n){let e=n.files.map(a=>{let i=a.attempts.length?"M":" ";return`<div class="raw-line"><span class="gs-code ${a.attempts.length?"mod":""}">${i}</span> ${w(a.path)}</div>`});return`<div class="raw-line">On branch ${w(n.task.branch)}</div>
    <div class="raw-line" style="opacity:.6">Changes not staged for commit:</div>${e.join("")}`}function ot(n){let e=n.files.filter(a=>a.attempts.length&&!a.ignored&&!a.reverted);return e.length?e.map(a=>{let i=Se(a),r=i.lines.map(o=>`<div class="raw-line ${o.type==="add"?"add":o.type==="del"?"del":""}">${o.type==="add"?"+":o.type==="del"?"-":" "}${w(o.text)}</div>`).join("");return`<div class="patch-file"><div class="raw-cmd">--- a/${w(a.path)}
+++ b/${w(a.path)}</div>
      <div class="raw-line" style="opacity:.6">${w(i.header)}</div>${r}</div>`}).join(""):'<div class="raw-line">\u8FD8\u6CA1\u6709\u8865\u4E01</div>'}var lt=new Set(["bash","read","edit","write","str_replace_editor","todo_write"]);function ct(n,e){let a=e??{},i=[a.command,a.query,a.file_path,a.path,a.pattern,a.url,a.prompt,a.description,a.goal,a.task];for(let r of i)if(typeof r=="string"&&r.trim()!=="")return r.trim().replace(/\s+/g," ").slice(0,80);if(e&&typeof e=="object"){let r=Object.keys(e);if(r.length>0)return`${r.slice(0,3).join(", ")}`}return n}var pt=300,dt=/\bTests?\s+(\d+)\s+passed(?:\s*\|\s*(\d+)\s+failed)?/i,ut=/Tests:\s*(?:(\d+)\s+failed,\s*)?(\d+)\s+passed/i;function me(n){let e=/\[exit code: (-?\d+)\]/.exec(n??"");return e===null?null:Number(e[1])}function xe(n){let e=n??"",a=dt.exec(e);return a!==null?{passed:Number(a[1]),failed:Number(a[2]??0)}:(a=ut.exec(e),a!==null?{passed:Number(a[2]),failed:Number(a[1]??0)}:null)}function ee(n){return!n||!Array.isArray(n.content)?"":n.content.filter(e=>e?.type==="text"&&typeof e.text=="string").map(e=>e.text).join(`
`)}function ft(n){if(typeof n!="string")return{};try{let e=JSON.parse(n);return e&&typeof e=="object"?e:{}}catch{return{}}}function ge(n){let e=String(n??"");return e===""?[]:e.replace(/\n$/,"").split(`
`)}function te(n,e){let a=(e??[]).filter(f=>f&&typeof f.time=="number").slice().sort((f,x)=>(f.seq??0)-(x.seq??0)||f.time-x.time),i=a.length?a[0].time:Date.now(),r=f=>Math.max(0,Math.round((f-i)/100)/10),o=a.some(f=>f.type==="todo/write"||f.type==="tool/call"&&f.data?.name==="todo_write"),d=[],c=[],l=new Map,k=null,y=new Map,T=new Map,M="",C=null,h=f=>{let x=l.get(f);return x===void 0&&(x={id:`todo-${c.length+1}`,index:c.length+1,title:f,status:"pending",startT:null,endT:null,started:!1},c.push(x),l.set(f,x)),x},m=(f,x)=>{f.started||(f.started=!0,f.startT=x,d.push({type:"step.start",step:f.id,t:x}))},I=(f,x)=>{if(!(!Array.isArray(f)||f.length===0))for(let s of f){let v=typeof s?.content=="string"?s.content:"";if(v==="")continue;let b=h(v);s.status==="in_progress"?(m(b,x),k=b.id):s.status==="completed"&&(m(b,x),b.endT===null&&(b.endT=x,d.push({type:"step.end",step:b.id,ok:!0,t:x})))}};for(let f of a){let x=r(f.time),s=f.data??{};switch(f.type){case"turn/start":{if(!o){let v={id:`turn-${s.turn}`,index:c.length+1,title:"",status:"running",startT:x,endT:null,started:!0};c.push(v),C=v,k=v.id,d.push({type:"step.start",step:v.id,t:x})}break}case"turn/end":{!o&&C!==null&&C.endT===null&&(C.endT=x,d.push({type:"step.end",step:C.id,ok:!0,t:x})),C=null,M="";break}case"user/message":{let v=ee(s).trim();v!==""&&M===""&&(M=v.slice(0,80)),!o&&C!==null&&C.title===""&&v!==""&&(C.title=v.slice(0,40));break}case"todo/write":{I(s.todos,x);break}case"tool/call":{let v={id:s.callId,name:s.name,args:ft(s.arguments),t:x,text:""};if(y.set(s.callId,v),lt.has(s.name)||d.push({type:"tool.start",id:s.callId,name:s.name,summary:ct(s.name,v.args),t:x}),s.name==="read"){let b=v.args.file_path;typeof b=="string"&&d.push({type:"file.read",path:b,t:x})}else if(s.name==="bash"){let b=typeof v.args.command=="string"?v.args.command:"";b!==""&&d.push({type:"cmd.start",id:s.callId,cmd:b,t:x})}break}case"tool/result":{let v=s.message??{},b=y.get(v.toolCallId);if(b===void 0)break;let L=ee(v);if(b.name==="bash"){let D=ge(L);for(let O of D.slice(0,pt))d.push({type:"cmd.line",id:b.id,stream:v.isError?"err":"out",line:O,t:x});let q=me(L)??(v.isError?1:0);d.push({type:"cmd.end",id:b.id,exit:q,dur:Math.max(0,x-b.t),t:x});let N=xe(L);N!==null&&d.push({type:"test.result",passed:N.passed,failed:N.failed,t:x})}else if(b.name==="edit"||b.name==="write"||b.name==="str_replace_editor"){let D=s.meta&&Array.isArray(s.meta.diffs)?s.meta.diffs:[];for(let q of D){let N=typeof q?.path=="string"?q.path:b.args.file_path;if(typeof N!="string"||N==="")continue;let O=ge(q?.oldText),R=ge(q?.newText),B=de(O,R),H=ue(B),ne=(T.get(N)??0)+1;T.set(N,ne),d.push({type:"file.edit",path:N,attempt:ne,add:H.add,del:H.del,hunk:{header:`@@ ${N} @@`,lines:B},t:x})}}else b.name==="todo_write"?I(b.args.todos,x):d.push({type:"tool.end",id:b.id,name:b.name,ok:v.isError!==!0,dur:Math.max(0,x-b.t),text:ee(v).trim().slice(0,220),t:x});break}default:break}}let $=[...c].reverse().find(f=>f.startT!==null&&f.endT===null),j=[...c].reverse().find(f=>f.endT!==null),A=$?.id??j?.id??null,g=a.find(f=>f.type==="user/message"),u=g?ee(g.data?.message).trim().slice(0,40):"";for(let f of c)f.title===""&&(f.title=`\u7B2C ${f.index} \u8F6E`),delete f.started;return{scenario:{task:{id:n?.id??"",title:n?.title||u||"\u672A\u547D\u540D\u4F1A\u8BDD",intent:n?.title||u||"",branch:"",workdir:typeof n?.cwd=="string"?n.cwd:""},steps:c,duration:a.length?r(a[a.length-1].time):0},events:d,startMs:i,endMs:a.length?a[a.length-1].time:i,activeStepId:A}}var Ce={pending:0,done:1,stale:2,running:3,idle:4};function ht(n){if(n===null||typeof n!="object")return null;let e=[n.title,n.label,n.summary,n.kind,n.request?.title,n.request?.toolName,n.request?.name,n.toolName];for(let a of e)if(typeof a=="string"&&a.trim()!=="")return a.trim().slice(0,60);return"\u7B49\u4F60\u5904\u7406"}function ve({rows:n,status:e,now:a=Date.now(),currentId:i=null}={}){let r=e instanceof Map?e:new Map(Object.entries(e??{})),o=[];for(let l of n??[]){if(!l||typeof l.id!="string")continue;let k=r.get(l.id)??{},y=k.pendingInteraction??null,T=typeof l.updatedAt=="number"?l.updatedAt:null,M=T===null?null:Math.max(0,a-T),C=k.running===!0||l.running===!0,h=k.completionUnread===!0,m=C&&M!==null&&M>18e4,I=y!==null?"pending":h?"done":m?"stale":C?"running":"idle";o.push({id:l.id,title:typeof l.title=="string"&&l.title!==""?l.title:l.displayTitle??"\u672A\u547D\u540D\u4F1A\u8BDD",cwd:typeof l.cwd=="string"?l.cwd:"",updatedAt:T,ageMs:M,running:C,completionUnread:h,stale:m,level:I,pending:ht(y),current:l.id===i})}o.sort((l,k)=>{let y=Ce[l.level]-Ce[k.level];return y!==0?y:(k.updatedAt??0)-(l.updatedAt??0)});let d=o.filter(l=>l.level==="pending"||l.level==="done"||l.level==="stale"),c={pending:o.filter(l=>l.level==="pending").length,done:o.filter(l=>l.level==="done").length,stale:o.filter(l=>l.level==="stale").length,running:o.filter(l=>l.level==="running").length,total:o.length};return{sessions:o,inbox:d,counts:c}}function Le(n,e=null){let a=new Set,i=null,r=null,o=null,d=null,c=null,l=null,k=null,y=null,T=0,M=!0,C=()=>{let g=[],u=null;try{let S=n.list.getSnapshot();g=S&&S.byId?Object.values(S.byId):[],u=e?.sessionStatus?.getSnapshot?.()??null}catch{}return ve({rows:g,status:u,currentId:l})},h=()=>{if(i===null){let g=C();for(let u of a)u({scenario:null,events:[],overview:g,currentId:l});return}for(let g of a)g({...i,overview:C(),currentId:l})},m=()=>{T===0&&(T=requestAnimationFrame(()=>{T=0,h()}))},I=()=>{if(y!==null)return y;try{let g=n.list.getSnapshot(),u=g&&g.byId?Object.values(g.byId):[],S=u.find(s=>(s.retainedBy?.mainView??0)>0)?.id??null;if(S!==null)return k=S,S;if(k!==null&&u.some(s=>s.id===k))return k;let f=ve({rows:u,status:e?.sessionStatus?.getSnapshot?.()??null,currentId:null});return(f.sessions.find(s=>s.level==="pending")??f.sessions.find(s=>s.level==="running")??f.sessions[0]??null)?.id??null}catch{return null}},$=()=>{if(d!==null){try{d()}catch{}d=null}if(c!==null){try{c.release()}catch{}c=null}i=null},j=g=>{if($(),l=g,g===null)return;let u=n.retain(g,{source:"remoteConsole"});c=u,Promise.resolve(u.ready).then(S=>{if(M||l!==g)return;let f=S.eventSource,x=()=>{try{let v=(f.getSnapshot()?.entries??[]).filter(L=>L.type==="event").map(L=>L.event),b=n.list.getSnapshot()?.byId?.[g]??{};i=te({id:g,cwd:b.cwd,title:b.displayTitle},v),m()}catch(s){console.warn("[remote-panel] live normalize failed",s)}};d=f.subscribe(x),x()}).catch(S=>console.warn("[remote-panel] live session failed",S))},A=()=>{let g=I();g!==l&&j(g)};return{subscribe(g){return a.add(g),i!==null&&g(i),()=>a.delete(g)},start(){M&&(M=!1,r=n.list.subscribe(()=>{A(),m()}),e?.sessionStatus?.subscribe&&(o=e.sessionStatus.subscribe(()=>m())),A())},select(g){let u=typeof g=="string"&&g!==""?g:null;u!==y&&(y=u,k=u??k,A(),h())},send(g){let u=typeof g=="string"?g.trim():"";if(u==="")return!1;try{let S=c?.binding?.session;if(S&&typeof S.prompt=="function")return Promise.resolve(S.prompt([{type:"text",text:u}],"queue")).catch(f=>{console.warn("[remote-panel] prompt failed",f)}),!0}catch{}return!1},cancel(){try{let g=c?.binding?.session;if(g&&typeof g.cancel=="function")return Promise.resolve(g.cancel()).catch(()=>{}),!0}catch{}return!1},stop(){if(M=!0,T!==0&&(cancelAnimationFrame(T),T=0),r!==null){try{r()}catch{}r=null}if(o!==null){try{o()}catch{}o=null}$(),l=null,a.clear()}}}function gt(n,e){try{let a=globalThis.DSHPocket;if(a&&typeof a.notify=="function")return a.notify(n,e??""),!0}catch{}try{return typeof Notification>"u"||Notification.permission!=="granted"?!1:(new Notification(n,{body:e??"",tag:"dsh-remote-panel"}),!0)}catch{return!1}}function Ie(n,e={}){let a=new Q,i=e.live??(e.sessions?Le(e.sessions,e.uiSession??null):null);i!==null&&e.sessions&&(a.live=!0,a.scenario={task:{title:"",branch:"",workdir:"",intent:""},steps:[],duration:0},a.events=[],a.duration=0,a.ui.t=0,a.ui.playing=!1);let r=i&&typeof i.subscribe=="function"?i.subscribe(c=>a.setLive(c)):null,o=je(n,a,{...e,onTakeover:()=>i&&typeof i.cancel=="function"?i.cancel():!1,onSelectSession:c=>{i&&typeof i.select=="function"&&i.select(c)},onSend:c=>i&&typeof i.send=="function"?i.send(c):!1,onApprove:(c,l)=>e.approvals?.decide?.(c,l),onWatch:(c,l)=>e.approvals?.watch?.(c,l),onMark:(c,l)=>e.approvals?.relay?.mark?.({sessionId:c,text:l}),onSeen:c=>e.approvals?.relay?.seen?.(c)});i&&typeof i.start=="function"&&i.start();let d=0;if(e.approvals&&typeof e.approvals.list=="function"){let c=()=>{Promise.resolve().then(()=>e.approvals.list()).then(l=>{let k=Array.isArray(l?.entries)?l.entries:[],y=a.approvals.length;a.approvals=k,k.length>y&&typeof document<"u"&&document.hidden===!0&&gt(`\u6709 ${k.length} \u4E2A\u4EFB\u52A1\u7B49\u4F60\u6279\u51C6`,k.map(T=>T.toolName).slice(0,3).join("\u3001")),a.watchInFlight===0&&(a.watching=Array.isArray(l?.watching)?l.watching:[]),a.emit()}).catch(()=>{})};c(),d=setInterval(c,3e3)}return{store:a,dispose:()=>{d!==0&&clearInterval(d),r!==null&&r(),i&&typeof i.stop=="function"&&i.stop(),o()}}}var ze=`.pc{
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
`;var Ae="dsh-remote-panel/console";function mt(){if(typeof document>"u"||document.querySelector(`style[data-plugin-css="${Ae}"]`)!==null)return;let n=document.createElement("style");n.dataset.plugin="dsh-remote-panel",n.dataset.pluginCss=Ae,n.textContent=ze,document.head.appendChild(n)}function xt(n,e){return mt(),Ie(n,e)}

return module.exports;}});

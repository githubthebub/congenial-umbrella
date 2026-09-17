/* End-to-end test with no Google involved: build a test file, serve it over
   HTTP with Range support, point the engine at it, and check what actually
   comes out — including how many bytes the origin had to serve. */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const FF = process.env.FFMPEG || 'ffmpeg';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sieve-'));
const file = path.join(tmp, 'test.mp4');
const SECS = +(process.env.SECS || 300);
let fail = 0;
const ok = (name, cond, extra='') => { console.log((cond?'  ok  ':'  FAIL') + '  ' + name + (extra?'   '+extra:'')); if(!cond) fail++; };

/* A 90 s file: 640x360 video (so there is real video weight to skip) and an
   audio track that is loud for 3 s then silent for 3 s, all the way through.
   No -movflags +faststart, so the moov atom lands at the END of the file —
   which is exactly the case that breaks naive "pipe it into stdin" designs. */
console.log('building a', SECS + 's test file (moov at the end, on purpose)…');
const gen = spawnSync(FF, ['-y','-loglevel','error',
  '-f','lavfi','-i',`testsrc=size=640x360:rate=25:duration=${SECS}`,
  '-f','lavfi','-i',`aevalsrc=0.6*sin(660*2*PI*t)*lt(mod(t\\,6)\\,3):s=44100:d=${SECS}`,
  '-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-shortest',file]);
if (gen.status !== 0) { console.error(gen.stderr.toString().slice(-600)); process.exit(1); }
const size = fs.statSync(file).size;
console.log('  file:', (size/1048576).toFixed(2), 'MB');

/* Origin that counts what it ACTUALLY pushed to the socket. Counting bytes
   read off disk overstates it wildly: piping a small file fills the socket
   buffer before the client has consumed any of it, so an early disconnect
   still looks like a full download. socket.bytesWritten is the truth. */
let served = 0, reqs = [];
const origin = http.createServer((req,res)=>{
  const st = fs.statSync(file), r = req.headers.range;
  const label = r || 'no-range';
  const sock = res.socket, before = sock.bytesWritten;
  res.on('close', ()=>{ const n = sock.bytesWritten - before; served += n; reqs.push({label, n}); });
  if (req.method==='HEAD'){ res.writeHead(200,{'content-length':st.size,'accept-ranges':'bytes','content-type':'video/mp4'}); return res.end(); }
  const m = r && /bytes=(\d*)-(\d*)/.exec(r);
  const s0 = m && m[1] ? +m[1] : 0, e0 = m && m[2] ? +m[2] : st.size-1;
  res.writeHead(m?206:200, m
    ? {'content-range':`bytes ${s0}-${e0}/${st.size}`,'accept-ranges':'bytes','content-length':e0-s0+1,'content-type':'video/mp4'}
    : {'content-length':st.size,'accept-ranges':'bytes','content-type':'video/mp4'});
  fs.createReadStream(file,{start:s0,end:e0}).pipe(res);
});
await new Promise(r=>origin.listen(0,r));
const originPort = origin.address().port;

/* the engine itself, as a separate process, exactly as a user would run it */
const PORT = 8799;
const eng = spawn(process.execPath,['server.js'],{env:{...process.env,PORT:String(PORT)},stdio:['ignore','pipe','pipe']});
let engLog=''; eng.stdout.on('data',d=>engLog+=d); eng.stderr.on('data',d=>engLog+=d);
await new Promise(r=>setTimeout(r,700));

const j = async (u,o)=> (await fetch('http://127.0.0.1:'+PORT+u,o)).json();
try{
  const health = await j('/health');
  ok('engine is up', health.ok===true, JSON.stringify(health));

  const {job} = await j('/index',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({url:`http://127.0.0.1:${originPort}/test.mp4`})});
  ok('job accepted', !!job, job||'');

  let st, tries=0;
  do { await new Promise(r=>setTimeout(r,500)); st = await j('/index/'+job); }
  while (st.state==='running' && ++tries<120);

  console.log('\n--- engine log ---'); (st.log||[]).forEach(l=>console.log('  '+l)); console.log('---\n');
  ok('finished without error', st.state==='done', st.error||'');
  if (st.state!=='done') throw new Error(st.error||'did not finish');

  const idx = st.index;
  ok('duration read through HTTP', Math.abs(idx.source.durationSec-SECS)<=1, idx.source.durationSec+'s');
  ok('envelope is 10 Hz', Math.abs(idx.energy.length-SECS*10)<=12, idx.energy.length+' samples');
  ok('nothing written to disk', st.disk===0, st.disk+' bytes');
  ok('no ASR → flagged energy-only', idx.noText===true);
  ok('no ASR → speech runs, not guessed words',
     idx.words.length>0 && idx.words.every(w=>w.nc===1 && w.d>=0.35),
     idx.words.length+' runs, none carrying text');

  /* the audio was loud for 3 s then silent for 3 s: the envelope must show it */
  const loud=[], quiet=[];
  for (let i=0;i<idx.energy.length;i++){
    const t=i/10, phase=t%6;
    if (phase>0.5 && phase<2.5) loud.push(idx.energy[i]);
    if (phase>3.5 && phase<5.5) quiet.push(idx.energy[i]);
  }
  const avg=a=>a.reduce((x,y)=>x+y,0)/a.length;
  ok('envelope tracks the real audio', avg(loud)>0.4 && avg(quiet)<0.1,
     'loud '+avg(loud).toFixed(3)+' vs silent '+avg(quiet).toFixed(3));

  const idxBytes = JSON.stringify(idx).length;
  console.log('\n--- what it cost ---');
  console.log('  source file        ', (size/1048576).toFixed(2),'MB');
  console.log('  bytes served       ', (served/1048576).toFixed(2),'MB', '(read through, never stored)');
  console.log('  requests           ', reqs.length);
  reqs.forEach(r=>console.log('    · '+String(r.label).padEnd(26)+' → '+(r.n/1048576).toFixed(2)+' MB'));
  console.log('  read amplification ', (served/size).toFixed(2)+'× the file size');
  console.log('  index handed back  ', (idxBytes/1024).toFixed(0),'KB =',
              (idxBytes/size*100).toFixed(2)+'% of the file');
  console.log('  disk written       ', st.disk,'bytes');
} catch(e){ console.log('  FAIL  '+e.message); fail++; }
finally {
  eng.kill(); origin.close(); fs.rmSync(tmp,{recursive:true,force:true});
  if (engLog.trim()) console.log('\n[engine stdout]\n'+engLog.trim().split('\n').map(l=>'  '+l).join('\n'));
  console.log('\n'+(fail?fail+' FAILURES':'all checks passed'));
  process.exit(fail?1:0);
}

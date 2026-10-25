import {readFileSync,writeFileSync} from 'node:fs';
const kind=process.argv[2];
if(!['design','deck-01','deck-02','deck-03'].includes(kind))throw Error('Use design, deck-01, deck-02, or deck-03');
const dir='submission/figma/';
const packed=JSON.parse(readFileSync(dir+'tree-packed.json','utf8'));
const tree=`const PACK=${JSON.stringify(packed)};const paths=PACK.palette.map(()=>[]);for(let i=0;i<PACK.hex.length;i+=6){let x=parseInt(PACK.hex.slice(i,i+2),16)*8,y=parseInt(PACK.hex.slice(i+2,i+4),16)*8,k=parseInt(PACK.hex.slice(i+4,i+6),16);paths[k].push('M'+x+' '+y+'h6v6h-6z');}const TREE_SVG='<svg xmlns="http://www.w3.org/2000/svg" width="820" height="840" viewBox="0 0 820 840">'+paths.map((p,i)=>'<path fill="'+PACK.palette[i]+'" d="'+p.join('')+'"/>').join('')+'</svg>';`;
let code=kind==='design'?tree+'\n'+readFileSync(dir+'build-design.js','utf8'):(kind==='deck-01'?tree:'const LOGS='+readFileSync('submission/stage-log.json','utf8')+';')+'\n'+readFileSync(dir+'deck-preamble.js','utf8')+'\n'+readFileSync(dir+kind+'.js','utf8');
if(code.length>50000)throw Error('Figma code payload exceeds 50,000 characters');
process.stdout.write(code);

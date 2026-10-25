import { mkdirSync, writeFileSync } from 'node:fs';
import { getLandingData } from '../lib/landing/data';
import { growTree } from '../lib/landing/tree';

async function main() {
  const data = await getLandingData();
  const palette = ['#9b958b','#161616','#7a3524','#1f63e6','#86b4f6','#ee7f2d','#f5b867','#bcb7ad','#13307a','#e0457b','#f4abc2','#e5a21a','#6a4bd0'];
  const tree = growTree(data.leaks.map(x => x.cents / Math.max(...data.leaks.map(y => y.cents))));
  const scale = Math.min(756/(tree.bounds.maxX-tree.bounds.minX),776/(tree.bounds.maxY-tree.bounds.minY));
  const cells = new Map<string, {x:number;y:number;ink:number}>();
  for (const dot of tree.dots) {
    const x = Math.round(32+(dot.x-tree.bounds.minX)*scale), y = Math.round(32+(dot.y-tree.bounds.minY)*scale);
    const qx = Math.round(x/4)*4, qy = Math.round(y/4)*4;
    cells.set(`${qx},${qy}`,{x:qx,y:qy,ink:dot.ink});
  }
  const paths = palette.map((color,ink) => `<path fill="${color}" d="${[...cells.values()].filter(d=>d.ink===ink).map(d=>`M${d.x} ${d.y}h3v3h-3z`).join('')}"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="820" height="840" viewBox="0 0 820 840">${paths}</svg>`;
  mkdirSync('submission/prototype',{recursive:true});
  writeFileSync('submission/prototype/tree.svg',svg);
  const compact = new Map<string,{x:number;y:number;ink:number}>();
  for(const d of cells.values()){const x=Math.round(d.x/8),y=Math.round(d.y/8);compact.set(`${x},${y}`,{x,y,ink:d.ink});}
  writeFileSync('submission/figma/tree-packed.json',JSON.stringify({palette,hex:[...compact.values()].map(d=>[d.x,d.y,d.ink].map(n=>n.toString(16).padStart(2,'0')).join('')).join('')}));
  const {points,labels,...summary}=data;
  writeFileSync('submission/prototype/data.json',JSON.stringify({...summary,provenance:{mode:'fixture',anchor:'2026-10-24',source:'lib/landing/data.ts → runDemoOffline → finance engine',recordsAreFictional:true}},null,2));
  writeFileSync('submission/prototype/data.js','window.LEDGER_DATA='+JSON.stringify(summary)+';');
  console.log(JSON.stringify({totalCents:data.totalCents,records:data.stats.records,findings:data.leaks.length,treeCells:cells.size}));
}
main();

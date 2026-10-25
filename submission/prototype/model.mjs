export const STAGES=['discover','prove','prepare','review'];
export function transition(state,event){
  if(event==='reset')return {stage:0,approved:false};
  if(event==='next')return {...state,stage:Math.min(2,state.stage+1)};
  if(event==='approve'&&state.stage===2)return {stage:3,approved:true};
  if(typeof event==='number'&&event>=0&&event<=Math.min(2,state.stage))return {...state,stage:event};
  return state;
}
export function opportunity(data){
 const once=data.leaks.filter(x=>x.once).reduce((s,x)=>s+x.cents,0);
 const recurring=data.leaks.filter(x=>!x.once).reduce((s,x)=>s+x.cents,0);
 return {once,recurring,firstYear:once+recurring,recovered:0};
}

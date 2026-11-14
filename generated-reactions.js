// New model output may react as characters, but must never impersonate a user click.
export function sanitizeGeneratedReactions(message){
 if(!message||message.is_user||message.is_system)return false;
 let changed=false;
 for(const [object,key] of [[message,'mes'],[message.extra,'extblocks'],[message.extra,'display_text']]){
  if(typeof object?.[key]!=='string')continue;
  object[key]=object[key].replace(/<!--\s*tel:(sms|sent|out):(\{[\s\S]*?\})\s*-->/gi,(tag,kind,body)=>{
   let data;try{data=JSON.parse(body);}catch{return tag;}
   if(!['react','reactions','botReactions'].some(key=>Object.hasOwn(data,key)))return tag;
   delete data.react;delete data.reactions;delete data.botReactions;changed=true;return '<!--tel:'+kind+':'+JSON.stringify(data)+'-->';
  });
 }
 if(changed&&Array.isArray(message.swipes)&&Number.isInteger(message.swipe_id))message.swipes[message.swipe_id]=message.mes;
 return changed;
}

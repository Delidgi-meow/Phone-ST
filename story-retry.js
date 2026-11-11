const pending=new WeakMap();
export function storyReactionPending(story){return pending.has(story);}
export function retryStoryReactions(story,api){
 if(pending.has(story))return pending.get(story);
 const owner=api.owner();
 const task=Promise.resolve().then(async()=>{
  const result=await api.generate(story);
  if(api.owner()!==owner||!api.exists(story))return null;
  if(!result)throw new Error(api.emptyError);
  api.receive(story,result);return result;
 }).finally(()=>{pending.delete(story);});
 pending.set(story,task);return task;
}

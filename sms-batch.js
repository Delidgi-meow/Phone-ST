import { getMeta } from './state.js';
const queues=new WeakMap();
export function smsQueue(key){const owner=getMeta();if(!queues.has(owner))queues.set(owner,new Map());const map=queues.get(owner);if(!map.has(key))map.set(key,[]);return map.get(key);}
export function enqueueSms(key,item){if(item.text?.trim()||item.attachment?.image||item.shot)smsQueue(key).push({...item,text:String(item.text||'')});}
export function takeSmsQueue(key){return smsQueue(key).splice(0);}

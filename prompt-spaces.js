export function promptSpaceText(value,settings){
 if(typeof value!=='string')return value;
 if(settings.useFigureSpaces)return value.replace(/ /g,'\u2007');
 if(settings.normalizePromptSpaces)return value.replace(/\u2007/g,' ');
 return value;
}
export function transformPromptMessages(messages,settings){
 for(const message of messages||[]){
  if(typeof message.content==='string')message.content=promptSpaceText(message.content,settings);
  else if(Array.isArray(message.content))for(const part of message.content)if(part?.type==='text'&&typeof part.text==='string')part.text=promptSpaceText(part.text,settings);
 }
 return messages;
}
export function bindPromptSpaces(events,types,settings){
 if(types.CHAT_COMPLETION_PROMPT_READY)events.on(types.CHAT_COMPLETION_PROMPT_READY,event=>{const s=settings();if(!s.isEnabled)return;transformPromptMessages(event.chat,s);});
 if(types.GENERATE_AFTER_COMBINE_PROMPTS)events.on(types.GENERATE_AFTER_COMBINE_PROMPTS,event=>{const s=settings();if(!s.isEnabled)return;event.prompt=promptSpaceText(event.prompt,s);});
}

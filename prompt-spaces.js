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

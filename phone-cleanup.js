import {getMeta,saveMeta,invalidateChatCache} from './state.js';
import {saveChatConditional} from '../../../../script.js';
export function clearStoredPhoneHistory(root,chat){
 for(const message of chat){message.extra||={};message.extra.phoneHistoryCleared=true;}
 for(const key of ['imagePrompts','generatedChatMedia','lastRead','appNotificationState','feedSeen'])delete root[key];
 root.lockDismissed=[];
 if(root.social){for(const key of ['tweets','igPosts','ofPosts','stories'])root.social[key]=[];
  if(root.social.instagram){root.social.instagram.threads=[];root.social.instagram.activity=[];}
 }

}
export async function clearPhoneHistory(){
 const root=getMeta(),chat=SillyTavern.getContext()?.chat||[];clearStoredPhoneHistory(root,chat);invalidateChatCache();saveMeta();await saveChatConditional();
}

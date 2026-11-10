import { getMeta } from './state.js';
import { SMS_REACTIONS, smsReactions, toggleSmsReaction, appleReaction } from './sms-reactions.js';
import { tr } from './i18n.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const bindings=new WeakMap();
const forwardIcon='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14 5v4C7 9 3 13 2 19c4-4 7-6 12-6v4l8-6-8-6Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';

export function smsReactionChips(message,avatar,initial){
    const selected=smsReactions(message);
    const bot=(message.botReactions||[]).map(r=>'<span title="'+esc(r.from)+'">'+appleReaction(r.emoji)+'<small class="gp-reaction-avatar">'+esc(r.from.slice(0,1))+'</small></span>').join('');
    return (selected.length||bot)?'<span class="gp-react-chip">'+selected.map(id=>'<span>'+appleReaction(id)+(avatar?'<img class="gp-reaction-avatar" src="'+esc(avatar)+'" alt="'+esc(tr('Вы'))+'">':'<small class="gp-reaction-avatar">'+esc(initial)+'</small>')+'</span>').join('')+bot+'</span>':'';
}

export function rememberSmsScroll(list){
    if(!list)return null;
    const top=list.getBoundingClientRect().top;
    const anchor=[...list.querySelectorAll('[data-bmi]')].find(e=>e.getBoundingClientRect().bottom>top);
    return {top:list.scrollTop,pinned:list.scrollHeight-list.clientHeight-list.scrollTop<40,index:anchor?.dataset.bmi,offset:anchor?anchor.getBoundingClientRect().top-top:0};
}
export function restoreSmsScroll(list,saved){
    if(!list)return;
    if(!saved||saved.pinned){list.scrollTop=list.scrollHeight;return;}
    const anchor=list.querySelector('[data-bmi="'+saved.index+'"]');
    list.scrollTop=saved.top;
    if(anchor)list.scrollTop+=anchor.getBoundingClientRect().top-list.getBoundingClientRect().top-saved.offset;
}

export function disposeSmsReactions(screen){bindings.get(screen)?.abort();bindings.delete(screen);}

export function bindSmsReactions(screen,thread,{avatar,initial,persist,saved,failed}){
    disposeSmsReactions(screen);
    const controller=new AbortController(),signal=controller.signal,owner=getMeta(),list=screen.querySelector('#gp-msgs');
    if(!list)return;
    bindings.set(screen,controller);screen.classList.add('gp-reaction-host');
    let panel=null,bubble=null,index=-1,expanded=false,writes=Promise.resolve();
    const revisions=new Map(),confirmed=new Map();
    const close=()=>{panel?.remove();panel=null;bubble=null;index=-1;};
    signal.addEventListener('abort',close,{once:true});
    function position(){
        if(!panel||!bubble?.isConnected)return;
        const host=screen.getBoundingClientRect(),view=list.getBoundingClientRect(),rect=bubble.getBoundingClientRect();
        if(rect.bottom<view.top||rect.top>view.bottom){close();return;}
        const size=panel.getBoundingClientRect(),minTop=view.top-host.top+4,maxTop=Math.max(minTop,view.bottom-host.top-size.height-4);
        const left=rect.left-host.left,above=rect.top-host.top-size.height-6;
        panel.style.left=Math.max(6,Math.min(left,host.width-size.width-6))+'px';
        panel.style.top=Math.max(minTop,Math.min(above>=minTop?above:rect.bottom-host.top+6,maxTop))+'px';
    }
    function paint(){
        if(!panel)return;
        const message=thread.messages[index],selected=smsReactions(message);
        panel.innerHTML=(expanded?SMS_REACTIONS:SMS_REACTIONS.slice(0,5)).map(r=>'<button type="button" data-react="'+r.id+'" data-react-mi="'+index+'" aria-pressed="'+selected.includes(r.id)+'" class="'+(selected.includes(r.id)?'gp-selected':'')+'" aria-label="'+esc(tr(r.ru))+'" title="'+esc(tr(r.ru))+'">'+appleReaction(r)+'</button>').join('')+
            '<button type="button" data-react-more aria-expanded="'+expanded+'" aria-label="'+esc(tr(expanded?'Свернуть реакции':'Все реакции'))+'">'+(expanded?'⌃':'⌄')+'</button><button type="button" data-forward-message class="gp-react-forward" title="'+esc(tr('Переслать'))+'" aria-label="'+esc(tr('Переслать'))+'">'+forwardIcon+'</button>';
        position();
    }
    function chips(message,mi){
        const target=list.querySelector('[data-bmi="'+mi+'"]');if(!target)return;
        const top=list.scrollTop;target.querySelector(':scope>.gp-react-chip')?.remove();
        target.insertAdjacentHTML('beforeend',smsReactionChips(message,avatar,initial));
        target.closest('.gp-bubble-wrap')?.classList.toggle('gp-has-react',smsReactions(message).length>0);
        list.scrollTop=top;
    }
    function choose(id){
        const mi=index,message=thread.messages[mi],reaction=SMS_REACTIONS.find(r=>r.id===id);if(!message||!reaction)return;
        if(!confirmed.has(mi))confirmed.set(mi,smsReactions(message));
        const removing=smsReactions(message).includes(id),values=toggleSmsReaction(message,id),revision=(revisions.get(mi)||0)+1;
        revisions.set(mi,revision);message.reactions=values;delete message.react;
        chips(message,mi);paint();
        // Paint the selection first; serialize persistence so quick taps cannot
        // overwrite one another or race against stale message-tag offsets.
        writes=writes.then(async()=>{
            await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
            if(getMeta()!==owner)return;
            const ok=await persist(message,values);
            if(ok){confirmed.set(mi,values);saved?.({message,reaction,removing});}
            else{if(revisions.get(mi)===revision){message.reactions=confirmed.get(mi);if(!signal.aborted){chips(message,mi);paint();}}failed?.();}
        }).catch(()=>{if(getMeta()===owner)failed?.();});
    }
    list.addEventListener('click',event=>{
        if(event.defaultPrevented||event.target.closest('button,a,input,textarea,video,audio,img,[data-shot]'))return;
        const target=event.target.closest('[data-bmi]');if(!target)return;
        const mi=Number(target.dataset.bmi);if(panel&&index===mi){close();return;}
        close();index=mi;bubble=target;expanded=false;
        panel=document.createElement('div');panel.className='gp-react-picker gp-reaction-popover';panel.setAttribute('role','group');panel.setAttribute('aria-label',tr('Все реакции'));
        panel.onclick=event=>{
            event.stopPropagation();const button=event.target.closest('button');if(!button)return;
            if(button.hasAttribute('data-react-more')){expanded=!expanded;paint();}
            else if(button.hasAttribute('data-forward-message')){close();screen.dispatchEvent(new CustomEvent('gp:forward-select'));}
            else if(button.dataset.react)choose(button.dataset.react);
        };
        screen.append(panel);paint();
    },{signal});
    screen.addEventListener('click',event=>{if(panel&&!panel.contains(event.target)&&!event.target.closest('[data-bmi]'))close();},{signal});
    list.addEventListener('scroll',position,{signal,passive:true});
    window.addEventListener('resize',position,{signal,passive:true});
    screen.addEventListener('gp:forward-select',close,{signal});
}

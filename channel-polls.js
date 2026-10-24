import { getMeta, saveMeta } from './state.js';
import { publishToMyChannel, findChanPost } from './channels.js';
import { generateChannelPollVotes, logSocialToChat, getUserName } from './social.js';
import { openPhoneSheet, closePhoneSheet } from './phone-modal.js';
import { checkPostingTasks } from './posting-tasks.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pending=new WeakSet();
export function pollHtml(post) {
    const p=post.poll;if(!p)return '';
    const total=p.votes.reduce((a,b)=>a+b,0)+(p.choice==null?0:1);
    return '<section class="gp-poll"><b>'+esc(p.question)+'</b><small>Анонимный опрос · '+(p.closed?'завершён':'один вариант')+'</small>'+p.options.map((text,i)=>{const count=(p.votes[i]||0)+(p.choice===i?1:0),percent=total?Math.round(count/total*100):0;return '<button type="button" data-poll-choice="'+i+'" data-poll-post="'+esc(post.id)+'" '+(p.closed||p.choice!=null?'disabled':'')+'><span>'+esc(text)+'</span><b>'+percent+'%</b><i style="width:'+percent+'%"></i></button>';}).join('')+'<small>'+total+' голосов</small><button type="button" data-poll-results="'+esc(post.id)+'" '+(p.closed||pending.has(p)?'disabled':'')+'>'+(pending.has(p)?'Собираю голоса…':'Собрать голоса подписчиков')+'</button><button type="button" data-poll-close="'+esc(post.id)+'">'+(p.closed?'Опрос завершён':'Завершить опрос')+'</button></section>';
}
export function openChannelPoll(host,ch,api) {
    const owner=getMeta();
    const shade=openPhoneSheet(host,'Новый опрос','<form class="gp-group-composer"><label>Вопрос<input name="question" maxlength="300" required></label><label>Варианты ответа — каждый с новой строки<textarea name="options" rows="5" required></textarea></label><p data-error role="status"></p><button type="submit" class="gp-web-primary">Опубликовать опрос</button></form>',host.dataset.phoneView||'chans');
    const form=shade.querySelector('form');form.onsubmit=e=>{e.preventDefault();if(owner!==getMeta()||owner.channels?.mine!==ch)return;
        const question=form.elements.question.value.trim(),options=form.elements.options.value.split('\n').map(s=>s.trim()).filter(Boolean);
        if(!question||options.length<2||options.length>10||new Set(options.map(s=>s.toLowerCase())).size!==options.length||options.some(s=>s.length>150)){shade.querySelector('[data-error]').textContent='Нужны вопрос и от 2 до 10 разных вариантов длиной до 150 символов.';return;}
        const post=publishToMyChannel({text:question});post.poll={question,options,votes:options.map(()=>0),choice:null,closed:false};saveMeta();closePhoneSheet(shade);api.changed();api.render();
        checkPostingTasks().catch(error=>console.warn('[Phone] poll task check:',error));
        Promise.resolve(logSocialToChat(`${getUserName()} публикует анонимный опрос в канале «${ch.name}»: ${question}. Варианты: ${options.join('; ')}`)).catch(()=>{});
    };
}
export function bindChannelPolls(host,ch,api) {
    host.querySelectorAll('[data-poll-choice]').forEach(b=>b.onclick=e=>{e.stopPropagation();const p=findChanPost(ch.id,b.dataset.pollPost)?.poll;if(!p||p.closed||p.choice!=null||pending.has(p))return;p.choice=Number(b.dataset.pollChoice);saveMeta();api.render();});
    host.querySelectorAll('[data-poll-close]').forEach(b=>b.onclick=e=>{e.stopPropagation();const p=findChanPost(ch.id,b.dataset.pollClose)?.poll;if(!p||p.closed)return;p.closed=true;saveMeta();api.render();});
    host.querySelectorAll('[data-poll-results]').forEach(b=>b.onclick=async e=>{
        e.stopPropagation();const owner=getMeta(),post=findChanPost(ch.id,b.dataset.pollResults),p=post?.poll;
        if(!p||p.closed||pending.has(p))return;pending.add(p);api.render();
        try{const result=await generateChannelPollVotes(ch,p);
            if(owner!==getMeta()||findChanPost(ch.id,post.id)?.poll!==p||p.closed)return;
            if(!Array.isArray(result?.votes)||result.votes.length!==p.options.length||result.votes.some(v=>!Number.isSafeInteger(v)||v<0)||result.votes.reduce((a,b)=>a+b,0)>Math.max(0,Number(ch.subs)||0))throw new Error('Модель вернула некорректные голоса. Попробуй ещё раз.');
            const old=p.votes.reduce((a,b)=>a+b,0),next=result.votes.reduce((a,b)=>a+b,0);
            if(next>=old&&result.votes.every((v,i)=>v>=p.votes[i]))p.votes=result.votes;
            saveMeta();api.changed();
        }catch(error){if(owner===getMeta())api.toast(error.message,'fa-circle-exclamation');}
        finally{pending.delete(p);if(owner===getMeta()){saveMeta();api.render();}}
    });
}

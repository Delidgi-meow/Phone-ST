import { getMeta, getSettings } from './state.js';
import { harvestBankTags } from './bank.js';
import { generateUserValues } from './social.js';
import { userValueSnapshot, parseUserValue, applyUserValues } from './user-values.js';
import { openPhoneSheet, closePhoneSheet } from './phone-modal.js';
import { lang } from './i18n.js';
const L=(ru,en)=>lang()==='en'?en:ru;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function openUserValues(host,api,{balanceOnly=false}={}) {
    harvestBankTags();const owner=getMeta(),baseline=userValueSnapshot(),version=getSettings().phoneActivityVersion;
    const fields=[['balance',L('Баланс пользователя','User balance')+' · '+baseline.currency],...(!balanceOnly?[['twitter','Twitter / X'],['instagram','Instagram'],['onlyfans','OnlyFans'],...(baseline.telegram===null?[]:[['telegram','Telegram · '+(owner.channels.mine.name||'')]])]:[])];
    const title=balanceOnly?L('Баланс пользователя','User balance'):L('Баланс и подписчики','Balance and followers');
    const intro=balanceOnly?L('Укажи текущий баланс вручную или подбери его по сюжету.','Set the current balance or suggest it from the story.'):L('Задай текущие значения вручную или предложи ИИ заполнить их по сюжету. Подписчики у каждой площадки свои.','Set current values or ask AI for a story-based proposal. Each platform has its own audience.');
    const shade=openPhoneSheet(host,title,'<form class="gp-group-composer gp-values-form"><p>'+intro+'</p>'+fields.map(([key,title])=>'<label style="display:block;margin:12px 0">'+esc(title)+'<input style="display:block;width:100%;box-sizing:border-box" name="'+key+'" inputmode="'+(key==='balance'?'decimal':'numeric')+'" value="'+baseline[key]+'" required></label>').join('')+(!balanceOnly&&baseline.telegram===null?'<p>'+L('Telegram: сначала создай свой канал.','Telegram: create your own channel first.')+'</p>':'')+'<p data-values-status role="status"></p><button type="button" class="gp-web-primary" data-values-generate>'+L('Подобрать по сюжету','Suggest from story')+'</button><button type="submit" class="gp-web-primary" style="margin:12px 0">'+L('Сохранить','Save')+'</button></form>',host.dataset.phoneView||'settings');
    const form=shade.querySelector('form'),status=shade.querySelector('[data-values-status]');let busy=false;
    const current=()=>getMeta()===owner&&shade.isConnected&&version===getSettings().phoneActivityVersion;
    form.onsubmit=e=>{e.preventDefault();if(!current()||busy)return;try{
        applyUserValues(Object.fromEntries(fields.map(([key])=>[key,form.elements[key].value])),baseline,owner);
        closePhoneSheet(shade);api.changed?.();api.render();api.toast(balanceOnly?L('Баланс обновлён','Balance updated'):L('Баланс и подписчики обновлены','Balance and followers updated'),'fa-check');
    }catch(error){status.textContent=error.message;}};
    shade.querySelector('[data-values-generate]').onclick=async()=>{
        if(busy||!current())return;busy=true;form.querySelectorAll('input,button').forEach(el=>el.disabled=true);status.textContent=L('Читаю сюжет, карточку, персону и лорбук…','Reading story, card, persona and lorebook…');
        try{const result=await generateUserValues(balanceOnly?{currency:baseline.currency,balance:baseline.balance}:baseline);if(!current())return;
            const proposal={};for(const [key]of fields)if(result.values[key]!=null)proposal[key]=parseUserValue(result.values[key],key);
            if(!Object.keys(proposal).length)throw new Error(L('Не найдено значений','No values found'));
            for(const [key,value]of Object.entries(proposal))form.elements[key].value=value;
            status.textContent=L('Предложение готово. Проверь и нажми «Сохранить». ','Proposal ready. Review and save. ')+result.reason;
        }catch(error){if(current())status.textContent=error.message;}finally{busy=false;if(shade.isConnected)form.querySelectorAll('input,button').forEach(el=>el.disabled=false);}
    };
}

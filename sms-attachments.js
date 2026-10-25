import { getMeta, isPhoneAppInstalled, phoneAppForThread } from './state.js';
import { getUserName, isImageGenAvailable, generatePostImage, cancelImageGen } from './social.js';
import { preparePhotoUpload, persistPhoto } from './photo-upload.js';
import { openPhoneSheet, closePhoneSheet } from './phone-modal.js';
import { lang } from './i18n.js';
const drafts=new WeakMap();
const L=(ru,en)=>lang()==='en'?en:ru;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function getSmsAttachment(key){return drafts.get(getMeta())?.get(key)||null;}
export function setSmsAttachment(key,value){const owner=getMeta();if(!drafts.has(owner))drafts.set(owner,new Map());if(value)drafts.get(owner).set(key,value);else drafts.get(owner).delete(key);}

export function openSmsAttachments(host,thread,api) {
    const owner=getMeta(),phoneApp=phoneAppForThread(thread.key),view='thread:'+thread.key;
    const current=shade=>getMeta()===owner&&shade.isConnected&&isPhoneAppInstalled(phoneApp);
    const shade=openPhoneSheet(host,L('Прикрепить фото','Attach photo'),'<div class="gp-sms-photo-menu"><button type="button" data-photo-pick><i class="fa-solid fa-image"></i><span>'+L('Выбрать фото','Choose photo')+'</span></button><button type="button" data-photo-create><i class="gp-event-sparkles"></i><span>'+L('Создать по описанию','Create from description')+'</span></button><input type="file" data-photo-file accept="image/*" hidden><p role="status" data-photo-status></p></div>',view);
    const input=shade.querySelector('[data-photo-file]');
    shade.querySelector('[data-photo-pick]').onclick=()=>input.click();
    input.onchange=async()=>{
        const file=input.files?.[0];if(!file)return;shade.querySelectorAll('button:not([data-sheet-close])').forEach(b=>b.disabled=true);
        try{const prepared=await preparePhotoUpload(file);if(!current(shade))return;const image=await persistPhoto(prepared,'sms');if(!current(shade))return;setSmsAttachment(thread.key,{image,description:''});closePhoneSheet(shade);api.attached();}
        catch(error){if(current(shade))shade.querySelector('[data-photo-status]').textContent=error.message;}
        finally{if(shade.isConnected)shade.querySelectorAll('button').forEach(b=>b.disabled=false);}
    };
    shade.querySelector('[data-photo-create]').onclick=()=>{
        if(!current(shade))return;
        openSmsImageCreator(host,thread,api);
    };
}

export function openSmsImageCreator(host,thread,api) {
    const owner=getMeta(),phoneApp=phoneAppForThread(thread.key),key='sms-photo-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);
    const shade=openPhoneSheet(host,L('Фото по описанию','Photo from description'),'<form class="gp-group-composer gp-sms-photo-form"><label>'+L('Что должно быть на фото','What should be in the photo')+'<textarea name="description" maxlength="2000" rows="4" required placeholder="'+L('Например: чашка кофе у окна, вечерний свет','For example: a cup of coffee by the window, evening light')+'"></textarea></label><label>'+L('Формат','Format')+'<select name="aspect"><option value="1:1">1:1</option><option value="9:16">9:16</option><option value="16:9">16:9</option></select></label><p role="status" data-photo-status></p><div class="gp-sms-photo-preview" data-photo-preview hidden></div><div class="gp-sms-photo-actions"><button type="submit" class="gp-web-primary" data-photo-generate>'+L('Создать фото','Generate photo')+'</button><button type="button" class="gp-web-textbutton" data-photo-cancel hidden>'+L('Остановить','Stop')+'</button><button type="button" class="gp-web-primary" data-photo-attach hidden>'+L('Прикрепить','Attach')+'</button></div></form>','thread:'+thread.key);
    const form=shade.querySelector('form'),status=shade.querySelector('[data-photo-status]'),generate=shade.querySelector('[data-photo-generate]'),attach=shade.querySelector('[data-photo-attach]'),cancel=shade.querySelector('[data-photo-cancel]');
    let busy=false,result=null,revision=0;
    const current=()=>getMeta()===owner&&shade.isConnected&&isPhoneAppInstalled(phoneApp);
    shade.cleanup=()=>{revision++;cancelImageGen(key);};
    cancel.onclick=()=>{revision++;cancelImageGen(key);status.textContent=L('Останавливаю…','Stopping…');};
    form.onsubmit=async event=>{
        event.preventDefault();if(busy||!current())return;
        const description=form.elements.description.value.trim();if(!description)return;
        const request=++revision,active=()=>current()&&request===revision;
        busy=true;generate.disabled=true;attach.disabled=true;cancel.hidden=false;form.elements.description.disabled=true;form.elements.aspect.disabled=true;status.textContent=L('Готовлю изображение…','Preparing image…');
        try{
            if(!await isImageGenAvailable())throw new Error(L('Настрой подключение для картинок в настройках телефона.','Configure the image connection in phone settings.'));
            if(!active())return;
            const image=await generatePostImage({ak:'user',author:getUserName(),kind:'ig',imgDesc:description,aspect:form.elements.aspect.value},text=>{if(active())status.textContent=text;},key,{phoneApp,regeneratePrompt:true,descriptionOnly:true});
            if(!active())return;
            result={image,description};const preview=shade.querySelector('[data-photo-preview]');preview.innerHTML='<img src="'+esc(image)+'" alt="'+esc(description)+'">';preview.hidden=false;attach.hidden=false;generate.textContent=L('Другой вариант','Another version');status.textContent=L('Фото готово. Нажми «Прикрепить», чтобы добавить его к сообщению.','Photo ready. Attach it to your message.');
        }catch(error){if(current())status.textContent=error.name==='ImageGenCancelled'||error.name==='AbortError'?L('Генерация остановлена.','Generation stopped.'):String(error.message||error);}
        finally{busy=false;if(shade.isConnected){generate.disabled=false;attach.disabled=false;cancel.hidden=true;form.elements.description.disabled=false;form.elements.aspect.disabled=false;if(request!==revision)status.textContent=L('Генерация остановлена.','Generation stopped.');}}
    };
    attach.onclick=()=>{if(!current()||busy||!result)return;setSmsAttachment(thread.key,result);closePhoneSheet(shade);api.attached();};
}

import { getMeta, saveMeta, isPhoneAppInstalled } from './state.js';
import { generateChatAttachment, getUserName, cancelImageGen } from './social.js';
import { openPhoneSheet, closePhoneSheet } from './phone-modal.js';
import { lang } from './i18n.js';
import { preparePhotoUpload, persistPhoto } from './photo-upload.js';
import { saveSticker } from './chat-media.js';
const L=(ru,en)=>lang()==='en'?en:ru;
const esc=value=>String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function openStickerPicker(host,{phoneApp='list',view='stickers',selected}){
    const owner=getMeta();
    const shade=openPhoneSheet(host,L('Стикеры','Stickers'),'<div class="gp-sticker-library"><div class="gp-sticker-grid"></div><form class="gp-group-composer"><label>'+L('Новый чиби-стикер','New chibi sticker')+'<textarea name="description" rows="2" maxlength="1400" required placeholder="'+L('Таня с чашкой кофе, сонная улыбка','Tanya holding coffee, sleepy smile')+'"></textarea></label><label>'+L('Короткая надпись — по желанию','Short text — optional')+'<input name="caption" maxlength="70" placeholder="'+L('Например: ну привет','For example: oh hi')+'"></label><p role="status"></p><button type="submit" class="gp-web-primary">'+L('Создать стикер','Generate sticker')+'</button></form></div>',view);
    const active=()=>getMeta()===owner&&shade.isConnected&&isPhoneAppInstalled(phoneApp);
    const cancelKey='sticker-picker-'+Date.now();shade.cleanup=()=>cancelImageGen(cancelKey);
    const grid=shade.querySelector('.gp-sticker-grid'),form=shade.querySelector('form'),status=form.querySelector('[role=status]');
    const upload=document.createElement('button');upload.type='button';upload.className='gp-sticker-upload';upload.textContent=L('Загрузить свои стикеры','Upload your stickers');
    const files=document.createElement('input');files.type='file';files.accept='image/png,image/webp,image/gif,image/jpeg';files.multiple=true;files.hidden=true;
    shade.querySelector('.gp-sticker-library').prepend(upload,files);upload.onclick=()=>files.click();
    files.onchange=async()=>{
        if(!active()||form.dataset.busy)return;upload.disabled=true;form.querySelector('button').disabled=true;form.dataset.busy='1';
        let added=0;try{for(const file of [...files.files].slice(0,24)){
            if(!/^image\/(png|webp|gif|jpeg)$/.test(file.type))throw new Error(L('Поддерживаются PNG, WebP, GIF и JPEG','Use PNG, WebP, GIF or JPEG'));
            status.textContent=L('Загружаю…','Uploading…');const prepared=await preparePhotoUpload(file);if(!active())return;
            const image=await persistPhoto(prepared,'sticker');if(!active())return;
            saveSticker(owner,{image,description:file.name.replace(/\.[^.]+$/,'').slice(0,200),caption:''});saveMeta();added++;render();
        }if(active())status.textContent=L('Загружено: ','Uploaded: ')+added+L('. Нажми на стикер, чтобы прикрепить.','. Tap a sticker to attach.');}
        catch(error){if(active())status.textContent=String(error.message||error);}
        finally{delete form.dataset.busy;upload.disabled=false;form.querySelector('button').disabled=false;files.value='';}
    };
    const render=()=>{
        grid.innerHTML=(owner.stickers||[]).map(item=>'<div class="gp-sticker-item"><button type="button" data-sticker="'+esc(item.id)+'" aria-label="'+esc(item.caption||item.description)+'"><img src="'+esc(item.image)+'" alt="'+esc(item.description)+'" loading="lazy"></button><button type="button" data-sticker-delete="'+esc(item.id)+'" aria-label="'+L('Удалить стикер','Delete sticker')+'">×</button></div>').join('')||'<p>'+L('Созданные стикеры сохранятся здесь. Нажми на стикер, чтобы прикрепить.','Generated stickers stay here. Tap one to attach it.')+'</p>';
        grid.querySelectorAll('[data-sticker]').forEach(button=>button.onclick=()=>{if(!active())return;const sticker=owner.stickers.find(item=>item.id===button.dataset.sticker);if(!sticker)return;closePhoneSheet(shade);selected({image:sticker.image,description:sticker.description,mediaKind:'sticker',stickerId:sticker.id,stickerCaption:sticker.caption||''});});
        grid.querySelectorAll('[data-sticker-delete]').forEach(button=>button.onclick=()=>{if(!active())return;owner.stickers=owner.stickers.filter(item=>item.id!==button.dataset.stickerDelete);saveMeta();render();});
    };
    form.onsubmit=async event=>{event.preventDefault();if(!active()||form.dataset.busy)return;const description=form.elements.description.value.trim();if(!description)return;
        form.dataset.busy='1';const button=form.querySelector('button');button.disabled=true;upload.disabled=true;status.textContent=L('Рисую чиби-стикер…','Drawing chibi sticker…');
        try{await generateChatAttachment({kind:'sticker',description,caption:form.elements.caption.value.trim()},{speaker:getUserName(),phoneApp,cancelKey,onStatus:text=>{if(active())status.textContent=text;}});if(active()){render();status.textContent=L('Сохранён. Нажми на него, чтобы прикрепить.','Saved. Tap it to attach.');}}
        catch(error){if(active())status.textContent=String(error.message||error);}
        finally{delete form.dataset.busy;button.disabled=false;upload.disabled=false;}
    };render();
}

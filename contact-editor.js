import { getMeta, saveMeta, getThreadList, addManualContact, renameContact, resolveContactKey, randomNumber } from './state.js';
import { makeHandle, setContactHandle, setContactAvatar, getContactAvatar, compressImage } from './social.js';
import { saveBase64AsFile } from '../../../utils.js';
import { openPhoneSheet, closePhoneSheet } from './phone-modal.js';
import { lang } from './i18n.js';
import { contactAvatarGeneratorHtml, bindContactAvatarGenerator } from './contact-avatar-ui.js';
const L=(ru,en)=>lang()==='en'?en:ru;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function savePhoneContact(data){
    const root=getMeta(),name=String(data.name||'').trim();if(!name)throw new Error(L('Введи имя персонажа','Enter the character’s name'));
    let image=data.avatarImage||'';
    if(data.avatarFile){const compressed=await compressImage(data.avatarFile,512,.85);image=await saveBase64AsFile(compressed.slice(compressed.indexOf(',')+1),'glassphone','contact_'+Date.now(),'jpeg');}
    if(getMeta()!==root)return null;
    const entered=String(data.number||'').trim(),number=entered||(!data.edit?randomNumber():'');
    addManualContact(name,number);const key=resolveContactKey(name);
    if(data.label&&data.label.trim()!==name)renameContact(key,data.label);
    if(data.handle)setContactHandle(key,data.handle);
    if(image)setContactAvatar(key,image,data.avatarFile?null:data.avatarProfile);
    saveMeta();return key;
}
export function openPhoneContactEditor(screen,api,options={}){
    const root=getMeta(),contact=options.contact||null,source=contact?.originalName||contact?.name||'',initialAvatar=contact?getContactAvatar(contact.key):'';
    const shade=openPhoneSheet(screen,L(contact?'Изменить контакт':'Новый контакт',contact?'Edit contact':'New contact'),'<div class="gp-contact-editor">'+
        '<div class="gp-contact-avatar-wrap"><button type="button" class="gp-contact-editor-avatar" id="gp-contact-create-avatar" aria-label="'+L('Загрузить аватарку','Upload an avatar')+'">'+(initialAvatar?'<img src="'+esc(initialAvatar)+'" alt="">':'<i class="fa-solid fa-camera"></i>')+'</button><input type="file" accept="image/*" id="gp-contact-create-file" hidden>'+contactAvatarGeneratorHtml()+'</div><small>'+L('Нажми на фото, чтобы загрузить своё','Tap the photo to upload your own')+'</small>'+
        '<label>'+L(contact?'Имя в твоих контактах':'Имя персонажа','Name')+'<input id="gp-contact-create-name" maxlength="100" value="'+esc(contact?.name||'')+'" placeholder="'+L('Например: Алиса','For example: Alice')+'"></label>'+
        (!contact?'<label>'+L('Имя в контактах · необязательно','Saved label · optional')+'<input id="gp-contact-create-label" maxlength="60" placeholder="'+L('Например: Подруженька','For example: My bestie')+'"></label>':'')+
        '<label>'+L(contact?'Номер':'Номер · пусто = автоматически',contact?'Number':'Number · leave blank to generate')+'<input type="tel" id="gp-contact-create-number" maxlength="60" value="'+esc(contact?.number||options.number||'')+'"></label>'+
        '<label>'+L('Ник · необязательно','Handle · optional')+'<input id="gp-contact-create-handle" maxlength="21" placeholder="'+esc(makeHandle(source))+'"></label>'+
        '<button class="gp-web-primary" id="gp-contact-create-save">'+L(options.stage?'Добавить участника':'Сохранить',options.stage?'Add participant':'Save')+'</button></div>',screen.dataset.phoneView||'list');
    let avatarFile=null,preview='',generatedAvatar='',generatedProfile=null;
    let stopAvatar=()=>{};
    shade.cleanup=()=>{stopAvatar();if(preview)URL.revokeObjectURL(preview);};
    const cancel=()=>{closePhoneSheet(shade);options.onCancel?.();};
    if(options.onCancel){
        shade.querySelector('[data-sheet-close]').onclick=cancel;shade.onclick=e=>{if(e.target===shade)cancel();};
        const original=shade.onkeydown;shade.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancel();}else original(e);};
    }
    const file=shade.querySelector('#gp-contact-create-file'),button=shade.querySelector('#gp-contact-create-avatar');
    button.onclick=()=>file.click();file.onchange=()=>{avatarFile=file.files[0]||null;if(!avatarFile)return;generatedAvatar='';generatedProfile=null;if(preview)URL.revokeObjectURL(preview);preview=URL.createObjectURL(avatarFile);button.innerHTML='<img src="'+esc(preview)+'" alt="">';};
    stopAvatar=bindContactAvatarGenerator(shade,{contact:()=>({key:contact?.key,name:source||shade.querySelector('#gp-contact-create-name').value.trim(),originalName:source}),toast:api.toast,
        onBusy:busy=>{button.disabled=busy;shade.querySelector('#gp-contact-create-save').disabled=busy;if(!contact)shade.querySelector('#gp-contact-create-name').disabled=busy;},
        onGenerated:result=>{avatarFile=null;file.value='';generatedAvatar=result.image;generatedProfile=result;if(preview){URL.revokeObjectURL(preview);preview='';}button.innerHTML='<img src="'+esc(result.image)+'" alt="">';}});
    shade.querySelector('#gp-contact-create-name').oninput=e=>{if(!contact)shade.querySelector('#gp-contact-create-handle').placeholder=makeHandle(e.target.value);};
    shade.querySelector('#gp-contact-create-save').onclick=async()=>{
        const name=shade.querySelector('#gp-contact-create-name').value.trim();if(!name){api.toast(L('Введи имя','Enter a name'));return;}
        const data={name:contact?source:name,label:contact?name:shade.querySelector('#gp-contact-create-label').value.trim(),number:shade.querySelector('#gp-contact-create-number').value.trim(),handle:shade.querySelector('#gp-contact-create-handle').value.trim(),avatarFile,avatarImage:generatedAvatar,avatarProfile:generatedProfile,edit:!!contact};
        const save=shade.querySelector('#gp-contact-create-save');save.disabled=true;
        try{
            let key=null;
            if(!options.stage){key=await savePhoneContact(data);if(!key||getMeta()!==root||!shade.isConnected)return;if(contact){const stored=getMeta().contacts.find(c=>resolveContactKey(c.name)===key);if(stored)stored.number=data.number;renameContact(key,data.label);saveMeta();}api.changed();}
            closePhoneSheet(shade);options.onSave?.(options.stage?data:key);if(!options.onSave)api.render();
        }catch(e){if(shade.isConnected){api.toast(String(e?.message||e),'fa-circle-exclamation');save.disabled=false;}}
    };
    return shade;
}

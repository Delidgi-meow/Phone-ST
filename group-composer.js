import { getMeta, getThreadList, getThread, addGroup, keyOf } from './state.js';
import { openPhoneSheet, closePhoneSheet } from './phone-modal.js';
import { openPhoneContactEditor, savePhoneContact } from './contact-editor.js';
import { lang } from './i18n.js';
const L=(ru,en)=>lang()==='en'?en:ru;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function openGroupComposer(screen,api,draft={name:'',selected:[],newContacts:[]}){
    const root=getMeta(),contacts=getThreadList().filter(t=>!t.isGroup);
    const shade=openPhoneSheet(screen,L('Новая группа','New group'),'<div class="gp-group-composer">'+
        '<label>'+L('Название группы','Group name')+'<input id="gp-group-compose-name" maxlength="40" value="'+esc(draft.name)+'" placeholder="'+L('Например: Наши люди','For example: Our people')+'"></label>'+
        '<b>'+L('Участники','Participants')+'</b><div class="gp-group-existing">'+contacts.map(c=>'<label><input type="checkbox" data-group-contact="'+esc(c.key)+'" '+(draft.selected.includes(c.key)?'checked':'')+'><span>'+esc(c.name)+'</span><small>'+esc(c.originalName===c.name?'':c.originalName)+'</small></label>').join('')+
        (contacts.length?'':'<p>'+L('Сохранённых контактов пока нет','No saved contacts yet')+'</p>')+'</div>'+
        '<div class="gp-group-new">'+draft.newContacts.map((c,i)=>'<div><span>'+esc(c.label||c.name)+'</span><small>'+L('Новый контакт','New contact')+'</small><button type="button" data-group-remove="'+i+'" aria-label="'+L('Убрать участника','Remove participant')+'">×</button></div>').join('')+'</div>'+
        '<button type="button" class="gp-home-primary" id="gp-group-add-new"><i class="fa-solid fa-user-plus"></i> '+L('Добавить нового участника','Add a new participant')+'</button>'+
        '<button type="button" class="gp-web-primary" id="gp-group-compose-save"><i class="fa-solid fa-users"></i> '+L('Создать группу','Create group')+'</button>'+
        (api.generate?'<button type="button" class="gp-web-textbutton" id="gp-group-suggest">'+L('Предложить чаты по ролевой','Suggest groups from the story')+'</button>':'')+'</div>','list');
    function remember(){draft.name=shade.querySelector('#gp-group-compose-name').value;draft.selected=[...shade.querySelectorAll('[data-group-contact]:checked')].map(e=>e.dataset.groupContact);}
    shade.querySelector('#gp-group-add-new').onclick=()=>{remember();closePhoneSheet(shade);openPhoneContactEditor(screen,api,{stage:true,onSave:data=>{draft.newContacts.push(data);openGroupComposer(screen,api,draft);},onCancel:()=>openGroupComposer(screen,api,draft)});};
    shade.querySelectorAll('[data-group-remove]').forEach(b=>b.onclick=()=>{remember();draft.newContacts.splice(Number(b.dataset.groupRemove),1);closePhoneSheet(shade);openGroupComposer(screen,api,draft);});
    shade.querySelector('#gp-group-suggest')?.addEventListener('click',()=>{closePhoneSheet(shade);api.generate();});
    shade.querySelector('#gp-group-compose-save').onclick=async()=>{
        remember();const name=draft.name.trim();if(!name){api.toast(L('Напиши название группы','Enter a group name'));return;}
        if(root.groups.some(g=>keyOf(g.name)===keyOf(name))){api.toast(L('Группа с таким названием уже есть','A group with this name already exists'));return;}
        if(!draft.selected.length&&!draft.newContacts.length){api.toast(L('Выбери участников','Choose participants'));return;}
        const button=shade.querySelector('#gp-group-compose-save');button.disabled=true;
        try{
            const members=draft.selected.map(k=>getThread(k)?.originalName).filter(Boolean);
            for(const contact of draft.newContacts){const key=await savePhoneContact(contact);if(!key||getMeta()!==root||!shade.isConnected)return;members.push(getThread(key)?.originalName||contact.name);}
            addGroup(name,[...new Set(members)]);api.changed();closePhoneSheet(shade);api.open('group:'+keyOf(name));
        }catch(e){if(shade.isConnected){button.disabled=false;api.toast(String(e?.message||e),'fa-circle-exclamation');}}
    };
}

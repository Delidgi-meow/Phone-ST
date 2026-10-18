import { getMeta } from './state.js';
import { normalizePhoneTextNodes } from './phone-text.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function closePhoneSheet(shade){
    if(!shade)return;const host=shade.parentElement;
    shade.cleanup?.();shade.remove();
    if(host){host.classList.remove('gp-phone-modal-open');[...host.children].forEach(el=>el.inert=false);}
    if(shade.returnFocus?.isConnected)shade.returnFocus.focus({preventScroll:true});
}
export function openPhoneSheet(host,title,body,view=''){
    host.querySelectorAll('.gp-phone-sheet-shade').forEach(closePhoneSheet);
    const shade=document.createElement('div');shade.className='gp-phone-sheet-shade gp-web-sheet-shade';shade.dataset.phoneView=view;shade.returnFocus=document.activeElement;shade.ownerRoot=getMeta();
    shade.innerHTML='<section class="gp-web-sheet" role="dialog" aria-modal="true" aria-label="'+esc(title)+'"><header><b>'+esc(title)+'</b><button type="button" class="gp-web-icon" data-sheet-close aria-label="Close">×</button></header>'+body+'</section>';
    host.classList.add('gp-phone-modal-host','gp-phone-modal-open');host.appendChild(shade);
    [...host.children].forEach(el=>el.inert=el!==shade);
    shade.querySelector('[data-sheet-close]').onclick=()=>closePhoneSheet(shade);
    shade.onclick=e=>{if(e.target===shade)closePhoneSheet(shade);};
    shade.onkeydown=e=>{
        if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closePhoneSheet(shade);}
        if(e.key==='Tab'){
            const controls=[...shade.querySelectorAll('button,input,textarea,select,a[href]')].filter(el=>!el.disabled&&!el.hidden&&el.getClientRects().length);
            const first=controls[0],last=controls.at(-1);
            if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
            else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
        }
    };
    normalizePhoneTextNodes(shade);
    shade.querySelector('[data-sheet-close]').focus({preventScroll:true});return shade;
}

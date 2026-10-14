// Paint an app's surface behind the system chrome as well as the content area.
export function applyAppSurface(screen,view){
    const phone=document.getElementById('gp-phone');if(!phone)return;
    let layer=phone.querySelector(':scope > .gp-app-surface-layer');
    if(['home','lock','thread'].includes(view)){
        layer?.remove();phone.classList.remove('gp-app-surface-active');phone.style.removeProperty('--gp-app-chrome-ink');return;
    }
    if(!layer){layer=document.createElement('div');layer.className='gp-app-surface-layer';layer.setAttribute('aria-hidden','true');phone.prepend(layer);}
    const root=screen.querySelector('.gp-channels-list,.gp-wallet,.gp-dc-skin,.gp-twch-skin,.gp-web-shell,.gp-maps-shell');
    const theme=getComputedStyle(phone), surface=root?getComputedStyle(root):null;
    const color=surface?.backgroundColor;
    const transparent=!color||color==='transparent'||/rgba\([^)]*,\s*0\s*\)$/.test(color)||/\/\s*0\s*\)$/.test(color);
    layer.style.backgroundColor=transparent?(theme.getPropertyValue('--gp-home-sheet-bg').trim()||'#202024'):color;
    layer.style.backgroundImage=surface?.backgroundImage||'none';
    layer.style.backgroundSize=surface?.backgroundSize||'cover';
    layer.style.backgroundPosition=surface?.backgroundPosition||'center';
    phone.style.setProperty('--gp-app-chrome-ink',root?.matches('.gp-channels-list,.gp-dc-skin,.gp-twch-skin')?'rgba(255,255,255,.9)':theme.getPropertyValue('--gp-text'));
    phone.classList.add('gp-app-surface-active');
}

const bindings=new WeakMap();
export function setPhoneViewportCompatibility(overlay,enabled){
    overlay?.classList.toggle('gp-viewport-compatible',enabled===true);
}
export function bindPhoneViewport(overlay,view=window){
    if(bindings.has(overlay))return;
    let frame=0;
    const update=()=>{
        frame=0;const viewport=view.visualViewport;
        // Preserve native browser zoom instead of resizing the UI under it.
        if(viewport?.scale&&Math.abs(viewport.scale-1)>.05)return;
        const height=Math.min(view.innerHeight||Infinity,viewport?.height||Infinity);
        const width=Math.min(view.innerWidth||Infinity,viewport?.width||Infinity);
        if(!Number.isFinite(height)||!Number.isFinite(width)||height<=0||width<=0)return;
        for(const [name,value] of Object.entries({height,width,top:viewport?.offsetTop||0,left:viewport?.offsetLeft||0}))overlay.style.setProperty('--gp-visible-'+name,value+'px');
    };
    const schedule=()=>{if(!frame)frame=view.requestAnimationFrame(update);};
    view.addEventListener('resize',schedule,{passive:true});
    view.addEventListener('orientationchange',schedule,{passive:true});
    view.visualViewport?.addEventListener('resize',schedule,{passive:true});
    view.visualViewport?.addEventListener('scroll',schedule,{passive:true});
    bindings.set(overlay,schedule);update();
}

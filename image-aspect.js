// NovelAI's legacy image driver accepts these ratios, rather than all ratios
// supported by other image providers. Keep request overrides within that set.
const NOVELAI_ASPECTS = new Set(['1:1','2:3','3:2','9:16','16:9']);
export function resolvePhoneImageAspect(requested,settings={}){
    if(!requested)return null;
    const aspect=String(requested).trim();
    if(String(settings.apiType||'').toLowerCase()!=='novelai')return aspect;
    if(NOVELAI_ASPECTS.has(aspect))return aspect;
    for(const configured of [settings.aspectRatio,settings.novelaiAspectRatio]){
        const value=String(configured||'').trim();
        if(NOVELAI_ASPECTS.has(value))return value;
    }
    // If the profile supplies no usable ratio, retain the requested orientation.
    const pair=aspect.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
    if(pair&&Number(pair[1])>0&&Number(pair[2])>0){
        return Number(pair[1])>Number(pair[2])?'3:2':Number(pair[1])<Number(pair[2])?'2:3':'1:1';
    }
    return '1:1';
}

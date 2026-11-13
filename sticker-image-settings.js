// Some NovelAI providers encode dimensions in novelaiSize, ignoring aspectRatio.
export function stickerSquareSettings(settings,sizes=null){
 const result={...settings,aspectRatio:'1:1',novelaiAspectRatio:'1:1',overrideAspectRatio:false};
 if(String(settings.apiType||'').toLowerCase()==='novelai'){
  const square=Array.isArray(sizes)?sizes.find(size=>Number(size.width)>0&&Number(size.width)===Number(size.height)):null;
  if(square?.value)result.novelaiSize=square.value;
  else if(/^(Portrait|Landscape|Square)$/i.test(settings.novelaiSize||''))result.novelaiSize='Square';
 }
 return result;
}
export async function prepareStickerImageSettings(settings,mod){
 let sizes=null;
 if(settings.apiType==='novelai'&&mod.folder){try{const config=await import('/scripts/extensions/third-party/'+mod.folder+'/src/settings.js');sizes=config.NOVELAI_SIZES;}catch{/* Legacy drivers use size category plus aspect ratio. */}}
 return stickerSquareSettings(settings,sizes);
}

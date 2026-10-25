import { saveBase64AsFile } from '../../../utils.js';

export async function preparePhotoUpload(file,{maxDimension=2560,quality=.95}={}) {
    const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('Не удалось прочитать фото'));reader.onload=()=>resolve(String(reader.result));reader.readAsDataURL(file);});
    const img=await new Promise((resolve,reject)=>{const image=new Image();image.onerror=()=>reject(new Error('Не удалось открыть фото'));image.onload=()=>resolve(image);image.src=data;});
    const width=img.naturalWidth,height=img.naturalHeight;
    if(!width||!height)throw new Error('Некорректный размер фото');
    // Typical 1080×1920 story uploads remain byte-for-byte unchanged.
    const originalMime=data.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,/i)?.[1]?.toLowerCase();
    if(originalMime&&Math.max(width,height)<=maxDimension&&file.size<=12*1024*1024)return {data,width,height,mime:originalMime};
    const scale=Math.min(1,maxDimension/Math.max(width,height)),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Не удалось обработать фото');
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(img,0,0,canvas.width,canvas.height);
    const mime=originalMime==='image/png'||originalMime==='image/gif'?'image/png':originalMime==='image/webp'?'image/webp':'image/jpeg';
    return {data:canvas.toDataURL(mime,quality),width:canvas.width,height:canvas.height,mime};
}

export async function persistPhoto(image,name='photo') {
    const data=typeof image==='string'?image:image.data;
    const match=data.match(/^data:image\/(jpeg|png|webp|gif);base64,([\s\S]+)$/i);
    if(!match){if(typeof data==='string'&&data&&!data.startsWith('data:'))return data;throw new Error('Некорректный формат фото');}
    const url=await saveBase64AsFile(match[2],'glassphone',name+'_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),match[1].toLowerCase());
    if(typeof url!=='string'||!url)throw new Error('Не удалось сохранить фото');
    return url;
}

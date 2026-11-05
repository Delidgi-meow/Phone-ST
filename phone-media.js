import { saveBase64AsFile } from '../../../utils.js';
import { preparePhotoUpload, persistPhoto } from './photo-upload.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function isVideoMedia(src) {
    return /^data:video\//i.test(String(src||'')) || /\.(?:mp4|webm|mov|m4v)(?:[?#]|$)/i.test(String(src||''));
}
export function isGifMedia(src) {return /^data:image\/gif[;,]/i.test(String(src||'')) || /\.gif(?:[?#]|$)/i.test(String(src||''));}
export function phoneMediaHtml(src,{className='',zoom=true}={}) {
    if(!src)return '';
    return isVideoMedia(src)
        ? `<video class="${esc(className)} gp-video" src="${esc(src)}" controls playsinline preload="metadata"></video>`
        : `<img class="${esc(className)}" src="${esc(src)}" alt=""${zoom?' data-zoom':''}>`;
}

function readData(file) {
    return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('Не удалось прочитать файл'));reader.onload=()=>resolve(String(reader.result));reader.readAsDataURL(file);});
}
function mediaEvent(element,event) {
    return new Promise((resolve,reject)=>{
        const clear=()=>{clearTimeout(timer);element.removeEventListener(event,ok);element.removeEventListener('error',fail);};
        const ok=()=>{clear();resolve();},fail=()=>{clear();reject(new Error('Не удалось прочитать видео. Попробуй MP4 или WebM.'));};
        const timer=setTimeout(fail,15000);element.addEventListener(event,ok,{once:true});element.addEventListener('error',fail,{once:true});
    });
}
export async function uploadPhoneMedia(file,name='media') {
    if(file.size>50*1024*1024)throw new Error('Файл слишком большой: выбери файл до 50 МБ.');
    if(!file.type.startsWith('video/')&&!isVideoMedia(file.name))return persistPhoto(await preparePhotoUpload(file),name);
    const ext=/\.(mp4|webm|mov|m4v)$/i.exec(file.name)?.[1]?.toLowerCase();
    if(!ext)throw new Error('Для видео используй MP4, WebM или MOV.');
    const data=await readData(file),video=document.createElement('video');video.preload='metadata';video.muted=true;video.playsInline=true;
    try{const loaded=mediaEvent(video,'loadedmetadata');video.src=data;await loaded;if(!video.videoWidth)throw new Error('В видео нет изображения.');}
    finally{video.removeAttribute('src');video.load();}
    // The host image endpoint explicitly supports these video containers too.
    return saveBase64AsFile(data.slice(data.indexOf(',')+1),'glassphone',`${name}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,ext==='m4v'?'mp4':ext);
}

function contactSheet(frames,labels) {
    const width=512,height=384,columns=frames.length===1?1:2,rows=Math.ceil(frames.length/columns);
    const canvas=document.createElement('canvas');canvas.width=width*columns;canvas.height=(height+32)*rows;
    const context=canvas.getContext('2d');context.fillStyle='#111';context.fillRect(0,0,canvas.width,canvas.height);
    frames.forEach((frame,index)=>{
        const w=frame.displayWidth||frame.videoWidth||frame.naturalWidth||frame.width,h=frame.displayHeight||frame.videoHeight||frame.naturalHeight||frame.height;
        const scale=Math.min(width/w,height/h),x=(index%columns)*width,y=Math.floor(index/columns)*(height+32);
        context.drawImage(frame,x+(width-w*scale)/2,y+(height-h*scale)/2,w*scale,h*scale);
        context.fillStyle='white';context.font='18px sans-serif';context.fillText(labels[index],x+10,y+height+23);
    });
    return canvas.toDataURL('image/jpeg',.9);
}

// Send a static, chronological contact sheet to image-capable APIs rather than
// putting video bytes in image_url. Audio is intentionally absent.
export async function phoneMediaVisionData(src,blob) {
    const videoMedia=isVideoMedia(src)||blob.type.startsWith('video/');
    const gif=isGifMedia(src)||blob.type==='image/gif';
    if(!videoMedia&&!gif)return readData(blob);
    if(gif&&typeof ImageDecoder!=='undefined'&&await ImageDecoder.isTypeSupported('image/gif')){
        const decoder=new ImageDecoder({data:await blob.arrayBuffer(),type:'image/gif',preferAnimation:true}),frames=[];
        try{
            await decoder.tracks.ready;await decoder.completed;
            const count=decoder.tracks.selectedTrack.frameCount;
            const indexes=[...new Set([0,Math.floor((count-1)/3),Math.floor((count-1)*2/3),count-1])];
            for(const frameIndex of indexes)frames.push((await decoder.decode({frameIndex})).image);
            return contactSheet(frames,indexes.map(index=>'GIF frame '+(index+1)+' / '+count));
        }finally{frames.forEach(frame=>frame.close());decoder.close();}
    }
    const url=URL.createObjectURL(blob);
    try{
        if(gif){const image=new Image();const loaded=mediaEvent(image,'load');image.src=url;await loaded;return contactSheet([image],['GIF: one still frame only; motion unavailable']);}
        const video=document.createElement('video');video.preload='auto';video.muted=true;video.playsInline=true;
        try{
            const loaded=mediaEvent(video,'loadeddata');video.src=url;await loaded;
            // Some valid recorded WebM files have no duration index. A single
            // labeled frame is preferable to inventing a timeline or failing.
            if(!Number.isFinite(video.duration)||video.duration<=0)return contactSheet([video],['Video: first frame only; duration unavailable; no audio']);
            const frames=[],labels=[];
            for(const fraction of [.02,.33,.66,.98]){
                const time=Math.min(video.duration-.001,Math.max(0,video.duration*fraction));
                if(Math.abs(video.currentTime-time)>.001){const seeked=mediaEvent(video,'seeked');video.currentTime=time;await seeked;}
                const canvas=document.createElement('canvas'),scale=Math.min(1,768/Math.max(video.videoWidth,video.videoHeight));
                canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);frames.push(canvas);labels.push(time.toFixed(1)+'s / '+video.duration.toFixed(1)+'s; no audio');
            }
            return contactSheet(frames,labels);
        }finally{video.removeAttribute('src');video.load();}
    }finally{URL.revokeObjectURL(url);}
}

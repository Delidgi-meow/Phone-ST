import { getNotes, addNote, updateNote, deleteNote, toggleNoteShared } from './notes.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let active=null;
const colors=['#242424','#777777','#ffffff','#e34b4b','#ef9b32','#edcf45','#46a36a','#418ee6','#8864c7','#dc78a5'];

export function renderNotesApp(screen,{onHome,onChange,icon}){
    const notes=getNotes();
    if(active&&active.owner!==notes)active=null;
    if(!active){
        screen.innerHTML=`<section class="gp-ios-notes"><header><button data-home aria-label="На главный экран">${icon('fa-chevron-left')}</button><span></span></header><h1>Заметки</h1><label class="gp-notes-search">${icon('fa-magnifying-glass')}<input type="search" placeholder="Поиск" aria-label="Поиск заметок"></label><div class="gp-ios-note-list"></div><footer><span>${notes.length} заметок</span><button data-new aria-label="Новая заметка">${icon('fa-pen-to-square')}</button></footer></section>`;
        const list=screen.querySelector('.gp-ios-note-list');
        function filter(query=''){
            const found=notes.filter(n=>n.text.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
            list.innerHTML=found.map(n=>{const lines=n.text.split('\n').filter(Boolean);return `<button class="gp-ios-note-row" data-note="${esc(n.id)}"><strong ${lines[0]?'data-gp-content':''}>${esc(lines[0]||'Рисунок')}</strong><span ${lines.slice(1).length?'data-gp-content':''}>${n.shared?icon('fa-eye')+' ':''}${esc(lines.slice(1).join(' ').slice(0,100)||(n.drawing?.strokes?.length?'Рисунок':'Нет дополнительного текста'))}</span></button>`;}).join('')||'<div class="gp-ios-note-empty">'+(query?'Ничего не найдено':'Нет заметок')+'</div>';
            list.querySelectorAll('[data-note]').forEach(b=>b.onclick=()=>{const n=notes.find(n=>n.id===b.dataset.note);active={id:n.id,text:n.text,drawing:structuredClone(n.drawing||{strokes:[]}),shared:n.shared,owner:notes};renderNotesApp(screen,{onHome,onChange,icon});});
        }
        filter();screen.querySelector('input').oninput=e=>filter(e.target.value);
        screen.querySelector('[data-home]').onclick=onHome;
        screen.querySelectorAll('[data-new]').forEach(b=>b.onclick=()=>{active={id:null,text:'',drawing:{strokes:[]},shared:false,owner:notes};renderNotesApp(screen,{onHome,onChange,icon});screen.querySelector('textarea').focus();});
        return;
    }
    const draft=active;
    function save(){
        if(draft.id)updateNote(draft.id,draft.text,draft.drawing);
        else {const n=addNote(draft.text,draft.drawing);if(n){draft.id=n.id;if(draft.shared)toggleNoteShared(n.id);}}
        onChange();
    }
    screen.innerHTML=`<section class="gp-ios-notes gp-ios-note-editor"><header><button data-list>${icon('fa-chevron-left')} Заметки</button><div><button data-share aria-label="${draft.shared?'Скрыть от модели':'Показать модели'}" title="${draft.shared?'Видна модели':'Личная заметка'}">${icon(draft.shared?'fa-eye':'fa-eye-slash')}</button><button data-delete aria-label="Удалить заметку">${icon('fa-trash-can')}</button><button data-done>Готово</button></div></header><div class="gp-ios-note-paper"><textarea data-note-text maxlength="20000" placeholder="Заголовок&#10;Начни писать…" aria-label="Текст заметки"></textarea><div class="gp-note-sketch" ${draft.drawing.strokes.length?'':'hidden'}><canvas aria-label="Рисунок в заметке"></canvas></div></div><div class="gp-note-art-tools" hidden><div class="gp-note-pens"><button data-tool="brush" title="Кисть" aria-label="Кисть">${icon('fa-paintbrush')}<small>Кисть</small></button><button data-tool="pencil" title="Карандаш" aria-label="Карандаш">${icon('fa-pencil')}<small>Карандаш</small></button><button data-tool="eraser" title="Ластик" aria-label="Ластик">${icon('fa-eraser')}<small>Ластик</small></button><label title="Толщина"> <input data-width type="range" min="1" max="24" value="6" aria-label="Толщина линии"></label><button data-undo aria-label="Отменить штрих">${icon('fa-rotate-left')}</button></div><div class="gp-note-palette">${colors.map(c=>`<button data-color="${c}" style="--ink:${c}" aria-label="Цвет ${c}"></button>`).join('')}<label title="Палитра"><input type="color" value="#242424" aria-label="Выбрать цвет"></label></div></div><footer><button data-draw aria-label="Рисовать">${icon('fa-pen-nib')}</button><span data-save-status>Сохраняется автоматически</span><button data-check title="Добавить пункт списка" aria-label="Добавить пункт списка">${icon('fa-list-check')}</button></footer></section>`;
    const area=screen.querySelector('[data-note-text]');area.value=draft.text;
    area.oninput=()=>{draft.text=area.value;save();};
    const back=()=>{save();active=null;renderNotesApp(screen,{onHome,onChange,icon});};
    screen.querySelector('[data-list]').onclick=back;screen.querySelector('[data-done]').onclick=back;
    screen.querySelector('[data-delete]').onclick=()=>{if(draft.id){deleteNote(draft.id);onChange();}active=null;renderNotesApp(screen,{onHome,onChange,icon});};
    screen.querySelector('[data-share]').onclick=()=>{if(draft.id){save();draft.shared=toggleNoteShared(draft.id);}else draft.shared=!draft.shared;onChange();renderNotesApp(screen,{onHome,onChange,icon});};
    const privacy=document.createElement('div');privacy.className='gp-note-privacy';privacy.textContent=draft.shared?'Видна модели':'Личная заметка';screen.querySelector('.gp-ios-note-paper').before(privacy);
    screen.querySelector('[data-check]').onclick=()=>{const pos=area.selectionStart;area.setRangeText((pos&&area.value[pos-1]!=='\n'?'\n':'')+'☐ ',pos,area.selectionEnd,'end');area.dispatchEvent(new Event('input'));area.focus();};
    const canvas=screen.querySelector('canvas'),ctx=canvas.getContext('2d'),sketch=canvas.parentElement,tools=screen.querySelector('.gp-note-art-tools');
    let tool='brush',color=getComputedStyle(area).color,width=6,stroke=null;
    // Fixed drawing coordinates keep existing strokes stable at every phone width.
    canvas.width=800;canvas.height=600;
    function redraw(){
        ctx.clearRect(0,0,800,600);
        for(const s of draft.drawing.strokes){
            if(s.tool==='pencil'){
                // Deterministic graphite grains, rather than a translucent brush line.
                let seed=s.seed||12563;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
                ctx.globalCompositeOperation='source-over';ctx.fillStyle=s.color;
                for(let i=0;i<s.points.length;i++){
                    const p=s.points[i],prev=s.points[i-1]||p,dx=(p[0]-prev[0])*800,dy=(p[1]-prev[1])*600,steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)*1.5));
                    for(let j=0;j<steps;j++)for(let k=0;k<3;k++){
                        const t=j/steps,x=prev[0]*800+dx*t+(random()-.5)*s.width,y=prev[1]*600+dy*t+(random()-.5)*s.width;
                        ctx.globalAlpha=.12+random()*.38;ctx.beginPath();ctx.arc(x,y,.25+random()*.55,0,Math.PI*2);ctx.fill();
                    }
                }
                continue;
            }
            ctx.globalCompositeOperation=s.tool==='eraser'?'destination-out':'source-over';ctx.strokeStyle=s.color;ctx.fillStyle=s.color;ctx.globalAlpha=s.tool==='pencil'?.65:1;ctx.lineCap='round';ctx.lineJoin='round';
            for(let i=0;i<s.points.length;i++){const p=s.points[i],prev=s.points[i-1]||p;ctx.lineWidth=s.width*(s.tool==='brush'?(p[2]||.5)*1.5+.25:1);ctx.beginPath();ctx.moveTo(prev[0]*800,prev[1]*600);ctx.lineTo(p[0]*800+.01,p[1]*600+.01);ctx.stroke();}
        }
        ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    }
    function selections(){screen.querySelectorAll('[data-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tool===tool)));screen.querySelectorAll('[data-color]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.color===color)));}
    selections();redraw();
    screen.querySelector('[data-draw]').onclick=e=>{const opening=tools.hidden;tools.hidden=!opening;sketch.hidden=false;canvas.classList.toggle('gp-drawing-active',opening);e.currentTarget.setAttribute('aria-pressed',String(opening));if(opening)sketch.scrollIntoView({block:'nearest'});};
    screen.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>{tool=b.dataset.tool;selections();});
    screen.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>{color=b.dataset.color;selections();});
    screen.querySelector('[type=color]').oninput=e=>{color=e.target.value;selections();};screen.querySelector('[data-width]').oninput=e=>{width=Number(e.target.value);};
    screen.querySelector('[data-undo]').onclick=()=>{draft.drawing.strokes.pop();redraw();save();};
    const point=e=>{const r=canvas.getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height)),e.pressure||.5];};
    canvas.onpointerdown=e=>{if(tools.hidden||e.button>0)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);stroke={tool,color,width,seed:Math.floor(Math.random()*4294967296),points:[point(e)]};draft.drawing.strokes.push(stroke);redraw();};
    canvas.onpointermove=e=>{if(!stroke)return;e.preventDefault();const samples=e.getCoalescedEvents?.();for(const p of samples?.length?samples:[e])stroke.points.push(point(p));redraw();};
    const finish=()=>{if(stroke){stroke=null;save();}};canvas.onpointerup=finish;canvas.onpointercancel=finish;canvas.onlostpointercapture=finish;
}

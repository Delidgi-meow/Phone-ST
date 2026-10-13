import { webState, openWebPage } from './web.js';
import { getMeta, saveMeta, getThread, getThreadList, isSmsBlocked } from './state.js';
import { generatePhoneQuiz, generatePhoneQuizPartner, logSocialToChat, getUserName } from './social.js';
import { lang } from './i18n.js';
const L=(ru,en)=>lang()==='en'?en:ru;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cut=(v,n)=>String(v??'').trim().slice(0,n);
const generating=new WeakSet(),running=new WeakSet(),drafts=new WeakMap();
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
function templates(){
    const result=(id,ru,en,textRu,textEn)=>({id,title:L(ru,en),text:L(textRu,textEn)});
    const q=(textRu,textEn,choices)=>({text:L(textRu,textEn),choices:choices.map((c,i)=>({id:String(i),text:L(c[0],c[1]),result:c[2]}))});
    const relax=[
        result('city','Искатель впечатлений','An explorer','Тебе хочется новых мест и маленьких открытий. Даже знакомый город может удивить.','New places and small discoveries sound inviting. Even a familiar city can surprise you.'),
        result('nature','Любитель простора','An open-air soul','Прогулка, свежий воздух и возможность никуда не спешить — твой приятный сценарий.','Fresh air, a walk and no rush make a lovely day.'),
        result('cozy','Хранитель уюта','A cozy soul','Тепло, хороший фильм и свои люди рядом — вечер уже удался.','Warmth, a good film and your favorite people make a lovely evening.')
    ];
    const weekend=[
        q('Свободный день начался. Куда тянет?','A free day begins. Where do you want to go?', [['На выставку','An exhibition','city'],['В парк','A park','nature'],['За кофе и домой','Coffee, then home','cozy']]),
        q('Что взять с собой?','What will you bring?', [['Камеру для находок','A camera for discoveries','city'],['Удобную обувь','Comfortable shoes','nature'],['Любимую книгу','A favorite book','cozy']]),
        q('Начался дождь. Новый план?','It starts raining. New plan?', [['Найти необычное кафе','Find an unusual café','city'],['Прогуляться под зонтом','Take an umbrella walk','nature'],['Плед и фильм','A blanket and a film','cozy']]),
        q('Идеальный перекус?','An ideal snack?', [['Попробовать что-то новое','Try something new','city'],['Пикник на свежем воздухе','An outdoor picnic','nature'],['Что-то домашнее','Something homemade','cozy']]),
        q('Что хочется помнить о вечере?','What do you want to remember?', [['Неожиданную находку','An unexpected discovery','city'],['Красивый закат','A beautiful sunset','nature'],['Тёплый разговор','A warm conversation','cozy']])
    ];
    const date=[
        q('Встреча начинается с…','A date begins with…',[['Спонтанного маршрута','A spontaneous route','city'],['Прогулки без спешки','An unhurried walk','nature'],['Тихого уютного места','A quiet cozy place','cozy']]),
        q('Чем удивить друг друга?','How would you surprise each other?',[['Найти новое впечатление','Find a new experience','city'],['Показать любимый вид','Share a favorite view','nature'],['Приготовить что-то вместе','Cook something together','cozy']]),
        q('Вечер пошёл не по плану. Что делаем?','The evening changes plans. What next?',[['Импровизируем','Improvise','city'],['Просто гуляем дальше','Keep walking','nature'],['Ищем спокойное место','Find somewhere calm','cozy']]),
        q('Какой момент особенно приятен?','Which moment feels best?',[['Когда смеёмся над неожиданностью','Laughing at a surprise','city'],['Когда молчим рядом и смотрим вокруг','Sharing a quiet view','nature'],['Когда можно поговорить по душам','A heartfelt conversation','cozy']]),
        q('Как завершить встречу?','How will the date end?',[['Придумать следующую авантюру','Plan the next adventure','city'],['Пройти чуть длиннее до дома','Take the long way home','nature'],['Ещё чашечкой чая','One more cup of tea','cozy']])
    ];
    const habits=[
        q('Появились два свободных часа. Что первым делом?','You have two spare hours. What first?',[['Проверить, что происходит в городе','See what is happening in town','city'],['Выйти проветриться','Go get some fresh air','nature'],['Наконец устроиться поудобнее','Finally get comfortable','cozy']]),
        q('Что хочется добавить в обычный день?','What would improve an ordinary day?',[['Маленький сюрприз','A small surprise','city'],['Больше света и воздуха','More daylight and fresh air','nature'],['Больше спокойствия','More calm','cozy']]),
        q('Что приятнее получить в сообщении?','What message would you enjoy?',[['Пойдём исследовать новое место?','Want to explore somewhere new?','city'],['Пойдём прогуляемся?','Want to take a walk?','nature'],['Я рядом, рассказывай','I am here. Tell me.','cozy']]),
        q('Что запоминается в новом месте?','What do you remember about a new place?',[['Необычные детали','Unusual details','city'],['Пейзаж и ощущение пространства','The view and open space','nature'],['Атмосфера и люди','The atmosphere and people','cozy']]),
        q('Приятный ритуал перед сном?','A pleasant bedtime ritual?',[['Придумать план на завтра','Dream up tomorrow’s plans','city'],['Посмотреть на вечернее небо','Look at the evening sky','nature'],['Чай и разговор','Tea and conversation','cozy']])
    ];
    return [
        {id:'weekend',title:L('Твой идеальный выходной','Your ideal day off'),summary:L('Пять маленьких выборов для большого свободного дня.','Five small choices for a lovely free day.'),questions:weekend,results:relax,icon:'fa-sun'},
        {id:'date',title:L('Какая встреча вам по душе?','What is your kind of date?'),summary:L('Выберите свой вечер и сравните, насколько совпали желания.','Choose an evening and compare what you both enjoy.'),questions:date,results:relax,icon:'fa-heart'},
        {id:'habits',title:L('Маленькие привычки','Little habits'),summary:L('Узнайте, какие мелочи делают день приятнее для каждого из вас.','Find out which small things make your days better.'),questions:habits,results:relax,icon:'fa-mug-saucer'}
    ].map(t=>({...t,questions:t.questions.map((q,i)=>({...q,id:'q'+(i+1)}))}));
}
export function normalizePhoneQuiz(raw){
    const results=(Array.isArray(raw?.results)?raw.results:[]).slice(0,5).map((r,i)=>({id:cut(r.id||String(i),30),title:cut(r.title,90),text:cut(r.text,500)})).filter(r=>r.title);
    if(results.length<2||new Set(results.map(r=>r.id)).size!==results.length)throw new Error(L('Не удалось прочитать результаты теста','Invalid quiz results'));
    const questions=(Array.isArray(raw?.questions)?raw.questions:[]).slice(0,8).map((q,i)=>{
        const choices=(Array.isArray(q.choices)?q.choices:[]).slice(0,4).map((c,j)=>({id:'c'+j,text:cut(c.text,180),result:results.some(r=>r.id===String(c.result))?String(c.result):results[j%results.length].id})).filter(c=>c.text);
        return {id:'q'+i,text:cut(q.text,260),choices};
    }).filter(q=>q.text&&q.choices.length>=2);
    if(questions.length<3)throw new Error(L('В тесте слишком мало вопросов','Too few quiz questions'));
    return {title:cut(raw.title,120)||L('Новый тест','New quiz'),summary:cut(raw.summary,400),questions,results};
}
function pool(){const {w,session}=webState();return session.private?session.pages:w.pages;}
function runs(){const {w,session}=webState(),target=session.private?session:w;if(!target.quizRuns||typeof target.quizRuns!=='object')target.quizRuns={};return target.quizRuns;}
function save(){if(!webState().session.private)saveMeta();}
function addPage(quiz,key=''){
    const id=key||'quiz:'+uid(),pages=pool();let page=pages.find(p=>p.id===id);
    if(!page){page={id,kind:'quiz',url:'https://quizzes.test/'+id.replace(/:/g,'/'),title:quiz.title,summary:quiz.summary,paragraphs:[],quiz};pages.push(page);save();}
    openWebPage(page.id);return page;
}
export function quizHubHTML(){
    const saved=pool().filter(p=>p.kind==='quiz'&&!p.id.startsWith('quiz:built:'));
    return '<div class="gp-quiz-hub"><span class="gp-web-eyebrow">'+L('МАЛЕНЬКИЕ ОТКРЫТИЯ','LITTLE DISCOVERIES')+'</span><h1>'+L('А ты какой<br>вариант выберешь?','What would<br>you choose?')+'</h1><p>'+L('Проходи один или вместе с контактом. Ответы персонажа появляются после твоего выбора.','Play solo or with a contact. Their answers appear after your choice.')+'</p>'+
        '<div class="gp-quiz-catalog">'+templates().map(t=>'<button data-quiz-template="'+t.id+'"><i class="fa-solid '+t.icon+'"></i><span><b>'+esc(t.title)+'</b><small>'+esc(t.summary)+'</small></span><i class="fa-solid fa-chevron-right"></i></button>').join('')+'</div>'+
        '<form id="gp-web-quiz-create"><label>'+L('Создай тест по своей теме','Create a quiz on your topic')+'</label><div><input id="gp-web-quiz-topic" maxlength="160" value="'+esc(drafts.get(getMeta())||'')+'" placeholder="'+L('Например: какое вы мифическое существо','For example: which mythical creature are you?')+'"><button type="submit" '+(generating.has(getMeta())?'disabled':'')+'><i class="fa-solid '+(generating.has(getMeta())?'fa-spinner fa-spin':'fa-wand-magic-sparkles')+'"></i></button></div></form>'+
        (saved.length?'<h2>'+L('Твои тесты','Your quizzes')+'</h2>'+saved.map(p=>'<button class="gp-quiz-saved" data-open-page="'+esc(p.id)+'">'+esc(p.title)+'</button>').join(''):'')+'</div>';
}
function resultFor(quiz,answers){
    const counts=new Map(quiz.results.map(r=>[r.id,0]));
    for(const q of quiz.questions){const chosen=q.choices.find(c=>c.id===answers[q.id]);if(chosen)counts.set(chosen.result,(counts.get(chosen.result)||0)+1);}
    return [...quiz.results].sort((a,b)=>(counts.get(b.id)||0)-(counts.get(a.id)||0))[0];
}
export function quizShareText(page){
    const r=runs()[page.id];if(!r?.finished)return [page.title,page.summary,page.url].join('\n');
    const mine=resultFor(page.quiz,r.answers);
    const lines=[page.title,L('Мой результат: ','My result: ')+mine.title,mine.text];
    if(r.partnerKey){const theirs=resultFor(page.quiz,r.partnerAnswers);lines.push(r.partnerLabel+': '+theirs.title,L('Совпали ответы: ','Matching choices: ')+page.quiz.questions.filter(q=>r.answers[q.id]===r.partnerAnswers[q.id]).length+'/'+page.quiz.questions.length);}
    lines.push(page.url);return lines.join('\n').slice(0,1600);
}
export function quizPageHTML(page){
    const quiz=page.quiz,r=runs()[page.id];
    const heading='<div class="gp-quiz-heading"><button class="gp-web-textbutton" data-web-action="quizzes">‹ '+L('Все тесты','All quizzes')+'</button><span class="gp-web-eyebrow">'+L('ТЕСТ ДЛЯ НАСТРОЕНИЯ','JUST FOR FUN')+'</span><h1>'+esc(page.title)+'</h1><p>'+esc(page.summary)+'</p></div>';
    if(!r)return heading+'<div class="gp-quiz-intro"><button class="gp-web-primary" data-quiz-start="">'+L('Пройти одному','Play solo')+'</button><label>'+L('Или пройти вместе','Or play together')+'<select id="gp-web-quiz-partner"><option value="">'+L('Выбери контакт','Choose a contact')+'</option>'+getThreadList().filter(t=>!t.isGroup&&!isSmsBlocked(t.key)).map(t=>'<option value="'+esc(t.key)+'">'+esc(t.name)+'</option>').join('')+'</select></label><button class="gp-home-primary" data-quiz-together>'+L('Пригласить и начать','Invite and start')+'</button><small>'+L(quiz.questions.length+' вопросов · прогресс сохранится в этой вкладке',quiz.questions.length+' questions · progress stays in this tab')+'</small></div>';
    if(running.has(r))return heading+'<div class="gp-quiz-wait"><i class="fa-solid fa-spinner fa-spin"></i><b>'+esc(r.partnerLabel)+L(' выбирает ответы…',' is choosing answers…')+'</b><p>'+L('Твои варианты ему пока не показываем.','Your choices have not been shown yet.')+'</p></div>';
    if(r.error||r.pending||r.busy)return heading+'<div class="gp-web-error">'+esc(r.error||L('Ответы персонажа ещё не готовы. Начни снова.','The character’s answers are not ready. Please restart.'))+'</div><div class="gp-quiz-intro"><button class="gp-web-primary" data-quiz-start="'+esc(r.partnerKey)+'">'+L('Попробовать снова','Try again')+'</button><button class="gp-home-primary" data-quiz-reset>'+L('Выбрать другой режим','Choose another mode')+'</button></div>';
    if(r.finished){
        const mine=resultFor(quiz,r.answers),theirs=r.partnerKey?resultFor(quiz,r.partnerAnswers):null;
        const matches=quiz.questions.filter(q=>r.answers[q.id]===r.partnerAnswers[q.id]).length;
        return heading+'<div class="gp-quiz-results"><div class="gp-quiz-result"><span>'+L('ТВОЙ РЕЗУЛЬТАТ','YOUR RESULT')+'</span><h2>'+esc(mine.title)+'</h2><p>'+esc(mine.text)+'</p></div>'+
            (theirs?'<div class="gp-quiz-result"><span>'+esc(r.partnerLabel)+'</span><h2>'+esc(theirs.title)+'</h2><p>'+esc(theirs.text)+'</p></div><div class="gp-quiz-match"><b>'+matches+' / '+quiz.questions.length+'</b><span>'+L('ответов совпало','matching choices')+'</span></div>':'')+
            '<div class="gp-quiz-review">'+quiz.questions.map(q=>'<details><summary>'+esc(q.text)+'</summary><p>'+L('Твой выбор: ','Your choice: ')+esc(q.choices.find(c=>c.id===r.answers[q.id])?.text||'')+'</p>'+(r.partnerKey?'<p>'+esc(r.partnerLabel)+': '+esc(q.choices.find(c=>c.id===r.partnerAnswers[q.id])?.text||'')+'</p><small>'+esc(r.partnerComments[q.id]||'')+'</small>':'')+'</details>').join('')+'</div>'+
            '<button class="gp-web-primary" data-web-action="share">'+L('Поделиться результатом','Share results')+'</button><button class="gp-web-textbutton" data-quiz-reset>'+L('Пройти заново','Play again')+'</button></div>';
    }
    const index=Math.min(r.index||0,quiz.questions.length-1),q=quiz.questions[index],chosen=r.answers[q.id],partnerChosen=r.partnerAnswers[q.id];
    return heading+'<div class="gp-quiz-question"><div class="gp-quiz-progress"><span>'+L('Вопрос ','Question ')+(index+1)+' / '+quiz.questions.length+'</span>'+(r.partnerKey?'<b>'+esc(r.partnerLabel)+'</b>':'')+'</div><div class="gp-quiz-progressbar"><span style="width:'+((index+1)/quiz.questions.length*100)+'%"></span></div><h2>'+esc(q.text)+'</h2><div class="gp-quiz-choices">'+q.choices.map(c=>'<button data-quiz-choice="'+esc(c.id)+'" class="'+(chosen===c.id?'gp-selected':'')+'" '+(chosen!==undefined?'disabled':'')+'>'+esc(c.text)+'</button>').join('')+'</div>'+
        (chosen!==undefined&&r.partnerKey?'<div class="gp-quiz-partner-answer"><b>'+esc(r.partnerLabel)+'</b><span>'+esc(q.choices.find(c=>c.id===partnerChosen)?.text||'')+'</span><p>'+esc(r.partnerComments[q.id]||'')+'</p></div>':'')+
        '<div class="gp-quiz-next">'+(chosen!==undefined?'<button class="gp-web-textbutton" data-quiz-change>'+L('Изменить ответ','Change choice')+'</button><button class="gp-web-primary" data-quiz-next>'+L(index===quiz.questions.length-1?'Результат':'Дальше',index===quiz.questions.length-1?'Results':'Next')+'</button>':'')+'</div></div>';
}
async function startQuiz(page,key,api){
    const {root,session}=webState(),privateMode=session.private,contact=key?getThread(key):null;
    if(key&&!contact)throw new Error(L('Выбери существующий контакт','Choose an existing contact'));
    const run={id:uid(),partnerKey:contact?.key||'',partnerLabel:contact?.name||'',partnerName:contact?.originalName||'',answers:{},partnerAnswers:{},partnerComments:{},index:0,pending:!!contact,finished:false};
    runs()[page.id]=run;if(contact)running.add(run);save();api.render();
    if(!contact)return;
    try{
        const answers=await generatePhoneQuizPartner(contact,page.quiz);
        if(getMeta()!==root||webState().session.private!==privateMode||runs()[page.id]!==run)return;
        for(const q of page.quiz.questions){
            const answer=answers.find(a=>a.questionId===q.id);
            if(!answer||!q.choices.some(c=>c.id===answer.choiceId))throw new Error(L('Ответы персонажа не совпали с вариантами теста. Попробуй ещё раз.','The character returned invalid choices. Please try again.'));
            run.partnerAnswers[q.id]=answer.choiceId;run.partnerComments[q.id]=cut(answer.text,350);
        }
        run.pending=false;
    }catch(e){if(getMeta()===root&&runs()[page.id]===run)run.error=String(e?.message||e).slice(0,250);}
    finally{running.delete(run);if(getMeta()===root&&webState().session.private===privateMode&&runs()[page.id]===run){save();api.render();}}
}
function record(page,run,api){
    if(run.recorded||webState().session.private)return;run.recorded=true;
    const lines=page.quiz.questions.map(q=>q.text+' | '+getUserName()+': '+(q.choices.find(c=>c.id===run.answers[q.id])?.text||'')+(run.partnerKey?' | '+run.partnerName+': '+(q.choices.find(c=>c.id===run.partnerAnswers[q.id])?.text||''):'')).join('\n');
    logSocialToChat(getUserName()+' проходит в браузере тест «'+page.title+'»'+(run.partnerKey?' вместе с '+run.partnerName+' (в контактах: '+run.partnerLabel+')':'')+'. '+quizShareText(page)+'\n'+lines,{priv:true,marker:'quiz:'+run.id});api.changed();save();
}
export async function createBrowserQuiz(topic,api,v){
    const {root,session}=webState(),privateMode=session.private;topic=cut(topic,160);
    if(!topic)throw new Error(L('Напиши тему теста','Enter a quiz topic'));if(generating.has(root))return;
    generating.add(root);v.error='';api.render();
    try{
        const raw=await generatePhoneQuiz(topic);
        if(getMeta()!==root||webState().session.private!==privateMode)return;
        addPage(normalizePhoneQuiz(raw));v.panel='';
    }catch(e){if(getMeta()===root)v.error=String(e?.message||e).slice(0,250);}
    finally{generating.delete(root);if(getMeta()===root)api.render();}
}
export function bindBrowserQuizzes(screen,api,v,page){
    screen.querySelectorAll('[data-quiz-template]').forEach(b=>b.onclick=()=>{const t=templates().find(t=>t.id===b.dataset.quizTemplate);if(t){addPage(t,'quiz:built:'+t.id+':'+lang());v.panel='';api.render();}});
    const form=screen.querySelector('#gp-web-quiz-create');
    if(form){const input=form.querySelector('input');input.oninput=()=>drafts.set(getMeta(),input.value);form.onsubmit=e=>{e.preventDefault();createBrowserQuiz(input.value,api,v).catch(e=>api.toast(e.message));};}
    if(page?.kind!=='quiz')return;
    screen.querySelectorAll('[data-quiz-start]').forEach(b=>b.onclick=()=>startQuiz(page,b.dataset.quizStart,api).catch(e=>api.toast(e.message)));
    screen.querySelector('[data-quiz-together]')?.addEventListener('click',()=>{const key=screen.querySelector('#gp-web-quiz-partner').value;if(!key){api.toast(L('Выбери контакт','Choose a contact'));return;}startQuiz(page,key,api).catch(e=>api.toast(e.message));});
    screen.querySelector('[data-quiz-reset]')?.addEventListener('click',()=>{delete runs()[page.id];save();api.render();});
    screen.querySelectorAll('[data-quiz-choice]').forEach(b=>b.onclick=()=>{
        const r=runs()[page.id],q=page.quiz.questions[r.index];if(running.has(r)||r.pending||r.answers[q.id]!==undefined)return;r.answers[q.id]=b.dataset.quizChoice;save();api.render();
    });
    screen.querySelector('[data-quiz-change]')?.addEventListener('click',()=>{const r=runs()[page.id];delete r.answers[page.quiz.questions[r.index].id];save();api.render();});
    screen.querySelector('[data-quiz-next]')?.addEventListener('click',()=>{const r=runs()[page.id];if(r.index>=page.quiz.questions.length-1){r.finished=true;record(page,r,api);}else r.index++;save();api.render();});
}


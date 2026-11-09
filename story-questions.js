import { getMeta, getSettings, saveMeta } from './state.js';
import { generateStoryQuestions, addStory, getStories, logSocialToChat, getUserName } from './social.js';
import { openPhoneSheet, closePhoneSheet } from './phone-modal.js';
import { checkPostingTasks } from './posting-tasks.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function storyQuestionHtml(st,isMine) {
    return (st.questionAnswer?'<div class="gp-story-question-card"><small>Анонимный вопрос</small><b>'+esc(st.questionAnswer.question)+'</b><p>'+esc(st.questionAnswer.answer)+'</p></div>':'')+
        (st.questionPrompt?'<button type="button" class="gp-story-question-card" data-story-questions><small>Анонимные вопросы'+(st.questionsEnabled?'':' · выключены')+'</small><b>'+esc(st.questionPrompt)+'</b>'+(isMine?'<span>Ответить · '+(st.questions||[]).filter(q=>!q.answered).length+'</span>':'')+'</button>':'');
}
export function openStoryQuestions(host,st,api) {
    if(st.ak!=='user')return;
    const owner=getMeta(),version=getSettings().phoneActivityVersion;
    const shade=openPhoneSheet(host,'Анонимные вопросы','<div class="gp-group-composer" data-question-body></div>',host.dataset.phoneView||'igstory');
    let busy=false,message='';
    const current=()=>getMeta()===owner&&shade.isConnected&&getStories().includes(st);
    function paint(){
        if(!current())return;const body=shade.querySelector('[data-question-body]');
        body.innerHTML='<label><input type="checkbox" data-questions-enabled '+(st.questionsEnabled?'checked':'')+'> Принимать вопросы в этой сторис</label><p>'+(getSettings().storyQuestionsEnabled===false?'Вопросы полностью выключены в настройках телефона.':'Вопросы приходят только по кнопке. Автоматической рассылки нет.')+'</p><button type="button" class="gp-web-primary" data-questions-fetch '+(!st.questionsEnabled||busy||getSettings().storyQuestionsEnabled===false?'disabled':'')+'>'+(busy?'Собираю…':'Собрать вопросы')+'</button><p role="status">'+esc(message)+'</p>'+(st.questions||[]).map(q=>'<article class="gp-question-entry"><small>Анонимный вопрос</small><p>'+esc(q.text)+'</p>'+(q.answered?'<small>Ответ опубликован</small>':'<button type="button" class="gp-web-textbutton" data-answer="'+esc(q.id)+'">Ответить в сторис</button>')+'</article>').join('');
        body.querySelector('[data-questions-enabled]').onchange=e=>{st.questionsEnabled=e.target.checked;st.questionsRevision=(st.questionsRevision||0)+1;saveMeta();paint();api.changed();};
        body.querySelector('[data-questions-fetch]').onclick=async()=>{
            if(busy||!st.questionsEnabled||getSettings().storyQuestionsEnabled===false)return;busy=true;const revision=st.questionsRevision||0;message='';paint();
            try{const questions=await generateStoryQuestions(st);if(!current()||!st.questionsEnabled||getSettings().storyQuestionsEnabled===false||revision!==(st.questionsRevision||0)||version!==getSettings().phoneActivityVersion)return;
                st.questions||=[];const known=new Set(st.questions.map(q=>q.text.toLowerCase()));
                for(const text of questions)if(!known.has(text.toLowerCase())&&st.questions.length<50){known.add(text.toLowerCase());st.questions.push({id:Date.now().toString(36)+Math.random().toString(36).slice(2,7),text,answered:false});}
                saveMeta();message='Вопросы сохранены.';
            }catch(error){message=error.message;}finally{busy=false;paint();}
        };
        body.querySelectorAll('[data-answer]').forEach(b=>b.onclick=()=>{
            const q=st.questions.find(q=>q.id===b.dataset.answer);if(!q||q.answered)return;
            const answerShade=openPhoneSheet(host,'Ответ в сторис','<form class="gp-group-composer"><p>'+esc(q.text)+'</p><textarea name="answer" maxlength="1000" rows="5" placeholder="Твой ответ" required></textarea><button type="submit" class="gp-web-primary">Опубликовать ответ</button></form>',host.dataset.phoneView||'igstory');
            answerShade.querySelector('form').onsubmit=e=>{e.preventDefault();const answer=e.target.elements.answer.value.trim();if(!answer||getMeta()!==owner||!getStories().includes(st)||q.answered)return;
                const story=addStory({image:st.image,imgDesc:st.imgDesc,caption:'',questionAnswer:{question:q.text,answer}});q.answered=true;q.answerStoryId=story.id;saveMeta();closePhoneSheet(answerShade);api.changed();api.render();
                checkPostingTasks().catch(error=>console.warn('[Phone] answer task check:',error));
                Promise.resolve(logSocialToChat(`${getUserName()} отвечает в Instagram-сторис на анонимный вопрос «${q.text}»: «${answer}». Автор вопроса неизвестен.`)).catch(()=>{});
            };
        });
    }
    paint();
}

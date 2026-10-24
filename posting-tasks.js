import { getMeta, getSettings, saveMeta, isPhoneAppInstalled } from './state.js';
import { ensureSocialSystems } from './social-events.js';
import { generatePostingTaskProposal, judgePostingTaskEvidence } from './social.js';

const jobs=new WeakMap();
const names={twitter:'Twitter',instagram:'Instagram',channel:'Telegram',story:'Сторис'};
export const postingPlatformName=platform=>names[platform]||platform;
export function postingTaskBusy(){return jobs.has(getMeta());}
export function postingTaskPosts(root=getMeta()) {
    const out=[];
    for(const [platform,posts]of [['twitter',root.social?.tweets],['instagram',root.social?.igPosts],['channel',root.channels?.mine?.posts],['story',root.social?.stories]]) {
        if(!isPhoneAppInstalled({twitter:'tw',instagram:'ig',channel:'chans',story:'ig'}[platform]))continue;
        for(const p of posts||[]) {
            if(!p?.id||(platform==='channel'?!p.mine:p.ak!=='user'))continue;
            const text=[p.text,p.caption,p.imgDesc,p.questionAnswer?.question,p.questionAnswer?.answer,p.poll?.options?.join('; ')].filter(Boolean).join('\n').slice(0,5000);
            out.push({id:platform+':'+p.id,platform,text,at:Number(p.time)||0});
        }
    }
    return out;
}
export async function createPostingTasks() {
    const owner=getMeta(),version=getSettings().phoneActivityVersion;
    const root=ensureSocialSystems(),previous=[...root.postingTasks.active,...root.postingTasks.completed].slice(-15);
    const platforms=[...(isPhoneAppInstalled('tw')?['twitter']:[]),...(isPhoneAppInstalled('ig')?['instagram','story']:[]),...(isPhoneAppInstalled('chans')&&owner.channels?.mine?['channel']:[])];
    if(!platforms.length)throw new Error('Сначала установи соцсеть или создай свой канал.');
    const generated=await generatePostingTaskProposal(platforms,previous.map(t=>({title:t.title,text:t.text})));
    if(getMeta()!==owner||getSettings().phoneActivityVersion!==version||getSettings().socialSystems===false)throw new Error('Чат или настройки изменились.');
    const knownPosts=postingTaskPosts(owner).map(p=>p.id),tasks=[];
    for(const raw of generated.slice(0,3)) {
        if(!raw||!platforms.includes(raw.platform)||typeof raw.title!=='string'||typeof raw.text!=='string'||typeof raw.criterion!=='string'||!raw.title.trim()||!raw.text.trim()||!raw.criterion.trim())continue;
        tasks.push({id:'task-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),kind:'contextual',platform:raw.platform,title:raw.title.trim().slice(0,100),text:raw.text.trim().slice(0,500),criterion:raw.criterion.trim().slice(0,700),goal:Math.max(1,Math.min(3,Math.round(Number(raw.goal)||1))),progress:0,matches:[],knownPosts,createdAt:Date.now()});
    }
    if(!tasks.length)throw new Error('Не получилось подобрать задания. Попробуй ещё раз.');
    root.postingTasks.retired=[...(root.postingTasks.retired||[]),...root.postingTasks.active].slice(-30);
    root.postingTasks.active=tasks;saveMeta();return tasks;
}
export function dismissPostingTask(id) {
    const tasks=ensureSocialSystems().postingTasks,task=tasks.active.find(t=>t.id===id);if(!task)return;
    tasks.retired=[...(tasks.retired||[]),task].slice(-30);tasks.active=tasks.active.filter(t=>t!==task);saveMeta();
}
export function checkPostingTasks() {
    const owner=getMeta(),previous=jobs.get(owner)||Promise.resolve();
    const job=previous.catch(()=>{}).then(()=>verify(owner));jobs.set(owner,job);
    return job.finally(()=>{if(jobs.get(owner)===job)jobs.delete(owner);});
}
async function verify(owner) {
    if(getMeta()!==owner||getSettings().socialSystems===false||getSettings().isEnabled===false)return 0;
    const version=getSettings().phoneActivityVersion,root=ensureSocialSystems(),tasks=root.postingTasks.active.filter(t=>t.kind==='contextual');
    if(!tasks.length)return 0;
    const records=postingTaskPosts(owner),eligible=t=>records.filter(p=>p.platform===t.platform&&!(t.knownPosts||[]).includes(p.id)&&!(t.matches||[]).some(m=>m.postId===p.id));
    const ready=tasks.filter(t=>eligible(t).length);if(!ready.length)return 0;
    const posts=[...new Map(ready.flatMap(eligible).map(p=>[p.id,p])).values()].sort((a,b)=>b.at-a.at).slice(0,30);
    const result=await judgePostingTaskEvidence(ready.map(t=>({id:t.id,platform:t.platform,criterion:t.criterion})),posts);
    if(getMeta()!==owner||getSettings().phoneActivityVersion!==version||getSettings().socialSystems===false)return 0;
    const current=new Map(postingTaskPosts(owner).map(p=>[p.id,p])),submitted=new Map(posts.map(p=>[p.id,p]));let changed=0;
    for(const match of result) {
        if(!match||typeof match.evidence!=='string')continue;
        const task=root.postingTasks.active.find(t=>ready.includes(t)&&t.id===match.taskId),post=current.get(match.postId),source=submitted.get(match.postId),quote=match.evidence.trim();
        if(!task||!post||post.text!==source?.text||task.platform!==post.platform||!quote||quote.length<Math.min(6,post.text.trim().length)||!post.text.includes(quote)||(task.knownPosts||[]).includes(post.id)||(task.matches||[]).some(m=>m.postId===post.id))continue;
        task.matches||=[];task.matches.push({postId:post.id,evidence:quote.slice(0,1000)});task.progress=Math.min(task.goal,task.matches.length);changed++;
        if(task.progress>=task.goal){root.postingTasks.active=root.postingTasks.active.filter(t=>t!==task);root.postingTasks.completed.push({...task,completedAt:Date.now()});root.postingTasks.completed=root.postingTasks.completed.slice(-50);}
    }
    if(changed)saveMeta();return changed;
}

import { PHONE_APPS, phoneAppInstalled } from './phone-apps.js';
import { normalizePhoneSpaces } from './phone-text.js';
import { formatCurrency } from './currencies.js';
import { birthdaysOnDate } from './birthday-dates.js';

const rows=value=>Array.isArray(value)?value:[];
const text=value=>normalizePhoneSpaces(value).trim();
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const token=value=>encodeURIComponent(String(value??''));
const key=value=>text(value).replace(/^@/,'').toLocaleLowerCase();
function fingerprint(value){let h=2166136261;for(const c of String(value)){h=Math.imul(h^c.charCodeAt(0),16777619);}return (h>>>0).toString(36);}

// Native messenger unread flags remain the source of truth for SMS, Direct,
// Discord and courier chats. Other app events use stable IDs, never feed length.
function candidates(root,{user='',date=null,english=false}={}){
    const out=[],social=root.social||{},L=(ru,en)=>english?en:ru;
    const own=value=>!!key(value)&&[key(user),key(root.userHandle)].includes(key(value));
    const add=(app,id,kind,title,body,route)=>{
        if(!id)return;
        out.push({id:app+':'+kind+':'+token(id),app,kind,title:text(title),text:text(body),route});
    };
    const foreign=item=>item&&item.ak!=='user'&&!item.user&&!own(item.author);
    for(const [app,items,screen]of [['tw',social.tweets,'twthread'],['ig',social.igPosts,'igview'],['of',social.ofPosts,'ofview']]){
        for(const post of rows(items)){
            if(foreign(post))add(app,post.id,'post',post.author||L('Новая публикация','New post'),post.text||post.caption||post.imgDesc,{screen:app,postId:post.id});
            // Instagram activity already supplies notifications for comments on
            // the user's posts and replies to their own comments.
            if(app==='ig')continue;
            for(const comment of rows(app==='tw'?post.replies:post.comments))if(foreign(comment))
                add(app,post.id+'/'+comment.id,'comment',comment.author,comment.text,{screen,postId:post.id});
        }
    }
    for(const story of rows(social.stories))if(foreign(story)&&Date.now()-Number(story.time||0)<86400000)
        add('ig',story.id,'story',story.author,L('Новая история','New story')+(story.caption?': '+story.caption:''),{screen:'igstory',storyId:story.id,author:story.author});
    for(const channel of [...rows(root.channels?.list),root.channels?.mine,root.channels?.anon].filter(Boolean)){
        if(!channel.mine&&!channel.subscribed)continue;
        for(const post of rows(channel.posts))for(const comment of rows(post.comments))if(foreign(comment))
            add('chans',channel.id+'/'+post.id+'/'+comment.id,'comment',channel.name+' · '+comment.author,comment.text,{screen:'chanpost',channelId:channel.id,postId:post.id});
    }
    for(const stream of rows(root.twitch?.streams)){
        add('twitch',stream.id,'live',stream.streamer,L('В эфире: ','Live: ')+stream.title,{screen:'stream',streamId:stream.id});
        if(stream.watched)for(const message of rows(stream.chat))if(foreign(message))
            add('twitch',stream.id+'/'+message.id,'chat',stream.streamer+' · '+message.author,message.text,{screen:'stream',streamId:stream.id});
    }
    const mine=root.twitch?.myStream;
    for(const message of rows(mine?.chat))if(foreign(message))
        add('twitch',mine.startedAt+'/'+message.id,'chat',message.author,message.text,{screen:'mystream'});
    for(const tx of rows(root.bank?.transactions)){
        const amount=Number(tx.amount)||0,currency=root.bank?.currency||'RUB';
        add('bank',tx.id,'transaction',amount>0?L('Поступление','Money received'):tx.external?L('Оплачено за тебя','Paid for you'):L('Списание','Payment'),
            (tx.label||'')+' · '+(amount>0?'+':'')+formatCurrency(tx.external?Math.abs(amount):amount,currency)+(tx.external&&tx.payer?' · '+tx.payer:''),{screen:'banktx'});
    }
    for(const loan of rows(root.bank?.loans))if(loan.paidOff)
        add('bank',loan.id,'debt-closed',L('Обязательство закрыто','Debt paid off'),loan.name,{screen:loan.kind==='mortgage'?'bankmortgage':'bankloan'});
    const today=date&&[date.year,String(date.month).padStart(2,'0'),String(date.day).padStart(2,'0')].join('-');
    const minutes=date?(Number(date.hours)||0)*60+(Number(date.minutes)||0):null;
    for(const plan of rows(root.plans)){
        const status=plan.cancelled?'cancelled':plan.done?'done':plan.status||'open';
        const route={screen:'calendar',date:plan.date};
        add('calendar',plan.id+'/'+fingerprint([plan.text,plan.date,plan.time,status].join('|')),'plan',
            status==='cancelled'?L('План отменён','Plan cancelled'):status==='done'?L('План выполнен','Plan completed'):L('Календарь обновлён','Calendar updated'),
            [plan.date,plan.time,plan.text].filter(Boolean).join(' · '),route);
        const match=String(plan.time||'').match(/^(\d{1,2}):(\d{2})$/),at=match?Number(match[1])*60+Number(match[2]):null;
        if(status==='open'&&plan.date===today&&(at===null||minutes===null||at-minutes<=30))
            add('calendar',plan.id+'/'+plan.date+'/'+plan.time,'reminder',L('Напоминание','Reminder'),[plan.time,plan.text].filter(Boolean).join(' · '),route);
    }
    const now=new Date(),birthdayToday=today||[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
    for(const birthday of birthdaysOnDate(root,birthdayToday,english))
        add('calendar',birthday.id+'/'+birthdayToday,'reminder',L('Сегодня день рождения','Birthday today'),birthday.name,{screen:'calendar',date:birthdayToday});
    for(const order of rows(root.shop?.orders))if(['way','done'].includes(order.stage))
        add('shop',order.id+'/'+order.stage,'delivery',order.stage==='done'?L('Заказ доставлен','Order delivered'):L('Курьер в пути','Courier on the way'),order.item||order.store,{screen:'shoporders'});
    for(const offer of rows(social.advertising?.offers))
        add('events',offer.id,'offer',L('Новое предложение','New offer'),offer.brand||offer.title||offer.product,{screen:'socialhub'});
    for(const task of rows(social.postingTasks?.completed))
        add('events',task.id,'task',L('Задание выполнено','Task completed'),task.title||task.text,{screen:'socialhub'});
    // Apps without incoming events (e.g. appearance or the calculator-like
    // casino) do not produce fabricated alerts merely because they are installed.
    return out;
}

export function syncAppNotifications(root,settings,options={}){
    let changed=false;
    if(!root.appNotificationState||root.appNotificationState.version!==1||!root.appNotificationState.apps){root.appNotificationState={version:1,apps:{}};changed=true;}
    const store=root.appNotificationState,all=candidates(root,options),out=[],now=Date.now();
    for(const app of PHONE_APPS){
        const current=new Map(all.filter(item=>item.app===app.id).map(item=>[item.id,item]));
        const previous=store.apps[app.id],known=rows(previous?.known),seen=new Set(known);
        const enabled=settings.isEnabled!==false&&!settings.quietMode&&phoneAppInstalled(settings,app.id);
        const allowed=id=>!(app.id==='chans'&&current.get(id)?.route.channelId==='anon'&&settings.anonChannel===false);
        let pending=rows(previous?.pending).filter(item=>current.has(item.id)&&allowed(item.id));
        if(enabled)for(const [id,note]of current)if((previous?!seen.has(id):note.kind==='reminder')&&allowed(id)&&!pending.some(item=>item.id===id))pending.push({id,at:now});
        if(!enabled)pending=[];
        pending=pending.slice(-80);
        const next={known:[...current.keys()],pending};
        if(!same(previous,next)){store.apps[app.id]=next;changed=true;}
        for(const entry of pending){const note=current.get(entry.id);if(app.id==='chans'&&note.route.channelId==='anon'&&settings.anonChannel===false)continue;out.push({...note,icon:app.icon,appTitle:options.english?app.en:app.name,time:entry.at});}
    }
    const groups=new Map();
    for(const note of out){
        const route=note.route,k=JSON.stringify([note.app,note.kind,route.screen,note.kind==='post'?null:route.postId,route.channelId,route.streamId,route.storyId,route.date]);
        const group=groups.get(k);
        if(group){group.ids.push(note.id);group.count++;if(note.time>group.time)Object.assign(group,{title:note.title,text:note.text,time:note.time});}
        else groups.set(k,{...note,ids:[note.id],count:1});
    }
    return {changed,notifications:[...groups.values()].sort((a,b)=>b.time-a.time)};
}

export function markAppNotificationsRead(root,ids){
    const seen=new Set(ids);let changed=false;
    for(const app of Object.values(root.appNotificationState?.apps||{})){
        const next=rows(app.pending).filter(item=>!seen.has(item.id));
        if(next.length!==rows(app.pending).length){app.pending=next;changed=true;}
    }
    return changed;
}

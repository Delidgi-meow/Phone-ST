// Virtual applications share saved data; installation controls access and activity.
export const PHONE_APPS = [
    ['list','Сообщения','Messages','fa-comment-dots','#45b878','SMS, группы и пересылки','SMS, groups and forwards'],
    ['phone','Телефон','Phone','fa-phone','#43b585','Звонки и история вызовов','Calls and call history'],
    ['contacts','Контакты','Contacts','fa-address-book','#7d91aa','Контакты и аватарки','Contacts and avatars'],
    ['tw','Twitter','Twitter','fa-x-twitter','#313a46','Публикации и обсуждения','Posts and conversations'],
    ['ig','Instagram','Instagram','fa-instagram','#d45a95','Лента, сторис и Direct','Feed, stories and Direct'],
    ['chans','Каналы','Channels','fa-paper-plane','#4ba7dc','Подписки и свои каналы','Subscriptions and your channels'],
    ['discord','Discord','Discord','fa-discord','#7775e6','Серверы и общение','Servers and conversations'],
    ['twitch','Twitch','Twitch','fa-twitch','#a167e8','Эфиры и стримы','Live streams'],
    ['tinder','Tinder','Tinder','fa-fire','#ee737e','Знакомства и мэтчи','Dating and matches'],
    ['of','OnlyFans','OnlyFans','fa-heart','#53b5d1','Публикации и подписчики','Posts and subscribers'],
    ['bank','Банк','Bank','fa-wallet','#70a2cd','Счета, переводы и обязательства','Accounts, transfers and payments'],
    ['shop','Магазин','Shop','fa-bag-shopping','#ce9aab','Покупки и доставка','Shopping and delivery'],
    ['casino','Казино','Casino','fa-dice','#b78bcd','Игры и ставки','Games and bets'],
    ['browser','Браузер','Browser','fa-compass','#5eabe0','Поиск, новости и сайты','Search, news and websites'],
    ['maps','Карты','Maps','fa-map-location-dot','#78b991','Места и маршруты','Places and routes'],
    ['notes','Заметки','Notes','fa-note-sticky','#cab76b','Заметки для себя и сюжета','Personal and shared notes'],
    ['calendar','Календарь','Calendar','fa-calendar-days','#cc8293','Планы и события','Plans and events'],
    ['events','Ивенты','Events','gp-event-sparkles','#ae8acb','События и предложения','Story events and offers'],
    ['appearance','Оформление','Appearance','fa-palette','#8d9acb','Темы и обои','Themes and wallpapers'],
    ['settings','Настройки','Settings','fa-gear','#89909c','Настройки телефона','Phone settings',true],
    ['appstore','App Store','App Store','fa-store','#559ce6','Приложения твоего телефона','Apps for your phone',true],
].map(([id,name,en,icon,color,description,descriptionEn,essential=false])=>({id,name,en,icon,color,description,descriptionEn,essential}));

const screens = {
    thread:'list',add:'contacts',twthread:'tw',igdms:'ig',igdm:'ig',igactivity:'ig',igview:'ig',ignew:'ig',ignewstory:'ig',igstory:'ig',
    socialhub:'events',storyevent:'events',storyresult:'events',socialjournal:'events',ofview:'of',ofnew:'of',
    banktx:'bank',bankloan:'bank',bankmortgage:'bank',bankrec:'bank',shopcat:'shop',shoporders:'shop',ordchat:'shop',
    chan:'chans',chanpost:'chans',anonnew:'chans',tinprofile:'tinder',tinmatches:'tinder',tinme:'tinder',dchannel:'discord',stream:'twitch',mystream:'twitch',
};
export function phoneAppId(value){return screens[value]||value;}
export function phoneAppInstalled(settings,id){
    id=phoneAppId(id);
    const app=PHONE_APPS.find(item=>item.id===id);
    return !app||app.essential||settings.removedPhoneApps?.[id]!==true;
}
export function phoneTagApp(kind){
    return ({sms:'list',out:'list',contact:'contacts',call:'phone',tweet:'tw',insta:'ig',igdm:'ig',igact:'ig',ignotify:'ig',igstory:'ig',
        chan:'chans',anon:'chans',anonbust:'chans',plan:'calendar',bank:'bank'})[kind.toLowerCase()]||null;
}
export function phonePlatformApp(platform){return ({twitter:'tw',instagram:'ig',onlyfans:'of',channel:'chans',channels:'chans',phone:'events',web:'browser',map:'maps'})[platform]||phoneAppId(platform);}

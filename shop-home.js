import { getMeta } from './state.js';
import { getBank, fmtMoney } from './bank.js';
import { SHOP_CATS, getCustomCats, getCategory, getOrders, findShopProducts, searchShopProducts, addCustomCat, delCustomCat } from './shop.js';
import { bankIcon as icon } from './bank-icons.js';
import { openPhoneSheet, closePhoneSheet } from './phone-modal.js';
import { lang } from './i18n.js';
const L=(ru,en)=>lang()==='en'?en:ru;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons={food:'Utensils',grocery:'ShoppingBasket',clothes:'Shirt',beauty:'Sparkles',kids:'Baby',tech:'MonitorSmartphone',jewelry:'Gem',furniture:'Armchair',home:'House',adult:'Heart',hotels:'BedDouble',travel:'Plane'};
const states=new WeakMap();
function state(){const owner=getMeta();if(!states.has(owner))states.set(owner,{query:'',busy:false,busyQuery:''});return states.get(owner);}
export const shopCategoryIcon=id=>icon(icons[id]||'ShoppingBag');

function custom(host,api){
    const owner=getMeta(), shade=openPhoneSheet(host,L('Свой магазин','Custom store'),`<form class="gp-market-form"><label>${L('Что будем искать?','What are you looking for?')}<input name="name" maxlength="40" placeholder="${L('Например, книги или цветы','For example, books or flowers')}" required></label><button type="submit">${L('Добавить магазин','Add store')}</button></form>`,'shop');
    shade.classList.add('gp-market-sheet');
    shade.querySelector('form').onsubmit=event=>{event.preventDefault();if(getMeta()!==owner){closePhoneSheet(shade);return;}const cat=addCustomCat(event.target.elements.name.value);if(cat){closePhoneSheet(shade);api.open(cat.id);}};
}

export function renderShopHome(host,api){
    const owner=getMeta(),s=state(),bank=getBank(),orders=getOrders();
    const previous=host.querySelector('[data-market-query]'),focused=previous===document.activeElement,caret=previous?.selectionStart;
    const top=host.querySelector('.gp-market-scroll')?.scrollTop||0;
    const results=findShopProducts(s.query), shown=results.slice(0,s.query?80:6), categories=[...SHOP_CATS,...getCustomCats()];
    host.innerHTML=`<div class="gp-market-home"><header class="gp-market-header"><button type="button" data-market-home aria-label="${L('Назад','Back')}">${icon('ChevronLeft')}</button><h2>${L('Магазин','Shop')}</h2><button type="button" data-market-orders aria-label="${L('Мои заказы','My orders')}">${icon('Package')}${orders.length?`<span>${orders.length>9?'9+':orders.length}</span>`:''}</button></header>
        <form class="gp-market-search" data-market-search>${icon('Search')}<input type="search" data-market-query value="${esc(s.query)}" placeholder="${L('Найти товар','Find a product')}" aria-label="${L('Поиск товара','Product search')}" maxlength="100" autocomplete="off"><button type="submit" ${s.busy?'disabled':''} aria-label="${L('Найти','Search')}">${icon(s.busy?'LoaderCircle':'ArrowRight')}</button></form>
        <div class="gp-market-balance"><span>${L('На счёте','Available')}</span><b>${esc(fmtMoney(bank.balance))}</b></div>
        <div class="gp-market-scroll">
        ${!s.query?`<div class="gp-market-section"><h3>${L('Категории','Categories')}</h3><button type="button" data-market-custom aria-label="${L('Добавить магазин','Add store')}">${icon('Plus')}</button></div><div class="gp-market-categories">${categories.map(cat=>`<div class="gp-market-category"><button type="button" data-market-cat="${esc(cat.id)}"><span>${shopCategoryIcon(cat.id)}</span><b>${esc(cat.name)}</b>${getCategory(cat.id)?'<i></i>':''}</button>${cat.custom?`<button type="button" class="gp-market-delete" data-market-del="${esc(cat.id)}" aria-label="${L('Удалить','Delete')}">${icon('X')}</button>`:''}</div>`).join('')}</div>`:''}
        ${s.busy?`<p class="gp-market-status" role="status">${icon('LoaderCircle')}${L('Подбираю варианты','Finding options')}: ${esc(s.busyQuery)}</p>`:''}
        ${shown.length?`<div class="gp-market-section"><h3>${s.query?L('Найденные товары','Products found'):L('Из каталогов','From your catalogs')}</h3><span>${s.query?results.length:''}</span></div><div class="gp-market-products">${shown.map((hit,index)=>`<button type="button" class="gp-market-product" data-market-product="${index}"><span class="gp-market-product-image">${hit.item.image?`<img src="${esc(hit.item.image)}" alt="">`:shopCategoryIcon(hit.catId)}</span><strong>${esc(fmtMoney(hit.item.price))}</strong><b>${esc(hit.item.name)}</b><small>${esc(hit.storeName)}</small></button>`).join('')}</div>`:s.query&&!s.busy?`<div class="gp-market-empty"><b>${L('Пока нет в каталогах','Not in your catalogs yet')}</b><p>${L('Подберём магазины с нужным товаром?','Find stores selling this product?')}</p></div>`:''}
        ${s.query?`<button type="button" class="gp-market-find" data-market-find ${s.busy?'disabled':''}>${icon('Search')}${shown.length?L('Найти ещё варианты','Find more options'):L('Найти варианты','Find options')}</button>`:`<p class="gp-market-hint">${L('Выбери категорию или найди нужную вещь по названию.','Choose a category or search for a product by name.')}</p>`}
        </div></div>`;
    const input=host.querySelector('[data-market-query]');
    input.oninput=()=>{s.query=input.value;api.render();};
    if(focused){input.focus({preventScroll:true});try{input.setSelectionRange(caret,caret);}catch{}}
    host.querySelector('.gp-market-scroll').scrollTop=top;
    async function search(force){
        const query=s.query.trim();if(!query||s.busy)return;
        if(!force&&findShopProducts(query).length){api.render();return;}
        s.busy=true;s.busyQuery=query;api.render();
        try{await searchShopProducts(query);}
        catch(error){if(getMeta()===owner)api.toast(String(error.message||error),'fa-circle-exclamation');}
        finally{s.busy=false;if(getMeta()===owner)api.render();}
    }
    host.querySelector('[data-market-search]').onsubmit=event=>{event.preventDefault();search(false);};
    host.querySelector('[data-market-find]')?.addEventListener('click',()=>search(true));
    host.querySelector('[data-market-home]').onclick=api.home;
    host.querySelector('[data-market-orders]').onclick=api.orders;
    host.querySelector('[data-market-custom]')?.addEventListener('click',()=>custom(host,api));
    host.querySelectorAll('[data-market-cat]').forEach(button=>button.onclick=()=>api.open(button.dataset.marketCat));
    host.querySelectorAll('[data-market-product]').forEach(button=>button.onclick=()=>{const hit=shown[Number(button.dataset.marketProduct)];api.open(hit.catId,hit.item.id);});
    host.querySelectorAll('[data-market-del]').forEach(button=>button.onclick=()=>{if(confirm(L('Удалить эту категорию?','Delete this category?'))){delCustomCat(button.dataset.marketDel);api.render();}});
}

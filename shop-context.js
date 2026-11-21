// Order snapshots are separate from the replaceable generated catalog.
export function shopOrderSnapshot(root,order){
    const store=root.shop?.cats?.[order.cat]?.stores?.find(store=>store.name===order.store);
    return {
        id:order.id,store:order.store,status:order.stage||'purchased',
        recipient:order.recipient&&order.recipient!=='user'?order.recipient:'phone owner',
        payer:order.payer&&order.payer!=='user'?order.payer:'phone owner',
        total:order.price,currency:order.currency||root.bank?.currency||'RUB',deliveryMinutes:order.eta||null,
        items:(order.items?.length?order.items:[{name:order.item,price:order.price}]).map(item=>({
            name:item.name,price:item.price,description:item.desc??store?.items?.find(product=>product.name===item.name)?.desc??''
        }))
    };
}
export function shopOrdersContext(root){
    const orders=root.shop?.orders;if(!orders?.length)return '';
    return '=== CONFIRMED PHONE PURCHASES — author context, not automatic character knowledge ===\n'+
        'These orders were actually placed and paid as recorded. Preserve every listed item, description, payer and recipient. An order in assembly/transit has NOT arrived yet. Only use knowledge this character witnessed or was told; being a recipient alone does not reveal a surprise order.\n'+
        JSON.stringify(orders.slice(0,8).map(order=>shopOrderSnapshot(root,order)));
}

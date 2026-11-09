const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function calendarWidgetHtml(today,entries=[],language='ru') {
    const [year,month,day]=today.split('-').map(Number),date=new Date(year,month-1,day,12);
    const label=date.toLocaleDateString(language==='en'?'en-US':'ru-RU',{month:'long'});
    const offset=(new Date(year,month-1,1,12).getDay()+6)%7;
    const count=new Date(year,month,0,12).getDate(),rows=Math.ceil((offset+count)/7);
    const weekdays=language==='en'?['M','T','W','T','F','S','S']:['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
    const byDate=new Map();for(const entry of entries){if(!byDate.has(entry.date))byDate.set(entry.date,[]);byDate.get(entry.date).push(entry);}
    const cells=Array.from({length:rows*7},(_,index)=>{
        const value=index-offset+1;if(value<1||value>count)return '<span aria-hidden="true"></span>';
        const iso=`${year}-${String(month).padStart(2,'0')}-${String(value).padStart(2,'0')}`;
        const plans=byDate.get(iso)||[],title=plans.map(plan=>[plan.time,plan.text].filter(Boolean).join(' ')).join('; ');
        return '<span class="gp-mini-cal-day'+(value===day?' gp-mini-cal-today':value<day?' gp-mini-cal-past':'')+(plans.length?' gp-mini-cal-has-plans':'')+'" data-cal-date="'+iso+'"'+(value===day?' aria-current="date"':'')+(title?' title="'+esc(title)+'"':'')+'>'+value+(plans.length?'<i aria-hidden="true"></i>':'')+'</span>';
    }).join('');
    return '<div class="gp-mini-cal" style="--gp-mini-calendar-rows:'+rows+'" aria-label="'+esc(date.toLocaleDateString(language==='en'?'en-US':'ru-RU',{day:'numeric',month:'long',year:'numeric'}))+'"><time class="gp-mini-cal-number" datetime="'+today+'">'+day+'</time><div class="gp-mini-cal-panel"><div class="gp-mini-cal-month">'+esc(label)+'</div><div class="gp-mini-cal-grid">'+weekdays.map(value=>'<span class="gp-mini-cal-weekday" aria-hidden="true">'+value+'</span>').join('')+cells+'</div></div></div>';
}

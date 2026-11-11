// Skip comments, strings and URLs so editing a palette never changes image assets.
export function cssColorTokens(source){
 const tokens=[];const re=/\/\*[\s\S]*?\*\/|url\([^)]*\)|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#[\da-f]{3,8}\b|(?:rgba?|hsla?)\([^)]*\)/gi;
 for(const m of String(source).matchAll(re)){if(/^(?:#|rgba?\(|hsla?\()/i.test(m[0])&&CSS.supports('color',m[0]))tokens.push({value:m[0],start:m.index,end:m.index+m[0].length});}return tokens;
}
export function replaceCssColor(source,from,to){
 if(!CSS.supports('color',to))return source;
 const matches=cssColorTokens(source).filter(t=>t.value.toLowerCase()===from.toLowerCase());
 for(const t of matches.reverse())source=source.slice(0,t.start)+to+source.slice(t.end);return source;
}
export function mountCssPalette(host,area,save,english=false){
 host.replaceChildren();const values=[...new Set(cssColorTokens(area.value).map(t=>t.value))];
 const title=document.createElement('h3');title.textContent=english?'Colors in your CSS':'Цвета из вашего CSS';host.append(title);
 if(!values.length){const hint=document.createElement('small');hint.textContent=english?'Apply CSS containing HEX, RGB or HSL colors.':'Примените CSS с цветами HEX, RGB или HSL.';host.append(hint);}
 for(const value of values){const row=document.createElement('label');row.className='gp-css-color-row';const swatch=document.createElement('input');swatch.type='color';swatch.setAttribute('aria-label',english?'Choose color':'Выбрать цвет');const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');ctx.fillStyle=value;ctx.fillRect(0,0,1,1);const rgba=ctx.getImageData(0,0,1,1).data;swatch.value='#'+[...rgba].slice(0,3).map(n=>n.toString(16).padStart(2,'0')).join('');const input=document.createElement('input');input.type='text';input.value=value;input.setAttribute('aria-label',(english?'CSS color ':'Цвет CSS ')+value);input.onchange=()=>{const valid=CSS.supports('color',input.value);input.setCustomValidity(valid?'':(english?'Invalid color':'Некорректный цвет'));if(!valid){input.reportValidity();return;}area.value=replaceCssColor(area.value,value,input.value);save();mountCssPalette(host,area,save,english);};swatch.onchange=()=>{const rgb=swatch.value;input.value=rgba[3]===255?rgb:rgb+rgba[3].toString(16).padStart(2,'0');input.onchange();};row.append(swatch,input);host.append(row);}
}

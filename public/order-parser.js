export function parseOrder(text,products){
 const norm=s=>s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\bpamonhas\b/g,'pamonha').replace(/\bbolos\b/g,'bolo').replace(/\bsucos\b/g,'suco').replace(/\bcafes\b/g,'cafe').trim();
 const numbers={um:1,uma:1,dois:2,duas:2,tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8,nove:9,dez:10};
 const parts=norm(text).split(/[,;\n]+|\s+e\s+(?=\d|um\b|uma\b|dois\b|duas\b|tres\b|quatro\b|cinco\b)/).filter(Boolean);
 const items=[],issues=[];
 for(const part of parts){const m=part.trim().match(/^(\d+|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)\s+(.+)$/);if(!m){issues.push('Informe quantidade e produto: '+part);continue;}const quantity=numbers[m[1]]||Number(m[1]);if(!Number.isSafeInteger(quantity)||quantity<1||quantity>100){issues.push('Quantidade inválida: '+part);continue;}
 const query=m[2].replace(/^de\s+/,'');const words=query.split(/\s+/).filter(w=>!['de','com','da','do'].includes(w));
 const matches=products.filter(p=>p.active&&words.every(w=>norm(p.name).split(/\s+/).includes(w)));
 if(matches.length!==1){issues.push(matches.length?'Mais de uma opção para “'+query+'”: '+matches.map(p=>p.name).join(', '):'Produto não encontrado: '+query);continue;}
 const p=matches[0],existing=items.find(i=>i.productId===p.id);if(existing)existing.quantity+=quantity;else items.push({productId:p.id,quantity});
 }
 return {items,issues};
}

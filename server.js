import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import QRCode from 'qrcode';

const root = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(root, 'data/restaurant.sqlite');
mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS tables (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, seats INTEGER NOT NULL, shape TEXT NOT NULL, x REAL NOT NULL, y REAL NOT NULL, group_id INTEGER, token TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, price INTEGER NOT NULL, stock INTEGER NOT NULL CHECK(stock>=0), emoji TEXT NOT NULL, description TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY, table_id INTEGER NOT NULL REFERENCES tables(id), status TEXT NOT NULL, note TEXT NOT NULL, created TEXT NOT NULL, closed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), product_id INTEGER NOT NULL REFERENCES products(id), name TEXT NOT NULL, price INTEGER NOT NULL, quantity INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
const all = (sql,...args) => db.prepare(sql).all(...args);
const get = (sql,...args) => db.prepare(sql).get(...args);
const run = (sql,...args) => db.prepare(sql).run(...args);
for (const col of ['customer_id','customer_name','bill_id']) if(!all('PRAGMA table_info(orders)').some(c=>c.name===col)) db.exec('ALTER TABLE orders ADD COLUMN '+col+" TEXT NOT NULL DEFAULT ''");
run("UPDATE orders SET bill_id='legacy-'||table_id,customer_name='Comanda anterior' WHERE bill_id=''");
if (!get('SELECT id FROM tables LIMIT 1')) {
  for(let i=1;i<=12;i++) run('INSERT INTO tables VALUES (?,?,?,?,?,?,NULL,?)',i,String(i).padStart(2,'0'),i===6?6:4,i>8?'round':'square', 12+((i-1)%4)*24, 18+Math.floor((i-1)/4)*31,randomUUID());
  const products = [ ['Pamonha tradicional','Pamonhas',1200,24,'🌽','Milho fresquinho, receita da casa.'],['Pamonha com queijo','Pamonhas',1500,18,'🧀','Cremosa, com queijo derretido.'],['Pamonha doce','Pamonhas',1200,16,'🌽','Doce na medida, feita com carinho.'],['Bolo de milho','Quitutes',800,5,'🍰','Uma fatia de bolo caseiro e fofinho.'],['Pão de queijo','Quitutes',600,32,'🥯','Quentinho, crocante por fora.'],['Curau da casa','Quitutes',1000,9,'🍮','Creme de milho com canela.'],['Café coado','Bebidas',500,40,'☕','Passado na hora, do jeitinho certo.'],['Suco de laranja','Bebidas',900,15,'🍊','Natural e feito na hora.'],['Água mineral','Bebidas',400,28,'💧','Garrafa de 500 ml.'] ];
  for(const p of products)run('INSERT INTO products(name,category,price,stock,emoji,description) VALUES(?,?,?,?,?,?)',...p);
  for(const [t,s,mins,p,q] of [[2,'preparing',18,1,2],[4,'new',4,2,3],[6,'ready',26,4,2],[9,'delivered',36,3,2]]){
    const id=Number(run('INSERT INTO orders(table_id,status,note,created) VALUES(?,?,?,?)',t,s,t===4?'Uma pamonha sem manteiga, por favor.':'',new Date(Date.now()-mins*60000).toISOString()).lastInsertRowid);
    const product=get('SELECT * FROM products WHERE id=?',p);run('INSERT INTO items(order_id,product_id,name,price,quantity) VALUES(?,?,?,?,?)',id,p,product.name,product.price,q);
    run('UPDATE products SET stock=stock-? WHERE id=?',q,p);
  }
}
run("UPDATE orders SET bill_id='legacy-'||table_id,customer_name='Comanda anterior' WHERE bill_id=''");
function fail(message,status=400){const e=new Error(message);e.status=status;throw e;}
function integer(n,min=0,max=1000000){if(!Number.isSafeInteger(n)||n<min||n>max)fail('Valor numérico inválido.');return n;}
function str(v,max=200){if(typeof v!=='string'||!v.trim()||v.length>max)fail('Preencha os campos corretamente.');return v.trim();}
function table(id){const t=get('SELECT * FROM tables WHERE id=?',Number(id));if(!t)fail('Mesa não encontrada.',404);return t;}
function group(t){return all('SELECT * FROM tables WHERE id=? OR group_id=?',t.group_id||t.id,t.group_id||t.id);}
function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}
function orders(){return all('SELECT * FROM orders ORDER BY id DESC').map(o=>({...o,items:all('SELECT * FROM items WHERE order_id=?',o.id)}));}
async function api(req,url,body){
 const p=url.pathname;
 if(p==='/api/state'&&req.method==='GET')return {tables:all('SELECT * FROM tables'),products:all('SELECT * FROM products'),orders:orders(),baseUrl:get("SELECT value FROM settings WHERE key='baseUrl'")?.value||''};
 if(p==='/api/bills/close'&&req.method==='POST')return transaction(()=>{const os=orders().filter(o=>o.bill_id===body.billId&&!o.closed);if(!os.length)fail('Comanda não encontrada.');if(os.some(o=>!['delivered','cancelled'].includes(o.status)))fail('Entregue ou cancele os pedidos desta pessoa antes de fechar.');run('UPDATE orders SET closed=1 WHERE bill_id=?',body.billId);return {ok:true};});
 if(p==='/api/health')return {ok:true};
 if(p==='/api/menu'&&req.method==='GET') {const t=get('SELECT * FROM tables WHERE token=?',url.searchParams.get('table'));if(!t)fail('QR code inválido.',404);return {table:{id:t.id,name:t.name},products:all('SELECT * FROM products WHERE active=1'),orders:orders().filter(o=>o.customer_id&&o.customer_id===req.headers['x-customer-id']&&!o.closed)};}
 if(p==='/api/orders'&&req.method==='POST')return transaction(()=>{
   const t=body.token?get('SELECT * FROM tables WHERE token=?',body.token):table(body.tableId);if(!t)fail('Mesa inválida.');
   if(!Array.isArray(body.items)||!body.items.length||body.items.length>100)fail('Adicione produtos ao pedido.');
   const quantities=new Map();for(const item of body.items){integer(item.productId,1);integer(item.quantity,1,100);quantities.set(item.productId,(quantities.get(item.productId)||0)+item.quantity);}
   const items=[...quantities].map(([id,quantity])=>{const p=get('SELECT * FROM products WHERE id=? AND active=1',id);if(!p||p.stock<quantity)fail(`Estoque insuficiente: ${p?.name||'produto indisponível'}.`,409);return {...p,quantity};});
   const customerId=body.customerId?str(body.customerId,100):randomUUID();
   const customerName=body.customerName?str(body.customerName,80):'Cliente do balcão';
   const existing=get('SELECT bill_id FROM orders WHERE customer_id=? AND closed=0 LIMIT 1',customerId);
   const billId=existing?.bill_id||randomUUID();
   const note=body.note?str(body.note,500):'';
   const id=Number(run('INSERT INTO orders(table_id,status,note,created) VALUES(?,?,?,?)',t.id,'new',note,new Date().toISOString()).lastInsertRowid);
   run('UPDATE orders SET customer_id=?,customer_name=?,bill_id=? WHERE id=?',customerId,customerName,billId,id);
   for(const p of items){run('INSERT INTO items(order_id,product_id,name,price,quantity) VALUES(?,?,?,?,?)',id,p.id,p.name,p.price,p.quantity);run('UPDATE products SET stock=stock-? WHERE id=?',p.quantity,p.id);}return {id};
 });
 if(/^\/api\/orders\/\d+$/.test(p)&&req.method==='PATCH')return transaction(()=>{const id=Number(p.split('/').pop()),o=get('SELECT * FROM orders WHERE id=?',id);if(!o||o.closed)fail('Pedido indisponível.');const next={new:'preparing',preparing:'ready',ready:'delivered'};if(body.status==='cancelled'&&o.status!=='cancelled'&&o.status!=='delivered'){for(const i of all('SELECT * FROM items WHERE order_id=?',id))run('UPDATE products SET stock=stock+? WHERE id=?',i.quantity,i.product_id);}else if(next[o.status]!==body.status)fail('Mudança de etapa inválida.');run('UPDATE orders SET status=? WHERE id=?',body.status,id);return {ok:true};});
 if(p==='/api/products'&&req.method==='POST'){const id=Number(run('INSERT INTO products(name,category,price,stock,emoji,description,active) VALUES(?,?,?,?,?,?,?)',str(body.name),str(body.category),integer(body.price,1),integer(body.stock),str(body.emoji||'🌽',20),String(body.description||'').slice(0,500),body.active===false?0:1).lastInsertRowid);return {id};}
 if(/^\/api\/products\/\d+$/.test(p)&&req.method==='PATCH'){const id=Number(p.split('/').pop());if(!get('SELECT id FROM products WHERE id=?',id))fail('Produto não encontrado.',404);run('UPDATE products SET name=?,category=?,price=?,stock=?,emoji=?,description=?,active=? WHERE id=?',str(body.name),str(body.category),integer(body.price,1),integer(body.stock),str(body.emoji||'🌽',20),String(body.description||'').slice(0,500),body.active?1:0,id);return {ok:true};}
 if(p==='/api/tables'&&req.method==='POST'){return {id:Number(run('INSERT INTO tables(name,seats,shape,x,y,token) VALUES(?,?,?,?,?,?)',str(body.name,20),integer(body.seats,1,20),body.shape==='round'?'round':'square',50,50,randomUUID()).lastInsertRowid)};}
 if(/^\/api\/tables\/\d+$/.test(p)&&req.method==='PATCH'){const t=table(p.split('/').pop());if(body.x!==undefined){if(!Number.isFinite(body.x)||!Number.isFinite(body.y))fail('Posição inválida.');run('UPDATE tables SET x=?,y=? WHERE id=?',Math.max(8,Math.min(92,body.x)),Math.max(12,Math.min(88,body.y)),t.id);}else run('UPDATE tables SET name=?,seats=?,shape=? WHERE id=?',str(body.name,20),integer(body.seats,1,20),body.shape==='round'?'round':'square',t.id);return {ok:true};}
 if(p==='/api/tables/action'&&req.method==='POST')return transaction(()=>{const source=table(body.source);const members=group(source);const ids=members.map(t=>t.id);if(body.action==='close'){const open=orders().filter(o=>ids.includes(o.table_id)&&!o.closed);if(open.some(o=>!['delivered','cancelled'].includes(o.status)))fail('Entregue ou cancele os pedidos pendentes antes de fechar.');for(const id of ids){run('UPDATE orders SET closed=1 WHERE table_id=?',id);run('UPDATE tables SET group_id=NULL WHERE id=?',id);}return {ok:true};}if(body.action==='ungroup'){for(const id of ids)run('UPDATE tables SET group_id=NULL WHERE id=?',id);return {ok:true};}const target=table(body.target);if(ids.includes(target.id))fail('Escolha uma mesa de outro grupo.');if(body.action==='transfer'){for(const id of ids){run('UPDATE orders SET table_id=? WHERE table_id=? AND closed=0',target.id,id);run('UPDATE tables SET group_id=NULL WHERE id=?',id);}}else if(body.action==='merge'){const dest=target.group_id||target.id;for(const t of [...members,...group(target)])run('UPDATE tables SET group_id=? WHERE id=?',dest,t.id);}else fail('Ação inválida.');return {ok:true};});
 if(p==='/api/settings'&&req.method==='POST'){const u=new URL(body.baseUrl);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)fail('Endereço inválido.');run("INSERT INTO settings VALUES('baseUrl',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",u.origin);return {ok:true};}
 if(/^\/api\/qr\/\d+$/.test(p)&&req.method==='GET'){const t=table(p.split('/').pop());const base=get("SELECT value FROM settings WHERE key='baseUrl'")?.value||`http://${req.headers.host}`;return {svg:await QRCode.toString(`${base}/?mesa=${t.token}`,{type:'svg',margin:2,color:{dark:'#263e32',light:'#ffffff'}}),url:`${base}/?mesa=${t.token}`};}
 fail('Rota não encontrada.',404);
}
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname.startsWith('/api/')){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>100000)fail('Pedido muito grande.',413);}const result=await api(req,url,raw?JSON.parse(raw):{});res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(result));return;}
const files={'/':'public/index.html','/app.js':'public/app.js','/order-parser.js':'public/order-parser.js','/style.css':'public/style.css','/icons.js':'node_modules/lucide/dist/umd/lucide.js'};const file=files[url.pathname];if(!file||!existsSync(path.join(root,file)))fail('Não encontrado.',404);res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html; charset=utf-8'});res.end(readFileSync(path.join(root,file)));}catch(e){res.writeHead(e.status||400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message.includes('UNIQUE')?'Este nome já está em uso.':e.message}));}});
server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log(`Pamonharia disponível na porta ${process.env.PORT||3000}`));

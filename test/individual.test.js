import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseOrder} from '../public/order-parser.js';
test('texto reconhece quantidades e produtos, sem adivinhar opções ambíguas',()=>{
 const ps=[{id:1,name:'Pamonha de sal',active:1},{id:2,name:'Pamonha doce',active:1},{id:3,name:'Café coado',active:1}];
 assert.deepEqual(parseOrder('duas pamonhas de sal e um café',ps),{items:[{productId:1,quantity:2},{productId:3,quantity:1}],issues:[]});
 assert.equal(parseOrder('2 pamonhas',ps).issues.length,1);
 assert.equal(parseOrder('1 pizza',ps).items.length,0);
 assert.equal(parseOrder('0 café',ps).issues.length,1);
});

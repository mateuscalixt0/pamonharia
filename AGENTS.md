# Orientações do projeto

- Antes de criar ou alterar uma interface, leia [docs/DESIGN.md](docs/DESIGN.md).
- Reutilize os tokens e componentes de `public/style.css`, `public/app.js` e `public/accounts-ui.js`.
- Preserve comandas individuais, o carrinho ao fechar o resumo e a validação de nome com observação opcional.
- Valores monetários são centavos inteiros. Confirmações de pedido ou recebimento dependem da resposta real do servidor.
- Mudanças no padrão visual devem atualizar o guia e suas referências na mesma alteração.
- Valide a interface em celular, tablet e desktop. Para regras de negócio, use `npm test`; para fluxos e responsividade, `node scripts/browser-smoke.mjs`.
- Não commite bancos de dados, credenciais ou dados reais de clientes.

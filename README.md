# Pamonharia

## Comandas individuais e anotação por texto

Cada cliente informa o nome no primeiro pedido. Um identificador aleatório fica no localStorage do navegador para recuperar sua comanda aberta ao ler novamente um QR code. Limpar os dados do navegador, trocar de aparelho ou usar uma janela privada pode criar outra identidade. Nomes iguais não juntam contas. Após o fechamento, o próximo pedido abre outra comanda.

No painel da mesa, cada pessoa tem itens, total e fechamento próprios. Pedidos antigos são preservados em uma comanda anterior. Agrupar mesas compartilha a visualização, mantendo as contas individuais. O agrupamento tem destaque visual e animação; adicionar mesas e editar o layout continuam disponíveis.

Em **Adicionar pedido**, a equipe pode escolher uma comanda existente ou informar o nome de um novo cliente. Em **Anotar pedido por texto**, escreva por exemplo `duas pamonhas com queijo e um café` e clique em **Identificar produtos e revisar**. Os itens encontrados entram no carrinho, mas só são enviados à cozinha após confirmação. Use os nomes do cardápio: produtos inexistentes ou ambíguos são informados. O reconhecimento é local, por regras, sem IA externa; não interpreta substituições, ingredientes ou observações em linguagem livre. Use o campo de observações para esses cuidados.

Protótipo local de gestão de restaurante, com mapa de mesas, comandas, QR codes, cozinha, cardápio e estoque de produtos prontos.

## Rodar no seu computador

Instale **Node.js 24 LTS** (mínimo 22.13). Na pasta do projeto:

```sh
npm install
npm start
```

Abra `http://localhost:3000` no navegador. Não precisa de Vercel, contas externas ou servidor de banco. Para desenvolvimento com reinício automático: `npm run dev`.

O SQLite é criado automaticamente em `data/restaurant.sqlite`, com 12 mesas, 9 produtos e 4 pedidos demonstrativos. Alterações persistem após reiniciar. Os dados são fictícios. Para uma instalação reproduzível use `npm ci` (lockfile incluído).

## Testar o fluxo completo

1. Selecione uma mesa e abra **QR code da mesa → Testar cardápio do cliente**.
2. Escolha produtos e envie o pedido. A quantidade disponível é reduzida imediatamente, de forma transacional.
3. No painel **Pedidos**, avance de novo pedido para em preparo, pronto e entregue. O painel e o cliente atualizam a cada 5 segundos.
4. Após receber o pagamento no caixa, use **Fechar conta**. Pedidos ainda pendentes impedem o fechamento. Não há processamento de pagamentos.
5. Cancelar um pedido não entregue devolve o estoque; não é possível cancelar duas vezes.

## Mesas e QR codes

- **Editar salão** permite arrastar mesas para posicioná-las. As posições são salvas.
- Fora da edição, arraste uma mesa sobre outra para escolher transferência de pedidos ou agrupamento de comandas.
- O botão **Transferir / juntar** oferece a mesma operação, inclusive no celular. Para juntar mais mesas ou o salão inteiro, repita o agrupamento: grupos existentes são incluídos por completo.
- Mesas agrupadas compartilham o total, e cada QR continua identificando sua mesa original. **Desvincular mesas** separa o grupo sem mover os pedidos.
- O menu de três pontos edita nome, capacidade e formato. **Nova mesa** cria outra mesa com QR exclusivo.
- QR codes podem ser impressos no diálogo da mesa. O código é gerado localmente, sem serviço externo.

## Testar no celular, sem publicar

Conecte computador e celular à mesma rede Wi-Fi. Descubra o IP local do computador (`ipconfig` no Windows, configurações de rede no macOS/Linux). No painel, abra **Configurações** e salve por exemplo `http://192.168.1.10:3000`. Libere a porta 3000 no firewall da rede privada se necessário. Abra esse endereço no celular ou escaneie um QR code recém-impresso. O IP é um exemplo: use o endereço real do seu computador. `localhost` no celular aponta para o próprio celular.

## Banco e testes

```sh
npm test
```

Os testes usam um banco temporário independente e verificam estoque, concorrência, QR/menu, ciclo dos pedidos, fechamento, transferência, agrupamento e cadastros. Não modificam o banco de demonstração.

Teste visual automatizado opcional: instale Chromium com `npx playwright install chromium` e execute `node scripts/browser-smoke.mjs`. O script também aceita `CHROMIUM_PATH` ou usa `/usr/bin/chromium` quando disponível. Ele testa a navegação e o fluxo do cliente em desktop e celular, usando um banco temporário.

Variáveis opcionais: `PORT` (padrão 3000), `DB_PATH` (caminho de outro SQLite). Para começar uma demonstração nova, pare o servidor e mova a pasta `data` para um backup antes de iniciar novamente. Para copiar o banco, pare o servidor e copie a pasta inteira, incluindo arquivos WAL se existirem.

## Escopo do protótipo

Uso local em rede de confiança: não há autenticação nem separação de permissões entre equipe e cliente na API administrativa. Não exponha este servidor à internet. Uma implantação real precisa de login/perfis, autorização, proteção contra abuso, HTTPS e backups. Não há integração fiscal, pagamento online ou controle de ingredientes. Os valores são armazenados em centavos; o estoque representa unidades prontas para venda.

Interface responsiva em português. Fontes usam fallback local se o Google Fonts estiver indisponível; ícones e QR codes são servidos localmente.

# Guia de design — Pamonharia

Versão 1 · 11 de novembro de 2026

Este é o padrão para criar ou alterar qualquer tela da Pamonharia. Deve ser lido antes de implementar uma nova função. O guia descreve a interface desta versão e as regras para sua evolução; não é apenas uma proposta visual.

**Fonte dos estilos:** [`public/style.css`](../public/style.css). **Componentes e interações:** [`public/app.js`](../public/app.js) e [`public/accounts-ui.js`](../public/accounts-ui.js). Uma mudança de padrão deve atualizar estes arquivos e este documento no mesmo trabalho.

## 1. Identidade e prioridades

A interface usa fundo marfim, superfícies brancas, texto verde escuro e ações em laranja queimado. Cantos arredondados, bordas discretas e espaços regulares dão unidade ao sistema. A comida e as comandas são o conteúdo principal; elementos decorativos ocupam pouco espaço.

Prioridades, nesta ordem:

1. Identificar mesa, pessoa, pedido e situação sem ambiguidade.
2. Permitir concluir a tarefa com poucos toques e pouca rolagem.
3. Tornar valores e quantidades legíveis.
4. Mostrar o resultado real de cada ação.
5. Reutilizar o mesmo padrão entre todas as telas.

As referências são a skill **Apple Design**, fornecida pelo usuário, e a [Taste Skill](https://github.com/Leonxlnx/taste-skill). Aplicamos clareza, resposta imediata ao toque, consistência, tipografia, hierarquia e acessibilidade. As regras de marketing da Taste — como seções com altura de uma tela, fotografias grandes e páginas sem modais — foram adaptadas ao pedido explícito de um sistema operacional compacto, com modais e filtros horizontais. A identidade aprovada do restaurante tem prioridade sobre paletas ou layouts sorteados.

## 2. Cores

Use variáveis CSS. Não copie valores hexadecimais para novos componentes.

| Papel | Variável | Cor | Uso |
| --- | --- | --- | --- |
| Fundo | `--bg` | `#F8F9F6` | Fundo geral das páginas |
| Superfície | `--surface` | `#FFFFFF` | Cards, formulários, modais |
| Superfície suave | `--surface-soft` | `#EEF2E8` | Navegação ativa, fundos discretos |
| Texto principal | `--text` | `#283C32` | Títulos, nomes, preços |
| Texto secundário | `--muted` | `#627064` | Datas, descrições, ajuda |
| Borda decorativa | `--border` | `#DDE3D8` | Divisórias e contornos de superfícies |
| Borda de campo | `--input-border` | `#879683` | Identificação dos campos editáveis |
| Ação principal | `--primary` | `#B95124` | Botão de confirmar, enviar ou cadastrar |
| Ação em hover | `--primary-hover` | `#99401B` | Mouse sobre a ação principal |
| Fundo da ação | `--primary-soft` | `#FFF1E7` | Destaque leve, novo pedido e saldo |
| Laranja da marca | `--accent` | `#DF7C43` | Detalhes decorativos; não substituir o fundo acessível do botão |
| Sucesso | `--success` / `--success-soft` | `#426348` / `#EDF4E9` | Pronto, recebido, saldo quitado |
| Atenção | `--warning` / `--warning-soft` | `#805B16` / `#FAF1D9` | Estoque baixo, preparo, observações |
| Erro | `--danger` / `--danger-soft` | `#A43430` / `#FCEFED` | Erro, cancelamento e estorno |
| Foco | `--focus` | `#A54820` | Contorno de navegação por teclado |

O botão principal usa um laranja mais escuro que o detalhe da marca para tornar o texto branco legível. Não usar apenas uma mudança de cor para comunicar estado: incluir texto, ícone ou quantidade. Uma mesa deve ter nome acessível e uma legenda de situação, mesmo quando sua cor já indica o estado.

## 3. Tipografia e números

Fonte única, disponível no aparelho, sem download externo:

```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

| Elemento | Computador | Celular |
| --- | --- | --- |
| Título da página | 32 px | 28 px |
| Título de seção | 22 px | 20–22 px |
| Título do modal | 28 px | 26 px |
| Nome de produto | 18 px | 16–17 px |
| Texto geral | 15 px | 15 px |
| Texto em campos | 16 px | 16 px |
| Rótulos e controles | 14 px | 14 px |
| Metadados e ajuda | 12–13 px | 12–13 px |

Usar peso 400 no texto, 500–600 em rótulos e 650–700 em títulos e valores. Os nomes, observações e endereços podem quebrar linha; não reduzir a fonte para encaixar conteúdo longo. O mapa e a navegação compacta têm rótulos auxiliares de 11 px; manter os detalhes completos na comanda, com fonte normal. Não estender essa exceção a formulários ou novas telas.

Valores monetários usam `pt-BR`: **R$ 12,00**. Armazenamento, soma e comparação usam **centavos inteiros**. Datas e horários aparecem em português do Brasil. Quantidades devem informar sua unidade quando isso não estiver evidente.

## 4. Espaços, formas e profundidade

| Grupo | Padrão |
| --- | --- |
| Espaçamento | 4, 8, 12, 16, 24, 32 e 48 px (`--s1` até `--s12`) |
| Margem da página | 32 px no desktop, 24 px no tablet, 16 px no celular |
| Intervalo entre cards | 24 px no desktop; 12–16 px no celular |
| Raio pequeno | `--radius-sm`: 8 px |
| Controles | `--radius`: 12 px |
| Cards e painéis | `--radius-lg`: 20 px; variações compactas de 16 px |
| Modais | 24 px |
| Filtros e badges | `--radius-pill`: 999 px |
| Bordas | 1 px, com a variável correspondente |
| Botões | Altura mínima de 44 px |
| Campos | Altura mínima de 48 px |

Cards comuns usam borda, sem sombra forte. A barra fixa do cliente e os modais usam sombra para indicar sobreposição. Evitar um card dentro de outro card: separar pedidos da comanda com linhas e espaço.

## 5. Layout responsivo

As larguras abaixo são pontos de mudança de composição, não modelos de aparelhos. Entre elas, os componentes devem se adaptar sem rolagem horizontal da página.

| Largura | Navegação administrativa | Salão e comanda | Listas |
| --- | --- | --- | --- |
| 1200 px ou mais | Barra lateral de 224 px | Mapa e painel lateral de 340 px | Cards em 2–4 colunas conforme o conteúdo |
| 768–1199 px | Barra lateral compacta de 88 px | Mapa amplo; comanda abre em modal | Cards em 2 colunas; cozinha em 2 colunas |
| Até 767 px | Barra inferior com cinco destinos | Mesas menores; comanda abre em modal inferior | Estoque e clientes em lista; cozinha em uma coluna |
| Até 359 px | Mesmo fluxo, margens menores | Preservar área de toque das mesas | Evitar duas colunas em componentes complexos |

No cardápio do cliente, usar lista compacta no celular e tablet e duas colunas em telas grandes. Os filtros são uma faixa horizontal rolável; somente essa faixa pode rolar lateralmente. O estoque vira cards no celular, em vez de obrigar a rolar uma tabela larga.

Todo conteúdo deve reservar espaço para a barra inferior. Usar `env(safe-area-inset-bottom)` no celular e `dvh` para limitar a altura de modais. Com o teclado virtual aberto, o campo e o botão de envio precisam continuar alcançáveis por rolagem.

## 6. Componentes que devem ser reutilizados

| Componente | Classe / função | Regra |
| --- | --- | --- |
| Cabeçalho de página | `.heading`, `heading()` | Título, uma descrição curta e ações |
| Botão principal | `.btn.primary` | A ação que conclui a etapa |
| Botão secundário | `.btn` | Fundo branco, borda discreta |
| Ação destrutiva | `.btn.danger` | Texto explícito e confirmação quando necessário |
| Botão só com ícone | `.icon-button` | Nome acessível com `aria-label` |
| Filtro | `.chip`, `.chosen` | Formato arredondado; estado selecionado visível |
| Campo | `.field`, `field()` | Rótulo visível acima, nunca apenas placeholder |
| Grade de formulário | `.form-grid` | Duas colunas somente quando os campos cabem |
| Produto | `.product-card`, `productCard()` | Nome, descrição breve, preço e ação |
| Quantidade | `.stepper.quantity-control` | Branco, borda laranja, `− quantidade +` |
| Comanda individual | `.bill-card` | Pessoa, pedidos, total, pago e saldo |
| Pedido | `.mini-order`, `.k-order` | Número, pessoa, mesa, itens, situação |
| Estado | `.status` | Cor discreta e rótulo textual |
| Modal | `modal()`, `.dialog` | Um modal ativo; título e fechamento explícitos |
| Resposta curta | `toast()` | Confirmação complementar, nunca o único erro do formulário |
| Erro de formulário | `.form-feedback`, `.checkout-feedback` | Próximo da ação, anunciado com `role="status"` |
| Vazio | `.empty` | Explicar o que falta e como continuar |
| Resumo financeiro | `.payment-summary` | Total, já pago e falta pagar |

Exemplo de uma ação no padrão:

```html
<button type="button" class="btn primary">
  Salvar cliente
</button>

<label class="field">
  Nome
  <input name="name" autocomplete="name" maxlength="80" required>
</label>

<p class="form-feedback" role="status" aria-live="polite"></p>
```

O exemplo mostra a aparência e a semântica. Conectar a ação a uma API real, tratar erro, bloquear envio simultâneo e só confirmar após a resposta do servidor.

## 7. Regras por tela

### Salão e mesas

- Manter o mapa como elemento principal e os totais do salão como informação de apoio.
- Mesa livre, em atendimento, com pedido novo e com pedido pronto têm cores e legendas distintas.
- Em telas menores que 1200 px, tocar em uma mesa abre suas comandas em modal.
- Cada pessoa tem sua própria comanda. Agrupar mesas reúne a visualização, sem somar identidades de clientes.
- Um grupo aparece como uma mesa maior; ao separar, recuperar as posições individuais.
- Oferecer **Transferir / juntar** como alternativa ao arraste.
- Em **Editar salão**, permitir arrastar com mouse ou toque e posicionar por setas do teclado. A posição só é confirmada após salvar.

### Cardápio do cliente

1. Cabeçalho compacto com marca e identificação da mesa.
2. Categorias em botões horizontais arredondados, incluindo **Todos**.
3. Cards compactos com preço e disponibilidade relevante.
4. **Adicionar** vira um controle branco com borda laranja: `− 1 +`.
5. Ao escolher itens, a barra inferior fixa mostra total, quantidade e **Fazer pedido**.
6. **Fazer pedido** abre **Seu pedido**, contendo nome, itens, quantidades, observação opcional, total e **Enviar para a cozinha**.
7. O carrinho em edição aparece no modal. Pedidos já enviados podem aparecer em **Sua comanda**, com sua situação.

O botão da barra inferior abre a revisão; ele não envia o pedido diretamente. Alterar quantidades, fechar o resumo e reabri-lo deve preservar nome, observação e itens durante a sessão. O nome é obrigatório; a observação é opcional. Ao confirmar o envio, limpar o carrinho, atualizar a comanda e mostrar o número do pedido. Uma falha deve manter os dados para correção e nova tentativa.

A identificação e o nome confirmado ficam no navegador. O carrinho em edição não é persistido após recarregar a página; não prometer recuperação desse rascunho em outras sessões.

### Pedidos / cozinha

Mostrar nome da pessoa e mesa em cada card, além de número, tempo, itens e observações. As etapas são **Novo pedido → Em preparo → Pronto → Entregue**. A ação deve nomear a próxima etapa. No celular, as colunas se transformam em seções verticais.

### Cardápio administrativo e estoque

Usar os mesmos nomes, preços e categorias do cardápio do cliente. Estoque significa unidades prontas para venda, não ingredientes. Mostrar indisponibilidade e estoque baixo com texto. Produto pausado continua editável no painel, mas não aparece para o cliente.

### Clientes

A lista tem busca por nome ou telefone, cadastro e detalhe. O formulário contém nome, telefone, data de nascimento e endereço de entrega; somente nome é obrigatório. O detalhe mostra contatos, produtos mais pedidos e histórico com data, mesa e itens.

Vincular a comanda a um cadastro por escolha explícita da equipe. Nunca deduzir que duas pessoas com o mesmo nome são o mesmo cliente. Não solicitar telefone, endereço ou aniversário para fazer um pedido na mesa.

### Recebimento e divisão de conta

- Sempre mostrar **Total**, **Já pago** e **Falta pagar** juntos.
- A calculadora divide o **saldo restante** por uma quantidade de pessoas; não registra pagamentos sozinha.
- Exemplo: R$ 10,00 em três partes resulta em R$ 3,34 + R$ 3,33 + R$ 3,33. A soma deve fechar exatamente.
- **Registrar recebimento** exige valor e forma; o nome de quem pagou é opcional.
- Permitir pagamentos parciais em formas diferentes e mostrar cada recebimento no histórico.
- Não aceitar valor acima do saldo; atualizar os dados quando outro caixa tiver recebido antes.
- Um recebimento da mesa é distribuído entre suas comandas abertas. O registro individual permanece identificável.
- Estorno exige motivo e preserva o registro original. Um recebimento distribuído é estornado por inteiro, enquanto todas as comandas envolvidas continuarem abertas.
- Só encerrar quando o saldo estiver quitado e todos os pedidos estiverem entregues ou cancelados.

Os botões registram o recebimento informado pelo caixa. Eles não cobram cartão, geram Pix nem fazem estorno bancário.

### QR code e configurações

QR code tem área branca, margem e contraste escuro; não colocar decoração sobre o código. Exibir a mesa e ações separadas para imprimir e testar. Configurações usam o mesmo formulário e modal do restante do sistema. Nunca mostrar detalhes técnicos no fluxo do cliente.

## 8. Modais, estados e acessibilidade

- Usar o `<dialog>` nativo através de `modal()`. O conteúdo de fundo fica inativo, o foco entra no título e a navegação por Tab fica dentro da janela.
- Oferecer botão de fechar com nome acessível; Escape fecha, exceto enquanto o pedido está sendo enviado. Restaurar o foco ao elemento de origem quando ele ainda existir.
- No computador, centralizar o modal. No celular, ancorá-lo na parte inferior, com conteúdo rolável e limite de altura.
- Campos mantêm rótulos visíveis; `autocomplete`, `type`, limites e teclado devem corresponder ao dado.
- Erro de nome direciona o foco ao campo e usa `aria-invalid`. Nas novas telas, aplicar o mesmo padrão ao primeiro campo inválido.
- Ação em andamento deve apresentar **Enviando…** ou **Salvando…** e bloquear repetição simultânea.
- Sucesso depende de resposta positiva do servidor. Não limpar os dados antes dessa resposta.
- Todo botão de quantidade tem nome acessível que identifica o produto. O número selecionado é texto real, não apenas cor ou imagem.
- Foco visível: contorno de 3 px com afastamento de 3 px. Não removê-lo de controles.
- Meta de contraste: 4,5:1 para texto comum, 3:1 para texto grande e controles essenciais. Conferir novamente ao introduzir cores.
- Verificar zoom de 200%, nomes longos, listas vazias, estoque esgotado, erros de rede e teclado virtual. Não tratar teste de largura como substituto de teste em aparelho real.

## 9. Movimento, ícones e imagens

Usar transições curtas (150–200 ms), apenas para feedback: pressão do botão, abertura do modal e agrupamento de mesas. Arrastar acompanha o dedo, sem atraso. Não animar valores financeiros para esconder uma atualização.

`prefers-reduced-motion: reduce` remove animações e transições. O modo de contraste aumentado reforça bordas e texto secundário. Os modais têm fundo branco sólido; a sobreposição escurece o fundo sem depender de desfoque.

Ícones são Lucide, servidos localmente, normalmente com 20 px e traço 1,8. Não misturar bibliotecas. Os produtos usam os emojis cadastrados como ilustrações provisórias. Se forem adicionadas fotografias reais, manter proporção e enquadramento consistentes, usar `alt` adequado e não apresentar imagem de outro alimento como foto do produto vendido.

## 10. Escrita da interface

Português do Brasil, frases curtas e ações concretas: **Salvar cliente**, **Fazer pedido**, **Enviar para a cozinha**, **Registrar recebimento**. Evitar rótulos genéricos como “Prosseguir” quando a consequência pode ser nomeada.

| Situação | Texto de referência |
| --- | --- |
| Nome obrigatório | Informe seu nome para continuar. |
| Nenhum item | Seu pedido está vazio. Escolha produtos no cardápio. |
| Envio confirmado | Seu pedido #123 chegou à cozinha. |
| Pagamento parcial | Pago R$ 13,00 · Falta R$ 26,00 |
| Saldo excedido | O valor excede o saldo restante. Atualize a conta. |
| Histórico vazio | Nenhum pedido vinculado. |

Usar os mesmos termos em todas as telas. **Mesa** é o lugar; **comanda** é a conta de uma pessoa; **pedido** é um envio para a cozinha; **recebimento** é um pagamento registrado no caixa.

## 11. Como criar uma nova tela

1. Definir a tarefa principal, dados necessários e estados vazio/carregando/erro/sucesso.
2. Escolher os componentes existentes da seção 6. Só criar um componente se nenhum atual representar a tarefa.
3. Reutilizar os tokens de cor, espaço, borda e tipografia; acrescentar estilos em `public/style.css`, sem uma segunda folha de tema.
4. Definir a composição de celular antes de aumentar a quantidade de colunas no desktop.
5. Usar `modal()` para tarefas curtas; usar uma página para informação que merece navegação permanente.
6. Integrar a API e preservar os dados em caso de falha. Tratar concorrência e repetição em ações que criam pedidos ou pagamentos.
7. Validar teclado, toque, leitura dos valores e nomes longos.
8. Atualizar este guia se o padrão mudar. Novas exceções devem explicar o motivo e onde se aplicam.

### Checklist de revisão

- [ ] Segue as variáveis e componentes existentes.
- [ ] Há uma ação principal clara por etapa.
- [ ] Funciona em 320, 390, 768, 1024 e 1440 px, sem rolagem horizontal da página.
- [ ] Tem controles de toque de pelo menos 44 px e campos de 16 px.
- [ ] Modal pode ser fechado e percorrido pelo teclado; foco é visível.
- [ ] Barra fixa não cobre o último item nem o campo focado.
- [ ] Nome, notas e itens não desaparecem ao ajustar o pedido.
- [ ] Validação identifica o problema e mantém o que já foi digitado.
- [ ] Mensagem de sucesso corresponde a uma gravação confirmada.
- [ ] Valores são calculados em centavos e pagamentos não são duplicados.
- [ ] Considera estado vazio, nomes longos, estoque esgotado e movimento reduzido.
- [ ] Testes relevantes passam; capturas foram examinadas visualmente.

## 12. Referências visuais e verificação

As capturas abaixo usam dados fictícios e foram geradas a partir da aplicação. São referências desta versão; o CSS e os componentes são a fonte atual do comportamento.

| Tela | Captura |
| --- | --- |
| Salão no computador | [Ver imagem](design/salao-desktop.png) |
| Clientes no computador | [Ver imagem](design/clientes-desktop.png) |
| Cardápio no celular | [Ver imagem](design/cardapio-mobile.png) |
| Resumo do pedido no celular | [Ver imagem](design/resumo-mobile.png) |
| Divisão e recebimentos | [Ver imagem](design/dividir-conta.png) |
| Comanda da mesa no celular | [Ver imagem](design/comanda-mobile.png) |

```sh
npm test
node scripts/browser-smoke.mjs
```

Os testes usam bancos temporários. O teste de navegador requer Chromium/Playwright e grava capturas em `/tmp/pamonharia-design-previews`. Ele cobre o fluxo do cliente, cadastros, histórico, cozinha, recebimentos e largura das telas. Testar também em celular real antes de uma implantação: os testes automatizados não comprovam, sozinhos, o comportamento do teclado virtual ou de todos os leitores de tela.

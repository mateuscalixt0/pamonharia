import { parseOrder } from "/order-parser.js";
import { setupAccountsUI } from "/accounts-ui.js";
const $ = (s) => document.querySelector(s),
  money = (n) =>
    (n / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    ),
  icon = (n) => `<i data-lucide="${n}"></i>`;
let state = { tables: [], orders: [], products: [] },
  view = "tables",
  selected = 4,
  filter = "all",
  category = "Todos",
  search = "",
  editing = false,
  cart = {},
  customer = new URLSearchParams(location.search).get("mesa"),
  customerData,
  cartTable = null,
  dragSource = null;
function newIdentityId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}
let identity;
try {
  identity = JSON.parse(localStorage.getItem("pamonharia-customer") || "null");
} catch {}
if (!identity?.id) identity = { id: newIdentityId(), name: "" };
function saveIdentity() {
  try {
    localStorage.setItem("pamonharia-customer", JSON.stringify(identity));
  } catch {
    toast("Identificação não salva neste navegador.");
  }
}
saveIdentity();
const newId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
const statuses = {
  new: ["Novo pedido", "orange"],
  preparing: ["Em preparo", "yellow"],
  ready: ["Pronto para servir", "green"],
  delivered: ["Entregue", "gray"],
  cancelled: ["Cancelado", "gray"],
};
async function api(path, method = "GET", data) {
  const r = await fetch("/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Customer-Id": identity.id,
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw Error(j.error);
  return j;
}
function toast(msg) {
  $("#toast").textContent = msg;
  $("#toast").classList.add("show");
  setTimeout(() => $("#toast").classList.remove("show"), 4000);
}
function icons() {
  lucide.createIcons();
}
function total(orders) {
  return orders
    .filter((o) => o.status !== "cancelled")
    .reduce(
      (s, o) => s + o.items.reduce((a, i) => a + i.price * i.quantity, 0),
      0,
    );
}
function members(t) {
  return state.tables.filter(
    (a) => (a.group_id || a.id) === (t.group_id || t.id),
  );
}
function tableOrders(t) {
  return state.orders.filter(
    (o) => !o.closed && members(t).some((a) => a.id === o.table_id),
  );
}
function tableStatus(t) {
  const os = tableOrders(t).filter((o) => o.status !== "cancelled");
  return os.some((o) => o.status === "ready")
    ? "ready"
    : os.some((o) => o.status === "new")
      ? "new"
      : os.length
        ? "busy"
        : "free";
}
const tableLabels = {
  free: "Livre",
  busy: "Em atendimento",
  new: "Novo pedido",
  ready: "Pronto para servir",
};
function minutes(o) {
  return Math.max(0, Math.floor((Date.now() - new Date(o.created)) / 60000));
}
async function refresh() {
  try {
    if (customer) {
      customerData = await api("/menu?table=" + encodeURIComponent(customer));
      renderCustomer();
    } else {
      state = await api("/state");
      render();
    }
  } catch (e) {
    toast(e.message);
    if (customer && !customerData)
      $("#app").innerHTML =
        '<div class="invalid"><h1>Não encontramos esta mesa</h1><p>Peça à equipe um novo QR code.</p></div>';
  }
}
const navs = [
  ["tables", "layout-dashboard", "Salão e mesas"],
  ["orders", "clipboard-list", "Pedidos"],
  ["products", "utensils", "Cardápio"],
  ["stock", "package", "Estoque"],
  ["customers", "contact-round", "Clientes"],
];
function render() {
  const pending = state.orders.filter(
    (o) => !o.closed && o.status === "new",
  ).length;
  $("#app").innerHTML =
    `<aside class="sidebar"><a class="brand" href="/"><div class="brand-mark">${icon("wheat")}</div><div>Pamonharia<span>Feita com carinho</span></div></a><div class="nav-caption">SEU RESTAURANTE</div><nav>${navs.map(([id, ic, label]) => `<button data-view="${id}" class="nav-item ${view === id ? "active" : ""}">${icon(ic)}${label}${id === "orders" && pending ? `<b>${pending}</b>` : ""}</button>`).join("")}</nav><div class="sidebar-bottom"><div class="local-card">${icon("database")}<div>Ambiente de teste<span>Seus dados ficam salvos aqui</span></div><span class="dot"></span></div><button class="nav-item" data-action="settings">${icon("settings-2")}Configurações</button><div class="profile"><div class="avatar">MC</div><div>Minha pamonharia<small>Administrador</small></div>${icon("chevrons-up-down")}</div></div></aside><div class="workspace"><header class="topbar"><div class="breadcrumb">Operação <span>/</span> <b>${navs.find((n) => n[0] === view)[2]}</b></div><div class="top-right"><span class="live"><span class="dot"></span> Painel local</span><button class="icon-button" title="Configurações" data-action="settings">${icon("settings-2")}</button><span class="date">${new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}</span><button class="icon-button" title="Ver novos pedidos" data-view="orders">${icon("bell")}${pending ? "<em></em>" : ""}</button></div></header><main id="main" tabindex="-1">${view === "tables" ? tablesView() : view === "orders" ? ordersView() : productsView()}</main><footer><span><span class="dot"></span> Atualização automática a cada 5 segundos</span><span>Um bom atendimento começa aqui.</span></footer></div>`;
  icons();
  bindDrag();
  renderBills();
}
function heading(title, subtitle, actions = "") {
  const names = {
    "Cada mesa, uma boa história.": [
      "Salão e mesas",
      "Comandas individuais, um salão organizado.",
    ],
    "Na cozinha, tudo no ponto.": [
      "Pedidos",
      "Nome, mesa e preparo em cada etapa.",
    ],
    "Tudo pronto para servir.": [
      "Estoque",
      "Unidades prontas para vender, atualizadas a cada pedido.",
    ],
    "Sabores que fazem voltar.": [
      "Cardápio",
      "Produtos, preços e disponibilidade da casa.",
    ],
  };
  [title, subtitle] = names[title] || [title, subtitle];
  return (
    '<div class="heading"><div><h1>' +
    title +
    "</h1><p>" +
    subtitle +
    '</p></div><div class="heading-actions">' +
    actions +
    "</div></div>"
  );
}
function tablesView() {
  const counts = { free: 0, busy: 0, ready: 0, new: 0 };
  state.tables.forEach((t) => counts[tableStatus(t)]++);
  const occupied = state.tables.length - counts.free;
  return `${heading("Cada mesa, uma boa história.", "Acompanhe o salão e cuide de cada pedido em um só lugar.", `<button class="btn" data-action="edit-layout">${icon(editing ? "check" : "move")}${editing ? "Concluir edição" : "Editar salão"}</button><button class="btn primary" data-action="new-table">${icon("plus")} Nova mesa</button>`)}<section class="stats"><div class="stat"><div class="stat-icon cream">${icon("armchair")}</div><div><span>Total de mesas</span><strong>${state.tables.length}<small>no salão</small></strong></div></div><div class="stat"><div class="stat-icon sage">${icon("circle-check")}</div><div><span>Mesas livres</span><strong>${counts.free}<small>prontas para receber</small></strong></div></div><div class="stat"><div class="stat-icon peach">${icon("utensils")}</div><div><span>Em atendimento</span><strong>${occupied}<small>comandas abertas</small></strong></div></div><div class="stat"><div class="stat-icon butter">${icon("chef-hat")}</div><div><span>Pedidos em preparo</span><strong>${state.orders.filter((o) => !o.closed && o.status === "preparing").length}<small>aguardando preparo</small></strong></div></div></section><div class="salon-layout"><section class="floor-panel"><div class="panel-top"><div><h2>Mapa do salão <span class="pill">${state.tables.length} mesas</span></h2><p>${editing ? "Arraste as mesas para organizar o espaço." : "Selecione uma mesa para ver a comanda."}</p></div><span class="floor-label">${icon("layers")} Salão principal</span></div><div class="filters">${[
    ["all", "Todas"],
    ["free", "Livres"],
    ["busy", "Em atendimento"],
    ["ready", "Prontas"],
  ]
    .map(
      ([id, name]) =>
        `<button class="chip ${filter === id ? "chosen" : ""}" data-filter="${id}">${id !== "all" ? `<span class="dot ${id}"></span>` : ""}${name}</button>`,
    )
    .join(
      "",
    )}<span class="map-hint">${icon("mouse-pointer-2")} ${editing ? "Organize seu espaço" : "Arraste para transferir"}</span></div><div class="floor ${editing ? "editing" : ""}" id="floor"><span class="room-note">S A L Ã O &nbsp; P R I N C I P A L</span><div class="plant plant-one">✳</div><div class="plant plant-two">✳</div>${state.tables
    .filter((t) => editing || !t.group_id || t.group_id === t.id)
    .map((t) => {
      const s = tableStatus(t),
        os = tableOrders(t),
        visible =
          filter === "all" ||
          filter === s ||
          (filter === "busy" && s !== "free");
      return `<button draggable="true" data-table="${t.id}" class="restaurant-table ${t.shape} ${t.group_id && !editing ? "grouped" : ""} ${s} ${selected === t.id ? "selected" : ""} ${!visible ? "dim" : ""}" style="left:${t.group_id && !editing ? Math.max(16, Math.min(84, t.x)) : t.x}%;top:${t.y}%" aria-label="Mesa ${esc(t.name)}, ${tableLabels[s]}"><span class="chair top"></span><span class="chair bottom"></span><span class="chair left"></span><span class="chair right"></span><span class="table-inner"><span class="table-name">${
        t.group_id && !editing
          ? members(t)
              .map((m) => esc(m.name))
              .join(" + ")
          : "Mesa " + esc(t.name)
      }</span>${s === "free" ? `<span class="seats">${icon("users")} ${t.seats} lugares</span><span class="free-label">Livre</span>` : `<strong>${money(total(os))}</strong><span class="table-time">${icon(s === "ready" ? "bell-ring" : "clock-3")}${s === "ready" ? "Pedido pronto" : minutes(os[os.length - 1]) + " min"}</span>`}${t.group_id ? '<span class="group-label">▦ Mesas juntas</span>' : ""}</span>${s === "new" ? '<span class="table-alert">!</span>' : ""}</button>`;
    })
    .join(
      "",
    )}<span class="entrance">ENTRADA ${icon("arrow-up")}</span></div><div class="floor-bottom"><div><span class="legend"><i class="dot free"></i>Livre</span><span class="legend"><i class="dot busy"></i>Em atendimento</span><span class="legend"><i class="dot new"></i>Novo pedido</span><span class="legend"><i class="dot ready"></i>Pronto</span></div><span>${icon("move")} ${editing ? "Edição ativa" : "Visão do salão"}</span></div></section>${detailView()}</div><div class="tip">${icon("lightbulb")}<span><b>Mais tempo para receber bem.</b> Seus clientes podem pedir pelo QR code da mesa. O pedido chega direto na sua cozinha.</span><button data-action="qr" data-id="${selected || 1}">Ver QR code ${icon("arrow-up-right")}</button></div>`;
}
function renderBills() {
  const t = state.tables.find((t) => t.id === selected);
  if (!t) return;
  const os = tableOrders(t),
    bills = [...new Set(os.map((o) => o.bill_id))];
  const html =
    bills
      .map((id) => {
        const own = os.filter((o) => o.bill_id === id);
        return (
          '<article class="bill-card"><h3>' +
          icon("user-round") +
          esc(own[0].customer_name || "Comanda anterior") +
          "</h3>" +
          own
            .map(
              (o) =>
                '<div class="mini-order"><div class="row between"><b>#' +
                o.id +
                '</b><span class="status ' +
                statuses[o.status][1] +
                '">' +
                statuses[o.status][0] +
                "</span></div>" +
                o.items
                  .map(
                    (i) =>
                      '<div class="order-line"><span>' +
                      i.quantity +
                      "× " +
                      esc(i.name) +
                      "</span><b>" +
                      money(i.price * i.quantity) +
                      "</b></div>",
                  )
                  .join("") +
                (o.note ? '<p class="note">' + esc(o.note) + "</p>" : "") +
                advanceButton(o) +
                "</div>",
            )
            .join("") +
          '<div class="cart-total"><span>Total individual</span><strong>' +
          money(total(own)) +
          "</strong></div>" +
          accountsUI.billFooter(id) +
          "</article>"
        );
      })
      .join("") ||
    '<div class="empty"><h3>Mesa disponível</h3><p>Adicione um pedido ou apresente o QR code.</p></div>';
  document
    .querySelectorAll(".detail-orders")
    .forEach((c) => (c.innerHTML = html));
  document.querySelectorAll('[data-action="close"]').forEach((b) => {
    b.hidden = true;
  });
  document.querySelectorAll(".detail-summary").forEach((c) => {
    c.querySelector('[data-account="pay-table"]')?.remove();
    if (bills.length)
      c.insertAdjacentHTML(
        "beforeend",
        '<button class="btn wide" data-account="pay-table" data-id="' +
          t.id +
          '">' +
          icon("wallet") +
          " Receber / dividir mesa</button>",
      );
  });
  icons();
}
function detailView() {
  const t = state.tables.find((t) => t.id === selected);
  if (!t) return '<aside class="detail"><h2>Selecione uma mesa</h2></aside>';
  const s = tableStatus(t),
    os = tableOrders(t),
    ms = members(t);
  return `<aside class="detail"><div class="detail-header"><div><span class="eyebrow">COMANDA DA MESA</span><h2>Mesa ${esc(t.name)} <span class="status ${s}">${tableLabels[s]}</span></h2><p>${icon("users")} ${t.seats} lugares ${ms.length > 1 ? " · Mesas " + ms.map((t) => esc(t.name)).join(" + ") : " · Salão principal"}</p></div><button class="icon-button" title="Editar mesa" data-action="edit-table" data-id="${t.id}">${icon("ellipsis")}</button></div><button class="qr-button" data-action="qr" data-id="${t.id}">${icon("qr-code")}<span>QR code da mesa<small>Seu cliente pede, você recebe.</small></span>${icon("arrow-up-right")}</button><div class="order-title"><h3>Pedidos da mesa</h3><span>${os.length} pedido${os.length !== 1 ? "s" : ""}</span></div><div class="detail-orders">${os.length ? os.map((o) => `<article class="mini-order"><div class="mini-order-top"><b>#${String(o.id).padStart(3, "0")}</b><span class="status ${statuses[o.status][1]}">${statuses[o.status][0]}</span><small>${minutes(o)} min</small></div>${o.items.map((i) => `<div class="order-line"><span class="quantity">${i.quantity}×</span><span>${esc(i.name)}</span><b>${money(i.price * i.quantity)}</b></div>`).join("")}${o.note ? `<p class="note">${icon("message-square")} ${esc(o.note)}</p>` : ""}${advanceButton(o)}</article>`).join("") : `<div class="empty">${icon("coffee")}<h3>Pronta para uma boa conversa</h3><p>Adicione um pedido ou deixe o cliente escolher pelo QR code.</p></div>`}</div><div class="detail-summary"><div><span>Total da comanda</span><strong>${money(total(os))}</strong></div><small>Sem taxa de serviço • pagamento no caixa</small><button class="btn primary wide" data-action="order" data-id="${t.id}">${icon("plus")} Adicionar pedido</button><div class="split-actions"><button class="btn" data-action="move" data-id="${t.id}">${icon("arrow-right-left")} Transferir / juntar</button><button class="btn" data-action="close" data-id="${t.id}" ${!os.length ? "disabled" : ""}>Fechar conta</button></div>${t.group_id ? `<button class="text-button" data-action="ungroup" data-id="${t.id}">Desvincular mesas</button>` : ""}</div></aside>`;
}
function advanceButton(o) {
  const labels = {
      new: "Começar preparo",
      preparing: "Marcar como pronto",
      ready: "Confirmar entrega",
    },
    next = { new: "preparing", preparing: "ready", ready: "delivered" };
  return labels[o.status]
    ? `<button class="advance" data-status="${next[o.status]}" data-id="${o.id}">${labels[o.status]} ${icon("arrow-right")}</button>`
    : "";
}
function ordersView() {
  const open = state.orders.filter((o) => !o.closed);
  return `${heading("Na cozinha, tudo no ponto.", "Do primeiro pedido à última entrega. Cada etapa, no seu tempo.", `<span class="live"><span class="dot"></span> Atualiza a cada 5 segundos</span>`)}<div class="kanban">${[
    "new",
    "preparing",
    "ready",
    "delivered",
  ]
    .map(
      (s) =>
        `<section class="kanban-column"><h2><i class="dot ${statuses[s][1]}"></i>${statuses[s][0]} <span>${open.filter((o) => o.status === s).length}</span></h2>${
          open
            .filter((o) => o.status === s)
            .map(
              (o) =>
                `<article class="k-order"><div class="k-title"><span><b>Mesa ${esc(state.tables.find((t) => t.id === o.table_id)?.name)}</b><strong class="customer-name">${esc(o.customer_name || "Comanda anterior")}</strong></span><small>#${String(o.id).padStart(3, "0")}</small></div><div class="elapsed ${minutes(o) > 20 ? "late" : ""}">${icon("clock-3")} Há ${minutes(o)} minutos</div>${o.items.map((i) => `<div class="order-line"><span class="quantity">${i.quantity}×</span><span>${esc(i.name)}</span></div>`).join("")}${o.note ? `<p class="note">${esc(o.note)}</p>` : ""}${advanceButton(o)}${s !== "delivered" ? `<button class="text-button muted" data-action="cancel-order" data-id="${o.id}">Cancelar pedido</button>` : ""}</article>`,
            )
            .join("") ||
          '<div class="column-empty">Tudo tranquilo por aqui.</div>'
        }</section>`,
    )
    .join("")}</div>`;
}
function productsView() {
  if (view === "customers") return accountsUI.customersView(search);
  const stock = view === "stock";
  const ps = state.products.filter(
    (p) =>
      (category === "Todos" || p.category === category) &&
      p.name.toLowerCase().includes(search.toLowerCase()),
  );
  return `${heading(stock ? "Tudo pronto para servir." : "Sabores que fazem voltar.", stock ? "Controle as unidades disponíveis para venda, sem complicação." : "Seu cardápio, organizado com o carinho da casa.", `<button class="btn primary" data-action="new-product">${icon("plus")} Novo produto</button>`)}<div class="catalog-toolbar"><div class="tabs">${["Todos", ...new Set(state.products.map((p) => p.category))].map((c) => `<button class="chip ${category === c ? "chosen" : ""}" data-category="${esc(c)}">${esc(c)}</button>`).join("")}</div><label class="search">${icon("search")}<input id="search" aria-label="Buscar produto" value="${esc(search)}" placeholder="Buscar produto..."></label></div>${stock ? `<section class="inventory"><div class="inventory-row inventory-head"><span>Produto</span><span>Categoria</span><span>Preço</span><span>Disponível</span><span>Situação</span><span></span></div>${ps.map((p) => `<div class="inventory-row"><span class="product-name"><span class="food-small">${esc(p.emoji)}</span><b>${esc(p.name)}</b></span><span>${esc(p.category)}</span><span>${money(p.price)}</span><b>${p.stock} un.</b><span class="status ${p.stock === 0 ? "orange" : p.stock <= 5 ? "yellow" : "green"}">${p.stock === 0 ? "Esgotado" : p.stock <= 5 ? "Estoque baixo" : "Em estoque"}</span><button class="btn" data-action="edit-product" data-id="${p.id}">Ajustar</button></div>`).join("")}</section>` : `<div class="product-grid">${ps.map((p) => productCard(p, false)).join("")}</div>`}${!ps.length ? '<div class="empty"><h3>Nenhum produto encontrado</h3><p>Tente outra busca ou cadastre um produto.</p></div>' : ""}`;
}
function productCard(p, buy) {
  const qty = cart[p.id] || 0;
  const control = qty
    ? '<div class="stepper quantity-control"><button type="button" data-action="minus-cart" data-id="' +
      p.id +
      '" aria-label="Remover uma unidade de ' +
      esc(p.name) +
      '">−</button><output aria-live="polite">' +
      qty +
      '</output><button type="button" data-action="add-cart" data-id="' +
      p.id +
      '" aria-label="Adicionar uma unidade de ' +
      esc(p.name) +
      '" ' +
      (qty >= p.stock ? "disabled" : "") +
      ">+</button></div>"
    : '<button type="button" class="btn primary" data-action="add-cart" data-id="' +
      p.id +
      '" ' +
      (!p.stock || !p.active ? "disabled" : "") +
      ">" +
      (!p.stock ? "Esgotado" : icon("plus") + " Adicionar") +
      "</button>";
  return (
    '<article class="product-card ' +
    (buy ? "customer-product" : "") +
    '"><div class="product-art art-' +
    (p.id % 4) +
    '" aria-hidden="true"><span>' +
    esc(p.emoji) +
    '</span></div><div class="product-content"><span class="product-category">' +
    esc(p.category) +
    "</span><h3>" +
    esc(p.name) +
    "</h3><p>" +
    esc(p.description) +
    '</p><div class="product-bottom"><div class="product-meta"><strong>' +
    money(p.price) +
    "</strong>" +
    (!buy || p.stock <= 5
      ? "<span>" +
        (!p.active
          ? "Pausado"
          : p.stock
            ? p.stock + " disponíveis"
            : "Esgotado") +
        "</span>"
      : "") +
    "</div>" +
    (buy
      ? control
      : '<button class="btn" data-action="edit-product" data-id="' +
        p.id +
        '">' +
        icon("pencil") +
        " Editar</button>") +
    "</div></div></article>"
  );
}
function modal(html, wide = false) {
  const previous = $("#modal dialog");
  if (!previous) modalFocus = document.activeElement;
  previous?.close();
  $("#modal").innerHTML =
    '<dialog class="dialog ' +
    (wide ? "dialog-wide" : "") +
    '" aria-labelledby="dialog-title"><button type="button" class="dialog-close icon-button" data-action="dismiss" aria-label="Fechar janela">' +
    icon("x") +
    "</button>" +
    html +
    "</dialog>";
  const d = $("#modal dialog"),
    title = d.querySelector("h2");
  if (title) {
    title.id = "dialog-title";
    title.tabIndex = -1;
  }
  d.addEventListener("cancel", (e) => {
    e.preventDefault();
    dismiss();
  });
  d.showModal();
  document.body.classList.add("modal-open");
  icons();
  title?.focus({ preventScroll: true });
  // Both the desktop detail and the mobile sheet use the same bill renderer.
  if (d.querySelector(".detail-orders")) renderBills();
}
function dismiss() {
  if (orderSending) return;
  $("#modal dialog")?.close();
  $("#modal").innerHTML = "";
  document.body.classList.remove("modal-open");
  if (modalFocus?.isConnected) modalFocus.focus({ preventScroll: true });
}
function field(label, name, value = "", type = "text", extra = "") {
  return `<label class="field">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
}
function tableForm(t) {
  modal(
    `<h2>${t ? "Editar mesa" : "Uma nova mesa à casa"}</h2><p>Um lugar para receber boas histórias.</p><form id="table-form" data-id="${t?.id || ""}">${field("Número / nome da mesa", "name", t?.name || String(state.tables.length + 1).padStart(2, "0"), "text", 'required maxlength="20"')}${field("Quantidade de lugares", "seats", t?.seats || 4, "number", 'required min="1" max="20"')}<label class="field">Formato<select name="shape"><option value="square">Quadrada</option><option value="round" ${t?.shape === "round" ? "selected" : ""}>Redonda</option></select></label><button class="btn primary wide">Salvar mesa</button></form>`,
  );
}
function productForm(p) {
  modal(
    `<h2>${p ? "Editar produto" : "Um novo sabor"}</h2><p>Estoque é a quantidade pronta para vender.</p><form id="product-form" data-id="${p?.id || ""}">${field("Nome", "name", p?.name || "", "text", 'required maxlength="200"')}<div class="form-grid">${field("Categoria", "category", p?.category || "Pamonhas", "text", "required")}${field("Ícone (emoji)", "emoji", p?.emoji || "🌽")}</div><div class="form-grid">${field("Preço (R$)", "price", ((p?.price || 0) / 100).toFixed(2), "number", 'required min="0.01" step="0.01"')}${field("Unidades disponíveis", "stock", p?.stock ?? 0, "number", 'required min="0" step="1"')}</div>${field("Descrição", "description", p?.description || "")}<label class="checkbox"><input type="checkbox" name="active" ${!p || p.active ? "checked" : ""}> Disponível no cardápio</label><button class="btn primary wide">Salvar produto</button></form>`,
  );
}
async function qr(id) {
  const t = state.tables.find((t) => t.id === id),
    q = await api("/qr/" + id);
  modal(
    `<div class="qr-print"><div class="eyebrow">PAMONHARIA • FEITA COM CARINHO</div><h2>Oi, mesa ${esc(t.name)}!</h2><p>Seu próximo sabor está a um toque.<br>Escaneie, escolha e peça por aqui.</p><div class="qr-image">${q.svg}</div><b>Mesa ${esc(t.name)}</b></div><div class="qr-actions"><button class="btn primary wide" data-action="print">${icon("printer")} Imprimir QR code</button><a class="btn wide" href="${esc(q.url)}" target="_blank" rel="noopener">Testar cardápio do cliente ${icon("external-link")}</a><p class="help">Para ler pelo celular, configure o endereço de rede do computador em Configurações.</p></div>`,
  );
}
function orderModal(id) {
  cartTable = id;
  cart = {};
  orderRequestId = newId();
  modal(
    `<h2>Novo pedido · Mesa ${esc(state.tables.find((t) => t.id === id).name)}</h2><p>Escolha os sabores. A cozinha cuida do resto.</p><div class="quick-products">${state.products
      .filter((p) => p.active)
      .map(
        (p) =>
          `<div><span class="food-small">${esc(p.emoji)}</span><span><b>${esc(p.name)}</b><small>${money(p.price)} · ${p.stock} disponíveis</small></span><button class="icon-button" aria-label="Adicionar ${esc(p.name)}" data-action="add-cart" data-id="${p.id}" ${!p.stock ? "disabled" : ""}>${icon("plus")}</button></div>`,
      )
      .join(
        "",
      )}</div><label class="field">Anotar pedido por texto<textarea id="written-order" placeholder="2 pamonhas com queijo e um café"></textarea></label><button class="btn wide" data-action="parse-order">Identificar produtos e revisar</button><p id="parse-feedback" class="help" role="status"></p><label class="field">Comanda<select id="staff-bill"><option value="">Nova comanda</option>${[
      ...new Map(
        tableOrders(state.tables.find((t) => t.id === id))
          .filter((o) => o.customer_id)
          .map((o) => [o.customer_id, o]),
      ).values(),
    ]
      .map(
        (o) =>
          `<option value="${esc(o.customer_id)}">${esc(o.customer_name)} · ${esc(o.bill_id.slice(0, 8))}</option>`,
      )
      .join(
        "",
      )}</select></label>${accountsUI.clientSelect()}${field("Nome do cliente", "staffName", "", "text", 'required maxlength="80"')}<div id="cart-content"></div>`,
    true,
  );
  renderCart();
}
function checkoutModal() {
  modal(
    "<h2>" +
      icon("shopping-bag") +
      " Seu pedido</h2><p>Mesa " +
      esc(customerData.table.name) +
      ' · pagamento no caixa</p><label class="field">Seu nome<input id="checkout-name" maxlength="80" autocomplete="name" value="' +
      esc(checkoutDraft.name || identity.name) +
      '" required aria-describedby="checkout-feedback"></label><div class="checkout-items"></div><label class="field">Algum cuidado especial? <span class="muted">Opcional</span><textarea id="checkout-note" maxlength="500" placeholder="Ex.: sem manteiga, por favor">' +
      esc(checkoutDraft.note) +
      '</textarea></label><div class="checkout-footer"><div class="cart-total"><span>Total do pedido</span><strong id="checkout-total"></strong></div><button type="button" class="btn primary wide" data-action="send-order">Enviar para a cozinha ' +
      icon("arrow-right") +
      '</button><p id="checkout-feedback" class="checkout-feedback" role="status"></p></div>',
  );
  renderCart();
}
function renderCart() {
  const products = customer ? customerData.products : state.products;
  const items = Object.entries(cart)
    .filter(([, q]) => q > 0)
    .map(([id, q]) => ({ ...products.find((p) => p.id === Number(id)), q }))
    .filter((p) => p.id);
  const lines =
    items
      .map(
        (p) =>
          '<div class="order-line"><span>' +
          esc(p.name) +
          '</span><div class="stepper quantity-control"><button type="button" data-action="minus-cart" data-id="' +
          p.id +
          '" aria-label="Remover uma unidade de ' +
          esc(p.name) +
          '">−</button><output>' +
          p.q +
          '</output><button type="button" data-action="add-cart" data-id="' +
          p.id +
          '" aria-label="Adicionar uma unidade de ' +
          esc(p.name) +
          '" ' +
          (p.q >= p.stock ? "disabled" : "") +
          ">+</button></div><b>" +
          money(p.q * p.price) +
          "</b></div>",
      )
      .join("") ||
    '<p class="muted">Seu pedido está vazio. Escolha produtos no cardápio.</p>';
  const sum = items.reduce((n, p) => n + p.price * p.q, 0);
  if (customer) {
    if ($("#customer-menu"))
      $("#customer-menu").innerHTML = customerData.products
        .filter((p) => category === "Todos" || p.category === category)
        .map((p) => productCard(p, true))
        .join("");
    const dock = $("#customer-dock");
    if (dock) {
      dock.hidden = !items.length;
      dock.innerHTML = items.length
        ? "<span><strong>" +
          money(sum) +
          "</strong><small>" +
          items.reduce((n, p) => n + p.q, 0) +
          ' itens selecionados</small></span><button type="button" class="btn primary" data-action="open-checkout">Fazer pedido ' +
          icon("arrow-right") +
          "</button>"
        : "";
    }
    if ($(".checkout-items")) $(".checkout-items").innerHTML = lines;
    if ($("#checkout-total")) $("#checkout-total").textContent = money(sum);
    const send = $('#modal [data-action="send-order"]');
    if (send) send.disabled = !items.length || orderSending;
  } else if ($("#cart-content")) {
    const note = $("#order-note")?.value || "";
    $("#cart-content").innerHTML =
      '<div class="cart-lines">' +
      lines +
      '</div><label class="field">Observações <span class="muted">Opcional</span><textarea id="order-note" maxlength="500">' +
      esc(note) +
      '</textarea></label><div class="cart-total"><span>Total do pedido</span><strong>' +
      money(sum) +
      '</strong></div><button type="button" class="btn primary wide" data-action="send-order" ' +
      (!items.length ? "disabled" : "") +
      ">Enviar para a cozinha " +
      icon("arrow-right") +
      "</button>";
  }
  icons();
}
function renderCustomer() {
  $("#app").innerHTML =
    '<div class="customer"><header><div class="brand"><div class="brand-mark">' +
    icon("wheat") +
    '</div><div>Pamonharia<span>Feita com carinho</span></div></div><span class="pill">Mesa ' +
    esc(customerData.table.name) +
    '</span></header><main id="main"><div class="menu-heading"><h1>Cardápio da casa</h1><p>Escolha, revise e envie para a cozinha.</p></div><div class="tabs customer-categories" aria-label="Categorias do cardápio">' +
    ["Todos", ...new Set(customerData.products.map((p) => p.category))]
      .map(
        (c) =>
          '<button type="button" class="chip ' +
          (category === c ? "chosen" : "") +
          '" aria-pressed="' +
          (category === c) +
          '" data-category="' +
          esc(c) +
          '">' +
          esc(c) +
          "</button>",
      )
      .join("") +
    '</div><div class="product-grid" id="customer-menu"></div><section id="customer-orders">' +
    customerOrders() +
    '</section></main><footer>Pedidos na mesa · pagamento no caixa</footer><div id="customer-dock" class="customer-dock" hidden></div></div>';
  renderCart();
  icons();
}
function customerOrders() {
  return customerData.orders.length
    ? `<h2>Comanda de ${esc(identity.name)}</h2><p>Total: ${money(total(customerData.orders))}</p>${customerData.orders.map((o) => `<div class="mini-order"><b>Pedido #${o.id}</b> <span class="status ${statuses[o.status][1]}">${statuses[o.status][0]}</span>${o.items.map((i) => `<p>${i.quantity}× ${esc(i.name)}</p>`).join("")}</div>`).join("")}`
    : " ";
}
function bindDrag() {
  document.querySelectorAll("[data-table]").forEach((el) => {
    let touchStart = null;
    el.addEventListener("pointerdown", (event) => {
      if (!editing || event.pointerType !== "touch") return;
      el.draggable = false;
      touchStart = { x: event.clientX, y: event.clientY };
      el.setPointerCapture(event.pointerId);
    });
    el.addEventListener("pointermove", (event) => {
      if (
        !touchStart ||
        Math.hypot(event.clientX - touchStart.x, event.clientY - touchStart.y) <
          6
      )
        return;
      layoutDragging = true;
      const rect = $("#floor").getBoundingClientRect();
      el.style.left =
        Math.max(
          8,
          Math.min(92, (100 * (event.clientX - rect.left)) / rect.width),
        ) + "%";
      el.style.top =
        Math.max(
          12,
          Math.min(88, (100 * (event.clientY - rect.top)) / rect.height),
        ) + "%";
    });
    el.addEventListener("pointerup", async () => {
      if (!touchStart) return;
      touchStart = null;
      if (!layoutDragging) return;
      try {
        await api("/tables/" + el.dataset.table, "PATCH", {
          x: parseFloat(el.style.left),
          y: parseFloat(el.style.top),
        });
        await refresh();
      } catch (error) {
        toast(error.message);
        await refresh();
      } finally {
        setTimeout(() => {
          layoutDragging = false;
        }, 0);
      }
    });
    el.addEventListener("pointercancel", () => {
      touchStart = null;
      layoutDragging = false;
      render();
    });
    el.addEventListener("keydown", async (event) => {
      if (
        !editing ||
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      )
        return;
      event.preventDefault();
      const t = state.tables.find((t) => t.id === Number(el.dataset.table));
      try {
        await api("/tables/" + t.id, "PATCH", {
          x:
            t.x +
            (event.key === "ArrowRight"
              ? 2
              : event.key === "ArrowLeft"
                ? -2
                : 0),
          y:
            t.y +
            (event.key === "ArrowDown" ? 2 : event.key === "ArrowUp" ? -2 : 0),
        });
        await refresh();
        $("[data-table='" + t.id + "']")?.focus();
      } catch (error) {
        toast(error.message);
      }
    });
    el.addEventListener("dragstart", (e) => {
      dragSource = Number(el.dataset.table);
      e.dataTransfer.setData("text/plain", String(dragSource));
    });
    el.addEventListener("dragover", (e) => e.preventDefault());
    el.addEventListener("drop", (e) => {
      if (editing) return;
      e.preventDefault();
      e.stopPropagation();
      const id = Number(el.dataset.table);
      if (dragSource && id !== dragSource) moveModal(dragSource, id);
    });
  });
  $("#floor")?.addEventListener("dragover", (e) => e.preventDefault());
  $("#floor")?.addEventListener("drop", async (e) => {
    if (!editing || !dragSource) return;
    e.preventDefault();
    const r = $("#floor").getBoundingClientRect();
    try {
      await api("/tables/" + dragSource, "PATCH", {
        x: (100 * (e.clientX - r.left)) / r.width,
        y: (100 * (e.clientY - r.top)) / r.height,
      });
      await refresh();
    } catch (e) {
      toast(e.message);
    }
  });
}
function moveModal(id, target) {
  const t = state.tables.find((t) => t.id === id);
  modal(
    `<h2>Conectar boas companhias</h2><p>Transfira a comanda da mesa ${esc(t.name)} ou junte as mesas mantendo as comandas individuais.</p><form id="move-form" data-id="${id}"><label class="field">Mesa de destino<select name="target">${state.tables
      .filter((a) => !members(t).some((m) => m.id === a.id))
      .map(
        (a) =>
          `<option value="${a.id}" ${target === a.id ? "selected" : ""}>Mesa ${esc(a.name)}</option>`,
      )
      .join(
        "",
      )}</select></label><label class="field">O que deseja fazer?<select name="action"><option value="transfer">Transferir pedidos para outra mesa</option><option value="merge">Juntar mesas, manter comandas individuais</option></select></label><p class="help">Para juntar várias mesas, repita a ação: todo o grupo será incluído. Os QR codes continuam funcionando.</p><button class="btn primary wide">Confirmar</button></form>`,
  );
}
document.addEventListener("click", async (e) => {
  const el = e.target.closest("button,a");
  if (!el || el.disabled || orderSending || layoutDragging) return;
  try {
    if (el.closest(".brand")) e.preventDefault();
    if (el.dataset.view) {
      view = el.dataset.view;
      search = "";
      category = "Todos";
      render();
    }
    if (el.dataset.filter) {
      filter = el.dataset.filter;
      render();
    }
    if (el.dataset.category) {
      category = el.dataset.category;
      if (customer) renderCustomer();
      else render();
    }
    if (el.dataset.table && !editing) {
      selected = Number(el.dataset.table);
      render();
      if (matchMedia("(max-width: 1199px)").matches) modal(detailView());
    }
    if (el.dataset.status) {
      await api("/orders/" + el.dataset.id, "PATCH", {
        status: el.dataset.status,
      });
      await refresh();
      if ($("#modal .detail-orders")) renderBills();
      toast("Etapa atualizada.");
    }
    if (el.dataset.bill) {
      modal(
        `<h2>Fechar comanda individual?</h2><p>Confirme o recebimento no caixa. As outras comandas da mesa permanecerão abertas.</p><button class="btn primary wide" data-confirm-bill="${esc(el.dataset.bill)}">Pagamento recebido</button>`,
      );
    }
    if (el.dataset.confirmBill) {
      await api("/bills/close", "POST", { billId: el.dataset.confirmBill });
      dismiss();
      await refresh();
      toast("Comanda individual encerrada.");
    }
    const a = el.dataset.action,
      id = Number(el.dataset.id);
    if (a === "parse-order") {
      const result = parseOrder($("#written-order").value, state.products);
      const issues = [...result.issues];
      for (const item of result.items) {
        const p = state.products.find((p) => p.id === item.productId);
        if (item.quantity + (cart[p.id] || 0) > p.stock) {
          issues.push("Estoque insuficiente: " + p.name);
          continue;
        }
        cart[p.id] = (cart[p.id] || 0) + item.quantity;
      }
      renderCart();
      $("#parse-feedback").textContent = issues.length
        ? issues.join(" · ")
        : "Itens identificados. Revise as quantidades abaixo antes de enviar.";
      if (result.items.length) $("#written-order").value = "";
    }
    if (a === "dismiss") dismiss();
    if (a === "edit-layout") {
      editing = !editing;
      render();
    }
    if (a === "new-table") tableForm();
    if (a === "edit-table") tableForm(state.tables.find((t) => t.id === id));
    if (a === "qr") await qr(id);
    if (a === "print") window.print();
    if (a === "new-product") productForm();
    if (a === "edit-product")
      productForm(state.products.find((p) => p.id === id));
    if (a === "move") moveModal(id);
    if (a === "order") orderModal(id);
    if (a === "ungroup") {
      await api("/tables/action", "POST", { source: id, action: "ungroup" });
      await refresh();
      toast("Mesas desvinculadas.");
    }
    if (a === "close")
      modal(
        `<h2>Fechar a comanda?</h2><p>Confirme que o pagamento de ${money(total(tableOrders(state.tables.find((t) => t.id === id))))} foi recebido no caixa. Todos os pedidos precisam estar entregues ou cancelados.</p><button class="btn primary wide" data-action="confirm-close" data-id="${id}">Pagamento recebido · liberar mesa</button>`,
      );
    if (a === "confirm-close") {
      await api("/tables/action", "POST", { source: id, action: "close" });
      dismiss();
      await refresh();
      toast("Comanda encerrada. Mesa liberada!");
    }
    if (a === "cancel-order")
      modal(
        `<h2>Cancelar este pedido?</h2><p>As unidades serão devolvidas ao estoque.</p><button class="btn primary wide" data-action="confirm-cancel" data-id="${id}">Confirmar cancelamento</button>`,
      );
    if (a === "confirm-cancel") {
      await api("/orders/" + id, "PATCH", { status: "cancelled" });
      dismiss();
      await refresh();
      toast("Pedido cancelado e estoque devolvido.");
    }
    if (a === "add-cart") {
      const p = (customer ? customerData.products : state.products).find(
        (p) => p.id === id,
      );
      if ((cart[id] || 0) >= p.stock)
        throw Error("Você atingiu o estoque disponível.");
      cart[id] = (cart[id] || 0) + 1;
      orderRequestId = newId();
      renderCart();
    }
    if (a === "minus-cart") {
      cart[id] = Math.max(0, (cart[id] || 0) - 1);
      if (!cart[id]) delete cart[id];
      orderRequestId = newId();
      renderCart();
    }
    if (a === "open-checkout") {
      checkoutModal();
    }
    if (a === "send-order") {
      if (orderSending) return;
      const name = customer
        ? ($("#checkout-name")?.value || "").trim()
        : ($('[name="staffName"]')?.value || "").trim();
      if (!name) {
        if (customer) {
          $("#checkout-feedback").textContent =
            "Informe seu nome para continuar.";
          $("#checkout-name").setAttribute("aria-invalid", "true");
          $("#checkout-name").focus();
          return;
        }
        throw Error("Informe o nome para identificar a comanda.");
      }
      if (customer) {
        identity.name = name;
        checkoutDraft.name = name;
        saveIdentity();
      }
      orderSending = true;
      el.disabled = true;
      const originalLabel = el.innerHTML;
      el.textContent = "Enviando…";
      try {
        const result = await api("/orders", "POST", {
          requestId: orderRequestId,
          clientId: customer
            ? undefined
            : Number($("#staff-client")?.value) || undefined,
          customerName: name,
          customerId: customer
            ? identity.id
            : $("#staff-bill")?.value || undefined,
          tableId: cartTable,
          token: customer,
          items: Object.entries(cart).map(([id, q]) => ({
            productId: Number(id),
            quantity: q,
          })),
          note:
            (customer ? $("#checkout-note") : $("#order-note"))?.value || "",
        });
        cart = {};
        orderRequestId = newId();
        checkoutDraft.note = "";
        orderSending = false;
        if (customer) {
          dismiss();
          await refresh();
          modal(
            `<div class="success-mark">✓</div><h2>Pedido enviado!</h2><p>Seu pedido #${result.id} chegou à cozinha. Acompanhe o preparo aqui.</p><button class="btn primary wide" data-action="dismiss">Continuar</button>`,
          );
          toast("Pedido enviado para a cozinha!");
        } else {
          dismiss();
          await refresh();
          toast("Pedido #" + result.id + " enviado para a cozinha!");
        }
      } catch (error) {
        if (customer && $("#checkout-feedback"))
          $("#checkout-feedback").textContent = error.message;
        else toast(error.message);
      } finally {
        orderSending = false;
        el.disabled = false;
        el.innerHTML = originalLabel;
        icons();
      }
    }
    if (a === "settings")
      modal(
        `<h2>Seu restaurante, conectado.</h2><p>Para testar pelo celular, informe o IP do computador na rede local e a porta 3000.</p><form id="settings-form">${field("Endereço usado nos QR codes", "baseUrl", state.baseUrl || location.origin, "url", "required")}<p class="help">Exemplo: http://192.168.1.10:3000. Celular e computador devem estar na mesma rede. Este protótipo não tem login; use apenas em uma rede de confiança.</p><button class="btn primary wide">Salvar endereço</button></form>`,
      );
  } catch (e) {
    toast(e.message);
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "staff-bill") {
    const o = state.orders.find((o) => o.customer_id === e.target.value);
    $('[name="staffName"]').value = o?.customer_name || "";
  }
});
document.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target,
    d = Object.fromEntries(new FormData(f)),
    id = f.dataset.id;
  if (f.dataset.submitting) return;
  f.dataset.submitting = "true";
  const submit = f.querySelector('button:not([type]),button[type="submit"]');
  const label = submit?.textContent;
  if (submit) {
    submit.disabled = true;
    submit.textContent = "Salvando…";
  }
  if (!f.querySelector(".form-feedback"))
    f.insertAdjacentHTML(
      "beforeend",
      '<p class="form-feedback" role="status"></p>',
    );
  f.querySelector(".form-feedback").textContent = "";
  try {
    if (f.id === "table-form")
      await api("/tables" + (id ? "/" + id : ""), id ? "PATCH" : "POST", {
        ...d,
        seats: Number(d.seats),
      });
    if (f.id === "product-form")
      await api("/products" + (id ? "/" + id : ""), id ? "PATCH" : "POST", {
        ...d,
        price: Math.round(Number(d.price) * 100),
        stock: Number(d.stock),
        active: d.active === "on",
      });
    if (f.id === "move-form")
      await api("/tables/action", "POST", {
        source: Number(id),
        target: Number(d.target),
        action: d.action,
      });
    if (f.id === "settings-form") await api("/settings", "POST", d);
    dismiss();
    await refresh();
    toast("Tudo salvo com sucesso.");
  } catch (e) {
    f.querySelector(".form-feedback").textContent = e.message;
  } finally {
    delete f.dataset.submitting;
    if (submit?.isConnected) {
      submit.disabled = false;
      submit.textContent = label;
    }
  }
});
document.addEventListener("input", (e) => {
  if (
    e.target.name === "staffName" ||
    e.target.id === "order-note" ||
    e.target.id === "written-order"
  )
    orderRequestId = newId();
  if (e.target.id === "checkout-name") {
    checkoutDraft.name = e.target.value;
    orderRequestId = newId();
    e.target.removeAttribute("aria-invalid");
  }
  if (e.target.id === "checkout-note") {
    checkoutDraft.note = e.target.value;
    orderRequestId = newId();
  }
  if (e.target.id === "search") {
    const pos = e.target.selectionStart;
    search = e.target.value;
    render();
    $("#search").focus();
    $("#search").setSelectionRange(pos, pos);
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") dismiss();
});
let modalFocus = null,
  orderSending = false,
  layoutDragging = false,
  orderRequestId = newId();
const checkoutDraft = { name: identity.name || "", note: "" };
const accountsUI = setupAccountsUI({
  state: () => state,
  api,
  modal,
  dismiss,
  refresh,
  money,
  esc,
  icon,
  field,
  toast,
  total,
});
await refresh();
setInterval(() => {
  if (!$("#modal").innerHTML && !$("#search")?.matches(":focus") && !editing)
    refresh();
}, 5000);

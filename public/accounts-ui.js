// Customer records and cashier receipts share the app's modal and component styles.
export function setupAccountsUI({
  state,
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
}) {
  let paymentContext = null,
    saving = false;
  const methods = {
    pix: "Pix",
    cash: "Dinheiro",
    debit: "Débito",
    credit: "Crédito",
  };
  const feedback =
    '<p class="form-feedback" role="status" aria-live="polite"></p>';
  const date = (s) =>
    new Date(s).toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  const button = (text, action, data = "") =>
    `<button type="button" class="btn" data-account="${action}" ${data}>${text}</button>`;
  const uid = () =>
    Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
      n.toString(16).padStart(2, "0"),
    ).join("");
  function balance(ids) {
    const sum = total(state().orders.filter((o) => ids.includes(o.bill_id)));
    const paid = state()
      .payments.filter((p) => ids.includes(p.bill_id) && !p.voided)
      .reduce((n, p) => n + p.amount, 0);
    return { total: sum, paid, remaining: sum - paid };
  }
  function customersView(search) {
    const cs = state().customers.filter((c) =>
      (c.name + " " + c.phone)
        .toLocaleLowerCase("pt-BR")
        .includes(search.toLocaleLowerCase("pt-BR")),
    );
    return `<div class="heading"><div><h1>Clientes</h1><p>Cadastros e histórico de quem volta à casa.</p></div><button class="btn primary" data-account="new-customer">${icon("user-round-plus")} Novo cliente</button></div><div class="catalog-toolbar"><span>${state().customers.length} clientes cadastrados</span><label class="search">${icon("search")}<input id="search" type="search" aria-label="Buscar cliente por nome ou telefone" value="${esc(search)}" placeholder="Nome ou telefone"></label></div><div class="customer-list">${cs
      .map((c) => {
        const os = state().orders.filter(
          (o) => o.client_id === c.id && o.status !== "cancelled",
        );
        return `<button class="customer-record" data-account="customer" data-id="${c.id}"><span class="avatar">${esc(c.name.slice(0, 1).toLocaleUpperCase())}</span><span><strong>${esc(c.name)}</strong><span>${esc(c.phone || "Telefone não informado")}</span><small>${os.length} pedidos · ${money(total(os))}</small></span>${icon("chevron-right")}</button>`;
      })
      .join(
        "",
      )}</div>${!cs.length ? '<div class="empty"><h2>' + (search ? "Nenhum cliente encontrado" : "Cadastre seu primeiro cliente") + "</h2><p>Vincule as comandas ao cadastro para acompanhar o histórico.</p></div>" : ""}`;
  }
  function form(c) {
    modal(
      `<h2>${c ? "Editar cliente" : "Novo cliente"}</h2><p>Telefone, endereço e aniversário são opcionais.</p><form data-account-form="customer" data-id="${c?.id || ""}">${field("Nome", "name", c?.name || "", "text", 'required maxlength="80" autocomplete="name"')}${field("Telefone com DDD", "phone", c?.phone || "", "tel", 'maxlength="30" autocomplete="tel"')}${field("Data de nascimento", "birthday", c?.birthday || "", "date", 'min="1900-01-01" max="' + new Date().toISOString().slice(0, 10) + '" autocomplete="bday"')}<label class="field">Endereço para entrega<textarea name="address" maxlength="500" autocomplete="street-address" placeholder="Rua, número, bairro e complemento">${esc(c?.address || "")}</textarea></label><button class="btn primary wide">Salvar cliente</button>${feedback}</form>`,
    );
  }
  function detail(id) {
    const c = state().customers.find((c) => c.id === id),
      os = state().orders.filter((o) => o.client_id === id),
      favorites = new Map();
    os.filter((o) => o.status !== "cancelled").forEach((o) =>
      o.items.forEach((i) =>
        favorites.set(i.name, (favorites.get(i.name) || 0) + i.quantity),
      ),
    );
    modal(
      `<h2>${esc(c.name)}</h2><p>Cadastro e histórico de pedidos.</p><dl class="customer-info"><div><dt>Telefone</dt><dd>${esc(c.phone || "Não informado")}</dd></div><div><dt>Aniversário</dt><dd>${c.birthday ? c.birthday.split("-").reverse().join("/") : "Não informado"}</dd></div><div><dt>Endereço de entrega</dt><dd>${esc(c.address || "Não informado")}</dd></div></dl>${button(icon("pencil") + " Editar cadastro", "edit-customer", `data-id="${id}"`)}<div class="payment-summary"><div><span>Pedidos válidos</span><strong>${os.filter((o) => o.status !== "cancelled").length}</strong></div><div><span>Total consumido</span><strong>${money(total(os))}</strong></div></div><h3>Mais pedidos</h3><p>${
        [...favorites]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([name, q]) => esc(name) + " · " + q + " un.")
          .join("<br>") || "O histórico aparecerá ao vincular uma comanda."
      }</p><h3>Histórico</h3>${os.map((o) => `<article class="mini-order"><div class="row between"><strong>Pedido #${o.id} · Mesa ${esc(state().tables.find((t) => t.id === o.table_id)?.name)}</strong><span class="status">${o.closed ? "Encerrado" : o.status === "cancelled" ? "Cancelado" : "Em aberto"}</span></div><p class="help">${date(o.created)}</p>${o.items.map((i) => `<div class="order-line"><span>${i.quantity}× ${esc(i.name)}</span><strong>${money(i.price * i.quantity)}</strong></div>`).join("")}</article>`).join("") || '<div class="empty">Nenhum pedido vinculado.</div>'}`,
      true,
    );
  }
  function link(billId) {
    const id = state().orders.find((o) => o.bill_id === billId)?.client_id;
    modal(
      `<h2>Vincular cliente</h2><p>Associe esta comanda ao histórico. Nomes iguais não são vinculados automaticamente.</p><form data-account-form="link" data-bill="${esc(billId)}"><label class="field">Cliente<select name="clientId"><option value="">Sem cadastro vinculado</option>${state()
        .customers.map(
          (c) =>
            `<option value="${c.id}" ${id === c.id ? "selected" : ""}>${esc(c.name)}${c.phone ? " · " + esc(c.phone) : ""}</option>`,
        )
        .join(
          "",
        )}</select></label><button class="btn primary wide">Salvar vínculo</button>${feedback}</form>${state().customers.length ? "" : button("Cadastrar cliente", "new-customer")}`,
    );
  }
  function billFooter(billId) {
    const b = balance([billId]),
      o = state().orders.find((o) => o.bill_id === billId),
      c = state().customers.find((c) => c.id === o.client_id);
    return `${c ? `<p class="help">Cadastro: ${esc(c.name)}</p>` : ""}<div class="bill-balance"><span>Pago ${money(b.paid)}</span><strong>Falta ${money(b.remaining)}</strong></div><div class="split-actions">${button("Receber / dividir", "pay-bill", `data-bill="${esc(billId)}"`)}${button(icon("contact-round"), "link", `data-bill="${esc(billId)}" aria-label="Vincular cliente"`)}</div>`;
  }
  function paymentModal(ids, tableId = null) {
    paymentContext = { ids, tableId, requestId: uid() };
    const os = state().orders.filter(
        (o) => ids.includes(o.bill_id) && !o.closed,
      ),
      b = balance(ids);
    const pending = os.some(
      (o) => !["delivered", "cancelled"].includes(o.status),
    );
    const entries = state().payments.filter((p) => ids.includes(p.bill_id));
    const receipts = [...new Set(entries.map((p) => p.request_id))].map(
      (key) => {
        const rows = entries.filter((p) => p.request_id === key);
        return { ...rows[0], amount: rows.reduce((n, p) => n + p.amount, 0) };
      },
    );
    modal(
      `<h2>${tableId ? "Conta da mesa" : esc(os[0]?.customer_name || "Comanda")}</h2><p>Registre os valores recebidos no caixa.</p><div class="payment-summary"><div><span>Total</span><strong>${money(b.total)}</strong></div><div><span>Já pago</span><strong>${money(b.paid)}</strong></div><div class="remaining"><span>Falta pagar</span><strong>${money(b.remaining)}</strong></div></div>${
        b.remaining > 0
          ? `<section class="split-calculator"><h3>Dividir o saldo restante</h3>${field("Quantidade de pessoas", "people", 1, "number", 'id="split-people" min="1" max="100" step="1"')}<div id="split-result" aria-live="polite"></div><p class="help">A divisão é uma sugestão. Só o recebimento registrado reduz o saldo.</p></section><form data-account-form="payment"><div class="form-grid">${field("Valor recebido (R$)", "amount", (b.remaining / 100).toFixed(2), "number", 'id="payment-amount" min="0.01" step="0.01" required')}<label class="field">Forma de pagamento<select name="method">${Object.entries(
              methods,
            )
              .map(([v, l]) => `<option value="${v}">${l}</option>`)
              .join(
                "",
              )}</select></label></div>${field("Quem pagou (opcional)", "payer", "", "text", 'maxlength="80"')}<button class="btn primary wide">Registrar recebimento</button>${feedback}</form>`
          : `<div class="settled">${icon("circle-check")} Saldo quitado</div>`
      }<section class="payment-history"><h3>Recebimentos</h3>${receipts.map((p) => `<div class="payment-entry ${p.voided ? "voided" : ""}"><div><strong>${money(p.amount)} · ${methods[p.method]}</strong><span>${esc(p.payer || "Pagador não informado")} · ${date(p.created)}</span>${p.voided ? `<small>Estornado: ${esc(p.reason)}</small>` : ""}</div>${p.voided ? "" : button("Estornar", "void", `data-id="${p.id}"`)}</div>`).join("") || '<p class="muted">Nenhum recebimento registrado.</p>'}</section><div class="close-bill"><p class="help">${pending ? "Entregue ou cancele os pedidos pendentes para encerrar." : b.remaining > 0 ? "Quite o saldo para encerrar a conta." : "Todos os pedidos foram concluídos. Você pode encerrar."}</p>${button(tableId ? "Encerrar conta e liberar mesa" : "Encerrar comanda", "close", pending || b.remaining > 0 ? "disabled" : "")}</div>`,
      true,
    );
    updateSplit();
  }
  function updateSplit() {
    const input = document.querySelector("#split-people");
    if (!input) return;
    const n = Number(input.value),
      b = balance(paymentContext.ids),
      result = document.querySelector("#split-result");
    if (!Number.isInteger(n) || n < 1 || n > 100) {
      result.textContent = "Escolha de 1 a 100 pessoas.";
      return;
    }
    const amount = Math.floor(b.remaining / n),
      extra = b.remaining % n;
    result.innerHTML = `<strong>${extra ? `${extra} × ${money(amount + 1)}${n > extra ? ` e ${n - extra} × ${money(amount)}` : ""}` : `${n} × ${money(amount)}`}</strong>${button("Usar uma parte: " + money(amount + (extra ? 1 : 0)), "portion", `data-amount="${amount + (extra ? 1 : 0)}"`)}`;
  }
  function clientSelect() {
    return `<label class="field">Cliente cadastrado <span class="muted">Opcional</span><select id="staff-client"><option value="">Sem cadastro</option>${state()
      .customers.map(
        (c) =>
          `<option value="${c.id}">${esc(c.name)}${c.phone ? " · " + esc(c.phone) : ""}</option>`,
      )
      .join("")}</select></label>`;
  }
  document.addEventListener("input", (e) => {
    if (e.target.id === "split-people") updateSplit();
  });
  document.addEventListener("change", (e) => {
    if (e.target.id === "staff-client") {
      const c = state().customers.find((c) => c.id === Number(e.target.value));
      if (c) document.querySelector('[name="staffName"]').value = c.name;
    }
    if (e.target.id === "staff-bill") {
      const o = state().orders.find(
        (o) => o.customer_id === e.target.value && !o.closed,
      );
      const input = document.querySelector("#staff-client");
      input.value = o?.client_id || "";
      input.disabled = !!e.target.value;
    }
  });
  document.addEventListener(
    "click",
    async (e) => {
      const el = e.target.closest("[data-account]");
      if (!el) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (el.disabled || saving) return;
      const id = Number(el.dataset.id);
      try {
        switch (el.dataset.account) {
          case "new-customer":
            form();
            break;
          case "edit-customer":
            form(state().customers.find((c) => c.id === id));
            break;
          case "customer":
            detail(id);
            break;
          case "link":
            link(el.dataset.bill);
            break;
          case "pay-bill":
            paymentModal([el.dataset.bill]);
            break;
          case "pay-table": {
            const t = state().tables.find((t) => t.id === id),
              groupId = t.group_id || t.id;
            const members = state()
              .tables.filter((t) => (t.group_id || t.id) === groupId)
              .map((t) => t.id);
            paymentModal(
              [
                ...new Set(
                  state()
                    .orders.filter(
                      (o) => !o.closed && members.includes(o.table_id),
                    )
                    .map((o) => o.bill_id),
                ),
              ],
              id,
            );
            break;
          }
          case "portion":
            document.querySelector("#payment-amount").value = (
              Number(el.dataset.amount) / 100
            ).toFixed(2);
            document.querySelector("#payment-amount").focus();
            break;
          case "void":
            modal(
              `<h2>Estornar recebimento</h2><p>Use após devolver o dinheiro ou corrigir um registro. Se este recebimento pagou várias comandas, todas as suas partes serão estornadas.</p><form data-account-form="void" data-id="${id}">${field("Motivo do estorno", "reason", "", "text", 'required maxlength="200"')}<button class="btn danger wide">Confirmar estorno</button>${feedback}</form>`,
            );
            break;
          case "close":
            saving = true;
            el.disabled = true;
            if (paymentContext.tableId)
              await api("/tables/action", "POST", {
                source: paymentContext.tableId,
                action: "close",
              });
            else
              await api("/bills/close", "POST", {
                billId: paymentContext.ids[0],
              });
            dismiss();
            await refresh();
            toast("Comanda encerrada.");
            break;
        }
      } catch (error) {
        toast(error.message);
        el.disabled = false;
      } finally {
        saving = false;
      }
    },
    true,
  );
  document.addEventListener(
    "submit",
    async (e) => {
      const f = e.target;
      if (!f.dataset.accountForm) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (saving) return;
      const d = Object.fromEntries(new FormData(f)),
        id = f.dataset.id,
        submit = f.querySelector("button:not([type])"),
        status = f.querySelector(".form-feedback");
      saving = true;
      submit.disabled = true;
      const label = submit.textContent;
      submit.textContent = "Salvando…";
      status.textContent = "";
      try {
        switch (f.dataset.accountForm) {
          case "customer":
            await api(
              "/customers" + (id ? "/" + id : ""),
              id ? "PATCH" : "POST",
              d,
            );
            break;
          case "link":
            await api("/bills/customer", "POST", {
              billId: f.dataset.bill,
              clientId: Number(d.clientId) || null,
            });
            break;
          case "payment":
            await api("/payments", "POST", {
              ...d,
              billIds: paymentContext.ids,
              amount: Math.round(Number(d.amount) * 100),
              requestId: paymentContext.requestId,
            });
            break;
          case "void":
            await api("/payments/" + id + "/void", "POST", d);
            break;
        }
        await refresh();
        if (["payment", "void"].includes(f.dataset.accountForm))
          paymentModal(paymentContext.ids, paymentContext.tableId);
        else dismiss();
        toast(
          f.dataset.accountForm === "payment"
            ? "Recebimento registrado."
            : "Alterações salvas.",
        );
      } catch (error) {
        status.textContent = error.message;
        status.classList.add("error");
      } finally {
        saving = false;
        if (submit.isConnected) {
          submit.disabled = false;
          submit.textContent = label;
        }
      }
    },
    true,
  );
  return { customersView, billFooter, clientSelect, balance };
}

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { once } from "node:events";
import os from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(os.tmpdir(), "pamonharia-accounts-"));
let server;
const base = "http://127.0.0.1:3117/api";
async function api(p, method = "GET", body, headers = {}) {
  const response = await fetch(base + p, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json() };
}
before(async () => {
  server = spawn(process.execPath, ["server.js"], {
    env: {
      ...process.env,
      PORT: "3117",
      DB_PATH: path.join(dir, "test.sqlite"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await Promise.race([
    once(server.stdout, "data"),
    once(server, "exit").then(() => {
      throw Error("Server exited early");
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(Error("Startup timeout")), 8000).unref(),
    ),
  ]);
});
after(async () => {
  const exit = once(server, "exit");
  server.kill();
  await exit;
  rmSync(dir, { recursive: true, force: true });
});

test("cadastro, histórico explícito, privacidade no menu e validações", async () => {
  const payload = {
    name: "João",
    phone: "(11) 99999-1234",
    address: "Rua de teste, 12",
    birthday: "1990-02-28",
  };
  const c = await api("/customers", "POST", payload);
  assert.equal(c.status, 200);
  assert.equal(
    (await api("/customers", "POST", { ...payload, birthday: "2025-02-30" }))
      .status,
    400,
  );
  assert.equal(
    (await api("/customers", "POST", { ...payload, phone: "abc" })).status,
    400,
  );
  assert.equal(
    (await api("/customers", "POST", { ...payload, name: " " })).status,
    400,
  );
  await api("/customers/" + c.data.id, "PATCH", {
    ...payload,
    address: "Rua nova, 45",
  });
  const order = await api("/orders", "POST", {
    tableId: 1,
    clientId: c.data.id,
    customerId: "registered-client",
    customerName: "João",
    items: [{ productId: 7, quantity: 1 }],
  });
  let state = (await api("/state")).data;
  const bill = state.orders.find((o) => o.id === order.data.id);
  assert.equal(bill.client_id, c.data.id);
  assert.equal(state.customers[0].address, "Rua nova, 45");
  const menu = await api(
    "/menu?table=" + state.tables[0].token,
    "GET",
    undefined,
    { "X-Customer-Id": "registered-client" },
  );
  assert.equal(menu.data.orders.length, 1);
  assert.ok(!JSON.stringify(menu.data).includes("Rua nova"));
  assert.equal(menu.data.customers, undefined);
  const sameName = await api("/orders", "POST", {
    tableId: 1,
    customerName: "João",
    items: [{ productId: 7, quantity: 1 }],
  });
  state = (await api("/state")).data;
  const other = state.orders.find((o) => o.id === sameName.data.id);
  assert.equal(other.client_id, null);
  await api("/bills/customer", "POST", {
    billId: other.bill_id,
    clientId: c.data.id,
  });
  assert.equal(
    (await api("/state")).data.orders.find((o) => o.id === sameName.data.id)
      .client_id,
    c.data.id,
  );
  const qrOrder = await api("/orders", "POST", {
    token: state.tables[0].token,
    customerName: "",
    items: [{ productId: 7, quantity: 1 }],
  });
  assert.equal(qrOrder.status, 400);
});

test("pagamento parcial, concorrência, estorno, divisão por centavos e fechamento", async () => {
  const product = (
    await api("/products", "POST", {
      name: "Conta de teste",
      category: "Teste",
      price: 1000,
      stock: 4,
    })
  ).data;
  const order = (
    await api("/orders", "POST", {
      tableId: 3,
      customerName: "Ana",
      items: [{ productId: product.id, quantity: 1 }],
    })
  ).data;
  let state = (await api("/state")).data;
  const billId = state.orders.find((o) => o.id === order.id).bill_id;
  const payment = {
    billIds: [billId],
    amount: 334,
    method: "pix",
    payer: "Pessoa 1",
    requestId: "split-1",
  };
  assert.equal((await api("/payments", "POST", payment)).status, 200);
  assert.equal((await api("/payments", "POST", payment)).data.repeated, true);
  assert.equal(
    (await api("/payments", "POST", { ...payment, amount: 100 })).status,
    409,
  );
  assert.equal(
    (
      await api("/payments", "POST", {
        ...payment,
        amount: 0,
        requestId: "zero",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await api("/payments", "POST", {
        ...payment,
        amount: 1.5,
        requestId: "float",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await api("/payments", "POST", {
        ...payment,
        amount: 1000,
        requestId: "too-much",
      })
    ).status,
    409,
  );
  assert.equal(
    (await api("/orders/" + order.id, "PATCH", { status: "cancelled" })).status,
    400,
  );
  assert.equal((await api("/bills/close", "POST", { billId })).status, 400);
  for (const status of ["preparing", "ready", "delivered"])
    await api("/orders/" + order.id, "PATCH", { status });
  assert.equal((await api("/bills/close", "POST", { billId })).status, 400);
  const concurrent = await Promise.all(
    ["final-a", "final-b"].map((requestId) =>
      api("/payments", "POST", { ...payment, amount: 666, requestId }),
    ),
  );
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 409]);
  state = (await api("/state")).data;
  const receipt = state.payments.find(
    (p) => p.bill_id === billId && p.amount === 666,
  );
  assert.equal(
    (await api("/payments/" + receipt.id + "/void", "POST", { reason: "" }))
      .status,
    400,
  );
  assert.equal(
    (
      await api("/payments/" + receipt.id + "/void", "POST", {
        reason: "Corrigir pagadores",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await api("/payments/" + receipt.id + "/void", "POST", {
        reason: "Duplicado",
      })
    ).status,
    404,
  );
  for (const requestId of ["split-2", "split-3"])
    assert.equal(
      (await api("/payments", "POST", { ...payment, amount: 333, requestId }))
        .status,
      200,
    );
  state = (await api("/state")).data;
  assert.equal(
    state.payments
      .filter((p) => p.bill_id === billId && !p.voided)
      .reduce((n, p) => n + p.amount, 0),
    1000,
  );
  assert.equal((await api("/bills/close", "POST", { billId })).status, 200);
  assert.equal(
    (
      await api("/payments", "POST", {
        ...payment,
        amount: 1,
        requestId: "closed",
      })
    ).status,
    409,
  );
});

test("recebimento da mesa distribui entre comandas e estorna de forma atômica", async () => {
  const orders = [];
  for (const customerName of ["A", "B"])
    orders.push(
      (
        await api("/orders", "POST", {
          tableId: 5,
          customerName,
          items: [{ productId: 7, quantity: 1 }],
        })
      ).data.id,
    );
  const state = (await api("/state")).data,
    billIds = orders.map((id) => state.orders.find((o) => o.id === id).bill_id);
  await api("/payments", "POST", {
    billIds,
    amount: 750,
    method: "debit",
    requestId: "table-payment",
  });
  let entries = (await api("/state")).data.payments.filter(
    (p) => p.request_id === "table-payment",
  );
  assert.deepEqual(entries.map((p) => p.amount).sort(), [250, 500]);
  await api("/payments/" + entries[0].id + "/void", "POST", {
    reason: "Valor devolvido",
  });
  entries = (await api("/state")).data.payments.filter(
    (p) => p.request_id === "table-payment",
  );
  assert.ok(entries.every((p) => p.voided === 1));
});

test("repetir envio confirmado não duplica pedido nem reduz estoque duas vezes", async () => {
  const state = (await api("/state")).data;
  const body = {
    token: state.tables[0].token,
    customerId: "retry-client",
    customerName: "Mateus",
    note: "",
    requestId: "retry-order",
    items: [{ productId: 8, quantity: 1 }],
  };
  const first = await api("/orders", "POST", body),
    second = await api("/orders", "POST", body);
  assert.equal(first.status, 200);
  assert.equal(first.data.id, second.data.id);
  assert.equal(second.data.repeated, true);
  assert.equal(
    (await api("/state")).data.products.find((p) => p.id === 8).stock,
    state.products.find((p) => p.id === 8).stock - 1,
  );
  assert.equal(
    (await api("/orders", "POST", { ...body, note: "Outra nota" })).status,
    409,
  );
});

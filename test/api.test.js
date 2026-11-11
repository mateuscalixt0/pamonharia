import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
const dir = mkdtempSync(path.join(os.tmpdir(), "pamonharia-test-"));
let server;
const base = "http://127.0.0.1:3107/api";
async function request(p, method = "GET", data) {
  if (p === "/orders" && data?.token && data.customerName === undefined)
    data = { ...data, customerName: "Cliente de teste" };
  const r = await fetch(base + p, {
    method,
    headers: { "Content-Type": "application/json" },
    body: data ? JSON.stringify(data) : undefined,
  });
  return { status: r.status, data: await r.json() };
}
before(async () => {
  server = spawn(process.execPath, ["server.js"], {
    env: {
      ...process.env,
      PORT: "3107",
      DB_PATH: path.join(dir, "test.sqlite"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    server.stdout.once("data", resolve);
    server.once("error", reject);
    server.once("exit", (code) => reject(Error("server exited " + code)));
    setTimeout(() => reject(Error("startup timeout")), 8000).unref();
  });
});
after(async () => {
  server.kill();
  await new Promise((resolve) => server.once("exit", resolve));
  rmSync(dir, { recursive: true, force: true });
});
test("pedido por QR, estoque transacional, cozinha, grupos e fechamento", async () => {
  const initial = (await request("/state")).data;
  assert.equal(initial.tables.length, 12);
  assert.equal(initial.products.length, 9);
  const token = initial.tables[0].token,
    p = initial.products[0];
  assert.equal((await request("/menu?table=invalid")).status, 404);
  assert.equal((await request("/menu?table=" + token)).data.table.id, 1);
  const order = await request("/orders", "POST", {
    token,
    items: [{ productId: p.id, quantity: 2 }],
    note: "Sem manteiga",
  });
  assert.equal(order.status, 200);
  assert.equal((await request("/state")).data.products[0].stock, p.stock - 2);
  const overflow = await request("/orders", "POST", {
    token,
    items: [
      { productId: p.id, quantity: 100 },
      { productId: 2, quantity: 1 },
    ],
  });
  assert.equal(overflow.status, 409);
  assert.equal(
    (await request("/state")).data.products[1].stock,
    initial.products[1].stock,
  );
  assert.equal(
    (await request("/tables/action", "POST", { source: 1, action: "close" }))
      .status,
    400,
  );
  assert.equal(
    (
      await request("/orders/" + order.data.id, "PATCH", {
        status: "delivered",
      })
    ).status,
    400,
  );
  for (const status of ["preparing", "ready", "delivered"])
    assert.equal(
      (await request("/orders/" + order.data.id, "PATCH", { status })).status,
      200,
    );
  assert.equal(
    (
      await request("/tables/action", "POST", {
        source: 1,
        target: 3,
        action: "merge",
      })
    ).status,
    200,
  );
  let s = (await request("/state")).data;
  assert.equal(s.tables[0].group_id, s.tables[2].group_id);
  assert.equal(
    (
      await request("/tables/action", "POST", {
        source: 3,
        target: 5,
        action: "transfer",
      })
    ).status,
    200,
  );
  s = (await request("/state")).data;
  assert.equal(s.orders.find((o) => o.id === order.data.id).table_id, 5);
  assert.equal(s.tables[0].group_id, null);
  assert.equal(
    (await request("/tables/action", "POST", { source: 5, action: "close" }))
      .status,
    400,
  );
  await request("/payments", "POST", {
    billIds: [s.orders.find((o) => o.id === order.data.id).bill_id],
    amount: p.price * 2,
    method: "pix",
    requestId: "first-receipt",
  });
  assert.equal(
    (await request("/tables/action", "POST", { source: 5, action: "close" }))
      .status,
    200,
  );
  assert.equal(
    (await request("/state")).data.orders.find((o) => o.id === order.data.id)
      .closed,
    1,
  );
  const another = (
    await request("/orders", "POST", {
      token,
      items: [{ productId: p.id, quantity: 1 }],
    })
  ).data;
  assert.equal(
    (await request("/orders/" + another.id, "PATCH", { status: "cancelled" }))
      .status,
    200,
  );
  assert.equal(
    (await request("/orders/" + another.id, "PATCH", { status: "cancelled" }))
      .status,
    400,
  );
  assert.equal((await request("/state")).data.products[0].stock, p.stock - 2);
  const qr = await request("/qr/1");
  assert.ok(qr.data.svg.includes("<svg"));
  assert.ok(qr.data.url.includes(token));
});
test("cadastros, validação de estoque e concorrência", async () => {
  const p = (
    await request("/products", "POST", {
      name: "Último bolo",
      category: "Quitutes",
      price: 1800,
      stock: 1,
      emoji: "🍰",
      description: "Teste",
    })
  ).data;
  const pair = await Promise.all([
    request("/orders", "POST", {
      tableId: 7,
      items: [{ productId: p.id, quantity: 1 }],
    }),
    request("/orders", "POST", {
      tableId: 8,
      items: [{ productId: p.id, quantity: 1 }],
    }),
  ]);
  assert.deepEqual(pair.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    (
      await request("/products", "POST", {
        name: "Inválido",
        category: "Teste",
        price: 100,
        stock: -1,
      })
    ).status,
    400,
  );
  const t = await request("/tables", "POST", {
    name: "Varanda",
    seats: 6,
    shape: "round",
  });
  assert.equal(t.status, 200);
  assert.equal(
    (await request("/tables/" + t.data.id, "PATCH", { x: 55, y: 65 })).status,
    200,
  );
  const s = (await request("/state")).data;
  assert.equal(s.tables.find((x) => x.id === t.data.id).x, 55);
});
test("comandas individuais separam clientes, reabertura e fechamento", async () => {
  const s = (await request("/state")).data,
    token = s.tables[0].token;
  const create = (customerId, customerName) =>
    request("/orders", "POST", {
      token,
      customerId,
      customerName,
      items: [{ productId: 7, quantity: 1 }],
    });
  const joao = (await create("joao-test", "João")).data,
    ana = (await create("ana-test", "Ana")).data;
  const second = (await create("joao-test", "João")).data;
  const os = (await request("/state")).data.orders;
  const bill = os.find((o) => o.id === joao.id).bill_id;
  assert.equal(os.find((o) => o.id === second.id).bill_id, bill);
  assert.notEqual(os.find((o) => o.id === ana.id).bill_id, bill);
  const own = await (
    await fetch(base + "/menu?table=" + token, {
      headers: { "X-Customer-Id": "joao-test" },
    })
  ).json();
  assert.equal(own.orders.length, 2);
  assert.ok(own.orders.every((o) => o.customer_name === "João"));
  assert.equal(
    (await request("/bills/close", "POST", { billId: bill })).status,
    400,
  );
  for (const id of [joao.id, second.id])
    for (const status of ["preparing", "ready", "delivered"])
      await request("/orders/" + id, "PATCH", { status });
  assert.equal(
    (await request("/bills/close", "POST", { billId: bill })).status,
    400,
  );
  await request("/payments", "POST", {
    billIds: [bill],
    amount: 1000,
    method: "cash",
    payer: "João",
    requestId: "joao-receipt",
  });
  assert.equal(
    (await request("/bills/close", "POST", { billId: bill })).status,
    200,
  );
  assert.equal(
    (await request("/state")).data.orders.find((o) => o.id === ana.id).closed,
    0,
  );
  const newer = (await create("joao-test", "João")).data;
  assert.notEqual(
    (await request("/state")).data.orders.find((o) => o.id === newer.id)
      .bill_id,
    bill,
  );
});
test("dados persistem após reiniciar o servidor", async () => {
  const before = (await request("/state")).data;
  const exited = new Promise((resolve) => server.once("exit", resolve));
  server.kill();
  await exited;
  server = spawn(process.execPath, ["server.js"], {
    env: {
      ...process.env,
      PORT: "3107",
      DB_PATH: path.join(dir, "test.sqlite"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    server.stdout.once("data", resolve);
    server.once("error", reject);
  });
  assert.deepEqual((await request("/state")).data, before);
});

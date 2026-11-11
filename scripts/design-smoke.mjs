import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { once } from "node:events";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(os.tmpdir(), "pamonharia-design-"));
const portProbe = createServer();
portProbe.listen(0, "127.0.0.1");
await once(portProbe, "listening");
const port = portProbe.address().port;
await new Promise((resolve) => portProbe.close(resolve));
const base = "http://127.0.0.1:" + port;
const shots = "/tmp/pamonharia-design-previews";
mkdirSync(shots, { recursive: true });
const server = spawn(process.execPath, ["server.js"], {
  env: {
    ...process.env,
    PORT: String(port),
    DB_PATH: path.join(dir, "test.sqlite"),
  },
  stdio: ["ignore", "pipe", "inherit"],
});
let browser;
try {
  await Promise.race([
    once(server.stdout, "data"),
    once(server, "exit").then(() => {
      throw Error("Server exited");
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(Error("Startup timeout")), 8000).unref(),
    ),
  ]);
  browser = await chromium.launch({
    executablePath:
      process.env.CHROMIUM_PATH ||
      (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    headless: true,
    args: ["--no-sandbox"],
  });
  const errors = [],
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", (e) => errors.push(e.message));
  page.setDefaultTimeout(10000);
  await page.goto(base);
  await page.locator(".restaurant-table").first().waitFor();
  assert.equal(await page.locator(".restaurant-table").count(), 12);
  await page.screenshot({
    animations: "disabled",
    path: shots + "/salao-desktop.png",
    fullPage: true,
  });
  await page.locator('.sidebar [data-view="customers"]').click();
  await page.locator('[data-account="new-customer"]').click();
  await page.getByLabel("Nome", { exact: true }).fill("Mateus");
  await page.getByLabel("Telefone com DDD").fill("(11) 99999-1234");
  await page.getByLabel("Data de nascimento").fill("1995-03-10");
  await page.getByLabel("Endereço para entrega").fill("Rua de teste, 123");
  await page
    .getByRole("button", { name: "Salvar cliente", exact: true })
    .click();
  await page.locator(".customer-record").waitFor();
  await page.screenshot({
    animations: "disabled",
    path: shots + "/clientes-desktop.png",
    fullPage: true,
  });
  console.log("Clientes: cadastro confirmado.");
  const state = await (await fetch(base + "/api/state")).json();
  const customer = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  customer.on("pageerror", (e) => errors.push(e.message));
  customer.setDefaultTimeout(10000);
  await customer.goto(base + "/?mesa=" + state.tables[0].token);
  await customer.locator('[data-category="Bebidas"]').click();
  assert.equal(
    await customer.locator("#customer-menu .product-card").count(),
    3,
  );
  await customer.locator('[data-category="Todos"]').click();
  await customer
    .locator('#customer-menu [data-action="add-cart"][data-id="1"]')
    .click();
  assert.equal(
    await customer
      .locator("#customer-menu .stepper output")
      .first()
      .textContent(),
    "1",
  );
  await customer
    .locator('#customer-menu [data-action="add-cart"][data-id="2"]')
    .click();
  assert.equal(await customer.locator(".customer-cart").count(), 0);
  await customer.screenshot({
    animations: "disabled",
    path: shots + "/cardapio-mobile.png",
    fullPage: true,
  });
  await customer.getByRole("button", { name: "Fazer pedido" }).click();
  await customer.locator('[data-action="send-order"]').click();
  assert.match(
    await customer.locator("#checkout-feedback").textContent(),
    /nome/,
  );
  await customer.locator("#checkout-name").fill("Mateus");
  await customer.locator("#checkout-note").fill("Sem manteiga");
  await customer
    .locator('.checkout-items [data-action="add-cart"][data-id="1"]')
    .click();
  assert.equal(await customer.locator("#checkout-name").inputValue(), "Mateus");
  assert.equal(
    await customer.locator("#checkout-note").inputValue(),
    "Sem manteiga",
  );
  await customer.locator('[data-action="dismiss"]').click();
  assert.match(await customer.locator("#customer-dock").textContent(), /39,00/);
  await customer.getByRole("button", { name: "Fazer pedido" }).click();
  assert.equal(await customer.locator("#checkout-name").inputValue(), "Mateus");
  await customer.screenshot({
    animations: "disabled",
    path: shots + "/resumo-mobile.png",
  });
  // Notes are optional; server errors preserve both the name and cart for a retry.
  await customer.locator("#checkout-note").fill("");
  await customer.route(
    "**/api/orders",
    (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ error: "Estoque alterado. Revise seu pedido." }),
      }),
    { times: 1 },
  );
  await customer.locator('[data-action="send-order"]').click();
  await customer
    .locator("#checkout-feedback")
    .filter({ hasText: "Estoque alterado" })
    .waitFor();
  assert.equal(await customer.locator("#checkout-name").inputValue(), "Mateus");
  await customer.locator('[data-action="send-order"]').click();
  await customer.getByRole("heading", { name: "Pedido enviado!" }).waitFor();
  await customer
    .getByRole("button", { name: "Continuar", exact: true })
    .click();
  await customer.locator("#customer-orders .mini-order").waitFor();
  assert.equal(await customer.locator("#customer-dock").isVisible(), false);
  await customer.reload();
  await customer.locator("#customer-orders .mini-order").waitFor();
  console.log(
    "Cliente: revisão, validação, recuperação de erro e confirmação verificadas.",
  );
  await page.reload();
  await page.locator(".restaurant-table").first().waitFor();
  await page.locator('.sidebar [data-view="orders"]').click();
  for (const label of [
    "Começar preparo",
    "Marcar como pronto",
    "Confirmar entrega",
  ]) {
    const order = page.locator(".k-order").filter({ hasText: "Mateus" });
    await order.getByRole("button", { name: label }).click();
  }
  await page.locator('.sidebar [data-view="tables"]').click();
  await page.locator('[data-table="1"]').click();
  await page.locator('.bill-card [data-account="link"]').click();
  await page
    .locator('[name="clientId"]')
    .selectOption(String(state.customers[0].id));
  await page.getByRole("button", { name: "Salvar vínculo" }).click();
  await page.locator('.bill-card [data-account="pay-bill"]').click();
  await page.locator("#split-people").fill("3");
  assert.match(await page.locator("#split-result").textContent(), /13,00/);
  await page.locator('[data-account="portion"]').click();
  await page.getByRole("button", { name: "Registrar recebimento" }).click();
  await page
    .locator(".payment-summary .remaining")
    .filter({ hasText: "26,00" })
    .waitFor();
  assert.equal(await page.locator('[data-account="close"]').isDisabled(), true);
  await page.screenshot({
    animations: "disabled",
    path: shots + "/dividir-conta.png",
  });
  await page.locator('[name="method"]').selectOption("credit");
  await page.getByRole("button", { name: "Registrar recebimento" }).click();
  await page.locator(".settled").waitFor();
  await page.locator('[data-account="close"]').click();
  await page.locator('[data-table="1"].free').waitFor();
  await page.locator('.sidebar [data-view="customers"]').click();
  await page.locator(".customer-record").click();
  assert.match(
    await page.locator(".dialog").textContent(),
    /Pamonha tradicional/,
  );
  assert.match(
    await page.locator(".dialog").textContent(),
    /Rua de teste, 123/,
  );
  await page.locator('[data-action="dismiss"]').click();
  console.log(
    "Caixa: divisão, pagamentos parciais, fechamento e histórico verificados.",
  );
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const view of ["tables", "orders", "products", "stock", "customers"]) {
      await page.locator('.sidebar [data-view="' + view + '"]').click();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        `${view} overflow at ${width}`,
      );
    }
    await customer.setViewportSize({ width, height: 900 });
    assert.equal(
      await customer.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      `Customer overflow at ${width}`,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.sidebar [data-view="tables"]').click();
  await page.locator('[data-table="4"]').click();
  assert.equal(await page.locator("#modal .bill-card").count(), 1);
  await page.screenshot({
    animations: "disabled",
    path: shots + "/comanda-mobile.png",
  });
  await page.keyboard.press("Escape");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator('[data-table="4"]').click();
  assert.equal(
    await page
      .locator(".dialog")
      .evaluate((el) => getComputedStyle(el).animationName),
    "none",
  );
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('[data-table="1"]').click();
  await page.locator('.detail [data-action="qr"]').click();
  await page.locator(".qr-image svg").waitFor();
  assert.ok(
    (await page.locator(".qr-actions a").getAttribute("href")).includes(
      state.tables[0].token,
    ),
  );
  await page.locator('[data-action="dismiss"]').click();
  await page.locator('.detail [data-action="order"]').click();
  await page
    .locator("#written-order")
    .fill("duas pamonhas com queijo e um café");
  await page.locator('[data-action="parse-order"]').click();
  assert.equal(await page.locator("#cart-content .order-line").count(), 2);
  await page
    .locator("#staff-client")
    .selectOption(String(state.customers[0].id));
  assert.equal(await page.locator('[name="staffName"]').inputValue(), "Mateus");
  await page.locator('[data-action="dismiss"]').click();
  await page.locator('.sidebar [data-view="products"]').click();
  await page.locator('[data-action="new-product"]').click();
  await page.locator('[name="name"]').fill("Bolo de teste");
  await page.locator('[name="price"]').fill("12.50");
  await page.locator('[name="stock"]').fill("5");
  await page.getByRole("button", { name: "Salvar produto" }).click();
  await page
    .locator(".product-card")
    .filter({ hasText: "Bolo de teste" })
    .waitFor();
  await page.locator('.sidebar [data-view="stock"]').click();
  assert.match(await page.locator(".inventory").textContent(), /Bolo de teste/);
  await page.locator('.sidebar [data-view="tables"]').click();
  await page.locator('[data-action="edit-layout"]').click();
  await page.locator('[data-table="1"]').focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(
    () => document.querySelector('[data-table="1"]').style.left === "14%",
  );
  await page.locator('[data-action="edit-layout"]').click();
  await page.locator('[data-table="1"]').click();
  await page.locator('.detail [data-action="move"]').click();
  await page.locator('[name="target"]').selectOption("3");
  await page.locator('[name="action"]').selectOption("merge");
  await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await page.locator(".restaurant-table.grouped").waitFor();
  assert.equal(await page.locator(".restaurant-table").count(), 11);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-table="3"]').click();
  await page.locator('#modal [data-action="ungroup"]').click();
  await page.locator('[data-action="dismiss"]').click();
  await page.locator('[data-action="edit-layout"]').click();
  const box = await page.locator('[data-table="1"]').boundingBox();
  const touch = await page.context().newCDPSession(page);
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: box.x + box.width / 2 + 30, y: box.y + box.height / 2 + 20 },
    ],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await page.waitForFunction(
    () =>
      parseFloat(document.querySelector('[data-table="1"]').style.left) > 20,
  );
  await page.locator('[data-action="edit-layout"]').click();
  assert.deepEqual(errors, []);
  console.log(
    "Browser OK: cadastro/histórico, pedido com erro e reenvio, cozinha, pagamentos parciais, fechamento; 5 páginas em 320/390/768/1024/1440px. Screenshots: " +
      shots,
  );
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    const exit = once(server, "exit");
    server.kill();
    await exit;
  }
  rmSync(dir, { recursive: true, force: true });
}

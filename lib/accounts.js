// Monetary values are integer cents. A payment records money received at the cashier.
export function accounts(
  db,
  { all, get, run, fail, integer, str, transaction, orders },
) {
  db.exec(`CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '', birthday TEXT NOT NULL DEFAULT '', created TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY, bill_id TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount > 0),
    method TEXT NOT NULL, payer TEXT NOT NULL, created TEXT NOT NULL,
    request_id TEXT NOT NULL, voided INTEGER NOT NULL DEFAULT 0, reason TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS payment_requests (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS payments_bill ON payments(bill_id);`);
  if (!all("PRAGMA table_info(orders)").some((c) => c.name === "client_id")) {
    db.exec(
      "ALTER TABLE orders ADD COLUMN client_id INTEGER REFERENCES customers(id)",
    );
  }

  function balance(billId) {
    const total = get(
      `SELECT COALESCE(SUM(i.price*i.quantity),0) AS n FROM items i
      JOIN orders o ON o.id=i.order_id WHERE o.bill_id=? AND o.status!='cancelled'`,
      billId,
    ).n;
    const paid = get(
      "SELECT COALESCE(SUM(amount),0) AS n FROM payments WHERE bill_id=? AND voided=0",
      billId,
    ).n;
    return { total, paid, remaining: total - paid };
  }
  function ensurePaid(os) {
    for (const id of new Set(os.map((o) => o.bill_id))) {
      if (balance(id).remaining > 0)
        fail(
          "Registre o pagamento do saldo restante antes de fechar a comanda.",
        );
    }
  }
  function customer(id) {
    const c = get("SELECT * FROM customers WHERE id=?", integer(id, 1));
    if (!c) fail("Cliente não encontrado.", 404);
    return c;
  }
  function optional(value, max) {
    if (value == null || value === "") return "";
    if (typeof value !== "string" || value.length > max)
      fail("Preencha os campos corretamente.");
    return value.trim();
  }
  function fields(body) {
    const name = str(body.name, 80),
      phone = optional(body.phone, 30);
    const address = optional(body.address, 500),
      birthday = optional(body.birthday, 10);
    if (
      phone &&
      (!/^[+\d\s().-]+$/.test(phone) || phone.replace(/\D/g, "").length < 8)
    )
      fail("Informe um telefone válido com DDD.");
    if (
      birthday &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(birthday) ||
        !Number.isFinite(Date.parse(birthday)) ||
        new Date(birthday).toISOString().slice(0, 10) !== birthday ||
        birthday > new Date().toISOString().slice(0, 10) ||
        birthday < "1900-01-01")
    )
      fail("Informe uma data de nascimento válida.");
    return [name, phone, address, birthday];
  }
  function snapshot() {
    return {
      customers: all("SELECT * FROM customers ORDER BY name COLLATE NOCASE"),
      payments: all("SELECT * FROM payments ORDER BY id DESC"),
    };
  }
  function handle(p, method, body) {
    if (p === "/api/customers" && method === "POST") {
      return {
        id: Number(
          run(
            "INSERT INTO customers(name,phone,address,birthday,created) VALUES(?,?,?,?,?)",
            ...fields(body),
            new Date().toISOString(),
          ).lastInsertRowid,
        ),
      };
    }
    if (/^\/api\/customers\/\d+$/.test(p) && method === "PATCH") {
      const c = customer(Number(p.split("/").pop()));
      run(
        "UPDATE customers SET name=?,phone=?,address=?,birthday=? WHERE id=?",
        ...fields(body),
        c.id,
      );
      return { ok: true };
    }
    if (p === "/api/bills/customer" && method === "POST")
      return transaction(() => {
        const billId = str(body.billId, 100),
          c = body.clientId ? customer(body.clientId) : null;
        if (!get("SELECT id FROM orders WHERE bill_id=?", billId))
          fail("Comanda não encontrada.", 404);
        run(
          "UPDATE orders SET client_id=? WHERE bill_id=?",
          c?.id || null,
          billId,
        );
        return { ok: true };
      });
    if (p === "/api/payments" && method === "POST")
      return transaction(() => {
        if (
          !Array.isArray(body.billIds) ||
          !body.billIds.length ||
          body.billIds.length > 100
        )
          fail("Selecione uma comanda.");
        const billIds = [
          ...new Set(body.billIds.map((id) => str(id, 100))),
        ].sort();
        const amount = integer(body.amount, 1, 100000000);
        if (!["pix", "cash", "debit", "credit"].includes(body.method))
          fail("Escolha a forma de pagamento.");
        const payer = optional(body.payer, 80),
          requestId = str(body.requestId, 100);
        const payload = JSON.stringify({
          billIds,
          amount,
          method: body.method,
          payer,
        });
        const previous = get(
          "SELECT payload FROM payment_requests WHERE id=?",
          requestId,
        );
        if (previous) {
          if (previous.payload !== payload)
            fail("Este pagamento já foi registrado com outros dados.", 409);
          return { ok: true, repeated: true };
        }
        const balances = billIds.map((id) => {
          if (!get("SELECT id FROM orders WHERE bill_id=? AND closed=0", id))
            fail("Comanda encerrada ou não encontrada.", 409);
          return { id, ...balance(id) };
        });
        if (amount > balances.reduce((n, b) => n + b.remaining, 0))
          fail("O valor excede o saldo restante. Atualize a conta.", 409);
        run("INSERT INTO payment_requests VALUES(?,?)", requestId, payload);
        let left = amount;
        for (const b of balances) {
          const portion = Math.min(left, b.remaining);
          if (portion > 0)
            run(
              "INSERT INTO payments(bill_id,amount,method,payer,created,request_id) VALUES(?,?,?,?,?,?)",
              b.id,
              portion,
              body.method,
              payer,
              new Date().toISOString(),
              requestId,
            );
          left -= portion;
        }
        return { ok: true };
      });
    if (/^\/api\/payments\/\d+\/void$/.test(p) && method === "POST")
      return transaction(() => {
        const payment = get(
          "SELECT * FROM payments WHERE id=? AND voided=0",
          Number(p.split("/")[3]),
        );
        if (!payment) fail("Pagamento não encontrado ou já estornado.", 404);
        const reason = str(body.reason, 200);
        if (
          !get(
            "SELECT id FROM orders WHERE bill_id=? AND closed=0",
            payment.bill_id,
          )
        )
          fail("A comanda já foi encerrada.");
        // A grouped receipt is reversed in full, keeping its individual allocations consistent.
        if (
          all(
            "SELECT bill_id FROM payments WHERE request_id=?",
            payment.request_id,
          ).some(
            (p) =>
              !get(
                "SELECT id FROM orders WHERE bill_id=? AND closed=0",
                p.bill_id,
              ),
          )
        )
          fail("Uma comanda deste recebimento já foi encerrada.");
        run(
          "UPDATE payments SET voided=1,reason=? WHERE request_id=?",
          reason,
          payment.request_id,
        );
        return { ok: true };
      });
  }
  return { balance, ensurePaid, customer, snapshot, handle };
}

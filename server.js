require('dotenv').config();

const express = require('express');
const path = require('path');
const useWindowsAuth = process.env.SQL_AUTH === 'windows';
const sql = useWindowsAuth ? require('mssql/msnodesqlv8') : require('mssql');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const htmlPath = path.join(__dirname, 'Httml');

app.use(express.json());

const demoInventory = [
  { id: '1', name: 'Fertilizante Úrea 46%', price: 120000, stock: 15, minStock: 10, lot: 'UT-9921', exp: '2027-05-12', branch: 'Apartadó' },
  { id: '2', name: 'Agroquímico BananoProtect', price: 85000, stock: 4, minStock: 8, lot: 'BP-8812', exp: '2026-11-30', branch: 'Chigorodó' },
  { id: '3', name: 'Abono Complejo NPK', price: 140000, stock: 2, minStock: 5, lot: 'NPK-001', exp: '2028-01-15', branch: 'Apartadó' },
  { id: '4', name: 'Fungicida Agrícola Premium', price: 95000, stock: 0, minStock: 5, lot: 'FG-4401', exp: '2026-12-01', branch: 'Chigorodó' },
  { id: '5', name: 'Urea Precisagro 46% x 50 kg', price: 124000, stock: 0, minStock: 5, lot: 'POR-RECIBIR', exp: 'N/A', branch: 'Apartadó', warehouse: 'Por recibir' },
  { id: '6', name: 'Nutrimon NPK 10-20-20 x 50 kg', price: 253200, stock: 0, minStock: 5, lot: 'POR-RECIBIR', exp: 'N/A', branch: 'Apartadó', warehouse: 'Por recibir' },
  { id: '7', name: 'Agrimins 8-5-0-6 Colinagro x 46 kg', price: 162000, stock: 0, minStock: 5, lot: 'POR-RECIBIR', exp: 'N/A', branch: 'Apartadó', warehouse: 'Por recibir' },
  { id: '8', name: 'Nutrimon Producción 17-6-18-2 x 50 kg', price: 170900, stock: 0, minStock: 5, lot: 'POR-RECIBIR', exp: 'N/A', branch: 'Apartadó', warehouse: 'Por recibir' },
  { id: '9', name: 'Banagen 250 EC x 250 ml', price: 26000, stock: 0, minStock: 2, lot: 'POR-RECIBIR', exp: 'N/A', branch: 'Apartadó', warehouse: 'Por recibir' }
];

const sqlConfig = {
  server: process.env.SQL_SERVER || (useWindowsAuth ? 'localhost\\SQLEXPRESS' : 'localhost'),
  database: process.env.SQL_DATABASE || 'AgroUraba',
  ...(useWindowsAuth ? { driver: process.env.SQL_ODBC_DRIVER || 'ODBC Driver 18 for SQL Server' } : {}),
  ...(useWindowsAuth ? {} : {
    user: process.env.SQL_USER || '',
    password: process.env.SQL_PASSWORD || ''
  }),
  ...(!useWindowsAuth && !process.env.SQL_INSTANCE ? { port: Number(process.env.SQL_PORT || 1433) } : {}),
  options: {
    encrypt: process.env.SQL_ENCRYPT === 'true',
    trustServerCertificate: process.env.SQL_TRUST_SERVER_CERTIFICATE === 'true',
    enableArithAbort: true,
    ...(useWindowsAuth
      ? { trustedConnection: true }
      : process.env.SQL_INSTANCE ? { instanceName: process.env.SQL_INSTANCE } : {})
  },
};

let pool;
let poolPromise;
let invoiceSchemaPromise;

async function connectDatabase() {
  if (!useWindowsAuth && (!sqlConfig.user || !sqlConfig.password)) {
    throw new Error('Credenciales de SQL no configuradas. Usa .env o variables de entorno.');
  }

  if (!poolPromise) {
    const nextPool = new sql.ConnectionPool(sqlConfig);
    poolPromise = nextPool.connect()
      .then(() => {
        pool = nextPool;
        return pool;
      })
      .catch(error => {
        pool = null;
        poolPromise = null;
        throw error;
      });
  }

  return poolPromise;
}

async function ensureInvoiceSchema(dbPool) {
  if (!invoiceSchemaPromise) {
    invoiceSchemaPromise = dbPool.request().query(`
      IF OBJECT_ID('dbo.Ventas', 'U') IS NOT NULL
         AND COL_LENGTH('dbo.Ventas', 'factura') IS NULL
      BEGIN
        ALTER TABLE dbo.Ventas ADD factura NVARCHAR(MAX) NULL;
      END
    `).catch(error => {
      invoiceSchemaPromise = null;
      throw error;
    });
  }

  await invoiceSchemaPromise;
}

function normalizeInventory(items) {
  return items.map(item => ({
    id: String(item.id),
    name: item.name,
    price: Number(item.price),
    stock: Number(item.stock),
    minStock: Number(item.minStock ?? item.min_stock ?? 0),
    lot: item.lot || 'N/A',
    exp: item.exp ? new Date(item.exp).toISOString().slice(0, 10) : 'N/A',
    branch: item.branch || 'Sede principal',
    warehouse: item.warehouse || item.branch || 'Sede principal'
  }));
}

async function getInventory() {
  try {
    const dbPool = await connectDatabase();
    const result = await dbPool.request().query(`
      SELECT id, name, price, stock, minStock, lot, exp, branch
      FROM Inventario
      ORDER BY name
    `);

    return normalizeInventory(result.recordset);
  } catch (error) {
    console.warn('Usando datos de demostración porque no hay conexión a SQL:', error.message);
    return demoInventory;
  }
}

async function getAlerts() {
  const inventory = await getInventory();
  return inventory
    .filter(item => item.stock <= item.minStock)
    .map(item => ({
      title: 'ALERTA DE REABASTECIMIENTO',
      product: item.name,
      message: `El producto ${item.name} (Sede ${item.branch}) alcanzó el punto de reorden (${item.stock} unidades restantes).`
    }));
}

function getMultiplier(strategy) {
  if (strategy === 'bananera') return 0.85;
  if (strategy === 'convenio') return 0.8;
  return 1;
}

app.get('/api/health', async (req, res) => {
  try {
    await connectDatabase();
    res.json({ ok: true, mode: 'sql', message: 'Conexión activa con SQL Server / Azure SQL.' });
  } catch (error) {
    res.json({ ok: true, mode: 'demo', message: 'Modo demostración activo. Configura SQL_SERVER, SQL_DATABASE, SQL_USER y SQL_PASSWORD para usar la base de datos real.' });
  }
});

app.get('/api/products', async (req, res) => {
  const inventory = await getInventory();
  res.json(inventory);
});

app.get('/api/alerts', async (req, res) => {
  const alerts = await getAlerts();
  res.json(alerts);
});

app.get('/api/sales', async (req, res) => {
  try {
    const dbPool = await connectDatabase();
    await ensureInvoiceSchema(dbPool);
    const result = await dbPool.request().query(`
      SELECT TOP (100) id, total, fecha, factura
      FROM Ventas
      WHERE factura IS NOT NULL
      ORDER BY fecha DESC
    `);

    const invoices = result.recordset.map(row => {
      let invoice;
      try {
        invoice = JSON.parse(row.factura);
      } catch {
        return null;
      }

      try {
        return {
          ...invoice,
          id: String(row.id),
          total: Number(row.total),
          date: invoice.date || new Date(row.fecha).toISOString()
        };
      } catch {
        return null;
      }
    }).filter(Boolean);

    res.json(invoices);
  } catch (error) {
    console.warn('No se pudo consultar el historial de facturas:', error.message);
    res.status(503).json({ success: false, message: 'Historial de facturas no disponible.' });
  }
});

app.post('/api/sales', async (req, res) => {
  const { cart = [], strategy = 'detal', invoice: requestedInvoice = {} } = req.body;
  const saleId = String(req.body.id || `TRX-${require('crypto').randomUUID()}`);

  if (!Array.isArray(cart) || cart.length === 0) {
    return res.status(400).json({ success: false, message: 'No hay productos en la factura.' });
  }

  if (cart.some(item => !Number.isInteger(Number(item.qty)) || Number(item.qty) <= 0)) {
    return res.status(400).json({ success: false, message: 'Las cantidades deben ser enteros mayores a cero.' });
  }

  let dbPool;
  try {
    dbPool = await connectDatabase();
    await ensureInvoiceSchema(dbPool);
  } catch (error) {
    return res.status(503).json({ success: false, message: 'Base de datos no disponible o sin migración de facturas; venta no confirmada.' });
  }

  const inventoryResult = await dbPool.request().query(`
    SELECT id, name, price, stock, minStock, lot, exp, branch
    FROM Inventario
    ORDER BY name
  `);
  const inventory = normalizeInventory(inventoryResult.recordset);
  let total = 0;
  const processedItems = [];
  const multiplier = getMultiplier(strategy);

  for (const item of cart) {
    const product = inventory.find(p => String(p.id) === String(item.id));
    if (!product) {
      return res.status(400).json({ success: false, message: `El producto ${item.id} no existe.` });
    }

    const qty = Number(item.qty || 0);
    const requestedForProduct = cart
      .filter(cartItem => String(cartItem.id) === String(product.id))
      .reduce((sum, cartItem) => sum + Number(cartItem.qty), 0);
    if (requestedForProduct > product.stock) {
      return res.status(400).json({ success: false, message: `No hay suficiente inventario para ${product.name}.` });
    }

    total += product.price * qty * multiplier;
    processedItems.push({
      id: String(product.id),
      name: product.name,
      qty,
      unitPrice: product.price,
      subtotal: product.price * qty * multiplier,
      branch: product.branch,
      warehouse: product.warehouse || product.branch,
      lot: product.lot || 'N/A'
    });
  }

  const subtotal = processedItems.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
  const customerInput = requestedInvoice.customer || {};
  const customer = {
    name: String(customerInput.name || 'Consumidor final').trim().slice(0, 200) || 'Consumidor final',
    identification: String(customerInput.identification || '').trim().slice(0, 50),
    phone: String(customerInput.phone || '').trim().slice(0, 50),
    address: String(customerInput.address || '').trim().slice(0, 200),
    city: String(customerInput.city || '').trim().slice(0, 100)
  };
  const strategyLabels = {
    detal: 'Cliente detal',
    bananera: 'Empresa bananera, descuento 15%',
    convenio: 'Convenio institucional, subsidio 20%'
  };
  const requestedDate = new Date(requestedInvoice.date);
  const paymentTerms = String(requestedInvoice.paymentTerms || 'Pago inmediato').trim().slice(0, 80);
  const requestedDueDate = new Date(requestedInvoice.dueDate);
  const invoice = {
    id: saleId,
    number: String(requestedInvoice.number || saleId).trim().slice(0, 80),
    date: Number.isNaN(requestedDate.getTime()) ? new Date().toISOString() : requestedDate.toISOString(),
    dueDate: Number.isNaN(requestedDueDate.getTime()) ? new Date().toISOString() : requestedDueDate.toISOString(),
    customer,
    paymentTerms,
    branch: [...new Set(processedItems.map(item => item.branch))].join(' / '),
    strategy,
    strategyLabel: strategyLabels[strategy] || strategyLabels.detal,
    items: processedItems,
    subtotal: Number(subtotal.toFixed(2)),
    discountAmount: Number((subtotal - total).toFixed(2)),
    taxAmount: 0,
    total: Number(total.toFixed(2)),
    status: 'Confirmada'
  };

  const transaction = new sql.Transaction(dbPool);
  try {
    await transaction.begin();
    const existingSale = await new sql.Request(transaction)
      .input('id', sql.NVarChar(50), saleId)
      .query('SELECT id, total, factura FROM Ventas WHERE id = @id');

    if (existingSale.recordset.length) {
      await transaction.rollback();
      let existingInvoice = invoice;
      try {
        if (existingSale.recordset[0].factura) existingInvoice = JSON.parse(existingSale.recordset[0].factura);
      } catch {}
      return res.json({
        success: true,
        id: saleId,
        total: Number(existingSale.recordset[0].total),
        invoice: existingInvoice,
        message: 'Esta venta ya estaba registrada.'
      });
    }

    await new sql.Request(transaction)
      .input('id', sql.NVarChar(50), saleId)
      .input('detalle', sql.NVarChar(sql.MAX), processedItems.map(p => `${p.qty}x ${p.name}`).join(', '))
      .input('total', sql.Decimal(18, 2), total)
      .input('factura', sql.NVarChar(sql.MAX), JSON.stringify(invoice))
      .query(`
        INSERT INTO Ventas (id, detalle, total, fecha, factura)
        VALUES (@id, @detalle, @total, GETDATE(), @factura)
      `);

    for (const item of cart) {
      const stockUpdate = await new sql.Request(transaction)
        .input('qty', sql.Int, Number(item.qty))
        .input('id', sql.Int, Number(item.id))
        .query(`
          UPDATE Inventario
          SET stock = stock - @qty
          WHERE id = @id AND stock >= @qty
        `);
      if (stockUpdate.rowsAffected[0] !== 1) {
        throw new Error(`Stock insuficiente para el producto ${item.id}.`);
      }
    }
    await transaction.commit();
  } catch (error) {
    try { await transaction.rollback(); } catch {}
    console.error('No se pudo persistir la venta:', error.message);
    return res.status(503).json({ success: false, message: 'No se pudo guardar la venta en la base de datos.' });
  }

  res.json({
    success: true,
    id: saleId,
    total: Number(total.toFixed(2)),
    invoice,
    message: 'Venta registrada correctamente.'
  });
});

app.post('/api/stock', async (req, res) => {
  const { productName, qty = 0, lot = '', exp = '', movement = 'in' } = req.body;

  if (!productName) {
    return res.status(400).json({ success: false, message: 'Debe indicar el producto.' });
  }

  if (!Number.isInteger(Number(qty)) || Number(qty) <= 0 || !['in', 'out'].includes(movement)) {
    return res.status(400).json({ success: false, message: 'Indique una cantidad entera positiva y un movimiento válido.' });
  }

  let dbPool;
  try {
    dbPool = await connectDatabase();
  } catch (error) {
    return res.status(503).json({ success: false, message: 'Base de datos no disponible; inventario no actualizado.' });
  }

  const inventoryResult = await dbPool.request()
    .input('name', sql.NVarChar(200), productName)
    .query('SELECT id, name, price, stock, minStock, lot, exp, branch FROM Inventario WHERE name = @name');
  const product = normalizeInventory(inventoryResult.recordset)[0];

  if (!product) {
    return res.status(404).json({ success: false, message: 'Producto no encontrado.' });
  }

  const delta = movement === 'out' ? -Number(qty) : Number(qty);
  if (product.stock + delta < 0) {
    return res.status(400).json({ success: false, message: `Existencias insuficientes. Stock actual: ${product.stock}.` });
  }

  try {
    const update = await dbPool.request()
      .input('delta', sql.Int, delta)
      .input('lot', sql.NVarChar(100), product.lot || 'N/A')
      .input('updateLot', sql.Bit, Boolean(lot))
      .input('updateExp', sql.Bit, Boolean(exp))
      .input('exp', sql.Date, exp || null)
      .input('id', sql.Int, Number(product.id))
      .query(`
        UPDATE Inventario
        SET stock = stock + @delta,
            lot = CASE WHEN @updateLot = 1 THEN @lot ELSE lot END,
            exp = CASE WHEN @updateExp = 1 THEN @exp ELSE exp END
        WHERE id = @id AND stock + @delta >= 0;
        SELECT id, name, price, stock, minStock, lot, exp, branch
        FROM Inventario WHERE id = @id;
      `);
    if (!update.recordset.length) {
      return res.status(400).json({ success: false, message: 'No se pudo aplicar el movimiento; verifique el stock actual.' });
    }
    const updated = normalizeInventory(update.recordset)[0];
    return res.json({ success: true, product: updated.name, stock: updated.stock, movement });
  } catch (error) {
    console.error('No se pudo actualizar inventario:', error.message);
    return res.status(503).json({ success: false, message: 'No se pudo guardar el movimiento en la base de datos.' });
  }
});

app.get('/Httml', (req, res) => {
  res.type('html').sendFile(htmlPath);
});

app.get('/admin', (req, res) => {
  res.type('html').sendFile(path.join(__dirname, 'admin.html'));
});

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.redirect('/Httml');
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log('Abre: http://localhost:' + PORT + '/Httml');
  console.log('Configura tu .env para usar SQL Server / Azure SQL.');
});

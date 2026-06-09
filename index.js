const express = require('express');
const path = require('path');
const helmet = require('helmet');
const repository = require('./repository.js');
const { MercadoPagoConfig, Preference } = require('mercadopago');

// Configura tus credenciales
const client = new MercadoPagoConfig({
    accessToken: process.env.MP_ACCESS_TOKEN
});

const app = express();
// const port = 3000;
const port = process.env.PORT || 10000;

// --- MIDDLEWARES ---
// Helmet ayuda a proteger la aplicación de vulnerabilidades web conocidas
// Se desactiva el contentSecurityPolicy para evitar romper el frontend si usa recursos externos
app.use(helmet({ contentSecurityPolicy: false }));

// Usar express nativo en lugar de body-parser (incluido desde express 4.16.0)
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Servir archivos estáticos
app.use('/frontend', express.static(path.join(__dirname, 'frontend')));
app.use('/img', express.static(path.join(__dirname, 'img'))); // <-- Exponer la carpeta de imágenes estáticas
app.use("/", express.static("frontend"));

// --- RUTAS DE PRODUCTOS ---

// Obtener productos por categoría
app.get('/api/products/:type', async (req, res) => {
    const type = req.params.type;
    try {
        const products = await repository.read();
        const filteredProducts = products.filter(product => String(product.Tipo) === String(type));
        res.send(filteredProducts);
    } catch (error) {
        console.error('Error al obtener productos por tipo:', error);
        res.status(500).json({ error: 'Error al obtener productos' });
    }
});

// Obtener catálogo completo (para el carrito)
app.get('/api/all-products', async (req, res) => {
    try {
        const products = await repository.read("Productos", "A:J");
        const ofertas = await repository.read("Ofertas", "A:J");
        res.send([...products, ...ofertas]);
    } catch (error) {
        res.status(500).send({ error: "Error al obtener catálogo completo" });
    }
});

// Obtener ofertas
app.get('/api/ofertas', async (req, res) => {
    try {
        const ofertas = await repository.read("Ofertas", "A:J");
        res.send(ofertas);
    } catch (error) {
        res.status(500).send({ error: "Error al obtener ofertas" });
    }
});

// --- RUTA DE PAGO Y GESTIÓN DE STOCK ---

app.post('/api/pay', async (req, res) => {
    try {
        const carrito = req.body;

        if (!Array.isArray(carrito) || carrito.length === 0) {
            return res.status(400).json({ error: 'El carrito está vacío' });
        }

        // 1. VALIDACIÓN DE STOCK
        const cantidadPorProducto = {};
        carrito.forEach(item => {
            const id = item.id;
            const qty = item.quantity || 1;
            cantidadPorProducto[id] = (cantidadPorProducto[id] || 0) + qty;
        });

        // Forzamos la lectura (sin caché) para tener el stock más reciente antes del pago
        const productosMaster = await repository.read("Productos", "A:J", true);
        const ofertasMaster = await repository.read("Ofertas", "A:J", true);
        const catalogoTotal = [...productosMaster, ...ofertasMaster];
        const faltantes = [];

        for (const id in cantidadPorProducto) {
            const producto = catalogoTotal.find(p => String(p.Id) === String(id) || String(p.OriginalId) === String(id));
            if (!producto) {
                faltantes.push({ id, motivo: 'Producto no existe' });
            } else if (Number(producto.Stock) < cantidadPorProducto[id]) {
                faltantes.push({
                    id,
                    producto: producto.Producto,
                    disponible: producto.Stock,
                    solicitado: cantidadPorProducto[id]
                });
            }
        }

        if (faltantes.length > 0) {
            return res.status(409).json({ error: 'Stock insuficiente', detalles: faltantes });
        }

        // 2. CREACIÓN DE LA PREFERENCIA
        const idVentaUnico = "MP-" + Date.now();
        const preference = new Preference(client);

        // Generar URL base dinámica según el host que realiza la petición
        const protocol = req.headers.referer ? req.headers.referer.split(':')[0] : 'https';
        const host = req.headers.host;
        const baseUrl = `${protocol}://${host}`;

        const body = {
            items: carrito.map(item => ({
                id: String(item.id),
                title: String(item.nombre).substring(0, 250), // MP limita a 256 caracteres
                quantity: Number(item.quantity),
                unit_price: Number(item.price),
                currency_id: 'ARS'
            })),
            back_urls: {
                // USAMOS URLS DINÁMICAS SEGÚN EL ENTORNO (localhost, Render pruebas o producción)
                success: `${baseUrl}/pages/success.html`,
                failure: `${baseUrl}/index.html`,
                pending: `${baseUrl}/index.html`,
            },
            notification_url: `${baseUrl}/webhook`,
            auto_return: "approved",
            external_reference: JSON.stringify({
                idVenta: idVentaUnico,
                items: carrito
            })
        };

        const response = await preference.create({ body });

        res.status(200).json({
            preferenceId: response.id,
            idVenta: idVentaUnico,
            initPoint: response.init_point
        });

    } catch (error) {
        console.error('--- ERROR DETECTADO ---');
        console.error('Mensaje:', error.message);
        if (error.apiResponse && error.apiResponse.body) {
            console.error('Respuesta MP:', JSON.stringify(error.apiResponse.body, null, 2));
        }

        if (!res.headersSent) {
            // Esto te dirá en el navegador cuál fue el error real
            return res.status(500).json({ error: 'Fallo en el servidor: ' + error.message });
        }
    }
});

// Ruta para recibir la confirmación de pago de Mercado Pago
app.post('/webhook', async (req, res) => {
    const { query } = req;
    const topic = query.topic || query.type;

    try {
        // --- BYPASS DE PRUEBA LOCAL ---
        if (req.body && req.body.isTest) {
            console.log('🧪 Iniciando procesamiento de compra de prueba local...');
            const carrito = req.body.items;
            const idVentaUnico = req.body.idVenta || "TEST-" + Date.now();

            // Evitar procesamiento duplicado
            const yaExiste = await repository.checkVentaExiste(idVentaUnico);
            if (yaExiste) {
                console.log(`⚠️ La venta de prueba ${idVentaUnico} ya fue procesada anteriormente.`);
                return res.status(200).json({ success: true, message: `La venta ${idVentaUnico} ya está registrada.` });
            }

            const productosMaster = await repository.read("Productos", "A:J", true);
            const ofertasMaster = await repository.read("Ofertas", "A:J", true);
            let totalVenta = 0;
            let nombresParaRegistro = [];
            let totalArticulos = 0;

            const productosActualizados = productosMaster.map(p => {
                const itemComprado = carrito.find(i => String(i.id) === String(p.Id) || String(i.id) === String(p.OriginalId));
                if (itemComprado) {
                    const qty = itemComprado.quantity || 1;
                    totalVenta += (Number(itemComprado.price) * qty);
                    totalArticulos += qty;
                    nombresParaRegistro.push(`(${p.Id}) ${p.Producto} (x${qty})`);
                    return { ...p, Stock: Number(p.Stock) - qty };
                }
                return p;
            });

            const ofertasActualizadas = ofertasMaster.map(p => {
                const itemComprado = carrito.find(i => String(i.id) === String(p.Id) || String(i.id) === String(p.OriginalId));
                if (itemComprado) {
                    const qty = itemComprado.quantity || 1;
                    totalVenta += (Number(itemComprado.price) * qty);
                    totalArticulos += qty;
                    nombresParaRegistro.push(`(${p.Id}) ${p.Producto} [Oferta] (x${qty})`);
                    return { ...p, Stock: Number(p.Stock) - qty };
                }
                return p;
            });

            await repository.write(productosActualizados, "Productos");
            await repository.write(ofertasActualizadas, "Ofertas");

            await repository.logVenta({
                id: idVentaUnico,
                productos: nombresParaRegistro.join(", "),
                cantidad: totalArticulos,
                total: totalVenta
            });

            console.log(`✅ Venta de Prueba ${idVentaUnico} procesada con éxito.`);
            return res.status(200).json({ success: true, message: `Venta de Prueba ${idVentaUnico} procesada con éxito.` });
        }
        // ------------------------------

        if (topic === "payment") {
            const paymentId = query.id || query['data.id'];

            // 1. Consultar el estado del pago a Mercado Pago
            const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
                headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` }
            });
            const payment = await response.json();

            if (payment.status === "approved") {
                // 2. Recuperar los datos que guardamos en external_reference
                const dataExtra = JSON.parse(payment.external_reference);
                const idVenta = dataExtra.idVenta;

                // Evitar procesamiento duplicado
                const yaExiste = await repository.checkVentaExiste(idVenta);
                if (yaExiste) {
                    console.log(`⚠️ La venta ${idVenta} ya fue procesada anteriormente. Evitando duplicación.`);
                    return res.sendStatus(200);
                }

                const carrito = dataExtra.items;

                // 3. ACTUALIZAR GOOGLE SHEETS
                const productosMaster = await repository.read("Productos", "A:J", true);
                const ofertasMaster = await repository.read("Ofertas", "A:J", true);
                let totalVenta = 0;
                let nombresParaRegistro = [];
                let totalArticulos = 0;

                // Separar productos actualizados por hoja
                const productosActualizados = productosMaster.map(p => {
                    const itemComprado = carrito.find(i => String(i.id) === String(p.Id) || String(i.id) === String(p.OriginalId));
                    if (itemComprado) {
                        const qty = itemComprado.quantity || 1;
                        totalVenta += (Number(itemComprado.price) * qty); // Precio final cobrado
                        totalArticulos += qty;
                        nombresParaRegistro.push(`(${p.Id}) ${p.Producto} (x${qty})`);
                        return { ...p, Stock: Number(p.Stock) - qty };
                    }
                    return p;
                });

                const ofertasActualizadas = ofertasMaster.map(p => {
                    const itemComprado = carrito.find(i => String(i.id) === String(p.Id) || String(i.id) === String(p.OriginalId));
                    if (itemComprado) {
                        const qty = itemComprado.quantity || 1;
                        totalVenta += (Number(itemComprado.price) * qty); // Precio final cobrado
                        totalArticulos += qty;
                        nombresParaRegistro.push(`(${p.Id}) ${p.Producto} [Oferta] (x${qty})`);
                        return { ...p, Stock: Number(p.Stock) - qty };
                    }
                    return p;
                });

                // A. Escribir stock en ambas hojas
                await repository.write(productosActualizados, "Productos");
                await repository.write(ofertasActualizadas, "Ofertas");

                // B. Registrar venta
                await repository.logVenta({
                    id: idVenta,
                    productos: nombresParaRegistro.join(", "),
                    cantidad: totalArticulos,
                    total: totalVenta
                });

                console.log(`✅ Venta ${idVenta} procesada con éxito.`);
            }
        }
        // Mercado Pago necesita un 200 o 201 para dejar de enviar notificaciones
        res.sendStatus(200);
    } catch (error) {
        console.error("Error en el Webhook:", error);
        res.sendStatus(500);
    }
});
// --- INICIO DEL SERVIDOR ---
app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});
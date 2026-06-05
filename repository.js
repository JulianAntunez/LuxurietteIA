const { google } = require('googleapis');
require('dotenv').config({ override: false });

// Inicializa el cliente de Google Sheets
const sheets = google.sheets('v4');

// --- CONFIGURACIÓN DE AUTENTICACIÓN FLEXIBLE ---
// Permite usar un archivo JSON localmente o variables de entorno en producción (Render)
let authOptions = {
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
};

if (process.env.GOOGLE_KEY_JSON_PATH) {
  authOptions.keyFile = process.env.GOOGLE_KEY_JSON_PATH;
} else if (process.env.GOOGLE_PRIVATE_KEY) {
  authOptions.credentials = {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  };
}

const auth = new google.auth.GoogleAuth(authOptions);

// const spreadsheetId = "1wihpFZbKGo4gBsMgmSDur8HbgUO6P8cW3ftNbcHEQG4";
const spreadsheetId = process.env.SPREAD_SHEET_ID;
// console.log("El ID cargado es:", spreadsheetId); // <--- AGREGA ESTA LÍNEA

// --- CACHÉ EN MEMORIA DUAL ---
let cache = {
  Productos: { data: null, lastFetch: 0 },
  Ofertas: { data: null, lastFetch: 0 }
};
const CACHE_TTL = 1000 * 60 * 2; // 2 minutos de caché

/**
 * Lee los productos de una hoja específica
 */
async function read(sheetName = "Productos", range = "A:J", forceRefresh = false) {
  try {
    if (!cache[sheetName]) cache[sheetName] = { data: null, lastFetch: 0 };
    
    if (!forceRefresh && cache[sheetName].data && (Date.now() - cache[sheetName].lastFetch < CACHE_TTL)) {
      return cache[sheetName].data;
    }

    const dynamicRange = `${sheetName}!${range}`;
    const authClient = await auth.getClient();

    const resultRead = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: dynamicRange,
      auth: authClient,
    });

    if (!resultRead.data.values || resultRead.data.values.length === 0) {
      console.log(`No se encontraron datos en la hoja ${sheetName}.`);
      return [];
    }

    // Mapeamos las filas a objetos JSON
    const products = resultRead.data.values.slice(1).map((row) => {
      return {
        Id: sheetName === "Ofertas" ? "O-" + row[0] : String(row[0]), // ID dinámico para separar carritos
        OriginalId: row[0], // Para poder volver a guardar en Google Sheets correctamente
        Producto: row[1],
        Descripcion: row[2],
        Precio: parseFloat(String(row[3]).replace(/[^0-9.-]+/g, "")) || 0,
        Stock: parseInt(row[4]),
        Img1: row[5],
        Img2: row[6] || "",
        Img3: row[7] || "",
        Tipo: row[8] || "",
        P_Descuento: row[9] ? parseFloat(String(row[9]).replace(/[^0-9.-]+/g, "")) : 0,
        SheetOrigin: sheetName // Identificador para el proceso de compra
      };
    });

    cache[sheetName].data = products;
    cache[sheetName].lastFetch = Date.now();

    return products;
  } catch (error) {
    console.error(`Error en lectura de ${sheetName}: ${error.message}`);
    return [];
  }
}

/**
 * Sobrescribe el stock en la hoja correspondiente
 */
async function write(products, sheetName = "Productos") {
  try {
    const authClient = await auth.getClient();
    const colEnd = sheetName === "Ofertas" ? "J" : "I";
    const rangeWrite = `${sheetName}!A2:${colEnd}`; 

    const values = products.map(p => {
      let row = [
        p.OriginalId || p.Id, // IMPORTANTE: escribir el ID original en formato numérico/string crudo
        p.Producto,
        p.Descripcion,
        p.Precio,
        p.Stock,
        p.Img1,
        p.Img2 || "",
        p.Img3 || "",
        p.Tipo || ""
      ];
      if (sheetName === "Ofertas") {
        row.push(p.P_Descuento || 0);
      }
      return row;
    });

    const result = await sheets.spreadsheets.values.update({
      spreadsheetId: spreadsheetId,
      range: rangeWrite,
      valueInputOption: 'RAW',
      requestBody: { values }, 
      auth: authClient,
    });

    console.log(`Stock actualizado en ${sheetName}. Celdas afectadas: ${result.data.updatedCells}`);
    if (cache[sheetName]) cache[sheetName].data = null; // Invalidar caché
    return { success: true, updatedCells: result.data.updatedCells };
  } catch (error) {
    console.error(`Error en escritura de stock para ${sheetName}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Registra una nueva fila en la hoja "Ventas"
 */
// async function logVenta(datos) {
//   try {
//     const authClient = await auth.getClient();
    
//     const values = [[
//       "MP-" + Date.now(), 
//       new Date().toLocaleString('es-AR'), 
//       datos.productos,
//       datos.cantidad,
//       "Mercado Pago",
//       datos.total
//     ]];

//     const result = await sheets.spreadsheets.values.append({
//       spreadsheetId: spreadsheetId,
//       range: "Ventas!A:F",
//       valueInputOption: 'RAW',
//       requestBody: { values },
//       auth: authClient,
//     });

//     console.log("Venta registrada exitosamente en historial.");
//     return { success: true };
//   } catch (error) {
//     console.error("Error en logVenta:", error.message);
//     return { success: false, error: error.message };
//   }
// }
async function logVenta(datos) {
  try {
    const authClient = await auth.getClient();
    
    const values = [[
      datos.id || ("MP-" + Date.now()), // Usa el ID que viene del servidor o genera uno si no hay
      new Date().toLocaleString('es-AR'), 
      datos.productos,
      datos.cantidad,
      "Mercado Pago",
      datos.total
    ]];

    const result = await sheets.spreadsheets.values.append({
      spreadsheetId: spreadsheetId,
      range: "Ventas!A:F", // Asegúrate que la hoja se llame exactamente "Ventas"
      valueInputOption: 'RAW',
      requestBody: { values },
      auth: authClient,
    });

    console.log("Venta registrada exitosamente en historial.");
    return { success: true };
  } catch (error) {
    console.error("Error en logVenta:", error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  read,
  write,
  logVenta
};


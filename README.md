# Luxuriette Web Store

Este proyecto es una tienda web que utiliza **Node.js**, **Express**, **Mercado Pago** para procesar pagos y **Google Sheets API** como base de datos y registro de stock/ventas.

## Cambios y Mejoras Recientes

A continuación se detallan las modificaciones realizadas para optimizar y asegurar el funcionamiento de la aplicación:

### 1. Sistema de Caché en Memoria (Optimización de Google Sheets)
- **Problema:** Cada vez que un usuario visitaba la página o filtraba productos, el servidor realizaba una llamada a la API de Google Sheets para obtener los productos (`repository.read()`). Esto podía llevar a superar fácilmente las cuotas de uso de Google (Rate Limits) si había múltiples usuarios.
- **Solución:** Se implementó una **caché en memoria** de 2 minutos en `repository.js`.
  - Ahora las peticiones habituales (como ver el catálogo) leen los datos desde la memoria del servidor de forma instantánea.
  - Para operaciones críticas donde se requiere precisión absoluta (como validar el stock antes de cobrar o actualizarlo tras una venta confirmada), se añadió un parámetro `forceRefresh = true` que ignora la caché y trae los datos frescos directamente de Google Sheets.
  - Al realizar una venta (`repository.write()`), la caché se invalida automáticamente para forzar que el siguiente cliente vea el stock actualizado.

### 2. Mejoras de Seguridad
- **Implementación de Helmet:** Se añadió el middleware `helmet` a `index.js`. Aunque la librería ya estaba en el `package.json`, no se estaba utilizando. `helmet` añade automáticamente varias cabeceras HTTP que protegen la aplicación de vulnerabilidades web conocidas. (Se configuró `contentSecurityPolicy: false` por precaución, para evitar romper la carga de imágenes u otros recursos del frontend original).

### 3. Simplificación de Express
- **Eliminación de body-parser:** Se reemplazó el uso de la librería externa `body-parser` por los middlewares nativos de express (`express.json()` y `express.urlencoded()`), los cuales vienen incluidos en las versiones modernas de Express.

### 4. Precisión del Stock en Pagos y Webhooks
- **Validación robusta:** Tanto en el endpoint de pago (`/api/pay`) como en el Webhook de confirmación (`/webhook`), se aseguró que la lectura del catálogo principal se realice de forma forzada (`forceRefresh = true`). Esto reduce la probabilidad de errores de concurrencia y venta de productos sin stock.

### 5. Frontend: Prevención de Errores en Modal
- **Validación segura de variables:** Se corrigió un problema potencial en `frontend/script.js` relacionado con el modal de verificación de edad (+18). La variable `myModal` ahora se declara correctamente en un alcance superior para evitar errores de tipo `ReferenceError` si el usuario interactúa con el botón de confirmación después de que la validación inicial haya pasado.

### 6. Autenticación de Google Sheets Flexible
- **Soporte para múltiples entornos:** Se modificó la inicialización de GoogleAuth en `repository.js`. Ahora el sistema es capaz de leer las credenciales a través de un archivo local (definiendo `GOOGLE_KEY_JSON_PATH` en el `.env`) para el entorno de desarrollo, o utilizando las variables directas (`GOOGLE_SERVICE_ACCOUNT_EMAIL` y `GOOGLE_PRIVATE_KEY`) para el entorno de producción en plataformas como Render.

### 7. Integración Frontend de Mercado Pago
- **SDK añadido:** Se corrigió un error en el navegador (`MercadoPago is not defined`) agregando el script oficial del SDK de Mercado Pago (`v2`) en el archivo `frontend/index.html`, justo antes de cargar la lógica personalizada en `script.js`.

### 8. Corrección de Archivos Estáticos (Imágenes)
- **Rutas de imágenes reparadas:** Se corrigió un error `404 Not Found` en el logo y favicon. El servidor de Express solo estaba configurado para servir archivos de la carpeta `frontend`, por lo que las peticiones a la carpeta raíz `img` estaban siendo bloqueadas. Se agregó un middleware `app.use('/img', express.static(...))` en `index.js` para exponer públicamente las imágenes.

### 9. Rediseño Visual Premium (Dark Mode y Glassmorphism)
- **Estética E-commerce Moderna:** Se implementó una revisión total de la interfaz para darle un aspecto "premium". 
  - Se creó el archivo `frontend/booststrap/css/modern-theme.css` que sobrescribe los estilos por defecto con una nueva paleta "Deep Slate" (`#0f172a`), tipografía 'Outfit' de Google Fonts, y acentos violetas y cian.
  - Se añadió *Glassmorphism* (efecto cristal translúcido) a la barra de navegación y al modal del carrito de compras.
  - Las tarjetas de los productos ahora incluyen micro-animaciones (efecto de flote al pasar el mouse) y sombras sutiles con brillos neón.
  - Este nuevo tema CSS se inyectó automáticamente en todos los archivos `.html` del frontend mediante un script.

### 10. Refactorización y Unificación CSS
- **Limpieza de código:** Para mejorar la mantenibilidad a futuro, se unificaron las reglas de disposición y estructura heredadas de `style2.css` con la estética de `modern-theme.css` en un único archivo maestro: `frontend/style.css`.
- Se eliminaron de forma segura los archivos redundantes (`style1.css`, `style2.css`, `modern-theme.css`) y se re-enlazaron dinámicamente las etiquetas `<link>` de todas las 9 páginas HTML del proyecto hacia la ruta unificada de `style.css`.

### 11. Creación e Integración de Nuevo Logo (Luxuriette)
- **Generación de Identidad Visual:** Se generó un nuevo logo e ícono premium exclusivo para la marca ("Luxuriette") mediante IA, en sintonía con la nueva estética Dark/Glassmorphism (acentos violeta y cian).
- **Corrección de Rutas Absolutas:** Se reemplazó el antiguo logo `Lemon.ico` por el nuevo `luxuriette_logo.png`. Para evitar los errores de tipo `404 Not Found` en las subcarpetas, se configuraron todas las rutas de imágenes en los HTML utilizando rutas absolutas (`/img/logo/luxuriette_logo.png`), aprovechando correctamente el middleware estático de Express.

### 12. Navbar Premium y Animaciones
- **Rediseño de Cabecera:** Se eliminó el texto estático y aburrido de "Tienda" en la barra de navegación de las 9 páginas HTML.
- Se inyectó el nuevo logo vectorial acompañado de un texto con **gradiente transparente** alineado con los colores de la marca.
- Se desarrollaron micro-animaciones en CSS (`style.css`): el logo tiene un sutil efecto de giro y sombreado (`drop-shadow`) al pasar el cursor, y los enlaces de navegación presentan un subrayado mágico que se despliega desde el centro mediante pseudo-elementos (`::after`).
### 13. Sistema de Redirección Directa para Mercado Pago
- **Problema:** El uso del SDK modal (`mp.checkout`) abría popups de forma asíncrona tras consultar la API, lo cual hacía que los navegadores modernos bloquearan la interfaz de pago por defecto.
- **Solución:** Se modificó la comunicación. El backend ahora retorna la URL directa de pago (`initPoint`) y el frontend redirige al usuario de manera limpia en la misma pestaña mediante `window.location.href`.

### 14. Endpoint de Webhook de Pruebas Locales (Bypass de Webhook)
- **Solución:** Se implementó un bypass seguro en `/webhook` para pruebas locales. Si recibe `isTest: true` en el cuerpo del request, procesa directamente la lógica del carrito ficticio suministrado (descontando stock y guardando la transacción en la hoja "Ventas") sin intentar conectarse con el servidor externo de Mercado Pago, facilitando el desarrollo local de punta a punta.
### 15. Sincronización Inteligente de Stock y Carrito en Frontend
- **Solución:** Se mejoró significativamente la lógica del carrito en `frontend/script.js`:
  - **Recuperación Visual de Stock:** Al remover un producto del carrito, el stock local del producto en la pantalla se recupera automáticamente (`product.Stock++`) de manera visual e inmediata.
  - **Sincronización al Recargar:** Al inicializar la tienda o cambiar de página, el sistema comprueba qué elementos están agregados al carrito (guardados en `localStorage`) y descuenta de forma visual ese stock antes de renderizar la lista, evitando que el usuario agregue más unidades de las disponibles reales de forma indebida.

### 16. Prevención de Ventas y Descuento de Stock Duplicados (Idempotencia y Concurrencia)
- **Problema:** Mercado Pago puede enviar múltiples notificaciones Webhook simultáneas o sucesivas para un mismo pago (por reintentos, transiciones de estado o webhooks paralelos). Si dos webhooks llegan exactamente al mismo tiempo (condición de carrera), la consulta a Google Sheets puede indicar que la venta no existe en ambos hilos, provocando registros duplicados y descuentos de stock redundantes.
- **Solución:** Se implementó una doble verificación:
  - **Bloqueo en Memoria (Concurrencia):** Se introdujo un `Set` en memoria (`processedSales` en `index.js`) que registra temporalmente los IDs de venta que se están procesando. Si llega otra petición para el mismo ID concurrentemente, se descarta de inmediato respondiendo `200 OK`. Los IDs se limpian automáticamente a los 10 minutos.
  - **Verificación en Base de Datos (Persistencia):** Mediante la función `checkVentaExiste(idVenta)` en `repository.js`, se verifica en la columna A de la hoja "Ventas" de Google Sheets que el ID no se haya guardado previamente en una ejecución anterior.

### 17. Persistencia de Paginación en Catálogo de Productos
- **Problema:** Al navegar a páginas avanzadas del catálogo (ej. página 2) y refrescar la pestaña (F5) o usar las flechas del navegador, la página se reseteaba regresando al inicio (página 1).
- **Solución:** Se integró la paginación con el historial de navegación:
  - Al cambiar de página, se actualiza dinámicamente el parámetro `?page=X` en la URL mediante `window.history.pushState`.
  - Al recargar la página, se recupera el número de página actual directamente desde la URL.
  - Se añadió soporte para `popstate` para sincronizar las vistas si el usuario usa los botones de navegación Atrás/Adelante del navegador.

### 18. Ocultación de Productos sin Stock en el Catálogo
- **Problema:** Los productos agotados en Google Sheets (Stock <= 0) seguían mostrándose en la tienda, ocupando espacio visual con un botón deshabilitado que impedía su compra.
- **Solución:** Se añadió un filtro dinámico en `fetchProducts` (`script.js`) para excluir de la lista principal a todos los productos cuyo stock de base de datos sea menor o igual a 0.

## Futuras Consideraciones Recomendadas
- **Base de Datos Transaccional:** Google Sheets no soporta transacciones (bloqueos de fila). Si la tienda crece y hay muchas compras simultáneas, dos personas podrían intentar comprar la misma unidad exacta al mismo tiempo y generarse inconsistencias. A futuro se recomienda migrar a una base de datos como PostgreSQL, MongoDB o MySQL.
- **Validación Estricta con Joi:** Implementar `joi` (el cual ya está instalado en las dependencias) para validar estructuradamente el carrito de compras (`req.body`) y garantizar que los precios e IDs no puedan ser manipulados de manera maliciosa por un cliente modificado.

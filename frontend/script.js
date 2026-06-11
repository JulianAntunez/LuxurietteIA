let productList = [];
let allProductsMaster = [];
let carrito = [];
let total = 0;
const urlParams = new URLSearchParams(window.location.search);
let currentPage = parseInt(urlParams.get('page')) || 1;
const itemsPerPage = 24;
const mp = new MercadoPago('APP_USR-aff751db-2be1-44d6-946e-b5d1255177a7', {
    locale: 'es-AR'
});

// Escuchar cambios de historial (botones atrás/adelante del navegador)
window.addEventListener('popstate', (event) => {
    if (event.state && event.state.page) {
        currentPage = event.state.page;
    } else {
        const params = new URLSearchParams(window.location.search);
        currentPage = parseInt(params.get('page')) || 1;
    }
    displayProducts();
});

// --- 1. FUNCIONES GLOBALES (ACCESIBLES DESDE EL HTML) ---

// Agregar al carrito
function add(productId, price) {
    const product = productList.find(p => p.Id === productId);
    if (product && product.Stock > 0) {
        product.Stock--;
        const existingProduct = carrito.find(item => item.id === productId);
        if (existingProduct) {
            existingProduct.quantity++;
        } else {
            carrito.push({
                id: productId,
                price: price,
                quantity: 1,
                nombre: product.Producto
            });
        }
        total += price;
        saveCart();
        updateCartDisplay();
        displayProducts(); // Actualizar interfaz para deshabilitar botón si se quedó en 0 stock
    }
}

// Cambiar imagen carrusel
function changeImage(productId, direction) {
    const product = productList.find(p => p.Id === productId);
    const images = [product.Img1, product.Img2, product.Img3].filter(Boolean);
    const imgElement = document.getElementById(`image-${productId}`);
    let currentImageIndex = images.indexOf(imgElement.src);

    if (direction === 'next') {
        currentImageIndex = (currentImageIndex + 1) % images.length;
    } else {
        currentImageIndex = (currentImageIndex - 1 + images.length) % images.length;
    }
    imgElement.src = images[currentImageIndex];
}

// Paginación
function changePage(page, event) {
    const totalPages = Math.ceil(productList.length / itemsPerPage);
    if (page < 1 || page > totalPages) return;
    if (event) event.preventDefault();
    currentPage = page;

    // Actualizar la URL con el número de página para que persista al recargar (F5)
    const url = new URL(window.location.href);
    url.searchParams.set('page', page);
    window.history.pushState({ page: page }, '', url.toString());

    displayProducts();
    const section = document.getElementById("page-content");
    if (section) section.scrollIntoView({ behavior: 'smooth' });
}

// Resetear búsqueda
function resetSearch() {
    if (document.getElementById('search-input')) document.getElementById('search-input').value = "";
    if (document.getElementById('search-input-mobile')) document.getElementById('search-input-mobile').value = "";
    displayProducts();
}

// --- 2. LÓGICA INTERNA DEL CARRITO ---

function updateCartDisplay() {
    const totalArticulos = carrito.reduce((acc, item) => acc + (item.quantity || 1), 0);
    const cartCountElement = document.querySelector(".cart-count");
    if (cartCountElement) {
        cartCountElement.textContent = totalArticulos;
        cartCountElement.style.display = totalArticulos > 0 ? "inline-block" : "none";
    }
    const checkoutElement = document.getElementById("checkout");
    if (checkoutElement) {
        checkoutElement.innerHTML = "Total: $ " + total.toFixed(2);
    }
    updateCartModal();
}

function updateCartModal() {
    const cartItems = document.getElementById("cart-items");
    const cartTotal = document.getElementById("cart-total");
    if (!cartItems || !cartTotal) return;

    cartItems.innerHTML = '';
    let totalModal = 0;

    carrito.forEach(item => {
        const product = allProductsMaster.find(p => p.Id == item.id);
        if (product) {
            const quantity = item.quantity || 1;
            const precio = parseFloat(product.Precio) || 0;
            const subtotal = quantity * precio;
            totalModal += subtotal;

            const li = document.createElement('li');
            li.innerHTML = `
                <a href="#product-${product.Id}" class="item-name-link" style="text-decoration: none; color: inherit;">
                    <span class="item-name">${product.Producto}</span>
                </a>
                <span class="item-price">${quantity} x $${precio.toFixed(2)}</span>
                <button class="btn-remove-item" data-id="${item.id}">❌</button>
            `;

            li.querySelector('.item-name-link').onclick = () => {
                document.getElementById("cart-modal").style.display = "none";
            };

            li.querySelector('.btn-remove-item').onclick = function (e) {
                e.stopPropagation();
                remove(String(this.getAttribute("data-id")));
            };
            cartItems.appendChild(li);
        }
    });
    cartTotal.textContent = `$${totalModal.toFixed(2)}`;
}

function remove(productId) {
    const index = carrito.findIndex(item => item.id === productId);
    if (index !== -1) {
        // Restaurar el stock local del producto en la pantalla si existe en productList
        const product = productList.find(p => p.Id === productId);
        if (product) {
            product.Stock++;
        }

        if (carrito[index].quantity > 1) {
            carrito[index].quantity--;
            total -= carrito[index].price;
        } else {
            total -= carrito[index].price;
            carrito.splice(index, 1);
        }
        saveCart();
        updateCartDisplay();
        displayProducts(); // Refrescar la pantalla para ver el stock recuperado
    }
}

function saveCart() { localStorage.setItem("cart", JSON.stringify(carrito)); }

function loadCart() {
    const savedCart = localStorage.getItem("cart");
    if (savedCart) {
        carrito = JSON.parse(savedCart);
        total = carrito.reduce((acc, item) => acc + (item.price * item.quantity), 0);
        updateCartDisplay();
    }
}

// --- 3. PROCESAMIENTO DE PRODUCTOS Y BUSCADOR ---

async function fetchProducts(type) {
    try {
        if (allProductsMaster.length === 0) {
            const resAll = await fetch('/api/all-products');
            allProductsMaster = await resAll.json();
        }
        
        let url = `/api/products/${type}`;
        if (type === 'ofertas') url = '/api/ofertas';
        
        const resType = await fetch(url);
        const rawProducts = await resType.json();

        // Ocultar productos sin stock de la lista principal
        productList = rawProducts.filter(p => Number(p.Stock) > 0);

        // Descontar del stock visual lo que ya tenemos agregado en el carrito al cargar la página
        carrito.forEach(cartItem => {
            const p = productList.find(prod => prod.Id === cartItem.id);
            if (p) {
                p.Stock = Math.max(0, p.Stock - (cartItem.quantity || 1));
            }
        });

        displayProducts();
    } catch (error) { console.error('Error:', error); }
}

function displayProducts() {
    const totalPages = Math.ceil(productList.length / itemsPerPage);
    if (currentPage > totalPages && totalPages > 0) {
        currentPage = totalPages;
    }
    const startIndex = (currentPage - 1) * itemsPerPage;
    renderProducts(productList.slice(startIndex, startIndex + itemsPerPage));
    updatePagination();
}

function searchProducts() {
    const dInput = document.getElementById('search-input');
    const mInput = document.getElementById('search-input-mobile');
    const term = (dInput?.value || mInput?.value || "").toLowerCase().trim();

    if (term === "") { displayProducts(); return; }

    const filtered = productList.filter(p => 
        (p.Producto?.toLowerCase() || "").includes(term) || 
        (p.Descripcion?.toLowerCase() || "").includes(term)
    );

    if (filtered.length === 0) {
        document.getElementById("page-content").innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: white; padding: 50px;"><h3>No se encontró "${term}"</h3><button class="button-add" onclick="resetSearch()">Ver todos</button></div>`;
        document.getElementById("pagination").innerHTML = "";
    } else {
        renderProducts(filtered);
        document.getElementById("pagination").innerHTML = "";
    }
}
function toggleSearch() {
    const searchBar = document.getElementById("mobile-search-bar");
    if (searchBar) {
        // Si tiene la clase d-none (oculto), se la quitamos. Si no, se la ponemos.
        if (searchBar.classList.contains("d-none")) {
            searchBar.classList.remove("d-none");
            // Opcional: poner el foco automáticamente en el input
            document.getElementById("search-input-mobile")?.focus();
        } else {
            searchBar.classList.add("d-none");
        }
    }
}
function renderProducts(lista) {
    let html = '';
    lista.forEach(p => {
        const precioBase = parseFloat(p.Precio) || 0;
        const descuento = parseFloat(p.P_Descuento) || 0;
        const precioFinal = descuento > 0 ? precioBase * (1 - descuento / 100) : precioBase;
        
        const badgeOferta = descuento > 0 
            ? `<div style="position: absolute; top: 10px; right: 10px; background-color: #ff4757; color: white; padding: 5px 10px; border-radius: 20px; font-weight: bold; z-index: 10; font-size: 0.9rem; box-shadow: 0 4px 10px rgba(255, 71, 87, 0.4);">🔥 ${descuento}% OFF</div>` 
            : '';

        const precioHtml = descuento > 0 
            ? `<h5 style="text-decoration: line-through; color: #a4b0be; margin: 0; font-size: 14px;">$ ${precioBase.toFixed(2)}</h5><h1 style="color: var(--accent-cyan); margin: 0;">$ ${precioFinal.toFixed(2)}</h1>`
            : `<h1>$ ${precioFinal.toFixed(2)}</h1>`;

        const buttonHtml = p.Stock > 0 
            ? `<button class="button-add" style="margin-top: 10px;" onclick="add('${p.Id}', ${precioFinal})">Agregar</button>`
            : `<button class="button-add-disabled" style="margin-top: 10px;" disabled>Sin Stock</button>`;

        html += `
            <div class="product-container" id="product-${p.Id}">
                <h3>${p.Producto || 'Sin nombre'}</h3>
                <div class="descr"><h4>${p.Descripcion || ''}</h4></div>
                <div class="carousel">
                    <div class="image-container">
                        ${badgeOferta}
                        <img src="${p.Img1 || ''}" alt="${p.Producto}" class="product-image" id="image-${p.Id}">
                        <div class="left-click-area" onclick="changeImage('${p.Id}', 'prev')"></div>
                        <div class="right-click-area" onclick="changeImage('${p.Id}', 'next')"></div>
                    </div>
                </div>
                <div class="product-footer">
                    ${precioHtml}
                    ${buttonHtml}
                </div>
            </div>`;
    });
    document.getElementById("page-content").innerHTML = html;
}

function updatePagination() {
    const totalPages = Math.ceil(productList.length / itemsPerPage);
    if (totalPages <= 1) { document.getElementById("pagination").innerHTML = ''; return; }
    let html = `<button class="page-link-custom" onclick="changePage(${currentPage - 1}, event)">&laquo;</button>`;
    for (let i = 1; i <= totalPages; i++) {
        html += `<button class="page-link-custom ${i === currentPage ? 'active' : ''}" onclick="changePage(${i}, event)">${i}</button>`;
    }
    html += `<button class="page-link-custom" onclick="changePage(${currentPage + 1}, event)">&raquo;</button>`;
    document.getElementById("pagination").innerHTML = html;
}

// --- 4. PAGO POR WHATSAPP ---

// async function pay() {
//     if (carrito.length === 0) return alert("Carrito vacío");
//     const btn = document.getElementById("checkout-button");
//     btn.disabled = true; btn.innerText = "Procesando...";

//     try {
//         const res = await fetch("/api/pay", { method: 'POST', body: JSON.stringify(carrito), headers: { 'Content-Type': 'application/json' } });
//         const result = await res.json();
//         if (!res.ok) throw new Error(result.error || "Error");

//         const lista = carrito.map(i => `- (${i.id}) ${i.nombre} x${i.quantity}`).join('%0A');
//         const mensaje = `¡Hola *Luxuriette*! Pedido: ${result.idVenta}%0A*Detalle:*%0A${lista}%0A*Total:* $${result.total.toFixed(2)}%0A_Coordinemos el envío._`;
        
//         window.open(`https://wa.me/5493757677266?text=${mensaje}`, '_blank');
//         carrito = []; total = 0; saveCart(); updateCartDisplay();
//         document.getElementById("cart-modal").style.display = "none";
//         location.reload(); 
//     } catch (e) { alert(e.message); } finally { btn.disabled = false; btn.innerText = "Pagar"; }
// }

// Inicializar Mercado Pago (Usa tu Public Key de prueba primero)
// const mp = new MercadoPago('TU_PUBLIC_KEY_AQUI', {
//     locale: 'es-AR'
// });

// async function pay() {
//     if (carrito.length === 0) return alert("Carrito vacío");
    
//     const btn = document.getElementById("checkout-button");
//     btn.disabled = true; 
//     btn.innerText = "Generando link de pago...";

//     try {
//         // 1. Llamamos a tu API (que modificaremos en el siguiente paso)
//         const res = await fetch("/api/pay", { 
//             method: 'POST', 
//             body: JSON.stringify(carrito), 
//             headers: { 'Content-Type': 'application/json' } 
//         });
        
//         const result = await res.json();
        
//         if (!res.ok) throw new Error(result.error || "Error al procesar");

//         // 2. Usar el checkout de Mercado Pago
//         // Esto abrirá la ventana de pago sobre tu sitio
//         mp.checkout({
//             preferenceId: result.preferenceId,
//             autoOpen: true 
//         });

//         // NOTA: No vaciamos el carrito aquí, 
//         // lo haremos cuando el pago sea exitoso.

//     } catch (e) { 
//         alert(e.message); 
//     } finally { 
//         btn.disabled = false; 
//         btn.innerText = "Pagar"; 
//     }
// }


function showPaymentMethodModal() {
    if (carrito.length === 0) return alert("Carrito vacío");
    
    let modal = document.getElementById("payment-method-modal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "payment-method-modal";
        modal.className = "payment-method-modal";
        modal.innerHTML = `
            <div class="payment-method-content">
                <h2>Selecciona el Método de Pago</h2>
                <div class="payment-options">
                    <button id="btn-pay-mp" class="btn-payment-option mp">
                        <span>💳 Mercado Pago</span>
                        <small>Pago online instantáneo</small>
                    </button>
                    <button id="btn-pay-cash" class="btn-payment-option cash">
                        <span>💵 Efectivo / Transferencia</span>
                        <small>Acordar y notificar por WhatsApp</small>
                    </button>
                </div>
                <button class="btn-cancel-payment" onclick="closePaymentMethodModal()">Cancelar</button>
            </div>
        `;
        document.body.appendChild(modal);

        // Estilos integrados del modal de selección de método de pago
        const style = document.createElement("style");
        style.innerHTML = `
            .payment-method-modal {
                display: none;
                position: fixed;
                z-index: 2000;
                left: 0;
                top: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.85);
                backdrop-filter: blur(10px);
                justify-content: center;
                align-items: center;
            }
            .payment-method-content {
                background: rgba(15, 23, 42, 0.95);
                border: 1px solid rgba(255, 0, 255, 0.3);
                box-shadow: 0 0 30px rgba(255, 0, 255, 0.2), 0 0 50px rgba(0, 242, 254, 0.1);
                border-radius: 20px;
                padding: 35px;
                width: 90%;
                max-width: 440px;
                text-align: center;
                color: white;
                position: relative;
            }
            .payment-method-content h2 {
                font-family: 'Outfit', sans-serif;
                margin-bottom: 25px;
                font-size: 1.6rem;
                background: linear-gradient(45deg, #00f2fe, #ff00ff);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                font-weight: bold;
            }
            .payment-options {
                display: flex;
                flex-direction: column;
                gap: 15px;
                margin-bottom: 25px;
            }
            .btn-payment-option {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 16px;
                border-radius: 12px;
                border: 1px solid rgba(255, 255, 255, 0.1);
                cursor: pointer;
                transition: all 0.3s ease;
                color: white;
            }
            .btn-payment-option.mp {
                background: linear-gradient(135deg, #009ee3, #007eb5);
            }
            .btn-payment-option.mp:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 20px rgba(0, 158, 227, 0.4);
            }
            .btn-payment-option.cash {
                background: linear-gradient(135deg, #10b981, #059669);
            }
            .btn-payment-option.cash:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 20px rgba(16, 185, 129, 0.4);
            }
            .btn-payment-option span {
                font-size: 1.15rem;
                font-weight: bold;
            }
            .btn-payment-option small {
                font-size: 0.8rem;
                opacity: 0.85;
                margin-top: 5px;
            }
            .btn-cancel-payment {
                background: transparent;
                border: none;
                color: #a0aec0;
                cursor: pointer;
                font-size: 0.95rem;
                transition: color 0.3s;
                margin-top: 10px;
                text-decoration: underline;
            }
            .btn-cancel-payment:hover {
                color: #fff;
            }
        `;
        document.head.appendChild(style);

        document.getElementById("btn-pay-mp").onclick = () => {
            closePaymentMethodModal();
            closeModal();
            payMercadoPago();
        };
        document.getElementById("btn-pay-cash").onclick = () => {
            closePaymentMethodModal();
            closeModal();
            payCash();
        };
    }
    modal.style.display = "flex";
}

function closePaymentMethodModal() {
    const modal = document.getElementById("payment-method-modal");
    if (modal) modal.style.display = "none";
}

async function payMercadoPago() {
    if (carrito.length === 0) return alert("Carrito vacío");

    const btn = document.getElementById("checkout-button");
    btn.disabled = true; 
    btn.innerText = "Generando link...";

    try {
        const res = await fetch("/api/pay", { 
            method: 'POST', 
            body: JSON.stringify(carrito), 
            headers: { 'Content-Type': 'application/json' } 
        });
        
        const result = await res.json();

        if (result.initPoint) {
            window.location.href = result.initPoint;
        } else if (result.preferenceId) {
            mp.checkout({
                preferenceId: result.preferenceId,
                autoOpen: true 
            });
        } else {
            alert("El servidor no devolvió un link de pago.");
        }
    } catch (e) {
        console.error("Error capturado:", e);
        alert("Error al conectar con Mercado Pago.");
    } finally {
        btn.disabled = false;
        btn.innerText = "Pagar";
    }
}

async function payCash() {
    if (carrito.length === 0) return alert("Carrito vacío");

    const btn = document.getElementById("checkout-button");
    btn.disabled = true;
    btn.innerText = "Procesando...";

    try {
        const res = await fetch("/api/pay-cash", { 
            method: 'POST', 
            body: JSON.stringify(carrito), 
            headers: { 'Content-Type': 'application/json' } 
        });
        
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Error");

        // Formatear mensaje para WhatsApp
        const lista = carrito.map(i => `- ${i.nombre} x${i.quantity}`).join('%0A');
        const mensaje = `¡Hola *Luxuriette*! Acabo de realizar un pedido.%0A*ID de Pedido:* ${result.idVenta}%0A*Método de Pago:* Efectivo / Transferencia%0A*Detalle:*%0A${lista}%0A*Total:* $${result.total.toFixed(2)}%0A_Coordinemos el pago y entrega._`;

        // Limpiar el carrito
        carrito = []; 
        total = 0; 
        saveCart(); 
        updateCartDisplay();

        // Abrir WhatsApp en pestaña nueva
        window.open(`https://wa.me/5493757677266?text=${mensaje}`, '_blank');
        
        alert(`¡Pedido en efectivo registrado! ID: ${result.idVenta}. Serás redirigido a WhatsApp para coordinar.`);
        location.reload();
    } catch (e) {
        alert("Error al procesar: " + e.message);
    } finally {
        btn.disabled = false;
        btn.innerText = "Pagar";
    }
}

// --- 5. INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
   
  // --- Inicialización del Modal de Edad con Validación Preventiva ---
  let myModal;
  const modalEl = document.getElementById('ageVerificationModal');
  if (modalEl && typeof bootstrap !== 'undefined') {
    if (localStorage.getItem('ageVerified') !== 'yes') {
      myModal = new bootstrap.Modal(modalEl);
      myModal.show();
    }
  }

  // Al hacer clic en "Sí, soy mayor"
  const btnAdulto = document.getElementById('btnAdulto');
  if (btnAdulto) {
    btnAdulto.addEventListener('click', function() {
      localStorage.setItem('ageVerified', 'yes'); // Guarda la confirmación
      if (myModal) myModal.hide(); // Oculta el modal solo si está definido
    });
  }

  // Al hacer clic en "No, soy menor"
  const btnMenor = document.getElementById('btnMenor');
  if (btnMenor) {
    btnMenor.addEventListener('click', function() {
      // Redirige a una página segura (ej. Google o una página informativa)
      window.location.href = 'https://www.google.com'; // Cambia por la URL deseada
    });
  }

    // 2. Carga Dinámica de Productos
    const container = document.getElementById("page-content");
    if (container) {
        let type = 1;
        const path = location.pathname.toLowerCase(); // Convertimos a minúsculas para evitar errores

        if (path.includes('juguetes')) type = 2;
        else if (path.includes('ropa')) type = 3;
        else if (path.includes('ofertas')) type = 'ofertas';

        fetchProducts(type);
    }

    // 3. Inicializar Carrito y Buscadores
    loadCart();

    document.getElementById('search-input')?.addEventListener('input', searchProducts);
    document.getElementById('search-input-mobile')?.addEventListener('input', searchProducts);

    // Vinculamos el botón de pago
    document.addEventListener("click", (e) => {
        if (e.target && e.target.id === "checkout-button") {
            showPaymentMethodModal();
        }
    });
    // 4. Lógica de Apertura del Carrito
    const cartIcon = document.getElementById("cart-icon");
    if (cartIcon) {
        cartIcon.onclick = (e) => {
            e.stopPropagation();
            const modal = document.getElementById("cart-modal");
            if (modal) {
                modal.style.display = "block";
                updateCartModal();
            }
        };
    }
});

// 5. FUNCIÓN PARA CERRAR EL MODAL (Agrégala fuera del DOMContentLoaded)
function closeModal() {
    const modal = document.getElementById("cart-modal");
    if (modal) modal.style.display = "none";
}
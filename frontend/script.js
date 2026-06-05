let productList = [];
let allProductsMaster = [];
let carrito = [];
let total = 0;
let currentPage = 1;
const itemsPerPage = 24;
const mp = new MercadoPago('APP_USR-aff751db-2be1-44d6-946e-b5d1255177a7', {
    locale: 'es-AR'
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
        productList = await resType.json();

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


async function pay() {
    console.log("Iniciando proceso de pago..."); // LOG 1
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
        console.log("Respuesta del servidor:", result); // LOG 2

        if (result.initPoint) {
            console.log("Redirigiendo a Mercado Pago:", result.initPoint); // LOG 3
            window.location.href = result.initPoint;
        } else if (result.preferenceId) {
            console.log("Abriendo Checkout con ID (fallback):", result.preferenceId); // LOG 3
            mp.checkout({
                preferenceId: result.preferenceId,
                autoOpen: true 
            });
        } else {
            alert("El servidor no devolvió un link de pago.");
        }
    } catch (e) {
        console.error("Error capturado:", e);
    } finally {
        btn.disabled = false;
        btn.innerText = "Pagar";
    }
}
// --- 5. INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
   
  let myModal;
  if (localStorage.getItem('ageVerified') !== 'yes') {
    // Muestra el modal al cargar la página
    myModal = new bootstrap.Modal(document.getElementById('ageVerificationModal'));
    myModal.show();
  }

  // Al hacer clic en "Sí, soy mayor"
  document.getElementById('btnAdulto').addEventListener('click', function() {
    localStorage.setItem('ageVerified', 'yes'); // Guarda la confirmación
    if (myModal) myModal.hide(); // Oculta el modal solo si está definido
    // Si usas WordPress, podrías tener un plugin que reaccione a esto, o podrías redirigir/cargar contenido principal aquí
  });

  // Al hacer clic en "No, soy menor"
  document.getElementById('btnMenor').addEventListener('click', function() {
    // Redirige a una página segura (ej. Google o una página informativa)
    window.location.href = 'https://www.google.com'; // Cambia por la URL deseada
  });

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
        pay();
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
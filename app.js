document.addEventListener('DOMContentLoaded', () => {
    const btnStartScan = document.getElementById('btn-start-scan');
    const btnStopScan = document.getElementById('btn-stop-scan');
    const form = document.getElementById('capture-form');
    const inputSku = document.getElementById('sku');
    const inputExpiryDate = document.getElementById('expiry-date');
    const toast = document.getElementById('toast');

    let html5QrcodeScanner = null;
    const btnManualEntry = document.getElementById('btn-manual-entry');

    // --- Función reutilizable para iniciar el escáner ---
    function startScanner() {
        // Limpiar campos del formulario antes de escanear
        inputSku.value = '';
        inputExpiryDate.value = '';
        document.getElementById('fefo-status').innerHTML = '';
        document.getElementById('desc-group').style.display = 'none';
        document.getElementById('quantity').value = '';

        btnStartScan.classList.add('hidden');
        btnStopScan.classList.remove('hidden');
        btnManualEntry.classList.remove('hidden');

        if (html5QrcodeScanner) {
            // Reusar instancia existente si la hay
            html5QrcodeScanner.start(
                { facingMode: "environment" },
                { fps: 10, qrbox: { width: 250, height: 250 } },
                onScanSuccess,
                onScanFailure
            ).catch(err => {
                console.error("Error reiniciando escáner", err);
                showManualForm();
            });
        } else {
            html5QrcodeScanner = new Html5Qrcode("reader");
            html5QrcodeScanner.start(
                { facingMode: "environment" },
                { fps: 10, qrbox: { width: 250, height: 250 } },
                onScanSuccess,
                onScanFailure
            ).catch(err => {
                console.error("Error iniciando escáner", err);
                alert("No se pudo acceder a la cámara. Revisa los permisos.");
                showManualForm();
            });
        }
    }

    // Mostrar formulario manual (sin cámara)
    function showManualForm() {
        btnStartScan.classList.remove('hidden');
        btnStopScan.classList.add('hidden');
        btnManualEntry.classList.add('hidden');
        inputSku.focus();
    }

    // Botón principal: iniciar escáner
    btnStartScan.addEventListener('click', startScanner);

    // Botón detener escáner manualmente
    btnStopScan.addEventListener('click', () => {
        stopScanner().then(() => showManualForm());
    });

    // Botón "Sin etiqueta / Carga Manual" (desde dentro del escáner)
    btnManualEntry.addEventListener('click', () => {
        stopScanner().then(() => showManualForm());
    });

    function stopScanner() {
        btnManualEntry.classList.add('hidden');
        if (html5QrcodeScanner) {
            return html5QrcodeScanner.stop().then(() => {
                btnStartScan.classList.remove('hidden');
                btnStopScan.classList.add('hidden');
            }).catch(err => console.error("Failed to stop scanner", err));
        }
        return Promise.resolve();
    }

    // productCatalog ahora se carga globalmente desde catalog.js

    // Callback cuando lee un código exitosamente
    function onScanSuccess(decodedText, decodedResult) {
        stopScanner();
        console.log(`Scan result: ${decodedText}`);
        
        try {
            // Ejemplo: 125435140513 000047 050426
            // Posiciones reales según CSV: 
            // 0-11: Lote/Prefijo (12 chars)
            // 12-17: SKU (6 chars)
            // 18-23: Fecha Vencimiento DDMMYY (6 chars)
            
            if (decodedText.length < 24) {
                throw new Error("Código muy corto");
            }

            // 1. Extraer SKU
            const skuRaw = decodedText.substring(12, 18);
            const sku = parseInt(skuRaw, 10).toString(); // Quitar ceros a la izquierda
            
            // 2. Extraer Fecha (Formato original DDMMYY -> Necesitamos YYYY-MM-DD para el input type="date")
            const dateRaw = decodedText.substring(18, 24);
            const day = dateRaw.substring(0, 2);
            const month = dateRaw.substring(2, 4);
            const year = "20" + dateRaw.substring(4, 6);
            const formattedDate = `${year}-${month}-${day}`;

            // 3. Asignar al formulario
            inputSku.value = sku;
            inputExpiryDate.value = formattedDate;

            // 4. Buscar descripción (efecto WOW)
            const product = productCatalog[sku];
            const productName = product ? product.description : "Producto Desconocido";
            const descGroup = document.getElementById('desc-group');
            const descInput = document.getElementById('description');
            
            descInput.value = productName;
            descGroup.style.display = 'flex';
            
            // Actualizar estado de fechas visual
            updateFefoStatus();

            // Mover el foco a cantidad
            document.getElementById('quantity').focus();
            
            // alert(`✅ Producto Identificado\n\nSKU: ${sku}\nProducto: ${productName}\nVencimiento: ${day}/${month}/${year}`);

        } catch (error) {
            console.error("Error parseando", error);
            alert("Formato de código no reconocido o ilegible. Por favor, intenta de nuevo o carga los datos manualmente.");
        }
    }

    function onScanFailure(error) {
        // html5-qrcode tira errores constantemente mientras intenta enfocar,
        // es mejor ignorarlos hasta que encuentre algo.
        // console.warn(`Code scan error = ${error}`);
    }

    // Actualizar descripción si se ingresa SKU a mano
    inputSku.addEventListener('input', (e) => {
        const sku = e.target.value;
        const descGroup = document.getElementById('desc-group');
        const descInput = document.getElementById('description');
        
        if (sku && productCatalog[sku]) {
            descInput.value = productCatalog[sku].description;
            descGroup.style.display = 'flex';
        } else {
            descGroup.style.display = 'none';
        }
    });

    // Calcular estado FEFO en tiempo real
    function updateFefoStatus() {
        const dateVal = inputExpiryDate.value;
        const statusDiv = document.getElementById('fefo-status');
        
        if (!dateVal) {
            statusDiv.innerHTML = '';
            return;
        }

        const captureDate = new Date();
        captureDate.setHours(0,0,0,0);
        const expiryDateObj = new Date(dateVal + "T12:00:00");
        expiryDateObj.setHours(0,0,0,0);
        
        const diffTime = expiryDateObj - captureDate;
        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (days < 30) {
            statusDiv.innerHTML = `❌ NO APTO: Faltan ${days} días`;
            statusDiv.style.color = 'var(--danger)';
        } else if (days <= 50) {
            statusDiv.innerHTML = `⚠️ ATENCIÓN: Faltan ${days} días`;
            statusDiv.style.color = 'var(--warning)';
        } else {
            statusDiv.innerHTML = `✅ OK: Faltan ${days} días`;
            statusDiv.style.color = 'var(--success)';
        }
    }

    inputExpiryDate.addEventListener('change', updateFefoStatus);

    // Manejo del formulario
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        let records = JSON.parse(localStorage.getItem('wms_records')) || [];
        
        // Obtener fecha de toma
        const captureDate = new Date();
        const expiryDateObj = new Date(document.getElementById('expiry-date').value + "T12:00:00");
        
        // Calcular días para vencer
        const diffTime = expiryDateObj - captureDate;
        const daysToExpiry = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        const product = productCatalog[document.getElementById('sku').value];
        const shelfLife = product ? product.shelfLife : 0;
        
        // Fecha elaboración (Vencimiento - shelfLife)
        let prodDateStr = "";
        if (shelfLife > 0) {
            const prodDateObj = new Date(expiryDateObj);
            prodDateObj.setDate(prodDateObj.getDate() - shelfLife);
            prodDateStr = prodDateObj.toISOString().split('T')[0];
        }

        const data = {
            id: Date.now().toString(), // ID único para borrar/editar
            sku: document.getElementById('sku').value,
            description: product ? product.description : "Desconocido",
            expiryDate: document.getElementById('expiry-date').value,
            daysToExpiry: daysToExpiry,
            productionDate: prodDateStr,
            quantity: document.getElementById('quantity').value,
            location: document.getElementById('location').value,
            timestamp: captureDate.toISOString()
        };
        
        records.push(data);
        localStorage.setItem('wms_records', JSON.stringify(records));
        
        // Actualizar la tabla si estuviera abierta
        renderHistoryTable();

        console.log("Guardando registro:", data);
        
        // Mostrar Toast
        toast.classList.remove('hidden');
        setTimeout(() => {
            toast.classList.add('hidden');
        }, 3000);
        
        // Limpiar formulario respetando los campos fijados
        const pinSku = document.getElementById('pin-sku').checked;

        if (!pinSku) {
            inputSku.value = '';
            document.getElementById('desc-group').style.display = 'none';
        }
        // La Ubicación no se borra, a petición del usuario.
        
        // Siempre limpiamos cantidad y fecha para la siguiente carga del mismo producto
        document.getElementById('quantity').value = '';
        inputExpiryDate.value = '';
        document.getElementById('fefo-status').innerHTML = ''; // Limpiar estado FEFO
        
        // ✅ Auto-reiniciar el escáner para la siguiente estiba
        startScanner();
    });

    // --- LÓGICA DE NAVEGACIÓN Y TABS ---
    const navBtns = document.querySelectorAll('.nav-btn');
    const viewScan = document.getElementById('view-scan');
    const viewHistory = document.getElementById('view-history');
    const viewFefo = document.getElementById('view-fefo');

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Actualizar botones
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Cambiar vista
            const target = btn.getAttribute('data-target');
            
            viewScan.style.display = 'none';
            viewHistory.style.display = 'none';
            if (viewFefo) viewFefo.style.display = 'none';

            if (target === 'view-scan') {
                viewScan.style.display = 'block';
            } else if (target === 'view-history') {
                viewHistory.style.display = 'block';
                renderHistoryTable(); // Renderizar al entrar
            } else if (target === 'view-fefo') {
                viewFefo.style.display = 'block';
                renderFefoTable();
            }
        });
    });

    // --- LÓGICA DE TABLA E HISTORIAL ---
    function renderHistoryTable() {
        const tbody = document.getElementById('history-tbody');
        tbody.innerHTML = '';
        
        const records = JSON.parse(localStorage.getItem('wms_records')) || [];
        
        if (records.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; color:var(--text-muted);">No hay registros en esta sesión</td></tr>';
            return;
        }

        // Mostrar del más reciente al más antiguo, manteniendo el índice original
        const reversedRecords = records.map((record, index) => ({ record, seq: index + 1 })).reverse();

        reversedRecords.forEach(({ record, seq }) => {
            const tr = document.createElement('tr');
            
            const d = new Date(record.timestamp);
            const timeStr = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
            const dateStr = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth()+1).toString().padStart(2, '0')}/${d.getFullYear().toString().substring(2)}`;
            
            const [y, m, day] = record.expiryDate.split('-');
            const expStr = `${day}/${m}/${y.substring(2)}`;
            
            // Lógica visual para la columna de Días Vencidos
            let daysHtml = '';
            if (record.daysToExpiry < 30) {
                daysHtml = `<span style="color: var(--danger); font-weight: bold;">${record.daysToExpiry} ❌</span>`;
            } else if (record.daysToExpiry <= 50) {
                daysHtml = `<span style="color: var(--warning); font-weight: bold;">${record.daysToExpiry} ⚠️</span>`;
            } else {
                daysHtml = `<span style="color: var(--success); font-weight: bold;">${record.daysToExpiry} ✅</span>`;
            }

            tr.innerHTML = `
                <td>${seq}</td>
                <td>${timeStr}</td>
                <td>${dateStr}</td>
                <td><strong>${record.sku}</strong></td>
                <td>${record.description}</td>
                <td>${expStr}</td>
                <td>${daysHtml}</td>
                <td>${record.quantity}</td>
                <td>${record.location}</td>
                <td>
                    <button class="btn btn-edit" data-id="${record.id}" style="padding: 0.2rem 0.4rem; font-size: 0.8rem; background: transparent; border: 1px solid var(--primary-color); color: var(--primary-color); border-radius: 4px; cursor: pointer; margin-right: 4px;">✏️</button>
                    <button class="btn btn-delete" data-id="${record.id}" style="padding: 0.2rem 0.4rem; font-size: 0.8rem; background: transparent; border: 1px solid var(--danger); color: var(--danger); border-radius: 4px; cursor: pointer;">🗑️</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Eventos para botones de edición y borrado
        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if(confirm("¿Seguro que deseas eliminar este registro?")) {
                    const id = e.currentTarget.getAttribute('data-id');
                    let currentRecords = JSON.parse(localStorage.getItem('wms_records')) || [];
                    currentRecords = currentRecords.filter(r => r.id !== id);
                    localStorage.setItem('wms_records', JSON.stringify(currentRecords));
                    renderHistoryTable();
                }
            });
        });

        document.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                let currentRecords = JSON.parse(localStorage.getItem('wms_records')) || [];
                const recordIndex = currentRecords.findIndex(r => r.id === id);
                
                if(recordIndex > -1) {
                    const rec = currentRecords[recordIndex];
                    const newQty = prompt(`Modificar Cantidad para SKU ${rec.sku}:`, rec.quantity);
                    if(newQty === null) return; // Cancelado
                    
                    const newLoc = prompt(`Modificar Ubicación para SKU ${rec.sku}:`, rec.location);
                    if(newLoc === null) return; // Cancelado
                    
                    if(newQty.trim() !== '' && !isNaN(newQty)) currentRecords[recordIndex].quantity = newQty;
                    if(newLoc.trim() !== '') currentRecords[recordIndex].location = newLoc;
                    
                    localStorage.setItem('wms_records', JSON.stringify(currentRecords));
                    renderHistoryTable();
                }
            });
        });
    }

    // --- LÓGICA DE TABLA FEFO (PRIORIDADES) ---
    function renderFefoTable() {
        const tbody = document.getElementById('fefo-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        const records = JSON.parse(localStorage.getItem('wms_records')) || [];
        if (records.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No hay registros</td></tr>';
            return;
        }

        // Ordenar por días para vencer (de menor a mayor)
        records.sort((a, b) => a.daysToExpiry - b.daysToExpiry);

        // Filtrar: Queremos los que tienen <= 50, Y solo las primeras 2 fechas únicas que son > 50
        const filteredRecords = [];
        const uniqueSafeDates = new Set();
        
        for (const r of records) {
            if (r.daysToExpiry <= 50) {
                filteredRecords.push(r);
            } else {
                uniqueSafeDates.add(r.expiryDate);
                if (uniqueSafeDates.size <= 2) {
                    filteredRecords.push(r);
                }
            }
        }

        filteredRecords.forEach(record => {
            const tr = document.createElement('tr');
            
            let priorHTML = '';
            let daysHtml = '';
            if (record.daysToExpiry < 30) {
                priorHTML = '<span style="color:var(--danger);font-weight:bold;">URGENTE ❌</span>';
                daysHtml = `<span style="color:var(--danger);font-weight:bold;">${record.daysToExpiry}</span>`;
            } else if (record.daysToExpiry <= 50) {
                priorHTML = '<span style="color:var(--warning);font-weight:bold;">ALTO ⚠️</span>';
                daysHtml = `<span style="color:var(--warning);font-weight:bold;">${record.daysToExpiry}</span>`;
            } else {
                priorHTML = '<span style="color:var(--success);font-weight:bold;">NORMAL ✅</span>';
                daysHtml = `<span style="color:var(--success);font-weight:bold;">${record.daysToExpiry}</span>`;
            }

            tr.innerHTML = `
                <td>${priorHTML}</td>
                <td><strong>${record.location}</strong></td>
                <td>${record.sku}</td>
                <td>${record.description}</td>
                <td><strong>${record.quantity}</strong></td>
                <td>${daysHtml}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    // Botón de imprimir
    const btnPrint = document.getElementById('btn-print');
    if (btnPrint) {
        btnPrint.addEventListener('click', () => {
            const d = new Date();
            document.getElementById('print-date').innerText = "Generado el: " + d.toLocaleDateString() + " a las " + d.getHours().toString().padStart(2,'0') + ":" + d.getMinutes().toString().padStart(2,'0');
            window.print();
        });
    }

    // --- EXPORTACIÓN A CSV ---
    document.getElementById('btn-export-csv').addEventListener('click', () => {
        const records = JSON.parse(localStorage.getItem('wms_records')) || [];
        if (records.length === 0) {
            alert("No hay registros para exportar.");
            return;
        }

        // Crear CSV (agregando las nuevas columnas de la Fase 3)
        let csvContent = "Secuencia,Fecha Toma,Hora Toma,SKU,Descripcion,Fecha Vencimiento,Dias para Vencer,Fecha Elaboracion,Cantidad,Ubicacion\n";
        
        records.forEach((r, index) => {
            const d = new Date(r.timestamp);
            const dateCap = `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
            const timeCap = `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
            
            const [y, m, day] = r.expiryDate.split('-');
            const expStr = `${day}/${m}/${y}`; // YYYY para excel
            
            let prodStr = "";
            if (r.productionDate) {
                const [py, pm, pd] = r.productionDate.split('-');
                prodStr = `${pd}/${pm}/${py}`;
            }

            const safeDesc = r.description ? r.description.replace(/,/g, '') : '';
            
            csvContent += `${index + 1},${dateCap},${timeCap},${r.sku},${safeDesc},${expStr},${r.daysToExpiry},${prodStr},${r.quantity},${r.location}\n`;
        });

        // Descargar archivo
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `Inventario_WMS_${new Date().getTime()}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    // --- LIMPIAR SESIÓN ---
    document.getElementById('btn-clear-history').addEventListener('click', () => {
        if (confirm("¿Estás seguro de que quieres borrar todos los registros de la tablet? Asegúrate de haber exportado a Excel primero.")) {
            localStorage.removeItem('wms_records');
            renderHistoryTable();
            alert("Sesión limpiada correctamente.");
        }
    });

});

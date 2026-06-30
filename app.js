// ============================================================
// --- FUNCIONES GLOBALES DE UMBRALES FEFO ---
// ============================================================
function getFefoThresholds() {
    const stored = localStorage.getItem('wms_fefo_thresholds');
    if (stored) return JSON.parse(stored);
    return { urgent: 30, warning: 50 };
}
function saveFefoThresholds(thresholds) {
    localStorage.setItem('wms_fefo_thresholds', JSON.stringify(thresholds));
}

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
        inputSku.value = '';
        inputExpiryDate.value = '';
        document.getElementById('fefo-status').innerHTML = '';
        document.getElementById('desc-group').style.display = 'none';
        document.getElementById('quantity').value = '';

        btnStartScan.classList.add('hidden');
        btnStopScan.classList.remove('hidden');
        btnManualEntry.classList.remove('hidden');

        if (html5QrcodeScanner) {
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
                showCustomAlert("No se pudo acceder a la cámara. Revisa los permisos.");
                showManualForm();
            });
        }
    }

    function showManualForm() {
        btnStartScan.classList.remove('hidden');
        btnStopScan.classList.add('hidden');
        btnManualEntry.classList.add('hidden');
        inputSku.focus();
    }

    btnStartScan.addEventListener('click', startScanner);

    btnStopScan.addEventListener('click', () => {
        stopScanner().then(() => showManualForm());
    });

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

    function onScanSuccess(decodedText, decodedResult) {
        stopScanner();
        console.log(`Scan result: ${decodedText}`);
        
        try {
            if (decodedText.length < 24) {
                throw new Error("Código muy corto");
            }

            const skuRaw = decodedText.substring(12, 18);
            const sku = parseInt(skuRaw, 10).toString();
            
            const dateRaw = decodedText.substring(18, 24);
            const day = dateRaw.substring(0, 2);
            const month = dateRaw.substring(2, 4);
            const year = "20" + dateRaw.substring(4, 6);
            const formattedDate = `${year}-${month}-${day}`;

            inputSku.value = sku;
            inputExpiryDate.value = formattedDate;

            const product = getCatalog()[sku];
            const productName = product ? product.description : "Producto Desconocido";
            const descGroup = document.getElementById('desc-group');
            const descInput = document.getElementById('description');
            
            descInput.value = productName;
            descGroup.style.display = 'flex';
            
            updateFefoStatus();
            document.getElementById('quantity').focus();

        } catch (error) {
            console.error("Error parseando", error);
            showCustomAlert("Formato de código no reconocido o ilegible. Por favor, intenta de nuevo o carga los datos manualmente.");
        }
    }

    function onScanFailure(error) {
        // Ignorar errores de escaneo en curso
    }

    inputSku.addEventListener('input', (e) => {
        const sku = e.target.value;
        const descGroup = document.getElementById('desc-group');
        const descInput = document.getElementById('description');
        
        if (sku && getCatalog()[sku]) {
            descInput.value = getCatalog()[sku].description;
            descGroup.style.display = 'flex';
        } else {
            descGroup.style.display = 'none';
        }
    });

    // Calcular estado FEFO en tiempo real usando umbrales configurables
    function updateFefoStatus() {
        const dateVal = inputExpiryDate.value;
        const statusDiv = document.getElementById('fefo-status');
        
        if (!dateVal) {
            statusDiv.innerHTML = '';
            return;
        }

        const { urgent, warning } = getFefoThresholds();
        const captureDate = new Date();
        captureDate.setHours(0,0,0,0);
        const expiryDateObj = new Date(dateVal + "T12:00:00");
        expiryDateObj.setHours(0,0,0,0);
        
        const diffTime = expiryDateObj - captureDate;
        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (days < urgent) {
            statusDiv.innerHTML = `❌ NO APTO: Faltan ${days} días`;
            statusDiv.style.color = 'var(--danger)';
        } else if (days <= warning) {
            statusDiv.innerHTML = `⚠️ ATENCIÓN: Faltan ${days} días`;
            statusDiv.style.color = 'var(--warning)';
        } else {
            statusDiv.innerHTML = `✅ OK: Faltan ${days} días`;
            statusDiv.style.color = 'var(--success)';
        }
    }

    inputExpiryDate.addEventListener('change', updateFefoStatus);

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        let records = JSON.parse(localStorage.getItem('wms_records')) || [];
        
        const captureDate = new Date();
        const expiryDateObj = new Date(document.getElementById('expiry-date').value + "T12:00:00");
        
        const diffTime = expiryDateObj - captureDate;
        const daysToExpiry = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        const product = getCatalog()[document.getElementById('sku').value];
        const shelfLife = product ? product.shelfLife : 0;
        
        let prodDateStr = "";
        if (shelfLife > 0) {
            const prodDateObj = new Date(expiryDateObj);
            prodDateObj.setDate(prodDateObj.getDate() - shelfLife);
            prodDateStr = prodDateObj.toISOString().split('T')[0];
        }

        const data = {
            id: Date.now().toString(),
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
        
        renderHistoryTable();

        toast.classList.remove('hidden');
        setTimeout(() => {
            toast.classList.add('hidden');
        }, 3000);
        
        const pinSku = document.getElementById('pin-sku').checked;

        if (!pinSku) {
            inputSku.value = '';
            document.getElementById('desc-group').style.display = 'none';
        }
        
        document.getElementById('quantity').value = '';
        inputExpiryDate.value = '';
        document.getElementById('fefo-status').innerHTML = '';
        
        startScanner();
    });

    // --- LÓGICA DE NAVEGACIÓN Y TABS ---
    const navBtns = document.querySelectorAll('.nav-btn');
    const viewScan = document.getElementById('view-scan');
    const viewHistory = document.getElementById('view-history');
    const viewFefo = document.getElementById('view-fefo');
    const viewCatalog = document.getElementById('view-catalog');

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const target = btn.getAttribute('data-target');
            
            viewScan.style.display = 'none';
            viewHistory.style.display = 'none';
            if (viewFefo) viewFefo.style.display = 'none';
            if (viewCatalog) viewCatalog.style.display = 'none';

            if (target === 'view-scan') {
                viewScan.style.display = 'block';
            } else if (target === 'view-history') {
                viewHistory.style.display = 'block';
                renderHistoryTable();
            } else if (target === 'view-fefo') {
                viewFefo.style.display = 'block';
                renderFefoTable();
            } else if (target === 'view-catalog') {
                viewCatalog.style.display = 'block';
                renderThresholdSettings();
                const si = document.getElementById('catalog-search');
                if (si) si.value = '';
                renderCatalogList('');
            }
        });
    });

    // --- LÓGICA DE TABLA E HISTORIAL ---
    function renderHistoryTable() {
        const tbody = document.getElementById('history-tbody');
        tbody.innerHTML = '';
        
        const rawRecords = JSON.parse(localStorage.getItem('wms_records')) || [];
        const records = groupRecords(rawRecords);
        
        if (records.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:var(--text-muted);">No hay registros en esta sesión</td></tr>';
            return;
        }

        const { urgent, warning } = getFefoThresholds();
        const reversedRecords = records.reverse();

        reversedRecords.forEach((record, index) => {
            const tr = document.createElement('tr');
            const seq = index + 1;
            
            const d = new Date(record.timestamp);
            const timeStr = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
            const dateStr = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth()+1).toString().padStart(2, '0')}/${d.getFullYear().toString().substring(2)}`;
            
            const [y, m, day] = record.expiryDate.split('-');
            const expStr = `${day}/${m}/${y.substring(2)}`;
            
            let daysHtml = '';
            if (record.daysToExpiry < urgent) {
                daysHtml = `<span style="color: var(--danger); font-weight: bold;">${record.daysToExpiry} ❌</span>`;
            } else if (record.daysToExpiry <= warning) {
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
                <td><strong>${record.quantity}</strong></td>
                <td style="font-size: 0.85em; white-space: pre-wrap;">${record.location}</td>
                <td>
                    <button class="btn btn-edit" data-sku="${record.sku}" data-date="${record.expiryDate}" style="padding: 0.2rem 0.4rem; font-size: 0.8rem; background: transparent; border: 1px solid var(--primary-color); color: var(--primary-color); border-radius: 4px; cursor: pointer; margin-right: 4px;">✏️</button>
                    <button class="btn btn-delete" data-sku="${record.sku}" data-date="${record.expiryDate}" style="padding: 0.2rem 0.4rem; font-size: 0.8rem; background: transparent; border: 1px solid var(--danger); color: var(--danger); border-radius: 4px; cursor: pointer;">🗑️</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const sku = e.currentTarget.getAttribute('data-sku');
                const date = e.currentTarget.getAttribute('data-date');
                if(await showCustomConfirm("¿Seguro que deseas eliminar TODOS los registros de este producto con esta fecha de vencimiento?")) {
                    let currentRecords = JSON.parse(localStorage.getItem('wms_records')) || [];
                    currentRecords = currentRecords.filter(r => !(r.sku === sku && r.expiryDate === date));
                    localStorage.setItem('wms_records', JSON.stringify(currentRecords));
                    renderHistoryTable();
                }
            });
        });

        document.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const sku = e.currentTarget.getAttribute('data-sku');
                const date = e.currentTarget.getAttribute('data-date');
                let currentRecords = JSON.parse(localStorage.getItem('wms_records')) || [];
                
                const groupRecordsList = currentRecords.filter(r => r.sku === sku && r.expiryDate === date);
                if (groupRecordsList.length === 0) return;
                
                const currentTotalQty = groupRecordsList.reduce((sum, r) => sum + parseInt(r.quantity, 10), 0);
                
                const newQtyStr = await showCustomPrompt(`Modificar Cantidad Total para SKU ${sku}:`, currentTotalQty.toString());
                if (newQtyStr === null) return;
                const newQty = parseInt(newQtyStr, 10);
                if (isNaN(newQty) || newQty <= 0) {
                    showCustomAlert("Cantidad inválida.");
                    return;
                }
                
                const newLoc = await showCustomPrompt(`Ubicación para la nueva cantidad consolidada:`, groupRecordsList[0].location || '');
                if (newLoc === null) return;

                currentRecords = currentRecords.filter(r => !(r.sku === sku && r.expiryDate === date));
                
                const consolidatedRecord = {
                    id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                    sku: sku,
                    description: groupRecordsList[0].description,
                    expiryDate: date,
                    daysToExpiry: groupRecordsList[0].daysToExpiry,
                    quantity: newQtyStr,
                    location: newLoc,
                    timestamp: new Date().toISOString()
                };
                currentRecords.push(consolidatedRecord);
                
                localStorage.setItem('wms_records', JSON.stringify(currentRecords));
                renderHistoryTable();
            });
        });
    }

    // --- LÓGICA DE TABLA FEFO (PRIORIDADES) ---
    function renderFefoTable() {
        const tbody = document.getElementById('fefo-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        const rawRecords = JSON.parse(localStorage.getItem('wms_records')) || [];
        const records = groupRecords(rawRecords);
        if (records.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No hay registros</td></tr>';
            return;
        }

        const { urgent, warning } = getFefoThresholds();

        records.sort((a, b) => a.daysToExpiry - b.daysToExpiry);

        const filteredRecords = [];
        const uniqueSafeDates = new Set();
        
        for (const r of records) {
            if (r.daysToExpiry <= warning) {
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
            if (record.daysToExpiry < urgent) {
                priorHTML = '<span style="color:var(--danger);font-weight:bold;">URGENTE ❌</span>';
                daysHtml = `<span style="color:var(--danger);font-weight:bold;">${record.daysToExpiry}</span>`;
            } else if (record.daysToExpiry <= warning) {
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

    const btnPrint = document.getElementById('btn-print');
    if (btnPrint) {
        btnPrint.addEventListener('click', () => {
            const d = new Date();
            document.getElementById('print-date').innerText = "Generado el: " + d.toLocaleDateString() + " a las " + d.getHours().toString().padStart(2,'0') + ":" + d.getMinutes().toString().padStart(2,'0');
            window.print();
        });
    }

    // --- FUNCIONES DE EXPORTACIÓN ---
    function buildCSVContent() {
        const rawRecords = JSON.parse(localStorage.getItem('wms_records')) || [];
        const records = groupRecords(rawRecords);
        if (records.length === 0) return null;

        let csv = "Secuencia,Fecha Toma,Hora Toma,SKU,Descripcion,Fecha Vencimiento,Dias para Vencer,Fecha Elaboracion,Cantidad,Ubicacion\n";
        records.forEach((r, index) => {
            const d = new Date(r.timestamp);
            const dateCap = `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
            const timeCap = `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
            const [y, m, day] = r.expiryDate.split('-');
            const expStr = `${day}/${m}/${y}`;
            let prodStr = "";
            if (r.productionDate) {
                const [py, pm, pd] = r.productionDate.split('-');
                prodStr = `${pd}/${pm}/${py}`;
            }
            const safeDesc = r.description ? `"${r.description.replace(/"/g, '""')}"` : '';
            const safeLoc = r.location ? `"${r.location.replace(/"/g, '""')}"` : '';
            csv += `${index + 1},${dateCap},${timeCap},${r.sku},${safeDesc},${expStr},${r.daysToExpiry},${prodStr},${r.quantity},${safeLoc}\n`;
        });
        return csv;
    }

    function getDateFilename() {
        const d = new Date();
        return `${d.getDate().toString().padStart(2,'0')}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getFullYear()}`;
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    document.getElementById('btn-export-csv').addEventListener('click', () => {
        const csv = buildCSVContent();
        if (!csv) { showCustomAlert("No hay registros para exportar."); return; }
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        downloadBlob(blob, `Inventario_WMS_${getDateFilename()}.csv`);
    });

    document.getElementById('btn-share-csv').addEventListener('click', async () => {
        const csv = buildCSVContent();
        if (!csv) { showCustomAlert("No hay registros para compartir."); return; }
        const filename = `Inventario_WMS_${getDateFilename()}.csv`;
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const file = new File([blob], filename, { type: 'text/csv' });

        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    title: 'Inventario WMS Bodega',
                    text: `Inventario de vencimientos del ${new Date().toLocaleDateString('es-AR')}`,
                    files: [file]
                });
            } catch (err) {
                if (err.name !== 'AbortError') downloadBlob(blob, filename);
            }
        } else {
            downloadBlob(blob, filename);
            alert("Función de compartir no disponible en este navegador. El archivo fue descargado, adjuntalo manualmente al correo.");
        }
    });

    document.getElementById('btn-share-fefo').addEventListener('click', async () => {
        const rawRecords = JSON.parse(localStorage.getItem('wms_records')) || [];
        const records = groupRecords(rawRecords);
        if (records.length === 0) { showCustomAlert("No hay registros en el Reporte FEFO."); return; }

        if (!window.jspdf) { showCustomAlert("Librería PDF no disponible. Verificá tu conexión e intentá de nuevo."); return; }

        const { urgent, warning } = getFefoThresholds();
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const dateStr = new Date().toLocaleDateString('es-AR');
        const timeStr = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, 210, 297, 'F');

        doc.setFillColor(30, 64, 175);
        doc.rect(0, 0, 210, 28, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Reporte FEFO - Prioridad de Salida', 105, 12, { align: 'center' });
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Generado el ${dateStr} a las ${timeStr}`, 105, 21, { align: 'center' });

        records.sort((a, b) => a.daysToExpiry - b.daysToExpiry);
        const filteredRecords = [];
        const uniqueSafeDates = new Set();
        for (const r of records) {
            if (r.daysToExpiry <= warning) {
                filteredRecords.push(r);
            } else {
                uniqueSafeDates.add(r.expiryDate);
                if (uniqueSafeDates.size <= 2) filteredRecords.push(r);
            }
        }

        let y = 38;
        const cols = { x: [10, 38, 65, 85, 160, 178], headers: ['Prioridad', 'Ubicación', 'SKU', 'Descripción', 'Cant.', 'Días'] };
        doc.setFillColor(241, 245, 249);
        doc.rect(10, y - 5, 190, 8, 'F');
        doc.setTextColor(71, 85, 105);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        cols.headers.forEach((h, i) => doc.text(h, cols.x[i], y));
        y += 3;
        doc.setDrawColor(203, 213, 225);
        doc.line(10, y, 200, y);
        y += 5;

        doc.setFont('helvetica', 'normal');
        filteredRecords.forEach((record, idx) => {
            if (y > 275) { doc.addPage(); y = 20; }

            if (idx % 2 === 0) {
                doc.setFillColor(248, 250, 252);
                doc.rect(10, y - 4, 190, 7, 'F');
            }

            let label, cr, cg, cb;
            if (record.daysToExpiry < urgent)       { label = 'URGENTE ❌'; [cr,cg,cb] = [220, 38, 38]; }
            else if (record.daysToExpiry <= warning)  { label = 'ALTO ⚠️';   [cr,cg,cb] = [217, 119, 6]; }
            else                                      { label = 'NORMAL ✅'; [cr,cg,cb] = [5, 150, 105]; }

            doc.setTextColor(cr, cg, cb);
            doc.setFontSize(8);
            doc.text(label, cols.x[0], y);

            doc.setTextColor(30, 41, 59);
            doc.text(String(record.location || '-'), cols.x[1], y);
            doc.text(String(record.sku || '-'), cols.x[2], y);
            const desc = record.description ? record.description.substring(0, 38) : '-';
            doc.text(desc, cols.x[3], y);
            doc.text(String(record.quantity || ''), cols.x[4], y);
            doc.setTextColor(cr, cg, cb);
            doc.setFont('helvetica', 'bold');
            doc.text(String(record.daysToExpiry), cols.x[5], y);
            doc.setFont('helvetica', 'normal');

            y += 7;
        });

        doc.setTextColor(148, 163, 184);
        doc.setFontSize(7);
        doc.text('WMS Control de Vencimientos en Bodega', 105, 290, { align: 'center' });

        const pdfBlob = doc.output('blob');
        const filename = `ReporteFEFO_${getDateFilename()}.pdf`;
        const file = new File([pdfBlob], filename, { type: 'application/pdf' });

        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    title: 'Reporte FEFO WMS',
                    text: `Reporte de prioridades de salida del ${dateStr}`,
                    files: [file]
                });
            } catch (err) {
                if (err.name !== 'AbortError') downloadBlob(pdfBlob, filename);
            }
        } else {
            downloadBlob(pdfBlob, filename);
            alert("Función de compartir no disponible en este navegador. El PDF fue descargado, adjuntalo manualmente al correo.");
        }
    });

    // --- LIMPIAR SESIÓN ---
    document.getElementById('btn-clear-history').addEventListener('click', async () => {
        if (await showCustomConfirm("¿Estás seguro de que quieres borrar todos los registros de la tablet? Asegúrate de haber exportado a Excel primero.")) {
            localStorage.removeItem('wms_records');
            renderHistoryTable();
            showCustomAlert("Sesión limpiada correctamente.");
        }
    });

    // --- CATÁLOGO: buscar y agregar ---
    const searchInput = document.getElementById('catalog-search');
    if (searchInput) {
        searchInput.addEventListener('input', () => renderCatalogList(searchInput.value));
    }

    const btnNewSku = document.getElementById('btn-new-sku');
    if (btnNewSku) {
        btnNewSku.addEventListener('click', async () => {
            const sku = await showCustomPrompt('Código SKU nuevo:', '');
            if (!sku || !sku.trim()) return;
            const catalog = getCatalog();
            if (catalog[sku.trim()]) { showCustomAlert('Ese SKU ya existe. Usa el botón de editar.'); return; }
            const desc = await showCustomPrompt('Descripción del producto:', '');
            if (desc === null) return;
            const lifeStr = await showCustomPrompt('Días de vida útil (0 = sin control):', '180');
            if (lifeStr === null) return;
            const life = parseInt(lifeStr, 10);
            if (isNaN(life) || life < 0) { showCustomAlert('Valor inválido.'); return; }
            catalog[sku.trim()] = { description: desc.trim(), shelfLife: life };
            saveCatalog(catalog);
            const si = document.getElementById('catalog-search');
            renderCatalogList(si ? si.value : '');
        });
    }

    // --- UMBRALES: guardar ---
    const btnSaveThresholds = document.getElementById('btn-save-thresholds');
    if (btnSaveThresholds) {
        btnSaveThresholds.addEventListener('click', async () => {
            const urgentVal = parseInt(document.getElementById('threshold-urgent').value, 10);
            const warningVal = parseInt(document.getElementById('threshold-warning').value, 10);
            if (isNaN(urgentVal) || isNaN(warningVal) || urgentVal < 1 || warningVal < 1) {
                showCustomAlert('Los valores deben ser números mayores a 0.');
                return;
            }
            if (urgentVal >= warningVal) {
                showCustomAlert('El límite URGENTE debe ser menor al límite ATENCIÓN.');
                return;
            }
            saveFefoThresholds({ urgent: urgentVal, warning: warningVal });
            showCustomAlert(`✅ Umbrales guardados:\n❌ URGENTE: menos de ${urgentVal} días\n⚠️ ATENCIÓN: entre ${urgentVal} y ${warningVal} días\n✅ OK: más de ${warningVal} días`);
        });
    }

});

// ============================================================
// --- MODALES PERSONALIZADOS ---
// ============================================================
function showCustomAlert(message) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('custom-modal-overlay');
        const titleEl = document.getElementById('custom-modal-title');
        const msgEl = document.getElementById('custom-modal-message');
        const btnCancel = document.getElementById('custom-modal-cancel');
        const btnConfirm = document.getElementById('custom-modal-confirm');
        const inputContainer = document.getElementById('custom-modal-input-container');

        titleEl.innerText = "Información";
        msgEl.innerText = message;
        inputContainer.classList.add('hidden');
        btnCancel.classList.add('hidden');
        
        btnConfirm.onclick = () => {
            overlay.classList.add('hidden');
            resolve();
        };

        overlay.classList.remove('hidden');
    });
}

function showCustomConfirm(message) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('custom-modal-overlay');
        const titleEl = document.getElementById('custom-modal-title');
        const msgEl = document.getElementById('custom-modal-message');
        const btnCancel = document.getElementById('custom-modal-cancel');
        const btnConfirm = document.getElementById('custom-modal-confirm');
        const inputContainer = document.getElementById('custom-modal-input-container');

        titleEl.innerText = "Confirmar Acción";
        msgEl.innerText = message;
        inputContainer.classList.add('hidden');
        btnCancel.classList.remove('hidden');
        
        btnCancel.onclick = () => {
            overlay.classList.add('hidden');
            resolve(false);
        };
        btnConfirm.onclick = () => {
            overlay.classList.add('hidden');
            resolve(true);
        };

        overlay.classList.remove('hidden');
    });
}

function showCustomPrompt(message, defaultValue = "") {
    return new Promise((resolve) => {
        const overlay = document.getElementById('custom-modal-overlay');
        const titleEl = document.getElementById('custom-modal-title');
        const msgEl = document.getElementById('custom-modal-message');
        const btnCancel = document.getElementById('custom-modal-cancel');
        const btnConfirm = document.getElementById('custom-modal-confirm');
        const inputContainer = document.getElementById('custom-modal-input-container');
        const inputEl = document.getElementById('custom-modal-input');

        titleEl.innerText = "Ingresar Datos";
        msgEl.innerText = message;
        inputEl.value = defaultValue;
        inputContainer.classList.remove('hidden');
        btnCancel.classList.remove('hidden');
        
        btnCancel.onclick = () => {
            overlay.classList.add('hidden');
            resolve(null);
        };
        btnConfirm.onclick = () => {
            overlay.classList.add('hidden');
            resolve(inputEl.value);
        };

        overlay.classList.remove('hidden');
        setTimeout(() => inputEl.focus(), 100);
    });
}

// ============================================================
// --- AGRUPAMIENTO (SKU + Fecha) ---
// ============================================================
function groupRecords(records) {
    const map = new Map();
    records.forEach(r => {
        const key = r.sku + "_" + r.expiryDate;
        if (!map.has(key)) {
            const grouped = JSON.parse(JSON.stringify(r));
            grouped.locationMap = new Map();
            if(r.location) {
                grouped.locationMap.set(r.location, parseInt(r.quantity, 10));
            }
            grouped.quantity = parseInt(r.quantity, 10);
            map.set(key, grouped);
        } else {
            const grouped = map.get(key);
            grouped.quantity += parseInt(r.quantity, 10);
            if(r.location) {
                const currentQty = grouped.locationMap.get(r.location) || 0;
                grouped.locationMap.set(r.location, currentQty + parseInt(r.quantity, 10));
            }
        }
    });

    const groupedArray = Array.from(map.values());
    groupedArray.forEach(g => {
        if (g.locationMap && g.locationMap.size > 0) {
            let locStrings = [];
            for (let [loc, qty] of g.locationMap) {
                locStrings.push(`${loc} (${qty})`);
            }
            g.location = locStrings.join(", ");
        }
    });
    return groupedArray;
}

// ============================================================
// --- GESTIÓN DE CATÁLOGO DE SKUs ---
// ============================================================
function getCatalog() {
    const stored = localStorage.getItem('wms_catalog');
    if (stored) return JSON.parse(stored);
    const migrated = {};
    for (const [sku, data] of Object.entries(productCatalog)) {
        migrated[sku] = { description: data.description, shelfLife: data.shelfLife };
    }
    localStorage.setItem('wms_catalog', JSON.stringify(migrated));
    return migrated;
}

function saveCatalog(catalog) {
    localStorage.setItem('wms_catalog', JSON.stringify(catalog));
}

function renderThresholdSettings() {
    const { urgent, warning } = getFefoThresholds();
    const urgentInput = document.getElementById('threshold-urgent');
    const warningInput = document.getElementById('threshold-warning');
    if (urgentInput) urgentInput.value = urgent;
    if (warningInput) warningInput.value = warning;
}

function renderCatalogList(filter = '') {
    const catalog = getCatalog();
    const container = document.getElementById('catalog-list');
    if (!container) return;
    container.innerHTML = '';

    const entries = Object.entries(catalog)
        .filter(([sku, data]) => {
            const q = filter.toLowerCase();
            return sku.toLowerCase().includes(q) || data.description.toLowerCase().includes(q);
        })
        .sort((a, b) => a[0].localeCompare(b[0]));

    if (entries.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:var(--text-muted);">No se encontraron SKUs</p>';
        return;
    }

    entries.forEach(([sku, data]) => {
        const card = document.createElement('div');
        card.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:0.7rem 0.8rem;background:var(--bg-dark);border:1px solid var(--border-color);border-radius:8px;gap:0.5rem;';
        card.innerHTML = `
            <div style="flex:1;min-width:0;">
                <div style="font-weight:600;font-size:0.9rem;">${sku}</div>
                <div style="font-size:0.78rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${data.description}</div>
                <div style="font-size:0.75rem;color:var(--primary);">Vida útil: ${data.shelfLife > 0 ? data.shelfLife + ' días' : 'Sin control'}</div>
            </div>
            <div style="display:flex;gap:4px;flex-shrink:0;">
                <button data-sku="${sku}" class="cat-edit-btn" style="padding:0.25rem 0.45rem;background:transparent;border:1px solid var(--primary);color:var(--primary);border-radius:6px;cursor:pointer;font-size:0.8rem;">&#9999;&#65039;</button>
                <button data-sku="${sku}" class="cat-del-btn" style="padding:0.25rem 0.45rem;background:transparent;border:1px solid var(--danger);color:var(--danger);border-radius:6px;cursor:pointer;font-size:0.8rem;">&#128465;&#65039;</button>
            </div>`;
        container.appendChild(card);
    });

    container.querySelectorAll('.cat-edit-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const sku = btn.getAttribute('data-sku');
            const catalog = getCatalog();
            const current = catalog[sku];
            const newDesc = await showCustomPrompt('Descripción para SKU ' + sku + ':', current.description);
            if (newDesc === null) return;
            const newLifeStr = await showCustomPrompt('Días de vida útil (0 = sin control):', current.shelfLife.toString());
            if (newLifeStr === null) return;
            const newLife = parseInt(newLifeStr, 10);
            if (isNaN(newLife) || newLife < 0) { showCustomAlert('Valor inválido.'); return; }
            catalog[sku] = { description: newDesc.trim(), shelfLife: newLife };
            saveCatalog(catalog);
            renderCatalogList(document.getElementById('catalog-search').value);
        });
    });

    container.querySelectorAll('.cat-del-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const sku = btn.getAttribute('data-sku');
            const ok = await showCustomConfirm('¿Eliminar SKU ' + sku + ' del catálogo?');
            if (!ok) return;
            const catalog = getCatalog();
            delete catalog[sku];
            saveCatalog(catalog);
            renderCatalogList(document.getElementById('catalog-search').value);
        });
    });
}

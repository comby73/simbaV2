// Control de Loterías - App Principal

let currentUser = null;
let juegos = [];
let sorteos = [];
let provincias = [];

const PREFIJOS_JUEGOS = {
  'QNL': { nombre: 'Quiniela', api: 'procesarQuiniela' },
  'PCD': { nombre: 'Poceada', api: 'procesarPoceada' },
  'TMB': { nombre: 'Tombolina', api: 'procesarTombolina' },
  'Q6': { nombre: 'Quini 6', api: 'procesarQuini6' },
  'BRC': { nombre: 'Brinco', api: 'procesarBrinco' },
  'LOTO': { nombre: 'Loto', api: 'procesarLoto' },
  'L5': { nombre: 'Loto 5', api: 'procesarLoto5' }
};



function detectarTipoJuego(fileName) {
  const upper = fileName.toUpperCase();
  for (const [prefijo, config] of Object.entries(PREFIJOS_JUEGOS)) {
    if (upper.startsWith(prefijo) || upper.includes(prefijo)) return config;
  }
  return null;
}

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  setupEventListeners();
  cargarVersionApp();
});

// Cargar versión de la aplicación desde el servidor
async function cargarVersionApp() {
  try {
    // Usar API_BASE para compatibilidad con todos los entornos
    const base = typeof API_BASE !== 'undefined' ? API_BASE : '/api';
    const response = await fetch(`${base}/version`);
    const data = await response.json();
    const versionEl = document.getElementById('app-version');
    if (versionEl && data.version) {
      versionEl.textContent = `v${data.version}`;
      versionEl.title = `SIMBA ${data.version} | ${data.environment || ''}`;
    }
  } catch (e) {
    console.log('No se pudo cargar versión:', e.message);
  }
}

async function checkAuth() {
  const token = getToken();
  const user = getUser();

  if (token && user) {
    try {
      await authAPI.verify();
      currentUser = user;
      showApp();
      await initApp();
    } catch (error) {
      showLogin();
    }
  } else {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('login-view').classList.remove('hidden');
  document.getElementById('app-view').classList.add('hidden');
}

function showApp() {
  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('app-view').classList.remove('hidden');

  document.getElementById('user-name').textContent = currentUser.nombre;
  document.getElementById('user-role').textContent = currentUser.rolNombre || currentUser.rol;

  // Mostrar/ocultar elementos admin
  const adminElements = document.querySelectorAll('.admin-only');
  adminElements.forEach(el => {
    if (currentUser.rol === 'admin') {
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  });
}

async function initApp() {
  // Fecha actual en inputs
  const today = new Date().toISOString().split('T')[0];
  document.querySelectorAll('input[type="date"]').forEach(input => {
    input.value = today;
  });

  // Generar inputs de números para extractos
  generarInputsExtracto();

  // Cargar Dashboard con sorteos del día
  cargarDashboard();
}

function setupEventListeners() {
  // Login
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('btn-logout').addEventListener('click', handleLogout);

  // Toggle Sidebar (menú hamburguesa)
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const sidebar = document.getElementById('sidebar');
  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
      document.querySelector('.main-content').classList.toggle('expanded');
    });
  }

  // Navegación
  document.querySelectorAll('.nav-item[data-view]').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(item.dataset.view);
    });
  });

  // Upload area
  const uploadArea = document.getElementById('upload-area');
  const fileInput = document.getElementById('archivo-input');

  if (uploadArea && fileInput) {
    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.style.borderColor = 'var(--primary)';
    });
    uploadArea.addEventListener('dragleave', () => {
      uploadArea.style.borderColor = 'var(--border-color)';
    });
    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.style.borderColor = 'var(--border-color)';
      handleFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', () => handleFiles(fileInput.files));
  }

  // Tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const parentCard = tab.closest('.card');
      if (parentCard) {
        parentCard.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        parentCard.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      } else {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      }
      tab.classList.add('active');
      const tabContent = document.getElementById(`tab-${tab.dataset.tab}`);
      if (tabContent) tabContent.classList.remove('hidden');

      // Inicializar filtros de extractos cuando se cambia a la pestaña "ver"
      if (tab.dataset.tab === 'ver') {
        initExtractosFiltros();
      }
    });
  });
}

async function handleLogin(e) {
  e.preventDefault();

  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  const errorDiv = document.getElementById('login-error');

  try {
    errorDiv.classList.add('hidden');
    const response = await authAPI.login(username, password);

    if (response.success) {
      currentUser = response.data.user;
      showApp();
      await initApp();
      showToast('Bienvenido ' + currentUser.nombre, 'success');
    }
  } catch (error) {
    errorDiv.textContent = error.message || 'Error al iniciar sesión';
    errorDiv.classList.remove('hidden');
  }
}

function navigateTo(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));

  const viewElement = document.getElementById(`view-${view}`);
  if (viewElement) viewElement.classList.remove('hidden');

  document.querySelectorAll(`.nav-item[data-view="${view}"]`).forEach(item => {
    item.classList.add('active');
  });

  // Cargar datos según la vista
  switch (view) {
    case 'dashboard':
      cargarDashboard();
      break;
    case 'usuarios':
      loadUsuarios();
      break;
    case 'control-previo':
      initControlPrevio();
      break;
    case 'control-posterior':
      initControlPosterior();
      break;
    case 'actas':
      initActas();
      break;
    case 'agencias':
      initAgencias();
      break;
    case 'programacion':
      initProgramacion();
      break;
    case 'reportes':
      initReportes();
      break;
    case 'extractos':
      initOCRExtractos();
      break;
    case 'juegos-offline':
      initJuegosOffline();
      break;
  }
}

// Generar inputs para extracto
function generarInputsExtracto() {
  const container = document.getElementById('extracto-numeros');
  const letrasContainer = document.getElementById('extracto-letras');

  if (container) {
    container.innerHTML = '';
    for (let i = 1; i <= 20; i++) {
      container.innerHTML += `
        <input type="text" class="numero-input" id="num-${i}" 
               placeholder="${i}" maxlength="4" data-pos="${i}">
      `;
    }
  }

  if (letrasContainer) {
    letrasContainer.innerHTML = '';
    for (let i = 1; i <= 4; i++) {
      letrasContainer.innerHTML += `
        <input type="text" class="letra-input" id="letra-${i}" 
               placeholder="${i}" maxlength="1">
      `;
    }
  }
}

function limpiarExtracto() {
  document.querySelectorAll('.numero-input').forEach(input => input.value = '');
  document.querySelectorAll('.letra-input').forEach(input => input.value = '');
}

function guardarExtracto() {
  showToast('Función en desarrollo', 'info');
}

// =============================================
// VER EXTRACTOS
// =============================================

// Inicializar fecha de hoy en el filtro
function initExtractosFiltros() {
  const fechaInput = document.getElementById('extractos-fecha');
  if (fechaInput && !fechaInput.value) {
    fechaInput.value = new Date().toISOString().split('T')[0];
  }
}

// Buscar extractos según filtros
let ultimosExtractosBuscados = []; // Para descarga Excel

async function buscarExtractos() {
  const fecha = document.getElementById('extractos-fecha').value;
  const juego = document.getElementById('extractos-filtro-juego').value;
  const modalidad = document.getElementById('extractos-filtro-modalidad').value;

  const container = document.getElementById('extractos-resultados');
  const btnExcel = document.getElementById('btn-descargar-extractos');
  container.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin fa-2x"></i></div>';
  btnExcel.disabled = true;
  ultimosExtractosBuscados = [];

  try {
    // Usar el nuevo endpoint de extractos
    let url = `${API_BASE}/extractos?`;
    if (fecha) url += `fecha=${fecha}&`;
    if (juego) url += `juego=${juego}&`;
    if (modalidad) url += `modalidad=${modalidad}&`;

    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });

    const data = await response.json();

    if (!data.success || data.data.length === 0) {
      container.innerHTML = `
        <div class="text-center text-muted py-4">
          <i class="fas fa-inbox fa-3x mb-3"></i>
          <p>No se encontraron extractos para los filtros seleccionados</p>
          <p class="small">Cargá extractos desde la pestaña "Cargar Extracto" usando OCR o manualmente</p>
        </div>
      `;
      return;
    }

    ultimosExtractosBuscados = data.data;
    btnExcel.disabled = false;

    // Renderizar extractos guardados
    container.innerHTML = renderExtractosGuardados(data.data);

  } catch (error) {
    console.error('Error buscando extractos:', error);
    container.innerHTML = '<div class="text-center text-danger py-4"><i class="fas fa-exclamation-circle"></i> Error buscando extractos</div>';
  }
}

// Descargar extractos como CSV separado por punto y coma (compatible Excel español)
function descargarExtractosExcel() {
  if (!ultimosExtractosBuscados || ultimosExtractosBuscados.length === 0) {
    showToast('No hay extractos para descargar', 'warning');
    return;
  }

  const extractos = ultimosExtractosBuscados;

  // Headers
  const headers = ['Fecha', 'Provincia', 'Nro Sorteo', 'Modalidad'];
  for (let i = 1; i <= 20; i++) headers.push('Num' + i);
  headers.push('Letras', 'Fuente');

  const rows = extractos.map(ext => {
    const fila = [
      ext.fecha ? ext.fecha.split('T')[0] : '',
      ext.provincia_nombre || ext.provincia_codigo || '',
      ext.numero_sorteo || '',
      ext.sorteo_nombre || ''
    ];
    const nums = ext.numeros || [];
    for (let i = 0; i < 20; i++) {
      fila.push(nums[i] !== undefined ? String(nums[i]).padStart(4, '0') : '');
    }
    fila.push(ext.letras ? (Array.isArray(ext.letras) ? ext.letras.join('') : ext.letras) : '');
    fila.push(ext.fuente || 'MANUAL');
    return fila;
  });

  // CSV con separador ; (estándar Excel en español)
  const sep = ';';
  let csv = '\uFEFF'; // BOM UTF-8
  csv += headers.join(sep) + '\r\n';
  rows.forEach(row => {
    csv += row.map(v => {
      const s = String(v);
      // Escapar si contiene ; o "
      return s.includes(sep) || s.includes('"') ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(sep) + '\r\n';
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const fecha = document.getElementById('extractos-fecha').value || 'todos';
  a.href = url;
  a.download = `extractos_${fecha}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(`Descargados ${extractos.length} extractos`, 'success');
}

// Renderizar lista de extractos guardados
function renderExtractosGuardados(extractos) {
  return `
    <div class="table-responsive">
      <table class="table table-sm" id="tabla-extractos-ver">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Provincia</th>
            <th>Nro. Sorteo</th>
            <th>Modalidad</th>
            <th>Números (1-20)</th>
            <th>Letras</th>
            <th>Fuente</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${extractos.map(ext => `
            <tr id="extracto-row-${ext.id}">
              <td>${formatDate(ext.fecha)}</td>
              <td><span class="badge bg-primary">${ext.provincia_nombre || ext.provincia_codigo || '-'}</span></td>
              <td><strong>${ext.numero_sorteo || '-'}</strong></td>
              <td>${ext.sorteo_nombre || '-'}</td>
              <td>
                <div id="numeros-display-${ext.id}" style="display: grid; grid-template-columns: repeat(10, 1fr); gap: 4px; font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; min-width: 350px; text-align: center;">
                  ${ext.numeros ? ext.numeros.map(n => `<span>${String(n).padStart(String(n).length > 3 ? 4 : 3, '0')}</span>`).join('') : '-'}
                </div>
                <div id="numeros-edit-${ext.id}" style="display: none; gap: 4px;">
                  <div style="display: grid; grid-template-columns: repeat(10, 1fr); gap: 2px; min-width: 350px;">
                    ${ext.numeros ? ext.numeros.map((n, i) => `<input type="text" class="form-control form-control-sm" style="font-size: 0.7rem; padding: 2px; text-align: center;" value="${String(n).padStart(String(n).length > 3 ? 4 : 3, '0')}" maxlength="4" id="edit-num-${ext.id}-${i}">`).join('') : ''}
                  </div>
                </div>
              </td>
              <td style="font-family: monospace;">
                <span id="letras-display-${ext.id}">${ext.letras ? (Array.isArray(ext.letras) ? ext.letras.join('') : ext.letras) : '-'}</span>
                <input type="text" id="letras-edit-${ext.id}" style="display: none; width: 60px; font-size: 0.8rem;" class="form-control form-control-sm" value="${ext.letras ? (Array.isArray(ext.letras) ? ext.letras.join('') : ext.letras) : ''}" maxlength="4">
              </td>
              <td><span class="badge bg-secondary">${ext.fuente || 'MANUAL'}</span></td>
              <td>
                <div id="acciones-normal-${ext.id}">
                  <button class="btn btn-sm btn-outline-primary" onclick="verDetalleExtracto(${ext.id})" title="Ver detalle">
                    <i class="fas fa-eye"></i>
                  </button>
                  <button class="btn btn-sm btn-outline-warning" onclick="editarExtracto(${ext.id})" title="Editar">
                    <i class="fas fa-edit"></i>
                  </button>
                  <button class="btn btn-sm btn-outline-danger" onclick="eliminarExtractoGuardado(${ext.id})" title="Eliminar">
                    <i class="fas fa-trash"></i>
                  </button>
                </div>
                <div id="acciones-edit-${ext.id}" style="display: none;">
                  <button class="btn btn-sm btn-success" onclick="guardarEdicionExtracto(${ext.id}, ${ext.numeros?.length || 20})" title="Guardar">
                    <i class="fas fa-check"></i>
                  </button>
                  <button class="btn btn-sm btn-secondary" onclick="cancelarEdicionExtracto(${ext.id})" title="Cancelar">
                    <i class="fas fa-times"></i>
                  </button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// Editar extracto (mostrar campos editables)
function editarExtracto(id) {
  // Ocultar display, mostrar inputs
  document.getElementById(`numeros-display-${id}`).style.display = 'none';
  document.getElementById(`numeros-edit-${id}`).style.display = 'block';
  document.getElementById(`letras-display-${id}`).style.display = 'none';
  document.getElementById(`letras-edit-${id}`).style.display = 'inline-block';
  document.getElementById(`acciones-normal-${id}`).style.display = 'none';
  document.getElementById(`acciones-edit-${id}`).style.display = 'block';
}

// Cancelar edición
function cancelarEdicionExtracto(id) {
  // Mostrar display, ocultar inputs
  document.getElementById(`numeros-display-${id}`).style.display = 'grid';
  document.getElementById(`numeros-edit-${id}`).style.display = 'none';
  document.getElementById(`letras-display-${id}`).style.display = 'inline';
  document.getElementById(`letras-edit-${id}`).style.display = 'none';
  document.getElementById(`acciones-normal-${id}`).style.display = 'block';
  document.getElementById(`acciones-edit-${id}`).style.display = 'none';
}

// Guardar edición de extracto
async function guardarEdicionExtracto(id, cantNumeros) {
  try {
    // Recoger números de los inputs
    const numeros = [];
    for (let i = 0; i < cantNumeros; i++) {
      const input = document.getElementById(`edit-num-${id}-${i}`);
      if (input) {
        numeros.push(input.value.padStart(input.value.length > 3 ? 4 : 3, '0'));
      }
    }

    // Recoger letras
    const letrasInput = document.getElementById(`letras-edit-${id}`);
    const letras = letrasInput ? letrasInput.value.toUpperCase().split('') : [];

    // Llamar al API para actualizar
    const response = await extractosAPI.actualizar(id, { numeros, letras });

    if (response.success) {
      showToast('Extracto actualizado correctamente', 'success');
      // Refrescar la lista
      buscarExtractos();
    } else {
      throw new Error(response.message || 'Error al actualizar');
    }
  } catch (error) {
    console.error('Error actualizando extracto:', error);
    showToast('Error al actualizar: ' + error.message, 'error');
  }
}

// Ver detalle de extracto
async function verDetalleExtracto(id) {
  try {
    const response = await fetch(`${API_BASE}/extractos/${id}`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    const data = await response.json();

    if (!data.success) {
      showToast('Error cargando extracto', 'error');
      return;
    }

    const ext = data.data;
    const numeros = ext.numeros || [];
    const letras = ext.letras || [];

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 600px;">
        <div class="modal-header">
          <h3>Extracto ${ext.provincia_nombre || ''} - ${ext.sorteo_nombre || ''}</h3>
          <button class="btn-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
        </div>
        <div class="modal-body">
          <p><strong>Fecha:</strong> ${ext.fecha} | <strong>Fuente:</strong> ${ext.fuente}</p>
          <h5>Números (20 posiciones)</h5>
          <table style="width: 100%; font-family: monospace; margin-bottom: 1rem;">
            <tr style="background: var(--bg-input);">
              ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => `<td style="text-align:center; padding: 4px; font-size: 0.7rem; color: var(--text-muted);">${i}</td>`).join('')}
            </tr>
            <tr>
              ${numeros.slice(0, 10).map(n => `<td style="text-align:center; padding: 4px; font-weight: bold;">${n}</td>`).join('')}
            </tr>
            <tr style="background: var(--bg-input);">
              ${[11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map(i => `<td style="text-align:center; padding: 4px; font-size: 0.7rem; color: var(--text-muted);">${i}</td>`).join('')}
            </tr>
            <tr>
              ${numeros.slice(10, 20).map(n => `<td style="text-align:center; padding: 4px; font-weight: bold;">${n}</td>`).join('')}
            </tr>
          </table>
          ${letras.length > 0 ? `
            <h5>Letras</h5>
            <p style="font-family: monospace; font-size: 1.5rem; letter-spacing: 0.5rem;">
              ${Array.isArray(letras) ? letras.join('') : letras}
            </p>
          ` : ''}
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cerrar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

  } catch (error) {
    console.error('Error:', error);
    showToast('Error cargando extracto', 'error');
  }
}

// Eliminar extracto guardado
async function eliminarExtractoGuardado(id) {
  if (!confirm('¿Eliminar este extracto?')) return;

  try {
    const response = await fetch(`${API_BASE}/extractos/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });

    const data = await response.json();

    if (data.success) {
      showToast('Extracto eliminado', 'success');
      buscarExtractos(); // Refrescar lista
    } else {
      showToast('Error: ' + data.message, 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showToast('Error eliminando extracto', 'error');
  }
}

// Renderizar una tarjeta de extracto
function renderExtractoCard(item) {
  const modalidadNombre = { M: 'Matutina', V: 'Vespertina', N: 'Nocturna' };
  const juegoColor = item.juego === 'quiniela' ? 'primary' : 'warning';

  if (item.juego === 'quiniela') {
    return renderExtractoQuiniela(item, modalidadNombre, juegoColor);
  } else {
    return renderExtractoPoceada(item, modalidadNombre, juegoColor);
  }
}

// Renderizar extracto de Quiniela (7 provincias)
function renderExtractoQuiniela(item, modalidadNombre, juegoColor) {
  const extractos = item.extractos || [];
  const cargados = extractos.filter(e => e.cargado);

  if (cargados.length === 0) {
    return `
      <div class="card mb-3">
        <div class="card-header">
          <div class="d-flex justify-content-between align-items-center">
            <div>
              <span class="badge badge-${juegoColor}">QUINIELA</span>
              <span class="badge badge-secondary">${modalidadNombre[item.modalidad] || item.modalidad}</span>
              <strong class="ms-2">Sorteo ${item.numero_sorteo}</strong>
            </div>
            <span class="text-muted">${formatDate(item.fecha)}</span>
          </div>
        </div>
        <div class="card-body text-center text-muted">
          <i class="fas fa-info-circle"></i> No hay extractos cargados para este sorteo
        </div>
      </div>
    `;
  }

  let html = `
    <div class="card mb-3">
      <div class="card-header">
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <span class="badge badge-${juegoColor}">QUINIELA</span>
            <span class="badge badge-secondary">${modalidadNombre[item.modalidad] || item.modalidad}</span>
            <strong class="ms-2">Sorteo ${item.numero_sorteo}</strong>
          </div>
          <span class="text-muted">${formatDate(item.fecha)}</span>
        </div>
      </div>
      <div class="card-body">
        <div class="extractos-grid">
  `;

  for (const ext of cargados) {
    const numeros = ext.numeros || [];
    const letras = ext.letras || [];

    html += `
      <div class="extracto-provincia">
        <h5>${ext.nombre}</h5>
        <div class="numeros-extracto">
          ${numeros.slice(0, 20).map((n, i) => `<span class="numero-badge ${i < 5 ? 'top5' : ''}">${String(n).padStart(4, '0')}</span>`).join('')}
        </div>
        ${letras.length > 0 ? `<div class="letras-extracto">${letras.map(l => `<span class="letra-badge">${l}</span>`).join('')}</div>` : ''}
      </div>
    `;
  }

  html += `
        </div>
      </div>
    </div>
  `;

  return html;
}

// Renderizar extracto de Poceada (20 números + 4 letras)
function renderExtractoPoceada(item, modalidadNombre, juegoColor) {
  const extracto = item.extracto || {};
  const numeros = extracto.numeros || [];
  const letras = extracto.letras || '';

  if (numeros.length === 0) {
    return `
      <div class="card mb-3">
        <div class="card-header">
          <div class="d-flex justify-content-between align-items-center">
            <div>
              <span class="badge badge-${juegoColor}">POCEADA</span>
              <strong class="ms-2">Sorteo ${item.numero_sorteo}</strong>
            </div>
            <span class="text-muted">${formatDate(item.fecha)}</span>
          </div>
        </div>
        <div class="card-body text-center text-muted">
          <i class="fas fa-info-circle"></i> No hay extracto cargado para este sorteo
        </div>
      </div>
    `;
  }

  // Dividir en grupos: 1-8 (8 aciertos), 9-15 (7 aciertos), 16-20 (6 aciertos)
  return `
    <div class="card mb-3">
      <div class="card-header">
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <span class="badge badge-${juegoColor}">POCEADA</span>
            <strong class="ms-2">Sorteo ${item.numero_sorteo}</strong>
          </div>
          <span class="text-muted">${formatDate(item.fecha)}</span>
        </div>
      </div>
      <div class="card-body">
        <div class="poceada-extracto">
          <div class="grupo-numeros">
            <span class="grupo-label">1er Premio (8 aciertos)</span>
            <div class="numeros-extracto">
              ${numeros.slice(0, 8).map(n => `<span class="numero-badge top5">${String(n).padStart(2, '0')}</span>`).join('')}
            </div>
          </div>
          <div class="grupo-numeros">
            <span class="grupo-label">2do Premio (7 aciertos)</span>
            <div class="numeros-extracto">
              ${numeros.slice(8, 15).map(n => `<span class="numero-badge">${String(n).padStart(2, '0')}</span>`).join('')}
            </div>
          </div>
          <div class="grupo-numeros">
            <span class="grupo-label">3er Premio (6 aciertos)</span>
            <div class="numeros-extracto">
              ${numeros.slice(15, 20).map(n => `<span class="numero-badge">${String(n).padStart(2, '0')}</span>`).join('')}
            </div>
          </div>
          ${letras ? `
            <div class="grupo-numeros">
              <span class="grupo-label">Letras</span>
              <div class="letras-extracto">
                ${letras.split('').map(l => `<span class="letra-badge">${l}</span>`).join('')}
              </div>
            </div>
          ` : ''}
        </div>
        <div class="extracto-stats mt-3">
          <span><i class="fas fa-trophy text-warning"></i> Ganadores: ${formatNumber(item.total_ganadores)}</span>
          <span class="ms-3"><i class="fas fa-dollar-sign text-success"></i> Premios: $${formatNumber(item.total_premios)}</span>
        </div>
      </div>
    </div>
  `;
}

// Archivos
let archivosSeleccionados = [];

function handleFiles(files) {
  archivosSeleccionados = [...files];
  renderArchivos();
}

function renderArchivos() {
  const container = document.getElementById('archivos-lista');
  if (!container) return;

  if (archivosSeleccionados.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = archivosSeleccionados.map((file, index) => `
    <div class="file-item">
      <div class="file-info">
        <i class="fas fa-file"></i>
        <span>${file.name}</span>
        <span class="text-muted">(${formatFileSize(file.size)})</span>
      </div>
      <button class="btn btn-sm btn-danger" onclick="removeFile(${index})">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `).join('');
}

function removeFile(index) {
  archivosSeleccionados.splice(index, 1);
  renderArchivos();
}

function procesarArchivos() {
  if (archivosSeleccionados.length === 0) {
    showToast('Seleccione al menos un archivo', 'warning');
    return;
  }
  showToast('Función en desarrollo', 'info');
}

// Usuarios
async function loadUsuarios() {
  try {
    const response = await usersAPI.getAll();
    const tbody = document.querySelector('#table-usuarios tbody');

    if (response.data && response.data.length > 0) {
      tbody.innerHTML = response.data.map(user => `
        <tr>
          <td>${user.username}</td>
          <td>${user.nombre}</td>
          <td><span class="badge badge-info">${user.rol_nombre || user.rol}</span></td>
          <td>${user.activo ? '<span class="badge badge-success">Activo</span>' : '<span class="badge badge-danger">Inactivo</span>'}</td>
          <td>${user.ultimo_login ? formatDate(user.ultimo_login) : '-'}</td>
          <td>
            <button class="btn btn-sm btn-secondary" onclick="editarUsuario(${user.id})">
              <i class="fas fa-edit"></i>
            </button>
          </td>
        </tr>
      `).join('');
    } else {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No hay usuarios</td></tr>';
    }
  } catch (error) {
    console.error('Error cargando usuarios:', error);
    showToast('Error cargando usuarios', 'error');
  }
}

function mostrarModalUsuario() {
  showToast('Función en desarrollo', 'info');
}

function editarUsuario(id) {
  showToast('Función en desarrollo', 'info');
}

// Utilidades
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';

  const icons = { success: 'check-circle', error: 'exclamation-circle', warning: 'exclamation-triangle', info: 'info-circle' };
  const colors = { success: 'var(--success)', error: 'var(--danger)', warning: 'var(--warning)', info: 'var(--primary)' };

  toast.innerHTML = `<i class="fas fa-${icons[type]}" style="color: ${colors[type]}"></i><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => toast.remove(), 4000);
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('es-AR');
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// =============================================
// CONTROL PREVIO
// =============================================

let cpArchivoSeleccionado = null;
let cpResultadosActuales = null;
let cpRegistrosNTF = []; // NUEVO: Registros parseados del TXT para Control Posterior

function initControlPrevio() {
  const uploadArea = document.getElementById('cp-upload-area');
  const fileInput = document.getElementById('cp-archivo-input');

  if (!uploadArea || !fileInput) return;

  // Click para seleccionar
  uploadArea.addEventListener('click', () => fileInput.click());

  // Drag & Drop
  uploadArea.addEventListener('dragenter', (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.add('drag-over');
  });

  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.add('drag-over');
  });

  uploadArea.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.remove('drag-over');
  });

  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      seleccionarArchivoCP(files[0]);
    }
  });

  // Input file change
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      seleccionarArchivoCP(fileInput.files[0]);
    }
  });
}

function seleccionarArchivoCP(file) {
  if (!file.name.toLowerCase().endsWith('.zip')) {
    showToast('Solo se permiten archivos ZIP', 'warning');
    return;
  }

  cpArchivoSeleccionado = file;
  document.getElementById('cp-archivo-nombre').textContent = `${file.name} (${formatFileSize(file.size)})`;
  document.getElementById('cp-archivo-seleccionado').classList.remove('hidden');
}

async function procesarControlPrevio() {
  if (!cpArchivoSeleccionado) {
    showToast('Seleccione un archivo ZIP', 'warning');
    return;
  }

  const juegoConfig = detectarTipoJuego(cpArchivoSeleccionado.name);
  if (!juegoConfig) {
    showToast('No se pudo detectar el tipo de juego (Prefijos: QNL, PCD, TMB)', 'error');
    return;
  }

  showToast(`Procesando ${juegoConfig.nombre}...`, 'info');

  try {
    const response = await controlPrevioAPI[juegoConfig.api](cpArchivoSeleccionado);
    cpResultadosActuales = response.data;
    cpResultadosActuales.tipoJuego = juegoConfig.nombre; // Guardar tipo detectado

    cpRegistrosNTF = response.data.registros || response.data.registrosNTF || [];
    console.log(`Control Previo (${juegoConfig.nombre}): ${cpRegistrosNTF.length} registros parseados`);

    mostrarResultadosCP(response.data);
    showToast('Archivo procesado correctamente', 'success');
  } catch (error) {
    console.error('Error:', error);
    showToast(error.message || 'Error procesando archivo', 'error');
  }
}

function mostrarResultadosCP(data) {
  console.log('📊 Datos recibidos en mostrarResultadosCP:', data);

  // Ocultar cards específicas de otros juegos al inicio
  ocultarCardTombolina();

  // Normalizar datos según el juego
  const isPoceada = data.tipoJuego === 'Poceada';
  const calc = isPoceada ? data.resumen : data.datosCalculados;
  const oficial = data.datosOficiales;

  console.log('🔍 calc.online:', calc.online);
  console.log('🔍 data.comparacion:', data.comparacion);

  // Título y badges
  document.getElementById('cp-titulo').textContent = `Control Previo - ${data.tipoJuego || 'Quiniela'}`;
  const gameBadge = document.getElementById('cp-juego-detectado');
  if (gameBadge) {
    gameBadge.textContent = data.tipoJuego;
    gameBadge.className = `badge badge-${isPoceada ? 'primary' : 'success'}`;
  }

  // Mostrar sección de resultados
  document.getElementById('cp-resultados').classList.remove('hidden');

  // Mostrar sección específica de Poceada
  const pcdEspecífico = document.getElementById('cp-poceada-especifico');
  if (pcdEspecífico) {
    if (isPoceada) {
      pcdEspecífico.classList.remove('hidden');
      // Los 4 pozos se actualizan via verificarYMostrarModalArrastres
      verificarYMostrarModalArrastres(data);
    } else {
      pcdEspecífico.classList.add('hidden');
    }
  }

  // Resumen principal - Tickets
  const registrosValidos = calc.registros || 0;
  const registrosAnulados = calc.anulados || calc.registrosAnulados || 0;
  const ticketsTotal = registrosValidos + registrosAnulados;

  document.getElementById('cp-tickets-total').textContent = formatNumber(ticketsTotal);
  document.getElementById('cp-registros').textContent = formatNumber(registrosValidos);
  document.getElementById('cp-anulados').textContent = formatNumber(registrosAnulados);
  document.getElementById('cp-apuestas').textContent = formatNumber(calc.apuestasTotal || calc.apuestas);
  // Recaudación sin decimales
  document.getElementById('cp-recaudacion').textContent = '$' + formatNumber(Math.round(calc.recaudacion));

  // Recaudación anulada (si existe el elemento)
  const recAnuladaEl = document.getElementById('cp-recaudacion-anulada');
  if (recAnuladaEl) {
    recAnuladaEl.textContent = '$' + formatNumber(calc.recaudacionAnulada || 0);
  }

  // Badge de sorteo
  document.getElementById('cp-sorteo-badge').textContent = `Sorteo: ${data.sorteo || calc.numeroSorteo}`;

  // Tablas según tipo de juego
  const isTombolina = data.tipoJuego === 'Tombolina';
  if (isPoceada) {
    renderTablasPoceada(data);
  } else if (isTombolina) {
    renderTablasTombolina(data);
    // Tombolina NO tiene provincias - ocultar esas cards
    ocultarCardsProvincias();
  } else {
    renderTablasQuiniela(data);
  }

  // Comparación con XML
  const tbodyComp = document.getElementById('cp-tabla-comparacion');
  if (tbodyComp) {
    tbodyComp.innerHTML = '';

    console.log('🔍 Verificando comparación...');
    console.log('   data.comparacion:', data.comparacion);
    console.log('   data.datosOficiales:', data.datosOficiales);
    console.log('   oficial:', oficial);

    // Usar data.comparacion si está disponible (viene del backend), sino calcular manualmente
    if (data.comparacion) {
      console.log('✅ Usando comparación del backend');
      // Usar la comparación pre-calculada del backend
      const comp = data.comparacion;
      // Calcular tickets totales
      const ticketsCalc = (comp.registros?.calculado || 0) + (comp.anulados?.calculado || 0);
      const ticketsOficial = (comp.registros?.oficial || 0) + (comp.anulados?.oficial || 0);
      const ticketsDiff = ticketsCalc - ticketsOficial;

      const comparaciones = [
        { concepto: 'Tickets (Total)', calc: ticketsCalc, oficial: ticketsOficial, diff: ticketsDiff },
        { concepto: 'Tickets Válidos', calc: comp.registros?.calculado || 0, oficial: comp.registros?.oficial || 0, diff: comp.registros?.diferencia || 0 },
        { concepto: 'Anulados', calc: comp.anulados?.calculado || 0, oficial: comp.anulados?.oficial || 0, diff: comp.anulados?.diferencia || 0 },
        { concepto: 'Apuestas en Sorteo', calc: comp.apuestas?.calculado || 0, oficial: comp.apuestas?.oficial || 0, diff: comp.apuestas?.diferencia || 0 },
        { concepto: 'Recaudación Bruta', calc: comp.recaudacion?.calculado || 0, oficial: comp.recaudacion?.oficial || 0, diff: comp.recaudacion?.diferencia || 0, esMonto: true }
      ];

      // Agregar venta web si hay datos (solo para Poceada)
      if (calc.ventaWeb !== undefined) {
        comparaciones.push({
          concepto: '🌐 Venta Web',
          calc: calc.ventaWeb || 0,
          oficial: '-',
          diff: null,
          esVentaWeb: true
        });
      }

      for (const item of comparaciones) {
        let diffCell;
        if (item.esVentaWeb) {
          diffCell = '<span class="badge badge-info">Solo TXT</span>';
        } else {
          const diffClass = item.diff === 0 ? 'text-success' : 'text-warning';
          diffCell = `<span class="${diffClass}">${item.diff === 0 ? '✓ OK' : (item.diff > 0 ? '+' : '') + formatNumber(item.diff)}</span>`;
        }

        tbodyComp.innerHTML += `
          <tr>
            <td>${item.concepto}</td>
            <td>${item.esMonto ? '$' : ''}${formatNumber(item.calc)}</td>
            <td>${item.esVentaWeb ? item.oficial : (item.esMonto ? '$' : '') + formatNumber(item.oficial)}</td>
            <td>${diffCell}</td>
          </tr>
        `;
      }

      document.getElementById('cp-verificacion-badge').innerHTML =
        '<span class="badge badge-success">XML Cargado</span>';
    } else if (oficial) {
      // Fallback: calcular manualmente si no viene del backend
      // Calcular tickets totales para Poceada y Quiniela
      const calcValidos = isPoceada ? (calc.registros || 0) : (calc.registros || 0);
      const calcAnulados = isPoceada ? (calc.anulados || 0) : (calc.registrosAnulados || 0);
      const oficialValidos = oficial.registrosValidos || 0;
      const oficialAnulados = oficial.registrosAnulados || 0;
      const ticketsCalcFallback = calcValidos + calcAnulados;
      const ticketsOficialFallback = oficialValidos + oficialAnulados;

      const comparaciones = isPoceada ? [
        { concepto: 'Tickets (Total)', calc: ticketsCalcFallback, oficial: ticketsOficialFallback },
        { concepto: 'Tickets Válidos', calc: calc.registros || 0, oficial: oficial.registrosValidos || 0 },
        { concepto: 'Anulados', calc: calc.anulados || 0, oficial: oficial.registrosAnulados || 0 },
        { concepto: 'Apuestas en Sorteo', calc: calc.apuestasTotal || 0, oficial: oficial.apuestas || 0 },
        { concepto: 'Recaudación Bruta', calc: calc.recaudacion || 0, oficial: oficial.recaudacion || 0, esMonto: true }
      ] : [
        { concepto: 'Tickets (Total)', calc: ticketsCalcFallback, oficial: ticketsOficialFallback },
        { concepto: 'Tickets Válidos', calc: calc.registros || 0, oficial: oficial.registrosValidos || 0 },
        { concepto: 'Anulados', calc: calc.registrosAnulados || 0, oficial: oficial.registrosAnulados || 0 },
        { concepto: 'Apuestas en Sorteo', calc: calc.apuestasTotal || 0, oficial: oficial.apuestasEnSorteo || 0 },
        { concepto: 'Recaudación Bruta', calc: calc.recaudacion || 0, oficial: oficial.recaudacionBruta || 0, esMonto: true }
      ];

      for (const item of comparaciones) {
        const diff = item.calc - item.oficial;
        const diffClass = diff === 0 ? 'text-success' : 'text-warning';
        tbodyComp.innerHTML += `
          <tr>
            <td>${item.concepto}</td>
            <td>${item.esMonto ? '$' : ''}${formatNumber(item.calc)}</td>
            <td>${item.esMonto ? '$' : ''}${formatNumber(item.oficial)}</td>
            <td class="${diffClass}">${diff === 0 ? '✓ OK' : (diff > 0 ? '+' : '') + formatNumber(diff)}</td>
          </tr>
        `;
      }

      document.getElementById('cp-verificacion-badge').innerHTML =
        '<span class="badge badge-success">XML Cargado</span>';
    } else if (data.comparacionXml && Array.isArray(data.comparacionXml)) {
      // Formato Tombolina: array con { concepto, txt, xml, diferencia }
      console.log('✅ Usando comparacionXml (formato Tombolina)');
      for (const item of data.comparacionXml) {
        const diff = item.diferencia;
        const esMonto = item.concepto.toLowerCase().includes('recaudaci');
        const diffClass = diff === 0 ? 'text-success' : (diff !== '' ? 'text-warning' : '');
        const diffText = diff === 0 ? '✓ OK' : (typeof diff === 'number' ? ((diff > 0 ? '+' : '') + formatNumber(diff)) : String(diff));

        tbodyComp.innerHTML += `
          <tr>
            <td>${item.concepto}</td>
            <td>${esMonto ? '$' : ''}${formatNumber(item.txt)}</td>
            <td>${esMonto ? '$' : ''}${formatNumber(item.xml)}</td>
            <td class="${diffClass}">${diffText}</td>
          </tr>
        `;
      }
      document.getElementById('cp-verificacion-badge').innerHTML =
        '<span class="badge badge-success">XML Cargado</span>';
    } else {
      tbodyComp.innerHTML = '<tr><td colspan="4" class="text-muted text-center">No se encontró archivo XML oficial para comparar</td></tr>';
      document.getElementById('cp-verificacion-badge').innerHTML =
        '<span class="badge badge-warning">Sin XML</span>';
    }
  }

  // Verificación de seguridad...
  const seg = data.seguridad;
  const segContent = document.getElementById('cp-seguridad-content');
  segContent.innerHTML = `
    <div class="security-grid">
      <div class="file-item" title="Archivo TXT">
        <span><i class="fas ${seg.archivos.txt ? 'fa-check-circle text-success' : 'fa-times-circle text-danger'}"></i> Archivo TXT</span>
      </div>
      <div class="file-item" title="Archivo XML">
        <span><i class="fas ${seg.archivos.xml ? 'fa-check-circle text-success' : 'fa-times-circle text-danger'}"></i> Archivo XML</span>
      </div>
      <div class="file-item" title="Hash TXT">
        <span><i class="fas ${seg.archivos.hash ? 'fa-check-circle text-success' : 'fa-times-circle text-danger'}"></i> Hash TXT</span>
      </div>
      <div class="file-item" title="Hash CP">
        <span><i class="fas ${seg.archivos.hashCP ? 'fa-check-circle text-success' : 'fa-times-circle text-danger'}"></i> Hash CP</span>
      </div>
      <div class="file-item" title="PDF Seguridad">
        <span><i class="fas ${seg.archivos.pdf ? 'fa-check-circle text-success' : 'fa-times-circle text-danger'}"></i> PDF Seguridad</span>
      </div>
      <div class="file-item" title="Verificación Hash TXT">
        <span><i class="fas ${seg.verificado ? 'fa-check-circle text-success' : (seg.verificado === false ? 'fa-times-circle text-danger' : 'fa-question-circle text-warning')}"></i> 
        Hash TXT ${seg.verificado ? 'Verificado' : (seg.verificado === false ? 'NO Coincide' : 'No verificable')}</span>
      </div>
      ${seg.verificadoXml !== undefined ? `
      <div class="file-item" title="Verificación Hash XML">
        <span><i class="fas ${seg.verificadoXml ? 'fa-check-circle text-success' : (seg.verificadoXml === false ? 'fa-times-circle text-danger' : 'fa-question-circle text-warning')}"></i> 
        Hash XML ${seg.verificadoXml ? 'Verificado' : (seg.verificadoXml === false ? 'NO Coincide' : 'No verificable')}</span>
      </div>
      ` : ''}
    </div>
  `;

  // Estadísticas de agencias amigas
  const statsAgencias = (data.datosCalculados?.estadisticasAgenciasAmigas || data.estadisticasAgenciasAmigas) || { total: 0, validas: 0, invalidas: 0 };
  const agenciasAmigasDiv = document.getElementById('cp-agencias-amigas-resumen');
  if (agenciasAmigasDiv) {
    if (statsAgencias.total > 0) {
      agenciasAmigasDiv.classList.remove('hidden');
      const iconClass = statsAgencias.invalidas > 0 ? 'fa-exclamation-triangle text-warning' : 'fa-check-circle text-success';
      const statusClass = statsAgencias.invalidas > 0 ? 'alert-warning' : 'alert-success';
      agenciasAmigasDiv.innerHTML = `
        <div class="alert ${statusClass}">
          <h4><i class="fas ${iconClass}"></i> Agencias Amigas</h4>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-top: 1rem;">
            <div>
              <div style="font-size: 1.5rem; font-weight: bold; color: var(--info);">${statsAgencias.total}</div>
              <div style="font-size: 0.85rem; color: var(--text-muted);">Total Detectadas</div>
            </div>
            <div>
              <div style="font-size: 1.5rem; font-weight: bold; color: var(--success);">${statsAgencias.validas}</div>
              <div style="font-size: 0.85rem; color: var(--text-muted);">Válidas (Registradas)</div>
            </div>
            ${statsAgencias.invalidas > 0 ? `
            <div>
              <div style="font-size: 1.5rem; font-weight: bold; color: var(--danger);">${statsAgencias.invalidas}</div>
              <div style="font-size: 0.85rem; color: var(--text-muted);">Inválidas (No Registradas)</div>
            </div>
            ` : ''}
          </div>
        </div>
      `;
    } else {
      // Mostrar mensaje cuando no hay agencias amigas
      agenciasAmigasDiv.classList.remove('hidden');
      agenciasAmigasDiv.innerHTML = `
        <div class="alert alert-info">
          <h4><i class="fas fa-info-circle"></i> Agencias Amigas</h4>
          <p style="margin: 0.5rem 0 0 0; color: var(--text-muted);">No se detectaron agencias amigas en este sorteo.</p>
        </div>
      `;
    }
  }

  // Errores de agencias amigas (detalle)
  const erroresAgenciasDiv = document.getElementById('cp-errores-agencias-amigas');
  if (erroresAgenciasDiv) {
    if (data.erroresAgenciasAmigas && data.erroresAgenciasAmigas.length > 0) {
      erroresAgenciasDiv.classList.remove('hidden');
      erroresAgenciasDiv.innerHTML = `
        <div class="alert alert-error">
          <h4><i class="fas fa-exclamation-triangle"></i> Errores de Agencias Amigas (${data.erroresAgenciasAmigas.length})</h4>
          <p class="text-muted">Se detectaron agencias amigas inválidas en ventas web (agencia 88880):</p>
          <div style="max-height: 300px; overflow-y: auto;">
            <table class="table" style="margin-top: 1rem;">
              <thead>
                <tr>
                  <th>Fila</th>
                  <th>Número Ticket</th>
                  <th>Agencia Amiga</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                ${data.erroresAgenciasAmigas.map(err => `
                  <tr>
                    <td>${err.fila}</td>
                    <td><strong>${err.numeroTicket}</strong></td>
                    <td><code>${err.agenciaAmiga}</code></td>
                    <td class="text-error">${err.mensaje}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else {
      erroresAgenciasDiv.classList.add('hidden');
      erroresAgenciasDiv.innerHTML = '';
    }
  }

  // Online (solo para Quiniela, Poceada no tiene esta sección)
  const onlineSection = document.getElementById('cp-online-registros')?.closest('.stat-card')?.parentElement;
  const onlineTitulo = document.getElementById('cp-online-titulo');

  if (isPoceada) {
    // Ocultar sección Online para Poceada
    if (onlineSection) onlineSection.style.display = 'none';
  } else {
    // Mostrar sección Online para Quiniela
    if (onlineSection) onlineSection.style.display = '';

    // Actualizar título dinámicamente según el juego
    if (onlineTitulo) {
      const juegoNombre = data.tipoJuego || 'Quiniela';
      onlineTitulo.textContent = `${juegoNombre} Online (Agencia 88880)`;
    }

    console.log('🌐 Verificando sección Online...');
    console.log('   calc.online existe?', !!calc.online);
    console.log('   calc.online valor:', calc.online);

    if (calc && calc.online && (calc.online.registros > 0 || calc.online.apuestas > 0 || calc.online.recaudacion > 0)) {
      console.log('✅ Mostrando datos Online:', calc.online);
      document.getElementById('cp-online-registros').textContent = formatNumber(calc.online.registros || 0);
      document.getElementById('cp-online-apuestas').textContent = formatNumber(calc.online.apuestas || 0);
      document.getElementById('cp-online-recaudacion').textContent = '$' + formatNumber(calc.online.recaudacion || 0);
      document.getElementById('cp-online-anulados').textContent = formatNumber(calc.online.anulados || 0);
    } else {
      console.log('⚠️ No hay datos Online');
      // Poner en 0 si no hay datos
      document.getElementById('cp-online-registros').textContent = '0';
      document.getElementById('cp-online-apuestas').textContent = '0';
      document.getElementById('cp-online-recaudacion').textContent = '$0';
      document.getElementById('cp-online-anulados').textContent = '0';
    }
  }

  // NUEVO: Mostrar validación contra programación
  mostrarValidacionProgramacionCP(data.validacionProgramacion, data.sorteo);
}

function limpiarControlPrevio() {
  cpArchivoSeleccionado = null;
  cpResultadosActuales = null;
  cpRegistrosNTF = []; // Limpiar registros parseados
  document.getElementById('cp-archivo-input').value = '';
  document.getElementById('cp-archivo-seleccionado').classList.add('hidden');
  document.getElementById('cp-resultados').classList.add('hidden');
}

async function guardarControlPrevio() {
  if (!cpResultadosActuales) {
    showToast('No hay datos para guardar', 'warning');
    return;
  }

  const isPoceada = cpResultadosActuales.tipoJuego === 'Poceada';

  try {
    if (isPoceada) {
      await controlPrevioAPI.guardarPoceada(cpResultadosActuales);
    } else {
      const calc = cpResultadosActuales.datosCalculados;
      await controlPrevioAPI.guardarQuiniela({
        numeroSorteo: calc.numeroSorteo,
        registros: calc.registros,
        apuestas: calc.apuestasTotal,
        recaudacion: calc.recaudacion,
        provincias: calc.provincias,
        datosXml: cpResultadosActuales.datosOficiales
      });
    }
    showToast('Datos guardados en la base de datos', 'success');
  } catch (error) {
    showToast(error.message || 'Error guardando datos', 'error');
  }
}

function generarActaControlPrevio() {
  if (!cpResultadosActuales) {
    showToast('No hay datos para generar acta', 'warning');
    return;
  }

  // Navegar a Actas con datos precargados
  navigateTo('actas');

  // Esperar a que se renderice la vista y precargar datos
  setTimeout(() => {
    const calc = cpResultadosActuales.datosCalculados;

    // Precargar número de sorteo
    document.getElementById('acta-numero-sorteo').value = calc.numeroSorteo || '';

    // Precargar fecha de hoy
    document.getElementById('acta-fecha').value = new Date().toISOString().split('T')[0];

    // Detectar modalidad desde el tipo de sorteo si existe
    if (calc.tiposSorteo) {
      const tipos = Object.keys(calc.tiposSorteo);
      if (tipos.length > 0) {
        const tipoMap = {
          'A': 'LA PRIMERA', 'M': 'MATUTINA', 'V': 'VESPERTINA',
          'N': 'NOCTURNA', 'U': 'MONTEVIDEO'
        };
        const modalidadDetectada = tipoMap[tipos[0]] || 'MATUTINA';
        document.getElementById('acta-modalidad').value = modalidadDetectada;
      }
    }

    // Marcar jurisdicciones según las provincias con apuestas
    if (calc.provincias) {
      document.getElementById('jur-caba').checked = (calc.provincias.CABA?.apuestas || 0) > 0;
      document.getElementById('jur-bsas').checked = (calc.provincias.PBA?.apuestas || 0) > 0;
      document.getElementById('jur-cordoba').checked = (calc.provincias.CBA?.apuestas || 0) > 0;
      document.getElementById('jur-santafe').checked = (calc.provincias.SFE?.apuestas || 0) > 0;
      document.getElementById('jur-montevideo').checked = (calc.provincias.URU?.apuestas || 0) > 0;
      document.getElementById('jur-mendoza').checked = (calc.provincias.MZA?.apuestas || 0) > 0;
      document.getElementById('jur-entrerios').checked = (calc.provincias.ENR?.apuestas || 0) > 0;
    }

    showToast('Datos del sorteo precargados. Complete el resto del formulario.', 'info');
  }, 100);
}

function renderTablasPoceada(data) {
  const tbodyRecProv = document.querySelector('#cp-tabla-recaudacion-prov tbody');
  const tbodyProv = document.querySelector('#cp-tabla-provincias tbody');

  if (tbodyRecProv && data.provincias) {
    tbodyRecProv.innerHTML = '';
    tbodyProv.innerHTML = '';

    // En Poceada, data.provincias ya tiene el formato { 'Nombre Provincia': { recaudacion, apuestas, registros } }
    const totalRec = data.resumen?.recaudacion || 1;
    const totalApuestas = data.resumen?.apuestasTotal || 1;

    for (const [nombre, prov] of Object.entries(data.provincias)) {
      // Validar que prov existe y tiene las propiedades necesarias
      if (!prov || typeof prov !== 'object') {
        console.warn(`Provincia ${nombre} no tiene datos válidos:`, prov);
        continue;
      }

      // Asegurar que las propiedades existan con valores por defecto
      const recaudacion = prov.recaudacion || 0;
      const apuestas = prov.apuestas || 0;
      const ventaWeb = prov.ventaWeb || 0;

      // Solo mostrar provincias con datos
      if (recaudacion > 0 || apuestas > 0) {
        const pRec = totalRec > 0 ? ((recaudacion / totalRec) * 100).toFixed(2) : '0.00';
        const pAp = totalApuestas > 0 ? ((apuestas / totalApuestas) * 100).toFixed(2) : '0.00';

        // Indicador de ventas web
        const webIndicator = ventaWeb > 0 ? ` <span class="badge badge-info" title="${ventaWeb} ventas web">🌐 ${ventaWeb}</span>` : '';

        if (recaudacion > 0) {
          tbodyRecProv.innerHTML += `
            <tr>
              <td><strong>${nombre}</strong>${webIndicator}</td>
              <td>$${formatNumber(Math.round(recaudacion))}</td>
              <td>${pRec}%</td>
            </tr>
          `;
        }

        if (apuestas > 0) {
          tbodyProv.innerHTML += `
            <tr>
              <td><strong>${nombre}</strong></td>
              <td>${formatNumber(apuestas)}</td>
              <td>${pAp}%</td>
            </tr>
          `;
        }
      }
    }
  }

  // Renderizar comparación de premios si existe
  renderComparacionPremiosPoceada(data);

  // Renderizar distribución de premios calculada
  renderDistribucionPremiosPoceada(data);
}

/**
 * Renderiza la tabla de comparación de premios (calculados vs XML oficial)
 */
function renderComparacionPremiosPoceada(data) {
  const tableBody = document.getElementById('cp-tabla-premios');
  const card = document.getElementById('cp-comparacion-premios-card');

  if (!tableBody || !card) return;

  // Validar si es Poceada. Si no lo es, ocultar la tarjeta y salir.
  if (data.tipoJuego !== 'Poceada') {
    card.classList.add('hidden');
    card.style.display = 'none';
    return;
  }

  // Si es Poceada, mostrar la tarjeta
  card.classList.remove('hidden');
  card.style.display = 'block';

  // Limpiar tabla antes de renderizar
  tableBody.innerHTML = '';

  // DEBUG: Ver estructura de datos
  console.log('📊 DEBUG renderComparacionPremiosPoceada:');
  console.log('   data.comparacion:', data.comparacion);
  console.log('   data.comparacion?.premios:', data.comparacion?.premios);
  console.log('   data.distribucionPremios:', data.distribucionPremios);

  const p = data.comparacion?.premios;
  if (!p) {
    if (!data.comparacion) {
      // Si no tenemos estructura de comparación, ocultar la card
      card.classList.add('hidden');
    } else {
      tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No hay datos de premios del XML para comparar</td></tr>';
    }
    return;
  }

  console.log('   p.primerPremio:', p.primerPremio);
  console.log('   p.fondoReserva:', p.fondoReserva);
  console.log('   p.importeTotalPremios:', p.importeTotalPremios);

  try {
    const dist = data.distribucionPremios || {};

    // Mostrar versión de configuración con pozo asegurado
    const versionBadge = document.getElementById('cp-config-version');
    if (versionBadge) {
      const configVer = dist.configVersion || 'Unknown';
      const pozoAsegurado = p.primerPremio?.pozoAsegurado || dist?.primerPremio?.pozoAsegurado || 60000000;
      versionBadge.textContent = `Config: ${configVer} | Pozo Asegurado: $${formatNumber(pozoAsegurado)}`;
    }

    // Helper para estado
    const getStatus = (diff) => {
      if (typeof diff !== 'number') return '<span class="text-muted">-</span>';
      if (Math.abs(diff) < 1) return '<span class="text-success"><i class="fas fa-check-circle"></i> OK</span>';
      return '<span class="text-danger"><i class="fas fa-times-circle"></i> Error</span>';
    };

    const getDiffClass = (diff) => {
      if (typeof diff !== 'number') return '';
      return Math.abs(diff) < 1 ? 'text-success' : 'text-danger';
    };

    const getDiffText = (diff) => {
      if (typeof diff !== 'number') return '$0';
      return Math.abs(diff) < 1 ? '$0' : (diff > 0 ? '+' : '') + '$' + formatNumber(diff);
    };

    const fmt = (val) => formatNumber(val || 0);

    // Helpers de acceso seguro - manejar tanto estructuras anidadas como valores directos
    const getVal = (obj, path, sub) => {
      try {
        if (!obj) return 0;
        const val = obj[path]?.[sub];
        // Si el valor es un objeto, intentar obtener .monto o devolver 0
        if (val && typeof val === 'object') {
          console.warn(`⚠️ getVal: ${path}.${sub} es un objeto, no un número:`, val);
          return val.monto || val.valor || 0;
        }
        return val || 0;
      } catch (e) {
        console.error(`Error en getVal(${path}, ${sub}):`, e);
        return 0;
      }
    };

    // Helper específico para valores directos (fondoReserva, importeTotalPremios)
    const getDirectVal = (obj, prop) => {
      try {
        if (!obj) return 0;
        const val = obj[prop];
        if (val && typeof val === 'object') {
          console.warn(`⚠️ getDirectVal: ${prop} es un objeto:`, val);
          return val.monto || val.valor || 0;
        }
        return val || 0;
      } catch (e) { return 0; }
    };

    const p1 = p.primerPremio || {};
    const p2 = p.segundoPremio || {};
    const p3 = p.terceroPremio || {};
    const pag = p.agenciero || {};
    const pfr = p.fondoReserva || {};
    const ptot = p.importeTotalPremios || {};

    // DEBUG: Loguear estructura
    console.log('📊 Estructura de premios:');
    console.log('   p1 (primerPremio):', p1);
    console.log('   p1.recaudacion:', p1.recaudacion);
    console.log('   pfr (fondoReserva):', pfr);
    console.log('   ptot (importeTotalPremios):', ptot);

    // Renderizar filas
    let html = `
      <!-- PRIMER PREMIO -->
      <tr style="background: rgba(255, 215, 0, 0.05); border-top: 2px solid var(--border-color);">
        <td><i class="fas fa-medal text-warning"></i> Recaudación 1er Premio</td>
        <td>62%</td>
        <td>$${fmt(getVal(p1, 'recaudacion', 'calculado'))}</td>
        <td>$${fmt(getVal(p1, 'recaudacion', 'oficial'))}</td>
        <td class="${getDiffClass(getVal(p1, 'recaudacion', 'diferencia'))}">${getDiffText(getVal(p1, 'recaudacion', 'diferencia'))}</td>
        <td>${getStatus(getVal(p1, 'recaudacion', 'diferencia'))}</td>
      </tr>
      <tr>
        <td style="padding-left: 2rem;"><span class="text-muted">↳</span> Arrastre del Pozo</td>
        <td>-</td>
        <td>$${fmt(getVal(p1, 'pozoVacante', 'calculado'))}</td>
        <td>$${fmt(getVal(p1, 'pozoVacante', 'oficial'))}</td>
        <td class="${getDiffClass(getVal(p1, 'pozoVacante', 'diferencia'))}">${getDiffText(getVal(p1, 'pozoVacante', 'diferencia'))}</td>
        <td>${getStatus(getVal(p1, 'pozoVacante', 'diferencia'))}</td>
      </tr>
      <tr>
        <td style="padding-left: 2rem;"><span class="text-muted">↳</span> Diferencia a Asegurar</td>
        <td>-</td>
        <td>$${fmt(getVal(p1, 'diferenciaAsegurar', 'calculado'))}</td>
        <td>$${fmt(getVal(p1, 'diferenciaAsegurar', 'oficial'))}</td>
        <td class="${getDiffClass(getVal(p1, 'diferenciaAsegurar', 'diferencia'))}">${getDiffText(getVal(p1, 'diferenciaAsegurar', 'diferencia'))}</td>
        <td>${getStatus(getVal(p1, 'diferenciaAsegurar', 'diferencia'))}</td>
      </tr>
      <tr style="font-weight: 600;">
        <td style="padding-left: 2rem;"><span class="text-muted">↳</span> Importe Final 1er Premio</td>
        <td>-</td>
        <td>$${fmt(getVal(p1, 'importeFinal', 'calculado'))}</td>
        <td>$${fmt(getVal(p1, 'importeFinal', 'oficial'))}</td>
        <td class="${getDiffClass(getVal(p1, 'importeFinal', 'diferencia'))}">${getDiffText(getVal(p1, 'importeFinal', 'diferencia'))}</td>
        <td>${getStatus(getVal(p1, 'importeFinal', 'diferencia'))}</td>
      </tr>

      <!-- SEGUNDO PREMIO -->
      <tr style="background: rgba(192, 192, 192, 0.05); border-top: 1px solid var(--border-color);">
        <td><i class="fas fa-medal text-secondary"></i> 2do Recaudación Premio (7 aciertos)</td>
        <td>23.50%</td>
        <td>$${fmt(getVal(p2, 'recaudacion', 'calculado'))}</td>
        <td>$${fmt(getVal(p2, 'recaudacion', 'oficial'))}</td>
        <td class="${getDiffClass(getVal(p2, 'recaudacion', 'diferencia'))}">${getDiffText(getVal(p2, 'recaudacion', 'diferencia'))}</td>
        <td>${getStatus(getVal(p2, 'recaudacion', 'diferencia'))}</td>
      </tr>
      <tr>
        <td style="padding-left: 2rem;"><span class="text-muted">↳</span> Arrastre del Pozo</td>
        <td>-</td>
        <td>$${fmt(getVal(p2, 'pozoVacante', 'calculado'))}</td>
        <td>$${fmt(getVal(p2, 'pozoVacante', 'oficial'))}</td>
        <td class="${getDiffClass(getVal(p2, 'pozoVacante', 'diferencia'))}">${getDiffText(getVal(p2, 'pozoVacante', 'diferencia'))}</td>
        <td>${getStatus(getVal(p2, 'pozoVacante', 'diferencia'))}</td>
      </tr>
      <tr style="font-weight: 600;">
        <td style="padding-left: 2rem;"><span class="text-muted">↳</span> Importe Final 2do Premio</td>
        <td>-</td>
        <td>$${fmt(getVal(p2, 'importeFinal', 'calculado'))}</td>
        <td>$${fmt(getVal(p2, 'importeFinal', 'oficial'))}</td>
        <td class="${getDiffClass(getVal(p2, 'importeFinal', 'diferencia'))}">${getDiffText(getVal(p2, 'importeFinal', 'diferencia'))}</td>
        <td>${getStatus(getVal(p2, 'importeFinal', 'diferencia'))}</td>
      </tr>

      <!-- TERCER PREMIO -->
      <tr style="background: rgba(205, 127, 50, 0.05); border-top: 1px solid var(--border-color);">
        <td><i class="fas fa-medal text-warning-dark"></i> 3er Premio (6 aciertos)</td>
        <td>10%</td>
        <td>$${fmt(getVal(p3, 'recaudacion', 'calculado'))}</td>
        <td>$${fmt(getVal(p3, 'recaudacion', 'oficial'))}</td>
        <td class="${getDiffClass(getVal(p3, 'recaudacion', 'diferencia'))}">${getDiffText(getVal(p3, 'recaudacion', 'diferencia'))}</td>
        <td>${getStatus(getVal(p3, 'recaudacion', 'diferencia'))}</td>
      </tr>
      <tr>
        <td style="padding-left: 2rem;"><span class="text-muted">↳</span> Arrastre del Pozo</td>
        <td>-</td>
        <td>$${fmt(getVal(p3, 'pozoVacante', 'calculado'))}</td>
        <td>$${fmt(getVal(p3, 'pozoVacante', 'oficial'))}</td>
        <td class="${getDiffClass(getVal(p3, 'pozoVacante', 'diferencia'))}">${getDiffText(getVal(p3, 'pozoVacante', 'diferencia'))}</td>
        <td>${getStatus(getVal(p3, 'pozoVacante', 'diferencia'))}</td>
      </tr>
      <tr style="font-weight: 600;">
        <td style="padding-left: 2rem;"><span class="text-muted">↳</span> Importe Final 3er Premio</td>
        <td>-</td>
        <td>$${fmt(getVal(p3, 'importeFinal', 'calculado'))}</td>
        <td>$${fmt(getVal(p3, 'importeFinal', 'oficial'))}</td>
        <td class="${getDiffClass(getVal(p3, 'importeFinal', 'diferencia'))}">${getDiffText(getVal(p3, 'importeFinal', 'diferencia'))}</td>
        <td>${getStatus(getVal(p3, 'importeFinal', 'diferencia'))}</td>
      </tr>

      <!-- PREMIO AGENCIERO -->
      <tr style="border-top: 1px solid var(--border-color);">
        <td><i class="fas fa-user-tie text-info"></i> Premio Agenciero</td>
        <td>0.50%</td>
        <td>$${fmt(getVal(pag, 'recaudacion', 'calculado'))}</td>
        <td>$${fmt(getVal(pag, 'recaudacion', 'oficial'))}</td>
        <td class="${getDiffClass(getVal(pag, 'recaudacion', 'diferencia'))}">${getDiffText(getVal(pag, 'recaudacion', 'diferencia'))}</td>
        <td>${getStatus(getVal(pag, 'recaudacion', 'diferencia'))}</td>
      </tr>
      <tr>
        <td style="padding-left: 2rem;"><span class="text-muted">↳</span> Arrastre del Pozo</td>
        <td>-</td>
        <td>$${fmt(getVal(pag, 'pozoVacante', 'calculado'))}</td>
        <td>$${fmt(getVal(pag, 'pozoVacante', 'oficial'))}</td>
        <td class="${getDiffClass(getVal(pag, 'pozoVacante', 'diferencia'))}">${getDiffText(getVal(pag, 'pozoVacante', 'diferencia'))}</td>
        <td>${getStatus(getVal(pag, 'pozoVacante', 'diferencia'))}</td>
      </tr>
       <tr style="font-weight: 600;">
        <td style="padding-left: 2rem;"><span class="text-muted">↳</span> Total Agenciero</td>
        <td>-</td>
        <td>$${fmt(getVal(pag, 'importeFinal', 'calculado'))}</td>
        <td>$${fmt(getVal(pag, 'importeFinal', 'oficial'))}</td>
        <td class="${getDiffClass(getVal(pag, 'importeFinal', 'diferencia'))}">${getDiffText(getVal(pag, 'importeFinal', 'diferencia'))}</td>
        <td>${getStatus(getVal(pag, 'importeFinal', 'diferencia'))}</td>
      </tr>

      <!-- FONDO RESERVA -->
      <tr style="border-top: 1px solid var(--border-color); background: rgba(0, 0, 0, 0.05);">
        <td><i class="fas fa-landmark text-muted"></i> Fondo de Reserva</td>
        <td>4%</td>
        <td>$${fmt(pfr.calculado)}</td>
        <td>$${fmt(pfr.oficial)}</td>
        <td class="${getDiffClass(pfr.diferencia)}">${getDiffText(pfr.diferencia)}</td>
        <td>${getStatus(pfr.diferencia)}</td>
      </tr>

      <!-- TOTAL -->
      <tr style="border-top: 2px solid var(--border-color); font-weight: bold; background: var(--bg-card-hover);">
        <td><i class="fas fa-money-bill-wave text-success"></i> Total Premios</td>
        <td>45%</td>
        <td>$${fmt(ptot.calculado)}</td>
        <td>$${fmt(ptot.oficial)}</td>
        <td class="${getDiffClass(ptot.diferencia)}">${getDiffText(ptot.diferencia)}</td>
        <td>${getStatus(ptot.diferencia)}</td>
      </tr>
    `;

    tableBody.innerHTML = html;

  } catch (error) {
    console.error('Error renderizando tabla Poceada:', error);
    tableBody.innerHTML = `<tr><td colspan="6" class="text-danger">Error renderizando datos: ${error.message}</td></tr>`;
  }
}

/**
 * Renderiza las cards de distribución de premios calculados
 * NOTA: Esta card está oculta por defecto, la comparación ya muestra todo
 */
function renderDistribucionPremiosPoceada(data) {
  const card = document.getElementById('cp-distribucion-premios-card');
  if (!card) return;

  // Ocultar esta card ya que la comparación de premios muestra todo el desglose
  card.classList.add('hidden');
  return;

  // El código siguiente se mantiene por si se necesita en el futuro
  if (!data.distribucionPremios) {
    card.classList.add('hidden');
    return;
  }

  card.classList.remove('hidden');
  const dist = data.distribucionPremios;

  // Actualizar valores
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = '$' + formatNumber(Math.round(value || 0));
  };

  set('cp-premio-1ro', dist.primerPremio?.total);
  set('cp-premio-2do', dist.segundoPremio?.total);
  set('cp-premio-3ro', dist.terceroPremio?.total);
  set('cp-premio-agenciero', dist.agenciero?.total);
  set('cp-fondo-reserva', dist.fondoReserva?.monto || dist.fondoReserva);
  set('cp-total-premios', dist.importeTotalPremios);

  // Mostrar arrastre del 1er premio si existe
  const arrastre1ro = document.getElementById('cp-premio-1ro-arrastre');
  if (arrastre1ro) {
    if (dist.primerPremio?.pozoVacante > 0) {
      arrastre1ro.innerHTML = `<span style="color: var(--accent-color);">+ $${formatNumber(Math.round(dist.primerPremio.pozoVacante))} arrastre</span>`;
    } else {
      arrastre1ro.textContent = '';
    }
  }

  // Mostrar pozo asegurado
  const pozoAseguradoBadge = document.getElementById('cp-pozo-asegurado-badge');
  if (pozoAseguradoBadge && dist.primerPremio?.pozoAsegurado) {
    pozoAseguradoBadge.textContent = `Pozo Asegurado: $${formatNumber(dist.primerPremio.pozoAsegurado)}`;
  }
}

function renderTablasQuiniela(data) {
  // Asegurar que las cards de provincias estén visibles
  mostrarCardsProvincias();
  const calc = data.datosCalculados;
  const tbodyRecProv = document.querySelector('#cp-tabla-recaudacion-prov tbody');
  const tbodyProv = document.querySelector('#cp-tabla-provincias tbody');

  if (tbodyRecProv && calc.provincias) {
    tbodyRecProv.innerHTML = '';
    const totalRecaudacion = calc.recaudacion || 1;
    for (const [codigo, prov] of Object.entries(calc.provincias)) {
      if (prov.recaudacion > 0) {
        const porcentaje = ((prov.recaudacion / totalRecaudacion) * 100).toFixed(2);
        tbodyRecProv.innerHTML += `
          <tr>
            <td><strong>${prov.nombre}</strong> (${codigo})</td>
            <td>$${formatNumber(Math.round(prov.recaudacion))}</td>
            <td>${porcentaje}%</td>
          </tr>
        `;
      }
    }
  }

  if (tbodyProv && calc.provincias) {
    tbodyProv.innerHTML = '';
    const totalApuestas = calc.apuestasTotal || 1;
    for (const [codigo, prov] of Object.entries(calc.provincias)) {
      if (prov.apuestas > 0) {
        const porcentaje = ((prov.apuestas / totalApuestas) * 100).toFixed(2);
        tbodyProv.innerHTML += `
          <tr>
            <td><strong>${prov.nombre}</strong> (${codigo})</td>
            <td>${formatNumber(prov.apuestas)}</td>
            <td>${porcentaje}%</td>
          </tr>
        `;
      }
    }
  }
}

// =============================================
// TOMBOLINA - Desglose por tipo de apuesta
// =============================================

function renderTablasTombolina(data) {
  const card = document.getElementById('cp-tombolina-desglose-card');
  const tbody = document.getElementById('cp-tombolina-desglose-body');
  if (!card || !tbody) return;

  // Mostrar la card
  card.classList.remove('hidden');

  const calc = data.datosCalculados || {};
  const desglose = data.desglosePorRango || {};
  const validas = desglose.validas || calc.apuestasPorNumeros || {};
  const anuladas = desglose.anuladas || calc.apuestasAnuladasPorNumeros || {};
  const recaudacionPorNum = data.recaudacionPorNumeros || calc.recaudacionPorNumeros || {};

  const totalValidas = Object.values(validas).reduce((a, b) => a + (b || 0), 0);
  const totalAnuladas = Object.values(anuladas).reduce((a, b) => a + (b || 0), 0);
  const totalRecaudacion = Object.values(recaudacionPorNum).reduce((a, b) => a + (b || 0), 0);

  // Colores para cada tipo de apuesta
  const colores = {
    7: { icon: 'fa-star', color: '#FFD700', label: 'Apuesta a 7 numeros' },
    6: { icon: 'fa-dice-six', color: '#C0C0C0', label: 'Apuesta a 6 numeros' },
    5: { icon: 'fa-dice-five', color: '#CD7F32', label: 'Apuesta a 5 numeros' },
    4: { icon: 'fa-dice-four', color: '#4CAF50', label: 'Apuesta a 4 numeros' },
    3: { icon: 'fa-dice-three', color: '#2196F3', label: 'Apuesta a 3 numeros' }
  };

  let html = '';

  // Renderizar de 7 a 3
  for (let num = 7; num >= 3; num--) {
    const v = validas[num] || 0;
    const a = anuladas[num] || 0;
    const total = v + a;
    const rec = recaudacionPorNum[num] || 0;
    const pct = totalValidas > 0 ? ((v / totalValidas) * 100).toFixed(1) : '0.0';
    const cfg = colores[num];

    html += `
      <tr>
        <td>
          <i class="fas ${cfg.icon}" style="color: ${cfg.color}; margin-right: 0.5rem;"></i>
          <strong>${cfg.label}</strong>
        </td>
        <td>${formatNumber(v)}</td>
        <td>$${formatNumber(Math.round(rec))}</td>
        <td>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <div style="flex: 1; background: var(--bg-input); border-radius: 4px; height: 8px; overflow: hidden;">
              <div style="width: ${pct}%; height: 100%; background: ${cfg.color}; border-radius: 4px;"></div>
            </div>
            <span style="min-width: 50px; text-align: right;">${pct}%</span>
          </div>
        </td>
        <td>${formatNumber(a)}</td>
        <td>${formatNumber(total)}</td>
      </tr>
    `;
  }

  tbody.innerHTML = html;

  // Totales en footer
  document.getElementById('cp-tmb-total-validas').textContent = formatNumber(totalValidas);
  document.getElementById('cp-tmb-total-recaudacion').textContent = '$' + formatNumber(Math.round(totalRecaudacion));
  document.getElementById('cp-tmb-total-anuladas').textContent = formatNumber(totalAnuladas);
  document.getElementById('cp-tmb-total-general').textContent = formatNumber(totalValidas + totalAnuladas);
}

// Ocultar card de Tombolina cuando se procesa otro juego
function ocultarCardTombolina() {
  const card = document.getElementById('cp-tombolina-desglose-card');
  if (card) card.classList.add('hidden');
}

// Ocultar cards de Provincias (Tombolina no tiene provincias)
function ocultarCardsProvincias() {
  const tablaRecProv = document.getElementById('cp-tabla-recaudacion-prov');
  const tablaProv = document.getElementById('cp-tabla-provincias');
  if (tablaRecProv) tablaRecProv.closest('.card').style.display = 'none';
  if (tablaProv) tablaProv.closest('.card').style.display = 'none';
}

// Mostrar cards de Provincias (para Quiniela/Poceada)
function mostrarCardsProvincias() {
  const tablaRecProv = document.getElementById('cp-tabla-recaudacion-prov');
  const tablaProv = document.getElementById('cp-tabla-provincias');
  if (tablaRecProv) tablaRecProv.closest('.card').style.display = '';
  if (tablaProv) tablaProv.closest('.card').style.display = '';
}

// =============================================
// MODAL POZOS DE ARRASTRE (4 pozos: 1er, 2do, 3er, Agenciero)
// =============================================

function abrirModalPozosArrastre() {
  const modal = document.getElementById('modal-pozos-arrastre');
  if (!modal) return;

  // Info del sorteo actual
  const sorteoInfo = document.getElementById('pozos-arrastre-sorteo-info');
  if (sorteoInfo && cpResultadosActuales) {
    const numSorteo = cpResultadosActuales.sorteo || cpResultadosActuales.datosCalculados?.numeroSorteo || '-';
    sorteoInfo.textContent = `Sorteo actual: ${numSorteo} (cargando arrastres del sorteo anterior)`;
  }

  // Pre-cargar valores actuales en los inputs
  const arrastres = cpResultadosActuales?._pozosArrastre || {};
  document.getElementById('pozo-arrastre-1er').value = arrastres.primerPremio || '';
  document.getElementById('pozo-arrastre-2do').value = arrastres.segundoPremio || '';
  document.getElementById('pozo-arrastre-3er').value = arrastres.tercerPremio || '';
  document.getElementById('pozo-arrastre-agenciero').value = arrastres.agenciero || '';

  modal.classList.remove('hidden');
}

function cerrarModalPozosArrastre() {
  const modal = document.getElementById('modal-pozos-arrastre');
  if (modal) modal.classList.add('hidden');
}

function parsearMonto(texto) {
  if (!texto) return 0;
  // Soportar formatos: 826000000, 826.000.000, 826,000,000
  const limpio = String(texto).replace(/\./g, '').replace(/,/g, '.').replace(/[^0-9.]/g, '');
  return parseFloat(limpio) || 0;
}

async function aplicarPozosArrastre() {
  const arrastres = {
    primerPremio: parsearMonto(document.getElementById('pozo-arrastre-1er').value),
    segundoPremio: parsearMonto(document.getElementById('pozo-arrastre-2do').value),
    tercerPremio: parsearMonto(document.getElementById('pozo-arrastre-3er').value),
    agenciero: parsearMonto(document.getElementById('pozo-arrastre-agenciero').value)
  };

  // Guardar en el estado local
  if (!cpResultadosActuales) cpResultadosActuales = {};
  cpResultadosActuales._pozosArrastre = arrastres;
  cpResultadosActuales.pozoArrastre = arrastres.primerPremio;

  // Actualizar la UI de los pozos
  actualizarDisplayPozosArrastre(arrastres, 'manual');

  // Recalcular distribución de premios con los nuevos arrastres
  recalcularDistribucionConArrastres(arrastres);

  cerrarModalPozosArrastre();
  showToast('Pozos de arrastre actualizados. Distribución recalculada.', 'success');

  // Intentar guardar en backend (para que quede persistido)
  try {
    const token = getToken();
    const sorteo = cpResultadosActuales.sorteo || cpResultadosActuales.datosCalculados?.numeroSorteo;
    if (sorteo && token) {
      await fetch(`${API_BASE}/control-previo/poceada/guardar-arrastres`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ sorteo, arrastres })
      });
    }
  } catch (e) {
    console.warn('No se pudieron guardar arrastres en BD (se usaron solo localmente):', e.message);
  }
}

function actualizarDisplayPozosArrastre(arrastres, fuente) {
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = '$' + formatNumber(Math.round(val || 0));
  };

  set('cp-pozo-arrastre-1er', arrastres.primerPremio);
  set('cp-pozo-arrastre-2do', arrastres.segundoPremio);
  set('cp-pozo-arrastre-3er', arrastres.tercerPremio);
  set('cp-pozo-arrastre-agenciero', arrastres.agenciero);

  // Indicar fuente
  const fuenteEl = document.getElementById('cp-pozos-fuente-texto');
  if (fuenteEl) {
    if (fuente === 'bd') {
      fuenteEl.innerHTML = '<i class="fas fa-database text-success"></i> Datos obtenidos de la BD (sorteo anterior)';
    } else if (fuente === 'manual') {
      fuenteEl.innerHTML = '<i class="fas fa-pen text-warning"></i> Arrastres cargados manualmente';
    } else {
      fuenteEl.innerHTML = '<i class="fas fa-exclamation-triangle text-danger"></i> Sin datos de arrastre - <a href="#" onclick="abrirModalPozosArrastre(); return false;" style="color: var(--primary);">Cargar manualmente</a>';
    }
  }
}

function recalcularDistribucionConArrastres(arrastres) {
  if (!cpResultadosActuales || !cpResultadosActuales.datosCalculados) return;

  const recaudacion = cpResultadosActuales.datosCalculados.recaudacion || 0;

  // Porcentajes de Poceada
  const PORCENTAJE_REC = 0.45;
  const PRIMER_PREMIO_PORC = 0.62;
  const SEGUNDO_PREMIO_PORC = 0.235;
  const TERCERO_PREMIO_PORC = 0.10;
  const AGENCIERO_PORC = 0.005;
  const FONDO_PORC = 0.04;

  const recaudacionPremios = recaudacion * PORCENTAJE_REC;

  // Bases
  const p1Base = recaudacionPremios * PRIMER_PREMIO_PORC;
  const p2Base = recaudacionPremios * SEGUNDO_PREMIO_PORC;
  const p3Base = recaudacionPremios * TERCERO_PREMIO_PORC;
  const agBase = recaudacionPremios * AGENCIERO_PORC;
  const fondoReserva = recaudacionPremios * FONDO_PORC;

  // Totales con arrastres
  const p1Total = p1Base + (arrastres.primerPremio || 0);
  const p2Total = p2Base + (arrastres.segundoPremio || 0);
  const p3Total = p3Base + (arrastres.tercerPremio || 0);
  const agTotal = agBase + (arrastres.agenciero || 0);

  // Pozo asegurado
  const pozoAsegurado = 60000000;
  const diferenciaAsegurar = p1Total < pozoAsegurado ? (pozoAsegurado - p1Total) : 0;
  const importeFinal = Math.max(p1Total, pozoAsegurado);

  // Actualizar cards de distribución
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = '$' + formatNumber(Math.round(val || 0));
  };
  set('cp-premio-1ro', p1Total);
  set('cp-premio-2do', p2Total);
  set('cp-premio-3ro', p3Total);
  set('cp-premio-agenciero', agTotal);
  set('cp-fondo-reserva', fondoReserva);
  set('cp-total-premios', recaudacionPremios);

  // Actualizar arrastre del 1er premio
  const arrastre1ro = document.getElementById('cp-premio-1ro-arrastre');
  if (arrastre1ro) {
    if (arrastres.primerPremio > 0) {
      arrastre1ro.innerHTML = `<span style="color: var(--accent-color);">+ $${formatNumber(Math.round(arrastres.primerPremio))} arrastre</span>`;
    } else {
      arrastre1ro.textContent = '';
    }
  }

  // Actualizar tabla de comparación de premios (columna "Calculado")
  actualizarComparacionPremiosConArrastres(arrastres, {
    p1Base, p2Base, p3Base, agBase, fondoReserva,
    p1Total, p2Total, p3Total, agTotal,
    diferenciaAsegurar, importeFinal, recaudacionPremios
  });
}

function actualizarComparacionPremiosConArrastres(arrastres, calc) {
  // Buscar la tabla de comparación de premios y actualizar las filas de "Arrastre del Pozo"
  const tableBody = document.getElementById('cp-tabla-premios');
  if (!tableBody) return;

  // Necesitamos re-renderizar porque la tabla tiene datos del XML para comparar
  // Buscar los datos originales y re-renderizar con nuevos arrastres
  if (cpResultadosActuales && cpResultadosActuales.comparacion && cpResultadosActuales.comparacion.premios) {
    const p = cpResultadosActuales.comparacion.premios;

    // Actualizar valores calculados de pozoVacante en la comparación
    if (p.primerPremio && p.primerPremio.pozoVacante) {
      p.primerPremio.pozoVacante.calculado = arrastres.primerPremio || 0;
      p.primerPremio.pozoVacante.diferencia = (arrastres.primerPremio || 0) - (p.primerPremio.pozoVacante.oficial || 0);
    }
    if (p.segundoPremio && p.segundoPremio.pozoVacante) {
      p.segundoPremio.pozoVacante.calculado = arrastres.segundoPremio || 0;
      p.segundoPremio.pozoVacante.diferencia = (arrastres.segundoPremio || 0) - (p.segundoPremio.pozoVacante.oficial || 0);
    }
    if (p.terceroPremio && p.terceroPremio.pozoVacante) {
      p.terceroPremio.pozoVacante.calculado = arrastres.tercerPremio || 0;
      p.terceroPremio.pozoVacante.diferencia = (arrastres.tercerPremio || 0) - (p.terceroPremio.pozoVacante.oficial || 0);
    }
    if (p.agenciero && p.agenciero.pozoVacante) {
      p.agenciero.pozoVacante.calculado = arrastres.agenciero || 0;
      p.agenciero.pozoVacante.diferencia = (arrastres.agenciero || 0) - (p.agenciero.pozoVacante.oficial || 0);
    }

    // Actualizar recaudacion calculada (base + arrastre)
    if (p.primerPremio && p.primerPremio.recaudacion) {
      const base = calc.p1Base;
      p.primerPremio.recaudacion.calculado = base;
    }
    if (p.primerPremio && p.primerPremio.importeFinal) {
      p.primerPremio.importeFinal.calculado = calc.importeFinal;
      p.primerPremio.importeFinal.diferencia = calc.importeFinal - (p.primerPremio.importeFinal.oficial || 0);
    }
    if (p.primerPremio && p.primerPremio.diferenciaAsegurar) {
      p.primerPremio.diferenciaAsegurar.calculado = calc.diferenciaAsegurar;
      p.primerPremio.diferenciaAsegurar.diferencia = calc.diferenciaAsegurar - (p.primerPremio.diferenciaAsegurar.oficial || 0);
    }
    if (p.segundoPremio && p.segundoPremio.importeFinal) {
      p.segundoPremio.importeFinal.calculado = calc.p2Total;
      p.segundoPremio.importeFinal.diferencia = calc.p2Total - (p.segundoPremio.importeFinal.oficial || 0);
    }
    if (p.terceroPremio && p.terceroPremio.importeFinal) {
      p.terceroPremio.importeFinal.calculado = calc.p3Total;
      p.terceroPremio.importeFinal.diferencia = calc.p3Total - (p.terceroPremio.importeFinal.oficial || 0);
    }
    if (p.agenciero && p.agenciero.importeFinal) {
      p.agenciero.importeFinal.calculado = calc.agTotal;
      p.agenciero.importeFinal.diferencia = calc.agTotal - (p.agenciero.importeFinal.oficial || 0);
    }

    // Actualizar distribucionPremios en el estado
    if (cpResultadosActuales.distribucionPremios) {
      cpResultadosActuales.distribucionPremios.primerPremio = {
        ...cpResultadosActuales.distribucionPremios.primerPremio,
        pozoVacante: arrastres.primerPremio || 0,
        total: calc.p1Total,
        importeFinal: calc.importeFinal,
        diferenciaAsegurar: calc.diferenciaAsegurar
      };
      cpResultadosActuales.distribucionPremios.segundoPremio = {
        ...cpResultadosActuales.distribucionPremios.segundoPremio,
        pozoVacante: arrastres.segundoPremio || 0,
        total: calc.p2Total
      };
      cpResultadosActuales.distribucionPremios.terceroPremio = {
        ...cpResultadosActuales.distribucionPremios.terceroPremio,
        pozoVacante: arrastres.tercerPremio || 0,
        total: calc.p3Total
      };
      cpResultadosActuales.distribucionPremios.agenciero = {
        ...cpResultadosActuales.distribucionPremios.agenciero,
        pozoVacante: arrastres.agenciero || 0,
        total: calc.agTotal
      };
    }

    // Re-renderizar la tabla completa
    renderComparacionPremiosPoceada(cpResultadosActuales);
  }
}

// Función para mostrar automáticamente el modal si no hay arrastres
function verificarYMostrarModalArrastres(data) {
  if (data.tipoJuego !== 'Poceada') return;

  const pozoArrastre = data.pozoArrastre || 0;
  const arrastres = {
    primerPremio: pozoArrastre,
    segundoPremio: data.distribucionPremios?.segundoPremio?.pozoVacante || 0,
    tercerPremio: data.distribucionPremios?.terceroPremio?.pozoVacante || 0,
    agenciero: data.distribucionPremios?.agenciero?.pozoVacante || 0
  };

  // Guardar en estado
  if (!cpResultadosActuales) cpResultadosActuales = {};
  cpResultadosActuales._pozosArrastre = arrastres;

  const tieneDatos = arrastres.primerPremio > 0 || arrastres.segundoPremio > 0 || arrastres.tercerPremio > 0 || arrastres.agenciero > 0;

  if (tieneDatos) {
    actualizarDisplayPozosArrastre(arrastres, 'bd');
  } else {
    actualizarDisplayPozosArrastre(arrastres, 'sin_datos');
    // Mostrar modal automáticamente tras un breve delay
    setTimeout(() => {
      abrirModalPozosArrastre();
    }, 1500);
  }
}

function formatNumber(num) {
  // Convertir a número si viene como string (común en valores DECIMAL de MySQL)
  const valor = parseFloat(num) || 0;
  return valor.toLocaleString('es-AR');
}

// Imprimir Reporte de Control Posterior (Escrutinio)
async function imprimirReportePosterior() {
  if (!cpstResultados) {
    showToast('No hay resultados de escrutinio para imprimir', 'warning');
    return;
  }

  showToast('Generando Reporte PDF...', 'info');

  try {
    const token = getToken();

    // Obtener datos del sorteo desde programación (cpResultadosActuales del Control Previo)
    const sorteoInfo = cpResultadosActuales?.sorteo || {};
    const programacionInfo = sorteoInfo.programacion || cpResultadosActuales?.validacionProgramacion?.sorteo || {};
    const modalidadInfo = sorteoInfo.modalidad || {};

    // Formatear fecha desde programación
    let fechaSorteoFormateada = '';
    if (programacionInfo.fecha) {
      const fecha = new Date(programacionInfo.fecha);
      fechaSorteoFormateada = fecha.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }

    const response = await fetch(`${API_BASE}/actas/control-posterior/generar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        tipoJuego: cpstJuegoSeleccionado,
        numeroSorteo: sorteoInfo.numero || cpstNumeroSorteo || cpstResultados.numeroSorteo || 'S/N',
        fechaSorteo: fechaSorteoFormateada || cpstResultados.fechaSorteo || '',
        modalidad: {
          codigo: modalidadInfo.codigo || cpstModalidadSorteo || '',
          nombre: modalidadInfo.nombre || getNombreModalidad(cpstModalidadSorteo) || ''
        },
        programacion: programacionInfo,
        resultado: cpstResultados,
        extractos: cpstExtractos // Enviar los extractos con sus números y letras
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Error generando PDF');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Acta_ControlPosterior_${cpstJuegoSeleccionado}_${new Date().toISOString().split('T')[0]}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    showToast('Reporte PDF generado correctamente', 'success');

  } catch (error) {
    console.error('Error:', error);
    showToast('Error al generar el PDF: ' + error.message, 'error');
  }
}

// Imprimir Reporte de Control Previo (PDF técnico)
async function imprimirReporteCP() {
  if (!cpResultadosActuales) {
    showToast('No hay datos para imprimir', 'warning');
    return;
  }

  showToast('Generando Reporte PDF...', 'info');

  try {
    const token = getToken();
    const response = await fetch(`${API_BASE}/actas/control-previo/generar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(cpResultadosActuales)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Error generando PDF');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => window.URL.revokeObjectURL(url), 30000);

    showToast('Reporte generado correctamente', 'success');

  } catch (error) {
    console.error('Error:', error);
    showToast(error.message || 'Error generando reporte', 'error');
  }
}

// =============================================
// ACTAS NOTARIALES
// =============================================

function initActas() {
  // Mostrar/ocultar campo de sorteo sustituto según tipo de acta
  document.querySelectorAll('input[name="tipo-acta"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const sustitutoRow = document.getElementById('acta-sustituto-row');
      if (document.querySelector('input[name="tipo-acta"]:checked').value === 'SUSTITUTO') {
        sustitutoRow.style.display = 'flex';
      } else {
        sustitutoRow.style.display = 'none';
      }
    });
  });

  // Establecer fecha de hoy
  document.getElementById('acta-fecha').value = new Date().toISOString().split('T')[0];

  // Cargar datos desde la programación si hay un sorteo procesado
  cargarDatosProgramacionEnActa();
}

// Cargar automáticamente datos de la programación en el formulario de Actas
function cargarDatosProgramacionEnActa() {
  // Verificar si hay datos del control previo procesado
  if (!cpResultadosActuales || !cpResultadosActuales.sorteo) {
    console.log('No hay datos de sorteo para cargar en el acta');
    return;
  }

  const sorteoInfo = cpResultadosActuales.sorteo || {};
  const programacion = sorteoInfo.programacion || cpResultadosActuales.validacionProgramacion?.sorteo || {};
  const modalidadInfo = sorteoInfo.modalidad || {};
  const tipoJuego = cpResultadosActuales.tipoJuego || 'Quiniela';

  console.log('Cargando datos de programación en acta:', { sorteoInfo, programacion, modalidadInfo });

  // N° Sorteo
  if (sorteoInfo.numero || programacion.numero) {
    document.getElementById('acta-numero-sorteo').value = sorteoInfo.numero || programacion.numero;
  }

  // Fecha del sorteo
  if (programacion.fecha) {
    const fecha = new Date(programacion.fecha);
    document.getElementById('acta-fecha').value = fecha.toISOString().split('T')[0];
  }

  // Juego (Quiniela/Poceada)
  const selectJuego = document.getElementById('acta-juego');
  if (tipoJuego.toUpperCase() === 'POCEADA') {
    selectJuego.value = 'POCEADA';
  } else {
    selectJuego.value = 'QUINIELA';
  }

  // Modalidad
  const selectModalidad = document.getElementById('acta-modalidad');
  const nombreModalidad = modalidadInfo.nombre || programacion.modalidad || '';
  if (nombreModalidad) {
    // Mapear nombre a valor del select
    const mapeoModalidad = {
      'LA PREVIA': 'LA PREVIA',
      'La Previa': 'LA PREVIA',
      'PREVIA': 'LA PREVIA',
      'LA PRIMERA': 'LA PRIMERA',
      'La Primera': 'LA PRIMERA',
      'PRIMERA': 'LA PRIMERA',
      'MATUTINA': 'MATUTINA',
      'Matutina': 'MATUTINA',
      'VESPERTINA': 'VESPERTINA',
      'Vespertina': 'VESPERTINA',
      'NOCTURNA': 'NOCTURNA',
      'Nocturna': 'NOCTURNA',
      'MONTEVIDEO': 'MONTEVIDEO',
      'Montevideo': 'MONTEVIDEO'
    };
    const valorModalidad = mapeoModalidad[nombreModalidad] || nombreModalidad.toUpperCase();
    // Buscar opción que coincida
    for (const option of selectModalidad.options) {
      if (option.value === valorModalidad || option.value.includes(nombreModalidad.toUpperCase())) {
        selectModalidad.value = option.value;
        break;
      }
    }
  }

  // Hora programada (desde programación)
  if (programacion.hora) {
    // programacion.hora puede venir como "14:00:00" o "14:00"
    const hora = programacion.hora.substring(0, 5); // Tomar solo HH:MM
    document.getElementById('acta-hora-programada').value = hora;
  }

  // Jurisdicciones desde programación
  if (programacion.prov_caba !== undefined) {
    document.getElementById('jur-caba').checked = programacion.prov_caba === 1;
  }
  if (programacion.prov_bsas !== undefined) {
    document.getElementById('jur-bsas').checked = programacion.prov_bsas === 1;
  }
  if (programacion.prov_cordoba !== undefined) {
    document.getElementById('jur-cordoba').checked = programacion.prov_cordoba === 1;
  }
  if (programacion.prov_santafe !== undefined) {
    document.getElementById('jur-santafe').checked = programacion.prov_santafe === 1;
  }
  if (programacion.prov_montevideo !== undefined) {
    document.getElementById('jur-montevideo').checked = programacion.prov_montevideo === 1;
  }
  if (programacion.prov_mendoza !== undefined) {
    document.getElementById('jur-mendoza').checked = programacion.prov_mendoza === 1;
  }
  if (programacion.prov_entrerios !== undefined) {
    document.getElementById('jur-entrerios').checked = programacion.prov_entrerios === 1;
  }

  showToast('Datos del sorteo cargados desde programación', 'info');
}

function limpiarActa() {
  document.getElementById('acta-numero-sorteo').value = '';
  document.getElementById('acta-jefe').value = '';
  document.getElementById('acta-escribano').value = '';
  document.getElementById('acta-operador-sorteo').value = '';
  document.getElementById('acta-operador-tecnica').value = '';
  document.getElementById('acta-hora-inicio').value = '';
  document.getElementById('acta-hora-programada').value = '';
  document.getElementById('acta-numero-rng').value = '';
  document.getElementById('acta-ultimo-rng').value = '';
  document.getElementById('acta-sorteo-sustituto').value = '';
  document.getElementById('acta-observaciones').value = '';
}

function obtenerJurisdicciones() {
  const jurisdicciones = [];
  if (document.getElementById('jur-caba').checked) jurisdicciones.push('Ciudad Autónoma de Buenos Aires');
  if (document.getElementById('jur-bsas').checked) jurisdicciones.push('Provincia de Buenos Aires');
  if (document.getElementById('jur-cordoba').checked) jurisdicciones.push('Córdoba');
  if (document.getElementById('jur-santafe').checked) jurisdicciones.push('Santa Fe');
  if (document.getElementById('jur-montevideo').checked) jurisdicciones.push('Montevideo');
  if (document.getElementById('jur-mendoza').checked) jurisdicciones.push('Mendoza');
  if (document.getElementById('jur-entrerios').checked) jurisdicciones.push('Entre Ríos');
  return jurisdicciones.join(', ');
}

// =============================================
// CONTROL POSTERIOR
// =============================================

let cpstRegistrosNTF = [];
let cpstExtractos = [];
let cpstDatosControlPrevio = null;
let cpstResultados = null;
let cpstNumeroSorteo = '';
let cpstModalidadSorteo = ''; // R=Previa, P=Primera, M=Matutina, V=Vespertina, N=Nocturna
let cpstJuegoSeleccionado = 'Quiniela'; // 'Quiniela' o 'Poceada'
let cpstExtractoPoceada = null; // {numeros: [8 nums], letras: [4 letras]}

// Mapeo de códigos de modalidad a nombres
const MODALIDADES_NOMBRE = {
  'R': 'La Previa',
  'P': 'Primera',
  'M': 'Matutina',
  'V': 'Vespertina',
  'N': 'Nocturna',
  'A': 'Anticipada',
  'U': 'Única'
};

// Combinaciones para apuestas múltiples de Poceada (cantidad de 8-combinaciones posibles)
const COMBINACIONES_MULTIPLES_POCEADA = {
  8: 1,
  9: 9,
  10: 45,
  11: 165,
  12: 495,
  13: 1287,
  14: 3003,
  15: 6435
};

// Función para seleccionar el juego en Control Posterior
function seleccionarJuegoPosterior(juego) {
  // Normalizar nombre del juego (ajustar si viene del backend con variaciones)
  if (juego === 'poceada') juego = 'Poceada';
  if (juego === 'quiniela') juego = 'Quiniela';
  if (juego === 'tombolina') juego = 'Tombolina';

  cpstJuegoSeleccionado = juego;

  // Actualizar título
  const titulo = document.getElementById('cpst-titulo');
  const subtitulo = document.getElementById('cpst-subtitulo');
  if (titulo) titulo.textContent = `Control Posterior - ${juego}`;

  if (subtitulo) {
    if (juego === 'Poceada') {
      subtitulo.textContent = 'Escrutinio de ganadores por aciertos (6, 7 u 8)';
    } else if (juego === 'Tombolina') {
      subtitulo.textContent = 'Control de aciertos sobre extracto de Quiniela';
    } else if (['Quini 6', 'Brinco', 'Loto'].includes(juego)) {
      subtitulo.textContent = `Escrutinio de ganadores para ${juego}`;
    } else {
      subtitulo.textContent = 'Análisis de ganadores post-sorteo';
    }
  }

  // Actualizar estilos de las tarjetas de radio
  document.querySelectorAll('input[name="cpst-juego"]').forEach(radio => {
    const card = radio.closest('.radio-card');
    if (card) {
      // Comparación flexible (insensible a mayúsculas/minúsculas o espacios extra para evitar errores)
      const radioVal = radio.value.toLowerCase().trim();
      const targetVal = juego.toLowerCase().trim();

      if (radioVal === targetVal) {
        card.style.borderColor = 'var(--primary)';
        card.style.background = 'rgba(37, 99, 235, 0.05)';
        radio.checked = true;
      } else {
        card.style.borderColor = 'var(--border-color)';
        card.style.background = 'transparent';
      }
    }
  });

  // Mostrar/ocultar secciones según el juego
  const extractoQuiniela = document.getElementById('cpst-extracto-quiniela-card');
  const extractoPoceada = document.getElementById('cpst-extracto-poceada-card');
  const detalleQuiniela = document.getElementById('cpst-detalle-quiniela');
  const detallePoceada = document.getElementById('cpst-detalle-poceada');


  if (juego === 'Quiniela') {
    extractoQuiniela?.classList.remove('hidden');
    extractoPoceada?.classList.add('hidden');
    detalleQuiniela?.classList.remove('hidden');
    detallePoceada?.classList.add('hidden');
  } else {
    // Para Poceada, Tombolina, Quini 6, Brinco, Loto, etc.
    extractoQuiniela?.classList.add('hidden');
    extractoPoceada?.classList.remove('hidden');
    detalleQuiniela?.classList.add('hidden');

    if (juego === 'Poceada') {
      detallePoceada?.classList.remove('hidden');
      document.getElementById('cpst-detalle-tombolina')?.classList.add('hidden');
      document.getElementById('cpst-ganadores-tombolina')?.classList.add('hidden');
    } else if (juego === 'Tombolina') {
      detallePoceada?.classList.add('hidden');
      document.getElementById('cpst-detalle-tombolina')?.classList.remove('hidden');
      document.getElementById('cpst-ganadores-tombolina')?.classList.add('hidden');
    } else {
      detallePoceada?.classList.add('hidden');
      document.getElementById('cpst-detalle-tombolina')?.classList.add('hidden');
      document.getElementById('cpst-ganadores-tombolina')?.classList.add('hidden');
    }

    // Actualizar texto del header de extracto si existe
    const poceadaHeader = extractoPoceada?.querySelector('h3');
    if (poceadaHeader) {
      if (juego === 'Poceada') poceadaHeader.innerHTML = '<i class="fas fa-list-ol"></i> Extracto Poceada (20 Números + 4 Letras)';
      else if (juego === 'Tombolina') poceadaHeader.innerHTML = '<i class="fas fa-list-ol"></i> Extracto Tombolina (20 Números de Quiniela)';
      else if (juego === 'Quini 6') poceadaHeader.innerHTML = '<i class="fas fa-list-ol"></i> Extracto Quini 6 (Tradicional, Segunda, Revancha, Sale o Sale)';
      else if (juego === 'Brinco') poceadaHeader.innerHTML = '<i class="fas fa-list-ol"></i> Extracto Brinco (Tradicional y Junior)';
      else if (juego === 'Loto') poceadaHeader.innerHTML = '<i class="fas fa-list-ol"></i> Extracto Loto (Tradicional, Desquite, Sale o Sale)';
      else if (juego === 'Loto 5') poceadaHeader.innerHTML = '<i class="fas fa-list-ol"></i> Extracto Loto 5 (5 Números)';
      else poceadaHeader.innerHTML = `<i class="fas fa-list-ol"></i> Extracto ${juego}`;
    }
  }



  // Actualizar hint de modalidad
  const hintModalidad = document.getElementById('cpst-hint-modalidad');
  if (hintModalidad) {
    hintModalidad.textContent = juego === 'Poceada'
      ? '💡 Para Poceada solo se procesarán registros de tipo POC'
      : '💡 Al cargar XMLs, solo se procesarán los de la modalidad detectada';
  }

  // Limpiar resultados anteriores
  document.getElementById('cpst-resultados')?.classList.add('hidden');

  console.log(`Control Posterior: Juego seleccionado = ${juego}`);
}

// Funciones para cambiar tabs de extracto en Poceada
function cambiarTabExtractoPoceada(tab) {
  document.querySelectorAll('#cpst-extracto-poceada-card .tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('#cpst-extracto-poceada-card .tab-content').forEach(c => c.classList.add('hidden'));

  document.querySelector(`#cpst-extracto-poceada-card .tab[data-tab="poc-ext-${tab}"]`)?.classList.add('active');
  document.getElementById(`tab-poc-ext-${tab}`)?.classList.remove('hidden');

  // Si es tab manual, generar los inputs dinámicamente
  if (tab === 'manual') {
    generarInputsPoceadaManual();
  }
}

// Generar inputs dinámicos para entrada manual de Poceada (20 números + 4 letras)
function generarInputsPoceadaManual() {
  const numerosGrid = document.getElementById('cpst-poceada-numeros-grid');
  const letrasGrid = document.getElementById('cpst-poceada-letras-grid');

  // Generar 20 inputs de números si no existen
  if (numerosGrid && numerosGrid.children.length === 0) {
    numerosGrid.innerHTML = '';
    for (let i = 1; i <= 20; i++) {
      const div = document.createElement('div');
      div.className = 'form-group';
      div.style.margin = '0';
      div.innerHTML = `
        <label style="font-size: 0.7rem; text-align: center; display: block;">${i}°</label>
        <input type="number" min="0" max="99" class="form-control text-center poceada-numero" placeholder="00" style="font-weight: bold; font-size: 0.9rem; padding: 0.3rem;">
      `;
      numerosGrid.appendChild(div);
    }
  }

  // Generar 4 inputs de letras si no existen
  if (letrasGrid && letrasGrid.children.length === 0) {
    letrasGrid.innerHTML = '';
    for (let i = 1; i <= 4; i++) {
      const div = document.createElement('div');
      div.className = 'form-group';
      div.style.margin = '0';
      div.innerHTML = `
        <label style="font-size: 0.75rem; text-align: center; display: block;">${i}°</label>
        <input type="text" maxlength="1" class="form-control text-center poceada-letra" placeholder="${String.fromCharCode(64 + i)}" style="font-weight: bold; text-transform: uppercase;">
      `;
      letrasGrid.appendChild(div);
    }
  }
}

// Cargar extracto de Poceada desde XML
async function cargarExtractoPoceadaXML(input) {
  if (!input.files.length) return;

  const file = input.files[0];
  const text = await file.text();
  procesarXMLExtractoPoceada(text);
}

function cargarExtractoPoceadaDesdeTextoXML() {
  const text = document.getElementById('cpst-poceada-xml-texto')?.value;
  if (!text || text.trim() === '') {
    showToast('Pegue el contenido XML del extracto', 'warning');
    return;
  }
  procesarXMLExtractoPoceada(text);
}

function procesarXMLExtractoPoceada(xmlText) {
  try {
    console.log('Procesando XML Poceada...');

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

    // Verificar errores de parseo
    const parseError = xmlDoc.querySelector('parsererror');
    if (parseError) {
      throw new Error('XML mal formado');
    }

    let numeros = [];
    let letras = [];

    // ======= FORMATO OFICIAL LOTERÍA: <Suerte> con <N01> a <N20> y <Letras> =======
    const suerteEl = xmlDoc.querySelector('Suerte');
    if (suerteEl) {
      // Extraer los 20 números del sorteo (N01 a N20)
      for (let i = 1; i <= 20; i++) {
        const tag = i < 10 ? `N0${i}` : `N${i}`;
        const el = suerteEl.querySelector(tag);
        if (el && el.textContent.trim()) {
          numeros.push(parseInt(el.textContent.trim()));
        }
      }

      // Extraer las 4 letras (separadas por espacio)
      const letrasEl = suerteEl.querySelector('Letras');
      if (letrasEl) {
        letras = letrasEl.textContent.trim().split(/\s+/).map(l => l.toUpperCase());
      }
    }

    // ======= FORMATO ALTERNATIVO: Tags individuales NUMERO_1, etc. =======
    if (numeros.length < 20) {
      for (let i = 1; i <= 20; i++) {
        const selectors = [`NUMERO_${i}`, `numero_${i}`, `Numero${i}`, `NUMERO${i}`];
        for (const sel of selectors) {
          const el = xmlDoc.querySelector(sel);
          if (el && el.textContent.trim()) {
            numeros.push(parseInt(el.textContent.trim()) || 0);
            break;
          }
        }
      }
    }

    if (letras.length < 4) {
      const letrasEl = xmlDoc.querySelector('LETRAS, letras, Letras');
      if (letrasEl) {
        const lets = letrasEl.textContent.trim().split(/[\s,]+/).filter(l => /^[A-Pa-p]$/.test(l));
        if (lets.length >= 4) letras = lets.slice(0, 4).map(l => l.toUpperCase());
      }
    }

    // Extraer info adicional del sorteo
    const sorteoNum = xmlDoc.querySelector('Sorteo')?.textContent?.trim() || '';
    const fechaSorteo = xmlDoc.querySelector('FechaSorteo')?.textContent?.trim() || '';

    console.log('Sorteo:', sorteoNum, 'Fecha:', fechaSorteo);
    console.log('Números del sorteo (20):', numeros);
    console.log('Letras del sorteo (4):', letras);

    if (numeros.length < 20) {
      showToast(`Se encontraron solo ${numeros.length} números (se esperan 20)`, 'error');
      return;
    }

    if (letras.length < 4) {
      showToast(`Se encontraron solo ${letras.length} letras (se esperan 4)`, 'error');
      return;
    }

    // Guardar los 20 números y 4 letras del sorteo
    cpstExtractoPoceada = {
      numeros: numeros.slice(0, 20),
      letras: letras.slice(0, 4),
      sorteo: sorteoNum,
      fecha: fechaSorteo
    };

    mostrarPreviewExtractoPoceada();
    showToast(`Extracto Poceada cargado - Sorteo ${sorteoNum}`, 'success');

  } catch (error) {
    console.error('Error procesando XML Poceada:', error);
    console.error('XML recibido:', xmlText);
    showToast('Error al procesar el XML: ' + error.message, 'error');
  }
}

// Confirmar extracto de Poceada desde entrada manual
function confirmarExtractoPoceada() {
  const numerosInputs = document.querySelectorAll('#cpst-poceada-numeros-grid .poceada-numero');
  const letrasInputs = document.querySelectorAll('#cpst-poceada-letras-grid .poceada-letra');

  const numeros = [];
  const letras = [];
  let hasError = false;

  numerosInputs.forEach((input, i) => {
    const val = parseInt(input.value);
    if (isNaN(val) || val < 0 || val > 99) {
      if (!hasError) {
        showToast(`Número ${i + 1} inválido (debe ser 00-99)`, 'error');
        hasError = true;
      }
      return;
    }
    numeros.push(val);
  });

  if (hasError) return;

  if (numeros.length < 20) {
    showToast(`Debe ingresar los 20 números del sorteo (tiene ${numeros.length})`, 'warning');
    return;
  }

  letrasInputs.forEach((input, i) => {
    const val = (input.value || '').toUpperCase();
    if (!val || !/^[A-P]$/.test(val)) {
      if (!hasError) {
        showToast(`Letra ${i + 1} inválida (debe ser A-P)`, 'error');
        hasError = true;
      }
      return;
    }
    letras.push(val);
  });

  if (hasError) return;

  if (letras.length < 4) {
    showToast('Debe ingresar las 4 letras del sorteo', 'warning');
    return;
  }

  cpstExtractoPoceada = { numeros, letras };
  mostrarPreviewExtractoPoceada();
  showToast('Extracto Poceada confirmado (20 números + 4 letras)', 'success');
}

function mostrarPreviewExtractoPoceada() {
  const preview = document.getElementById('cpst-poceada-extracto-preview');
  const numerosSpan = document.getElementById('cpst-poceada-numeros-preview');
  const letrasSpan = document.getElementById('cpst-poceada-letras-preview');

  if (cpstExtractoPoceada && preview) {
    preview.classList.remove('hidden');
    // Mostrar los 20 números en 2 filas de 10
    const nums = cpstExtractoPoceada.numeros.map(n => n.toString().padStart(2, '0'));
    const fila1 = nums.slice(0, 10).join(' - ');
    const fila2 = nums.slice(10, 20).join(' - ');
    numerosSpan.innerHTML = `${fila1}<br>${fila2}`;
    letrasSpan.textContent = cpstExtractoPoceada.letras.join(' - ');

    // Mostrar info del sorteo si existe
    if (cpstExtractoPoceada.sorteo) {
      const infoExtra = preview.querySelector('.sorteo-info') || document.createElement('div');
      infoExtra.className = 'sorteo-info';
      infoExtra.innerHTML = `<small style="color: var(--text-muted);">Sorteo: ${cpstExtractoPoceada.sorteo} - Fecha: ${cpstExtractoPoceada.fecha || ''}</small>`;
      if (!preview.querySelector('.sorteo-info')) {
        preview.appendChild(infoExtra);
      }
    }
  }
}

function limpiarExtractoPoceada() {
  cpstExtractoPoceada = null;

  // Limpiar inputs
  document.querySelectorAll('#cpst-poceada-numeros-grid .poceada-numero').forEach(i => i.value = '');
  document.querySelectorAll('#cpst-poceada-letras-grid .poceada-letra').forEach(i => i.value = '');
  document.getElementById('cpst-poceada-xml-texto').value = '';
  document.getElementById('cpst-poceada-extracto-xml').value = '';

  // Ocultar preview
  document.getElementById('cpst-poceada-extracto-preview')?.classList.add('hidden');

  showToast('Extracto Poceada limpiado', 'info');
}

function initControlPosterior() {
  // Generar inputs de números
  const numerosGrid = document.getElementById('cpst-numeros-grid');
  if (numerosGrid) {
    numerosGrid.innerHTML = '';
    for (let i = 1; i <= 20; i++) {
      numerosGrid.innerHTML += `<input type="text" class="numero-input" id="cpst-num-${i}" placeholder="${i}" maxlength="4">`;
    }
  }

  // Generar inputs de letras
  const letrasGrid = document.getElementById('cpst-letras-grid');
  if (letrasGrid) {
    letrasGrid.innerHTML = '';
    for (let i = 1; i <= 4; i++) {
      letrasGrid.innerHTML += `<input type="text" class="letra-input" id="cpst-letra-${i}" placeholder="${i}" maxlength="1">`;
    }
  }

  // Si venimos del dashboard, intentar pre-cargar datos o al menos el número de sorteo
  const sorteoSeleccionado = sessionStorage.getItem('sorteoSeleccionado');
  if (sorteoSeleccionado) {
    cpstNumeroSorteo = sorteoSeleccionado;
    const sorteoBadge = document.getElementById('cpst-sorteo');
    if (sorteoBadge) {
      sorteoBadge.textContent = sorteoSeleccionado;
      document.getElementById('cpst-datos-cargados')?.classList.remove('hidden');
    }
  }

  // Mostrar extractos cargados
  renderExtractosList();
}


// =============================================
// CARGAR EXTRACTOS EXISTENTES DE LA BD
// =============================================
async function cargarExtractosExistentesBD(fecha, modalidad) {
  try {
    // Mapear código de modalidad a letra
    const modalidadMap = {
      'LA PREVIA': 'R', 'PREVIA': 'R', 'R': 'R',
      'LA PRIMERA': 'P', 'PRIMERA': 'P', 'P': 'P',
      'MATUTINA': 'M', 'MATUTINO': 'M', 'M': 'M',
      'VESPERTINA': 'V', 'VESPERTINO': 'V', 'V': 'V',
      'NOCTURNA': 'N', 'NOCTURNO': 'N', 'N': 'N'
    };
    const modalidadCodigo = modalidadMap[modalidad?.toUpperCase()] || modalidad;

    const response = await extractosAPI.listar({ fecha, modalidad: modalidadCodigo });

    if (response.success && response.data && response.data.length > 0) {
      console.log(`[CPST] Encontrados ${response.data.length} extractos en BD para ${fecha} - ${modalidad}`);
      return response.data;
    }
    return [];
  } catch (error) {
    console.error('[CPST] Error cargando extractos de BD:', error);
    return [];
  }
}

// Verificar y cargar extractos existentes cuando se carga el ZIP
async function verificarExtractosExistentes() {
  if (!cpstNumeroSorteo || !cpstModalidadSorteo) {
    console.log('[CPST] No hay sorteo cargado, no se pueden verificar extractos');
    return;
  }

  // Obtener fecha del sorteo
  const fecha = cpResultadosActuales?.sorteo?.fecha || cpResultadosActuales?.fecha || new Date().toISOString().split('T')[0];
  const modalidad = cpstModalidadSorteo;

  console.log(`[CPST] Verificando extractos existentes para fecha: ${fecha}, modalidad: ${modalidad}`);

  const extractosExistentes = await cargarExtractosExistentesBD(fecha, modalidad);

  if (extractosExistentes.length > 0) {
    // Limpiar extractos locales y cargar los de la BD
    cpstExtractos = [];

    // Mapeo de códigos de provincia
    const provinciasMap = {
      '51': 0, '53': 1, '55': 2, '59': 3, '64': 4, '72': 5, '00': 6
    };
    const nombresProvincias = {
      '51': 'CABA', '53': 'Buenos Aires', '55': 'Córdoba',
      '59': 'Entre Ríos', '64': 'Mendoza', '72': 'Santa Fe', '00': 'Montevideo'
    };

    for (const ext of extractosExistentes) {
      const codigoProv = ext.provincia_codigo || '51';
      const idx = provinciasMap[codigoProv] ?? 0;

      cpstExtractos.push({
        index: idx,
        nombre: ext.provincia_nombre || nombresProvincias[codigoProv] || 'Desconocida',
        numeros: ext.numeros || [],
        letras: ext.letras || [],
        fromDB: true,
        dbId: ext.id
      });
    }

    renderExtractosList();
    showToast(`Se cargaron ${extractosExistentes.length} extractos existentes de la base de datos`, 'success');
  }
}

function cargarDatosControlPrevio() {
  if (!cpResultadosActuales) {
    showToast('No hay datos de Control Previo. Procese un archivo primero.', 'warning');
    return;
  }

  // Detectar tipo de juego y seleccionar automáticamente
  const tipoJuegoDetectado = cpResultadosActuales.tipoJuego || 'Quiniela';
  seleccionarJuegoPosterior(tipoJuegoDetectado);


  // Usar los datos del control previo - INCLUIR datosOficiales para los premios
  cpstDatosControlPrevio = {
    ...(cpResultadosActuales.datosCalculados || cpResultadosActuales.resumen || {}),
    datosOficiales: cpResultadosActuales.datosOficiales || null,
    comparacion: cpResultadosActuales.comparacion || null
  };

  // Normalizar obtención del número de sorteo (Quiniela devuelve objeto, Poceada/Tombolina puede devolver string)
  let nroSorteo = cpResultadosActuales.sorteo;
  if (nroSorteo && typeof nroSorteo === 'object') nroSorteo = nroSorteo.numero;

  cpstNumeroSorteo = cpstDatosControlPrevio.numeroSorteo || nroSorteo || '';

  // Tomar modalidad SOLO de la programación (basado en número de sorteo)
  // NO usar el código del NTF (SR, etc.) - la programación ya tiene la modalidad correcta
  const modalidadInfo = cpResultadosActuales.sorteo?.modalidad || {};
  const modalidadProgramacion = modalidadInfo.codigo;

  if (modalidadProgramacion) {
    cpstModalidadSorteo = modalidadProgramacion;
    console.log(`Modalidad desde programación (sorteo ${cpstNumeroSorteo}): ${modalidadProgramacion} (${modalidadInfo.nombre})`);
  } else {
    // Sin programación cargada - Solo para juegos que no son Quiniela, podemos asignar una modalidad por defecto
    if (tipoJuegoDetectado === 'Poceada') cpstModalidadSorteo = 'PCD';
    else if (tipoJuegoDetectado === 'Tombolina') cpstModalidadSorteo = 'TMB';
    else if (tipoJuegoDetectado === 'Quini 6') cpstModalidadSorteo = 'Q6';
    else if (tipoJuegoDetectado === 'Brinco') cpstModalidadSorteo = 'BRC';
    else if (tipoJuegoDetectado === 'Loto') cpstModalidadSorteo = 'LOTO';
    else if (tipoJuegoDetectado === 'Loto 5') cpstModalidadSorteo = 'L5';
    else cpstModalidadSorteo = '';

    if (cpstModalidadSorteo) {
      console.log(`[CPST] Sorteo ${cpstNumeroSorteo} no programado. Usando modalidad por defecto para ${tipoJuegoDetectado}: ${cpstModalidadSorteo}`);
    } else {
      console.warn(`⚠️ Sorteo ${cpstNumeroSorteo} no encontrado en programación. Cargue la programación primero.`);
    }
  }

  // Cargar los registros parseados del TXT (búsqueda exhaustiva)
  let registrosArray = [];
  if (Array.isArray(cpResultadosActuales.registrosNTF)) {
    registrosArray = cpResultadosActuales.registrosNTF;
  } else if (Array.isArray(cpResultadosActuales.registros)) {
    registrosArray = cpResultadosActuales.registros;
  } else if (cpResultadosActuales.datosCalculados && Array.isArray(cpResultadosActuales.datosCalculados.registrosNTF)) {
    registrosArray = cpResultadosActuales.datosCalculados.registrosNTF;
  }

  cpRegistrosNTF = registrosArray;
  cpstRegistrosNTF = registrosArray;

  console.log(`[CPST] Registros cargados (${tipoJuegoDetectado}):`, cpstRegistrosNTF.length);

  // Mostrar datos cargados
  document.getElementById('cpst-datos-cargados').classList.remove('hidden');
  document.getElementById('cpst-sorteo').textContent = cpstNumeroSorteo;
  document.getElementById('cpst-registros').textContent = formatNumber(cpstDatosControlPrevio.registros || 0);
  document.getElementById('cpst-recaudacion').textContent = '$' + formatNumber(cpstDatosControlPrevio.recaudacion || 0);

  // Mostrar modalidad desde la programación o detectada
  const modalidadBadge = document.getElementById('cpst-modalidad-badge');
  if (modalidadBadge) {
    const modalidadInfo = cpResultadosActuales.sorteo?.modalidad || {};
    const nombreModalidad = modalidadInfo.nombre || getNombreModalidad(cpstModalidadSorteo) || 'No identificada';
    modalidadBadge.textContent = nombreModalidad;
    modalidadBadge.className = `badge badge-${getModalidadColor(modalidadInfo.codigo || cpstModalidadSorteo)}`;
  }

  // Mostrar juego seleccionado
  const juegoBadge = document.getElementById('cpst-juego-badge');
  if (juegoBadge) {
    juegoBadge.textContent = cpstJuegoSeleccionado;
  }

  // NUEVO: Mostrar validación de programación
  mostrarValidacionProgramacion(cpResultadosActuales.validacionProgramacion);

  // Mostrar premios si es Poceada y hay datos oficiales
  if (tipoJuegoDetectado === 'Poceada' && cpResultadosActuales.datosOficiales?.premios) {
    const premios = cpResultadosActuales.datosOficiales.premios;
    console.log('Premios del Control Previo:', premios);
  }

  const cantRegistros = cpstRegistrosNTF.length;
  if (cantRegistros > 0) {
    showToast(`Datos cargados correctamente: ${formatNumber(cantRegistros)} registros operativos de ${cpstJuegoSeleccionado}.`, 'success');
  } else {
    showToast(`Se cargó el sorteo pero no se encontraron registros de apuestas en el archivo TXT.`, 'warning');
  }

  // NUEVO: Verificar si ya existen extractos en la BD para este sorteo
  verificarExtractosExistentes();
}

// Mostrar validación de programación para Control Previo
function mostrarValidacionProgramacionCP(validacion, sorteoInfo) {
  const container = document.getElementById('cp-validacion-programacion');
  const modalidadBadge = document.getElementById('cp-modalidad-badge');

  if (!container) return;

  // Mostrar modalidad desde la programación (si existe)
  if (sorteoInfo && sorteoInfo.modalidad && sorteoInfo.modalidad.codigo) {
    modalidadBadge.textContent = getNombreModalidad(sorteoInfo.modalidad.codigo) + ' (' + sorteoInfo.modalidad.codigo + ')';
    modalidadBadge.className = 'badge badge-success';
  } else if (sorteoInfo && sorteoInfo.modalidad && sorteoInfo.modalidad.detectada) {
    // Mostrar modalidad detectada del archivo NTF
    modalidadBadge.textContent = 'Detectado: ' + sorteoInfo.modalidad.detectada;
    modalidadBadge.className = 'badge badge-warning';
  } else {
    modalidadBadge.textContent = 'Sin Modalidad';
    modalidadBadge.className = 'badge badge-secondary';
  }

  if (!validacion) {
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');

  // Estado general
  const estadoDiv = document.getElementById('cp-validacion-estado');
  if (validacion.encontrado) {
    const sorteo = validacion.sorteo;
    estadoDiv.innerHTML = `
      <div class="alert alert-success" style="margin-bottom: 0;">
        <i class="fas fa-check-circle"></i> 
        <strong>Sorteo encontrado en programación:</strong> 
        ${sorteo.numero} - ${sorteo.modalidad_nombre || 'Sin modalidad'} 
        (${formatDate(sorteo.fecha)})
      </div>
    `;
  } else {
    estadoDiv.innerHTML = `
      <div class="alert alert-warning" style="margin-bottom: 0;">
        <i class="fas fa-exclamation-triangle"></i> 
        <strong>Sorteo no encontrado en programación.</strong> 
        Cargue la programación del mes para validar provincias.
      </div>
    `;
  }

  // Tabla de provincias
  const tbody = document.querySelector('#cp-tabla-validacion-provincias tbody');
  if (tbody && validacion.provincias) {
    tbody.innerHTML = validacion.provincias.map(prov => {
      let estadoClass = '';
      let estadoIcon = '';
      if (prov.estado === 'ERROR') {
        estadoClass = 'text-danger';
        estadoIcon = '<i class="fas fa-times-circle text-danger"></i> ERROR';
      } else if (prov.estado === 'WARNING') {
        estadoClass = 'text-warning';
        estadoIcon = '<i class="fas fa-exclamation-triangle text-warning"></i> Advertencia';
      } else {
        estadoClass = 'text-success';
        estadoIcon = '<i class="fas fa-check-circle text-success"></i> OK';
      }

      return `
        <tr class="${estadoClass}">
          <td><strong>${prov.nombre}</strong> <small>(${prov.codigo})</small></td>
          <td>${prov.habilitada ? '<span class="badge badge-success">Sí</span>' : '<span class="badge badge-secondary">No</span>'}</td>
          <td>${formatNumber(prov.apuestas)}</td>
          <td>$${formatNumber(prov.recaudacion)}</td>
          <td>${estadoIcon}</td>
        </tr>
      `;
    }).join('');
  }

  // Errores
  const erroresDiv = document.getElementById('cp-validacion-errores');
  if (erroresDiv && validacion.errores && validacion.errores.length > 0) {
    erroresDiv.classList.remove('hidden');
    erroresDiv.innerHTML = `
      <div class="alert alert-error">
        <strong><i class="fas fa-times-circle"></i> Errores encontrados:</strong>
        <ul style="margin: 0.5rem 0 0 1rem;">
          ${validacion.errores.map(e => `<li>${e.mensaje}</li>`).join('')}
        </ul>
      </div>
    `;
  } else if (erroresDiv) {
    erroresDiv.classList.add('hidden');
  }

  // Warnings
  const warningsDiv = document.getElementById('cp-validacion-warnings');
  if (warningsDiv && validacion.warnings && validacion.warnings.length > 0) {
    warningsDiv.classList.remove('hidden');
    warningsDiv.innerHTML = `
      <div class="alert alert-warning">
        <strong><i class="fas fa-exclamation-triangle"></i> Advertencias:</strong>
        <ul style="margin: 0.5rem 0 0 1rem;">
          ${validacion.warnings.map(w => `<li>${w.mensaje}</li>`).join('')}
        </ul>
      </div>
    `;
  } else if (warningsDiv) {
    warningsDiv.classList.add('hidden');
  }
}

// Mostrar validación de programación (para Control Posterior)
function mostrarValidacionProgramacion(validacion) {
  const container = document.getElementById('cpst-validacion-programacion');
  if (!container) return;

  if (!validacion) {
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');

  // Estado general
  const estadoDiv = document.getElementById('cpst-validacion-estado');
  if (validacion.encontrado) {
    const sorteo = validacion.sorteo;
    estadoDiv.innerHTML = `
      <div class="alert alert-success" style="margin-bottom: 0;">
        <i class="fas fa-check-circle"></i> 
        <strong>Sorteo encontrado en programación:</strong> 
        ${sorteo.numero} - ${sorteo.modalidad_nombre || 'Sin modalidad'} 
        (${formatDate(sorteo.fecha)})
      </div>
    `;
  } else {
    estadoDiv.innerHTML = `
      <div class="alert alert-warning" style="margin-bottom: 0;">
        <i class="fas fa-exclamation-triangle"></i> 
        <strong>Sorteo no encontrado en programación.</strong> 
        Cargue la programación del mes para validar provincias.
      </div>
    `;
  }

  // Tabla de provincias
  const tbody = document.querySelector('#cpst-tabla-validacion-provincias tbody');
  if (tbody && validacion.provincias) {
    tbody.innerHTML = validacion.provincias.map(prov => {
      let estadoClass = '';
      let estadoIcon = '';
      if (prov.estado === 'ERROR') {
        estadoClass = 'text-danger';
        estadoIcon = '<i class="fas fa-times-circle text-danger"></i> ERROR';
      } else if (prov.estado === 'WARNING') {
        estadoClass = 'text-warning';
        estadoIcon = '<i class="fas fa-exclamation-triangle text-warning"></i> Advertencia';
      } else {
        estadoClass = 'text-success';
        estadoIcon = '<i class="fas fa-check-circle text-success"></i> OK';
      }

      return `
        <tr class="${estadoClass}">
          <td><strong>${prov.nombre}</strong> <small>(${prov.codigo})</small></td>
          <td>${prov.habilitada ? '<span class="badge badge-success">Sí</span>' : '<span class="badge badge-secondary">No</span>'}</td>
          <td>${formatNumber(prov.apuestas)}</td>
          <td>$${formatNumber(prov.recaudacion)}</td>
          <td>${estadoIcon}</td>
        </tr>
      `;
    }).join('');
  }

  // Errores
  const erroresDiv = document.getElementById('cpst-validacion-errores');
  if (erroresDiv && validacion.errores && validacion.errores.length > 0) {
    erroresDiv.classList.remove('hidden');
    erroresDiv.innerHTML = `
      <div class="alert alert-error">
        <strong><i class="fas fa-times-circle"></i> Errores encontrados:</strong>
        <ul style="margin: 0.5rem 0 0 1rem;">
          ${validacion.errores.map(e => `<li>${e.mensaje}</li>`).join('')}
        </ul>
      </div>
    `;
  } else if (erroresDiv) {
    erroresDiv.classList.add('hidden');
  }

  // Warnings
  const warningsDiv = document.getElementById('cpst-validacion-warnings');
  if (warningsDiv && validacion.warnings && validacion.warnings.length > 0) {
    warningsDiv.classList.remove('hidden');
    warningsDiv.innerHTML = `
      <div class="alert alert-warning">
        <strong><i class="fas fa-exclamation-triangle"></i> Advertencias:</strong>
        <ul style="margin: 0.5rem 0 0 1rem;">
          ${validacion.warnings.map(w => `<li>${w.mensaje}</li>`).join('')}
        </ul>
      </div>
    `;
  } else if (warningsDiv) {
    warningsDiv.classList.add('hidden');
  }
}

// Obtener nombre de modalidad
function getNombreModalidad(codigo) {
  const nombres = {
    'R': 'LA PREVIA',
    'P': 'LA PRIMERA',
    'M': 'MATUTINA',
    'V': 'VESPERTINA',
    'N': 'NOCTURNA'
  };
  return nombres[codigo] || codigo;
}

// Detectar la modalidad predominante del sorteo
function detectarModalidadSorteo(tiposSorteo) {
  if (!tiposSorteo || Object.keys(tiposSorteo).length === 0) {
    return '';
  }

  // Mapeo de códigos NTF a letras de modalidad XML
  // Según documentación NTF: A, M, V, U, N, AS, MS, VS, US, NS
  const MAPEO_NTF_A_XML = {
    // Códigos simples (1 letra)
    'A': 'R',    // A -> La Previa (Anticipado)
    'M': 'M',    // M -> Matutina
    'V': 'V',    // V -> Vespertina
    'U': 'P',    // U -> Primera (Uno/Primera)
    'N': 'N',    // N -> Nocturna
    'R': 'R',    // R -> La Previa
    'P': 'P',    // P -> Primera
    // Códigos con S (variantes sábado/domingo/especial)
    'AS': 'R',   // AS -> La Previa
    'MS': 'M',   // MS -> Matutina
    'VS': 'V',   // VS -> Vespertina
    'US': 'P',   // US -> Primera
    'NS': 'N',   // NS -> Nocturna
    // Códigos SR/SM/SV/SN/SU (Sorteo Regular por modalidad)
    'SR': 'R',   // SR -> La Previa
    'SM': 'M',   // SM -> Matutina
    'SV': 'V',   // SV -> Vespertina
    'SN': 'N',   // SN -> Nocturna
    'SU': 'P',   // SU -> Primera
    'SP': 'P',   // SP -> Primera
    // Códigos extendidos (2 letras descriptivas)
    'MA': 'M',   // Matutina
    'VE': 'V',   // Vespertina
    'NO': 'N',   // Nocturna
    'PR': 'R',   // La Previa
    'P1': 'P',   // Primera
    'LP': 'R',   // La Previa
    'LPR': 'R',  // La Previa
    // Códigos con números (si existieran)
    '1': 'R',    // 1ra del día = La Previa
    '2': 'M',    // 2da del día = Matutina
    '3': 'V',    // 3ra del día = Vespertina
    '4': 'P',    // 4ta del día = Primera
    '5': 'N',    // 5ta del día = Nocturna
  };

  // Encontrar la modalidad con más apuestas
  let maxApuestas = 0;
  let modalidadPrincipal = '';

  for (const [modalidad, datos] of Object.entries(tiposSorteo)) {
    if (datos.apuestas > maxApuestas) {
      maxApuestas = datos.apuestas;
      modalidadPrincipal = modalidad;
    }
  }

  // Convertir código NTF a letra XML (asegurar trim y uppercase)
  const modalidadNormalizada = modalidadPrincipal.trim().toUpperCase();
  const modalidadXML = MAPEO_NTF_A_XML[modalidadNormalizada];

  console.log(`Modalidad detectada: NTF="${modalidadPrincipal}" (normalizada="${modalidadNormalizada}") -> XML="${modalidadXML || 'NO RECONOCIDA'}"`);
  console.log('Todos los tipos de sorteo encontrados:', Object.keys(tiposSorteo));

  // Si no se reconoce, mostrar warning y devolver vacío para que el usuario elija
  if (!modalidadXML) {
    console.warn(`⚠️ Código de modalidad "${modalidadPrincipal}" no reconocido. Se mostrarán todas las modalidades de XMLs.`);
    return ''; // Devolver vacío para que no filtre y muestre selector
  }

  return modalidadXML;
}

async function cargarZipPosterior(input) {
  if (!input.files.length) return;

  const file = input.files[0];

  // Detectar tipo de juego por nombre del archivo
  const juegoConfig = detectarTipoJuego(file.name);
  if (!juegoConfig) {
    showToast('No se pudo detectar el tipo de juego por el nombre del archivo.', 'error');
    return;
  }

  // Seleccionar el juego automáticamente
  seleccionarJuegoPosterior(juegoConfig.nombre);

  showToast(`Procesando archivo ZIP de ${juegoConfig.nombre}...`, 'info');

  try {
    const token = getToken();
    const formData = new FormData();
    formData.append('archivo', file);

    // Usar el endpoint correcto según el tipo de juego
    let endpoint = `${API_BASE}/control-previo/quiniela/procesar`;
    if (juegoConfig.nombre === 'Poceada') endpoint = `${API_BASE}/control-previo/poceada/procesar`;
    if (juegoConfig.nombre === 'Tombolina') endpoint = `${API_BASE}/control-previo/tombolina/procesar`;


    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.message);

    cpResultadosActuales = data.data;
    cpResultadosActuales.tipoJuego = juegoConfig.nombre; // Guardar tipo detectado

    // Guardar los registros parseados del TXT
    cpRegistrosNTF = data.data.registrosNTF || data.data.registros || [];
    console.log(`ZIP ${juegoConfig.nombre} cargado: ${cpRegistrosNTF.length} registros parseados del TXT`);

    cargarDatosControlPrevio();

  } catch (error) {
    showToast(error.message || 'Error procesando archivo', 'error');
  }
}

// Cambiar tab de extracto
function cambiarTabExtracto(tab) {
  // Ocultar todos los tabs
  document.querySelectorAll('.tabs-container .tab-content').forEach(t => t.classList.add('hidden'));
  document.querySelectorAll('.tabs-container .tab').forEach(t => t.classList.remove('active'));

  // Mostrar tab seleccionado
  document.getElementById(`tab-ext-${tab}`).classList.remove('hidden');
  document.querySelector(`.tab[data-tab="ext-${tab}"]`).classList.add('active');
}

// Llenar inputs con números y letras
function llenarInputsExtracto(numeros, letras, autoAgregar = true) {
  // Cambiar a tab manual primero para asegurar que los inputs existen
  cambiarTabExtracto('manual');

  // Pequeño delay para asegurar que el DOM está listo
  setTimeout(() => {
    if (numeros) {
      for (let i = 0; i < Math.min(20, numeros.length); i++) {
        const input = document.getElementById(`cpst-num-${i + 1}`);
        if (input) {
          input.value = String(numeros[i] || '').padStart(4, '0');
        }
      }
    }

    if (letras) {
      for (let i = 0; i < Math.min(4, letras.length); i++) {
        const input = document.getElementById(`cpst-letra-${i + 1}`);
        if (input) {
          input.value = String(letras[i] || '').toUpperCase();
        }
      }
    }

    // Agregar automáticamente si tiene datos válidos (sin limpiar después)
    if (autoAgregar && numeros && numeros.filter(n => n && n !== '0000').length >= 10) {
      agregarExtractoSinLimpiar();
    }
  }, 50);
}

// Cargar desde archivo JSON
function cargarExtractoJSON(input) {
  if (!input.files.length) return;

  const file = input.files[0];
  const reader = new FileReader();

  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      const numeros = data.numeros || data.numbers || [];
      const letras = data.letras || data.letters || [];

      llenarInputsExtracto(numeros, letras);
      showToast('Extracto cargado desde JSON', 'success');
    } catch (error) {
      showToast('Error leyendo archivo JSON', 'error');
    }
  };

  reader.readAsText(file);
}

// Cargar desde texto JSON
function cargarExtractoDesdeTextoJSON() {
  const texto = document.getElementById('cpst-json-texto').value.trim();
  if (!texto) {
    showToast('Ingrese el JSON', 'warning');
    return;
  }

  try {
    const data = JSON.parse(texto);
    const numeros = data.numeros || data.numbers || [];
    const letras = data.letras || data.letters || [];

    llenarInputsExtracto(numeros, letras);
    showToast('Extracto cargado desde JSON', 'success');
  } catch (error) {
    showToast('JSON inválido', 'error');
  }
}

// =============================================
// NOMENCLATURA DE ARCHIVOS XML QUINIELA
// =============================================
// QNL + PROVINCIA + MODALIDAD + FECHA
// Provincias: 51=CABA, 53=BsAs, 55=Córdoba, 59=EntreRíos, 64=Mendoza, 72=SantaFe, 00=Montevideo
// Modalidades: R=Previa, P=Primera, M=Matutina, V=Vespertina, N=Nocturna

const PROVINCIAS_XML = {
  '51': { index: 0, nombre: 'Ciudad Autónoma', codigo: 'CABA' },
  '53': { index: 1, nombre: 'Buenos Aires', codigo: 'PBA' },
  '55': { index: 2, nombre: 'Córdoba', codigo: 'CBA' },
  '72': { index: 3, nombre: 'Santa Fe', codigo: 'SFE' },
  '00': { index: 4, nombre: 'Montevideo', codigo: 'URU' },
  '64': { index: 5, nombre: 'Mendoza', codigo: 'MZA' },
  '59': { index: 6, nombre: 'Entre Ríos', codigo: 'ENR' }
};

const MODALIDADES_XML = {
  'R': 'LA PREVIA',
  'P': 'LA PRIMERA',
  'M': 'MATUTINA',
  'V': 'VESPERTINA',
  'N': 'NOCTURNA'
};

// Parsear nombre de archivo XML para extraer provincia, modalidad y fecha
function parsearNombreArchivoXML(filename) {
  // Formato: QNL + 2 dígitos provincia + 1 letra modalidad + fecha (opcional extensión)
  // Ejemplo: QNL51M20260116.xml, QNL53V20260116.xml
  const match = filename.toUpperCase().match(/QNL(\d{2})([RPMVN])(\d{8})?/);

  if (!match) return null;

  const codigoProv = match[1];
  const modalidad = match[2];
  const fecha = match[3] || '';

  const provincia = PROVINCIAS_XML[codigoProv];
  if (!provincia) return null;

  return {
    provincia: provincia,
    codigoProvincia: codigoProv,
    modalidad: modalidad,
    modalidadNombre: MODALIDADES_XML[modalidad] || modalidad,
    fecha: fecha,
    fechaFormateada: fecha ? `${fecha.slice(6, 8)}/${fecha.slice(4, 6)}/${fecha.slice(0, 4)}` : ''
  };
}

// Cargar desde archivo(s) XML - soporta múltiples archivos con filtrado por modalidad
function cargarExtractoXML(input) {
  if (!input.files.length) return;

  const files = Array.from(input.files);
  console.log(`📂 Intentando cargar ${files.length} archivos XML`);
  console.log(`🎯 Modalidad del sorteo actual: "${cpstModalidadSorteo}" (${MODALIDADES_NOMBRE[cpstModalidadSorteo] || 'no definida'})`);

  // SIEMPRE usar procesarMultiplesXML para filtrar por modalidad
  procesarMultiplesXML(files);
}

// Procesar múltiples archivos XML
async function procesarMultiplesXML(files) {
  const archivosInfo = [];
  const modalidades = {};

  // Primero analizar todos los archivos - LEER CONTENIDO para obtener modalidad real
  for (const file of files) {
    const info = parsearNombreArchivoXML(file.name);
    if (info) {
      // Leer el contenido del archivo para obtener la modalidad real del XML
      try {
        const contenido = await leerArchivoComoTexto(file);
        const datosXML = extraerDatosXML(contenido);

        // PRIORIDAD: Usar modalidad del CONTENIDO del XML si existe, sino la del nombre
        const modalidadReal = datosXML?.modalidad || info.modalidad;

        if (datosXML?.modalidad && datosXML.modalidad !== info.modalidad) {
          console.log(`📝 ${file.name}: Modalidad del nombre (${info.modalidad}) difiere del contenido (${datosXML.modalidad}). Usando: ${modalidadReal}`);
        }

        // Actualizar info con la modalidad real
        info.modalidadOriginal = info.modalidad; // Guardar la del nombre
        info.modalidad = modalidadReal; // Usar la del contenido

        archivosInfo.push({ file, info, datosXML });

        // Agrupar por modalidad REAL (del contenido)
        if (!modalidades[modalidadReal]) {
          modalidades[modalidadReal] = [];
        }
        modalidades[modalidadReal].push({ file, info, datosXML });
      } catch (error) {
        console.error(`Error leyendo ${file.name}:`, error);
      }
    } else {
      console.warn(`⚠️ Archivo no reconocido (formato esperado QNLxxY...): ${file.name}`);
    }
  }

  console.log(`📊 Archivos reconocidos: ${archivosInfo.length}/${files.length}`);
  console.log(`📊 Modalidades encontradas:`, Object.keys(modalidades).map(m => `${m}=${modalidades[m].length}`).join(', '));

  if (archivosInfo.length === 0) {
    showToast('No se reconocieron archivos XML válidos. Formato esperado: QNL51M20260116.xml', 'warning');
    return;
  }

  const modalidadesUsadas = Object.keys(modalidades);
  let modalidad;
  let archivosModalidad;

  // Si hay modalidad del sorteo definida (desde Control Previo), filtrar automáticamente
  if (cpstModalidadSorteo) {
    const modalidadNombre = MODALIDADES_NOMBRE[cpstModalidadSorteo] || cpstModalidadSorteo;

    if (modalidades[cpstModalidadSorteo]) {
      // Usar solo los archivos de la modalidad del sorteo
      modalidad = cpstModalidadSorteo;
      archivosModalidad = modalidades[cpstModalidadSorteo];

      const ignorados = archivosInfo.length - archivosModalidad.length;
      if (ignorados > 0) {
        // Mostrar detalle de lo que se ignoró
        const detalleIgnorados = modalidadesUsadas
          .filter(m => m !== cpstModalidadSorteo)
          .map(m => `${modalidades[m].length} de ${MODALIDADES_NOMBRE[m] || m}`)
          .join(', ');
        showToast(`✓ Filtrando por ${modalidadNombre}: ${archivosModalidad.length} XMLs cargados. Ignorados: ${detalleIgnorados}`, 'info');
      }
    } else {
      // No hay archivos de la modalidad esperada
      const encontradas = modalidadesUsadas.map(m => `${MODALIDADES_NOMBRE[m] || m} (${modalidades[m].length})`).join(', ');
      showToast(`⚠️ No hay XMLs de "${modalidadNombre}" (modalidad del sorteo). Se encontraron: ${encontradas}`, 'warning');
      return;
    }
  } else {
    // Sin modalidad definida (no se cargó Control Previo)
    if (modalidadesUsadas.length > 1) {
      const detalle = modalidadesUsadas.map(m => `${MODALIDADES_NOMBRE[m] || m}: ${modalidades[m].length}`).join(', ');
      showToast(`⚠️ ${modalidadesUsadas.length} modalidades detectadas (${detalle}). Cargue primero el Control Previo para filtrar automáticamente.`, 'warning');
      return;
    }

    modalidad = modalidadesUsadas[0];
    archivosModalidad = modalidades[modalidad];
  }

  console.log(`Modalidad sorteo: ${cpstModalidadSorteo || 'no definida'}, Modalidad XMLs: ${modalidad}, Archivos: ${archivosModalidad.length}`);

  // Verificar fecha si hay datos del Control Previo
  if (cpstNumeroSorteo) {
    const fechaEsperada = archivosModalidad[0]?.info.fecha;
    // Podríamos verificar que la fecha coincida con el sorteo
  }

  showToast(`Procesando ${archivosModalidad.length} extractos de ${MODALIDADES_XML[modalidad]}...`, 'info');

  // Limpiar extractos anteriores para esta carga masiva
  cpstExtractos = [];

  // Procesar cada archivo (ya tenemos los datos XML extraídos)
  let procesados = 0;
  let errores = 0;

  for (const { file, info, datosXML } of archivosModalidad) {
    try {
      // Ya tenemos datosXML del primer paso, no necesitamos leer de nuevo
      if (datosXML && datosXML.numeros) {
        // Agregar extracto con la provincia correcta
        cpstExtractos.push({
          index: info.provincia.index,
          nombre: info.provincia.nombre,
          numeros: datosXML.numeros,
          letras: datosXML.letras
        });
        procesados++;
      } else {
        console.warn(`⚠️ ${file.name}: No se pudieron extraer datos del XML`);
        errores++;
      }
    } catch (error) {
      console.error(`Error procesando ${file.name}:`, error);
      errores++;
    }
  }

  // Ordenar extractos por índice de provincia
  cpstExtractos.sort((a, b) => a.index - b.index);

  renderExtractosList();

  if (procesados > 0) {
    showToast(`✓ ${procesados} extractos cargados de ${MODALIDADES_XML[modalidad]}${errores > 0 ? ` (${errores} errores)` : ''}`, 'success');
  } else {
    showToast('No se pudieron cargar los extractos', 'error');
  }
}

// Leer archivo como texto (Promise)
function leerArchivoComoTexto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(e);
    reader.readAsText(file);
  });
}

// Extraer datos del XML (números, letras y modalidad)
function extraerDatosXML(xmlString) {
  try {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlString, 'text/xml');

    const parseError = xml.querySelector('parsererror');
    if (parseError) return null;

    let numeros = [];
    let letras = [];
    let modalidad = null;

    // Extraer modalidad del contenido del XML
    const modalidadNode = xml.querySelector('Modalidad') || xml.querySelector('modalidad');
    if (modalidadNode) {
      const modalidadTexto = modalidadNode.textContent.trim().toUpperCase();
      console.log(`[XML] Modalidad encontrada en XML: "${modalidadTexto}"`);
      // Mapear nombre de modalidad a código
      const modalidadMap = {
        'LA PREVIA': 'R', 'PREVIA': 'R',
        'LA PRIMERA': 'P', 'PRIMERA': 'P',
        'MATUTINA': 'M',
        'VESPERTINA': 'V',
        'NOCTURNA': 'N'
      };
      modalidad = modalidadMap[modalidadTexto] || null;
      console.log(`[XML] Modalidad mapeada: ${modalidadTexto} -> ${modalidad}`);
    }

    // Formato Quiniela: <N01>, <N02>, etc. dentro de <Suerte>
    const suerteNode = xml.querySelector('Suerte');
    if (suerteNode) {
      for (let i = 1; i <= 20; i++) {
        const numStr = i.toString().padStart(2, '0');
        const node = suerteNode.querySelector(`N${numStr}`);
        if (node) {
          numeros[i - 1] = node.textContent.trim();
        }
      }

      // Buscar letras en varios formatos posibles
      let letrasNode = suerteNode.querySelector('Letras');
      if (!letrasNode) letrasNode = suerteNode.querySelector('letras');
      if (!letrasNode) letrasNode = suerteNode.querySelector('LETRAS');

      if (letrasNode) {
        const letrasTexto = letrasNode.textContent.trim();
        console.log(`[XML] Letras encontradas en XML: "${letrasTexto}"`);
        // Puede venir como "M M Q Q" o "MMQQ"
        if (letrasTexto.includes(' ')) {
          letras = letrasTexto.split(/\s+/).filter(l => l.length === 1);
        } else {
          letras = letrasTexto.split('').filter(l => /[A-Za-z]/.test(l));
        }
        console.log(`[XML] Letras parseadas: ${JSON.stringify(letras)}`);
      } else {
        console.log(`[XML] No se encontró tag de Letras en Suerte`);
      }
    }

    // Formato alternativo
    if (numeros.filter(n => n).length === 0) {
      for (let i = 1; i <= 20; i++) {
        const node = xml.querySelector(`posicion${i}, pos${i}, n${i}, N${i.toString().padStart(2, '0')}`);
        if (node) {
          numeros[i - 1] = node.textContent.trim();
        }
      }
    }

    if (numeros.filter(n => n).length === 0) return null;

    return { numeros, letras, modalidad };
  } catch (error) {
    return null;
  }
}

// Cargar desde texto XML
function cargarExtractoDesdeTextoXML() {
  const texto = document.getElementById('cpst-xml-texto').value.trim();
  if (!texto) {
    showToast('Ingrese el XML', 'warning');
    return;
  }
  procesarXMLExtracto(texto);
}

// Procesar XML del extracto (un solo archivo)
function procesarXMLExtracto(xmlString, infoArchivo = null) {
  try {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlString, 'text/xml');

    // Verificar errores de parseo
    const parseError = xml.querySelector('parsererror');
    if (parseError) {
      showToast('XML inválido', 'error');
      return;
    }

    let numeros = [];
    let letras = [];

    // Formato Quiniela CABA: <N01>, <N02>, etc. dentro de <Suerte>
    const suerteNode = xml.querySelector('Suerte');
    if (suerteNode) {
      for (let i = 1; i <= 20; i++) {
        const numStr = i.toString().padStart(2, '0');
        const node = suerteNode.querySelector(`N${numStr}`);
        if (node) {
          numeros[i - 1] = node.textContent.trim();
        }
      }

      // Letras en formato "E U Q Q"
      const letrasNode = suerteNode.querySelector('Letras');
      if (letrasNode) {
        const letrasTexto = letrasNode.textContent.trim();
        letras = letrasTexto.split(/\s+/).filter(l => l.length === 1);
      }
    }

    // Formato alternativo: <numero pos="1">1234</numero>
    if (numeros.filter(n => n).length === 0) {
      const numerosNodes = xml.querySelectorAll('numero');
      if (numerosNodes.length > 0) {
        numerosNodes.forEach(node => {
          const pos = parseInt(node.getAttribute('pos') || node.getAttribute('posicion') || '0');
          const valor = node.textContent.trim();
          if (pos > 0 && pos <= 20) {
            numeros[pos - 1] = valor;
          } else {
            numeros.push(valor);
          }
        });
      }
    }

    // Formato alternativo: <posicion1>1234</posicion1> o <n1>
    if (numeros.filter(n => n).length === 0) {
      for (let i = 1; i <= 20; i++) {
        const node = xml.querySelector(`posicion${i}, pos${i}, n${i}`);
        if (node) {
          numeros[i - 1] = node.textContent.trim();
        }
      }
    }

    // Buscar letras en otros formatos
    if (letras.length === 0) {
      const letrasNode = xml.querySelector('letras, Letras');
      if (letrasNode) {
        const texto = letrasNode.textContent.trim();
        // Puede ser "EUQQ" o "E U Q Q"
        if (texto.includes(' ')) {
          letras = texto.split(/\s+/).filter(l => l.length === 1);
        } else {
          letras = texto.split('').filter(l => /[A-Za-z]/.test(l));
        }
      }
    }

    if (numeros.filter(n => n).length === 0) {
      showToast('No se encontraron números en el XML', 'warning');
      return;
    }

    // Si tenemos info del archivo, seleccionar la provincia correcta
    if (infoArchivo && infoArchivo.provincia) {
      const select = document.getElementById('cpst-extracto-provincia');
      if (select) {
        select.value = infoArchivo.provincia.index;
      }

      // Mostrar info del archivo
      console.log(`XML: ${infoArchivo.provincia.nombre} - ${infoArchivo.modalidadNombre} - ${infoArchivo.fechaFormateada}`);
      showToast(`Extracto ${infoArchivo.provincia.nombre} (${infoArchivo.modalidadNombre}) cargado`, 'success');
    } else {
      // Extraer info adicional del XML para mostrar
      const sorteoNode = xml.querySelector('Sorteo');
      const fechaNode = xml.querySelector('FechaSorteo');
      const juegoNode = xml.querySelector('Juego');

      if (sorteoNode || fechaNode) {
        const info = [];
        if (juegoNode) info.push(juegoNode.textContent.trim());
        if (sorteoNode) info.push(`Sorteo ${sorteoNode.textContent.trim()}`);
        if (fechaNode) info.push(fechaNode.textContent.trim());
        console.log('XML cargado:', info.join(' - '));
      }
      showToast('Extracto cargado desde XML', 'success');
    }

    llenarInputsExtracto(numeros, letras);
  } catch (error) {
    console.error('Error XML:', error);
    showToast('Error procesando XML', 'error');
  }
}

// Cargar desde imagen (OCR con detección automática de provincia/modalidad)
async function cargarExtractoImagen(input) {
  if (!input.files.length) return;

  const file = input.files[0];

  // Mostrar preview
  const preview = document.getElementById('cpst-imagen-preview');
  const img = document.getElementById('cpst-imagen-img');
  img.src = URL.createObjectURL(file);
  preview.style.display = 'block';

  // Mostrar status OCR
  const status = document.getElementById('cpst-ocr-status');
  const mensaje = document.getElementById('cpst-ocr-mensaje');
  const progress = document.getElementById('cpst-ocr-progress');
  status.classList.remove('hidden');
  mensaje.textContent = 'Procesando imagen con IA...';
  progress.style.width = '20%';

  try {
    // Verificar si OCRExtractos está disponible y tiene API key
    if (window.OCRExtractos && OCRExtractos.hasApiKey()) {
      // Usar OCR inteligente con Groq
      mensaje.textContent = 'Analizando imagen con IA...';
      progress.style.width = '40%';

      const { base64, mimeType } = await OCRExtractos.imageToBase64(file);
      progress.style.width = '60%';

      const provinciaSelect = document.getElementById('cpst-extracto-provincia');
      const provinciaHint = provinciaSelect?.options[provinciaSelect.selectedIndex]?.text || '';

      const result = await OCRExtractos.procesarImagenQuiniela(base64, mimeType, provinciaHint);
      progress.style.width = '90%';

      if (result.success && result.data) {
        const data = result.data;

        // Llenar números
        if (data.numeros && data.numeros.length > 0) {
          llenarInputsExtracto(data.numeros, []);
        }

        // Detectar y seleccionar provincia automáticamente
        if (data.provincia) {
          seleccionarProvinciaAutomatica(data.provincia);
        }

        // Validar modalidad con el sorteo cargado
        if (data.modalidad && cpstModalidadSorteo) {
          const modalidadDetectada = detectarCodigoModalidad(data.modalidad);
          if (modalidadDetectada !== cpstModalidadSorteo) {
            showToast(`⚠️ Modalidad detectada (${data.modalidad}) no coincide con el sorteo cargado (${getNombreModalidad(cpstModalidadSorteo)})`, 'warning');
          }
        }

        progress.style.width = '100%';
        mensaje.textContent = '¡Completado!';
        showToast(`OCR IA: ${data.numeros?.length || 0} números detectados. Provincia: ${data.provincia || 'No detectada'}`, 'success');
      } else {
        throw new Error('No se pudieron extraer datos de la imagen');
      }
    } else {
      // Fallback: usar Tesseract.js
      mensaje.textContent = 'Cargando OCR alternativo...';
      await usarTesseractOCR(file, status, mensaje, progress);
    }

    setTimeout(() => status.classList.add('hidden'), 2000);

  } catch (error) {
    console.error('Error OCR:', error);
    showToast('Error procesando imagen: ' + error.message, 'error');
    status.classList.add('hidden');
  }
}

// Fallback con Tesseract.js
async function usarTesseractOCR(file, status, mensaje, progress) {
  if (!window.Tesseract) {
    mensaje.textContent = 'Cargando librería OCR...';
    await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@4/dist/tesseract.min.js');
  }

  mensaje.textContent = 'Procesando imagen...';
  progress.style.width = '30%';

  const result = await Tesseract.recognize(file, 'spa', {
    logger: m => {
      if (m.status === 'recognizing text') {
        progress.style.width = (30 + m.progress * 60) + '%';
      }
    }
  });

  progress.style.width = '95%';
  mensaje.textContent = 'Extrayendo números...';

  const texto = result.data.text;
  const numeros = extraerNumerosDeTexto(texto);
  const letras = extraerLetrasDeTexto(texto);

  // Intentar detectar modalidad del texto
  const modalidadDetectada = detectarModalidadDeTexto(texto);
  if (modalidadDetectada && cpstModalidadSorteo) {
    if (modalidadDetectada !== cpstModalidadSorteo) {
      showToast(`⚠️ Modalidad detectada (${getNombreModalidad(modalidadDetectada)}) no coincide con el sorteo`, 'warning');
    }
  }

  progress.style.width = '100%';

  if (numeros.length > 0) {
    llenarInputsExtracto(numeros, letras);
    showToast(`OCR completado: ${numeros.length} números detectados`, 'success');
  } else {
    showToast('No se detectaron números. Intente con mejor calidad de imagen.', 'warning');
  }
}

// Detectar modalidad de texto OCR
function detectarModalidadDeTexto(texto) {
  const textoUpper = texto.toUpperCase();
  if (textoUpper.includes('PREVIA')) return 'R';
  if (textoUpper.includes('PRIMERA')) return 'P';
  if (textoUpper.includes('MATUTINA') || textoUpper.includes('MATUTINO')) return 'M';
  if (textoUpper.includes('VESPERTINA') || textoUpper.includes('VESPERTINO')) return 'V';
  if (textoUpper.includes('NOCTURNA') || textoUpper.includes('NOCTURNO')) return 'N';
  return null;
}

// Detectar código de modalidad desde nombre
function detectarCodigoModalidad(modalidadNombre) {
  if (!modalidadNombre) return null;
  const nombre = modalidadNombre.toUpperCase();
  if (nombre.includes('PREVIA')) return 'R';
  if (nombre.includes('PRIMERA')) return 'P';
  if (nombre.includes('MATUTINA') || nombre.includes('MATUTINO')) return 'M';
  if (nombre.includes('VESPERTINA') || nombre.includes('VESPERTINO')) return 'V';
  if (nombre.includes('NOCTURNA') || nombre.includes('NOCTURNO')) return 'N';
  return modalidadNombre;
}

// Seleccionar provincia automáticamente en el combo
function seleccionarProvinciaAutomatica(codigoProvincia) {
  const provinciaSelect = document.getElementById('cpst-extracto-provincia');
  if (!provinciaSelect) return;

  // Mapeo de códigos a índices del select
  const codigoToIndex = {
    '51': 0, 'CABA': 0, 'CIUDAD': 0,
    '53': 1, 'BUENOS AIRES': 1, 'PBA': 1, 'PROVINCIA': 1,
    '55': 2, 'CORDOBA': 2, 'CÓRDOBA': 2,
    '59': 3, 'ENTRE RIOS': 3, 'ENTRE RÍOS': 3,
    '64': 4, 'MENDOZA': 4,
    '72': 5, 'SANTA FE': 5,
    '00': 6, 'MONTEVIDEO': 6, 'URUGUAY': 6
  };

  const codigo = String(codigoProvincia).toUpperCase();
  const index = codigoToIndex[codigo];

  if (index !== undefined) {
    provinciaSelect.selectedIndex = index;
    showToast(`Provincia detectada: ${provinciaSelect.options[index].text}`, 'info');
  }
}

// Cargar script dinámicamente
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Extraer números de 4 dígitos del texto OCR
function extraerNumerosDeTexto(texto) {
  const numeros = [];
  // Buscar patrones de números de 4 dígitos
  const matches = texto.match(/\b\d{4}\b/g) || [];

  // Tomar los primeros 20
  for (let i = 0; i < Math.min(20, matches.length); i++) {
    numeros.push(matches[i]);
  }

  return numeros;
}

// Extraer letras del texto OCR
function extraerLetrasDeTexto(texto) {
  // Buscar patrón de 4 letras mayúsculas seguidas
  const match = texto.match(/\b[A-Z]{4}\b/);
  if (match) {
    return match[0].split('');
  }
  return [];
}

// Cargar desde PDF (con OCR inteligente)
async function cargarExtractoPDF(input) {
  if (!input.files.length) return;

  const file = input.files[0];
  const status = document.getElementById('cpst-pdf-status');
  status.classList.remove('hidden');

  try {
    // Verificar si OCRExtractos está disponible con Groq API
    if (window.OCRExtractos && OCRExtractos.hasApiKey()) {
      showToast('Procesando PDF con IA...', 'info');

      // Convertir PDF a imagen
      const { base64, mimeType } = await OCRExtractos.pdfToImage(file);

      const provinciaSelect = document.getElementById('cpst-extracto-provincia');
      const provinciaHint = provinciaSelect?.options[provinciaSelect.selectedIndex]?.text || '';

      const result = await OCRExtractos.procesarImagenQuiniela(base64, mimeType, provinciaHint);

      if (result.success && result.data) {
        const data = result.data;

        // Llenar números
        if (data.numeros && data.numeros.length > 0) {
          llenarInputsExtracto(data.numeros, []);
        }

        // Detectar y seleccionar provincia automáticamente
        if (data.provincia) {
          seleccionarProvinciaAutomatica(data.provincia);
        }

        // Validar modalidad
        if (data.modalidad && cpstModalidadSorteo) {
          const modalidadDetectada = detectarCodigoModalidad(data.modalidad);
          if (modalidadDetectada !== cpstModalidadSorteo) {
            showToast(`⚠️ Modalidad detectada (${data.modalidad}) no coincide con el sorteo`, 'warning');
          }
        }

        showToast(`PDF procesado: ${data.numeros?.length || 0} números. Provincia: ${data.provincia || 'No detectada'}`, 'success');
      } else {
        throw new Error('No se pudieron extraer datos del PDF');
      }
    } else {
      // Fallback: enviar al servidor o usar Tesseract
      const formData = new FormData();
      formData.append('archivo', file);

      const token = getToken();
      const response = await fetch(`${API_BASE}/control-posterior/quiniela/procesar-pdf`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      const data = await response.json();

      if (data.success && data.data) {
        llenarInputsExtracto(data.data.numeros, data.data.letras);
        showToast('Extracto extraído del PDF', 'success');
      } else {
        showToast('Intentando OCR en el PDF...', 'info');
        await procesarPDFconOCR(file);
      }
    }

  } catch (error) {
    console.error('Error PDF:', error);
    showToast('Error procesando PDF: ' + error.message, 'error');
  } finally {
    status.classList.add('hidden');
  }
}

// Procesar PDF con OCR (fallback)
async function procesarPDFconOCR(file) {
  try {
    // Cargar pdf.js si no está cargado
    if (!window.pdfjsLib) {
      await loadScript('https://cdn.jsdelivr.net/npm/pdfjs-dist@3/build/pdf.min.js');
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3/build/pdf.worker.min.js';
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    const page = await pdf.getPage(1);

    // Renderizar página a canvas
    const scale = 2;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');

    await page.render({ canvasContext: ctx, viewport }).promise;

    // Convertir a imagen y procesar con OCR
    canvas.toBlob(async (blob) => {
      const input = { files: [blob] };
      await cargarExtractoImagen(input);
    }, 'image/png');

  } catch (error) {
    console.error('Error procesando PDF con OCR:', error);
    showToast('Error procesando PDF', 'error');
  }
}

async function agregarExtracto() {
  const provinciaSelect = document.getElementById('cpst-extracto-provincia');
  const provinciaIdx = parseInt(provinciaSelect.value);
  const provinciaNombre = provinciaSelect.options[provinciaSelect.selectedIndex].text;

  // Mapeo de índice a código de provincia
  const indexToCodigoProvincia = {
    0: '51', // CABA
    1: '53', // Buenos Aires
    2: '55', // Córdoba
    3: '59', // Entre Ríos
    4: '64', // Mendoza
    5: '72', // Santa Fe
    6: '00'  // Montevideo
  };

  // Recoger números
  const numeros = [];
  for (let i = 1; i <= 20; i++) {
    const input = document.getElementById(`cpst-num-${i}`);
    numeros.push(input ? input.value.padStart(4, '0') : '0000');
  }

  // Recoger letras
  const letras = [];
  for (let i = 1; i <= 4; i++) {
    const input = document.getElementById(`cpst-letra-${i}`);
    letras.push(input ? input.value.toUpperCase() : '');
  }

  // Validar que haya al menos algunos números
  const tieneNumeros = numeros.some(n => n !== '0000' && n !== '');
  if (!tieneNumeros) {
    showToast('Ingrese al menos algunos números del extracto', 'warning');
    return;
  }

  // Obtener datos del sorteo actual
  const fecha = cpResultadosActuales?.sorteo?.fecha || cpResultadosActuales?.fecha || new Date().toISOString().split('T')[0];
  const modalidad = cpstModalidadSorteo || 'M';
  const codigoProvincia = indexToCodigoProvincia[provinciaIdx] || '51';

  // Guardar en la BD (misma tabla que Extractos)
  try {
    const response = await extractosAPI.guardar({
      provincia: codigoProvincia,
      modalidad: modalidad,
      fecha: fecha,
      numeros: numeros,
      letras: letras.filter(l => l), // Solo letras no vacías
      fuente: 'Control Posterior'
    });

    if (response.success) {
      // Agregar o actualizar en array local
      const existente = cpstExtractos.findIndex(e => e.index === provinciaIdx);
      const extracto = {
        index: provinciaIdx,
        nombre: provinciaNombre,
        numeros: numeros,
        letras: letras,
        fromDB: true,
        dbId: response.data?.id
      };

      if (existente >= 0) {
        cpstExtractos[existente] = extracto;
        showToast(`Extracto ${provinciaNombre} actualizado y guardado en BD`, 'success');
      } else {
        cpstExtractos.push(extracto);
        showToast(`Extracto ${provinciaNombre} agregado y guardado en BD`, 'success');
      }
    } else {
      throw new Error(response.message || 'Error al guardar');
    }
  } catch (error) {
    console.error('Error guardando extracto en BD:', error);
    // Igual guardamos localmente para no perder el trabajo
    const existente = cpstExtractos.findIndex(e => e.index === provinciaIdx);
    const extracto = {
      index: provinciaIdx,
      nombre: provinciaNombre,
      numeros: numeros,
      letras: letras
    };

    if (existente >= 0) {
      cpstExtractos[existente] = extracto;
    } else {
      cpstExtractos.push(extracto);
    }
    showToast(`Extracto guardado localmente (error BD: ${error.message})`, 'warning');
  }

  renderExtractosList();
  limpiarExtractoPosterior();
}

// Agregar extracto sin limpiar los campos (para carga automática desde XML/JSON)
function agregarExtractoSinLimpiar() {
  const provinciaSelect = document.getElementById('cpst-extracto-provincia');
  const provinciaIdx = parseInt(provinciaSelect.value);
  const provinciaNombre = provinciaSelect.options[provinciaSelect.selectedIndex].text;

  // Recoger números
  const numeros = [];
  for (let i = 1; i <= 20; i++) {
    const input = document.getElementById(`cpst-num-${i}`);
    numeros.push(input ? input.value.padStart(4, '0') : '0000');
  }

  // Recoger letras
  const letras = [];
  for (let i = 1; i <= 4; i++) {
    const input = document.getElementById(`cpst-letra-${i}`);
    letras.push(input ? input.value.toUpperCase() : '');
  }

  // Validar que haya al menos algunos números
  const tieneNumeros = numeros.some(n => n !== '0000' && n !== '');
  if (!tieneNumeros) {
    return; // Silenciosamente no agregar si no hay datos
  }

  // Agregar o actualizar extracto
  const existente = cpstExtractos.findIndex(e => e.index === provinciaIdx);
  const extracto = {
    index: provinciaIdx,
    nombre: provinciaNombre,
    numeros: numeros,
    letras: letras
  };

  if (existente >= 0) {
    cpstExtractos[existente] = extracto;
    showToast(`Extracto ${provinciaNombre} actualizado`, 'success');
  } else {
    cpstExtractos.push(extracto);
    showToast(`Extracto ${provinciaNombre} agregado`, 'success');
  }

  renderExtractosList();
  // NO limpiar los campos para que el usuario vea qué se cargó
}

function limpiarExtractoPosterior() {
  for (let i = 1; i <= 20; i++) {
    const input = document.getElementById(`cpst-num-${i}`);
    if (input) input.value = '';
  }
  for (let i = 1; i <= 4; i++) {
    const input = document.getElementById(`cpst-letra-${i}`);
    if (input) input.value = '';
  }
}

function renderExtractosList() {
  // Usar la nueva función de renderizado inteligente
  renderExtractosListInteligente();
}

function eliminarExtracto(idx) {
  cpstExtractos.splice(idx, 1);
  renderExtractosList();
}

// ============================================
// ZONA DE CARGA INTELIGENTE - Funciones
// ============================================

// Toggle entre modo inteligente y manual
function toggleModoManual() {
  const zonaInteligente = document.getElementById('cpst-zona-inteligente');
  const modoManual = document.getElementById('cpst-modo-manual');
  const btnModo = document.getElementById('btn-modo-manual');

  if (modoManual.classList.contains('hidden')) {
    // Mostrar manual, ocultar inteligente
    zonaInteligente.classList.add('hidden');
    modoManual.classList.remove('hidden');
    btnModo.innerHTML = '<i class="fas fa-magic"></i> Zona Inteligente';
  } else {
    // Mostrar inteligente, ocultar manual
    zonaInteligente.classList.remove('hidden');
    modoManual.classList.add('hidden');
    btnModo.innerHTML = '<i class="fas fa-keyboard"></i> Modo Manual';
  }
}

// Agregar extracto desde modo manual (renombrada)
async function agregarExtractoManual() {
  await agregarExtracto();
}

// Drag & Drop handlers
function handleDragOver(event) {
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.classList.add('drag-over');
}

function handleDragLeave(event) {
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.classList.remove('drag-over');
}

function handleDropInteligente(event) {
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.classList.remove('drag-over');

  const files = event.dataTransfer.files;
  if (files.length > 0) {
    procesarArchivosInteligente(files);
  }
}

// Procesar archivos de forma inteligente
async function procesarArchivosInteligente(files) {
  if (!files || files.length === 0) return;

  const statusDiv = document.getElementById('cpst-procesamiento-status');
  const mensajeDiv = document.getElementById('cpst-procesamiento-mensaje');
  const progressDiv = document.getElementById('cpst-procesamiento-progress');

  statusDiv.classList.remove('hidden');
  progressDiv.style.width = '0%';

  const archivos = Array.from(files);
  let procesados = 0;
  let errores = 0;

  for (let i = 0; i < archivos.length; i++) {
    const archivo = archivos[i];
    const extension = archivo.name.split('.').pop().toLowerCase();
    const progress = Math.round(((i + 1) / archivos.length) * 100);

    mensajeDiv.textContent = `Procesando ${archivo.name} (${i + 1}/${archivos.length})...`;
    progressDiv.style.width = `${progress * 0.8}%`; // 80% durante el procesamiento

    try {
      if (extension === 'xml') {
        await procesarArchivoXMLInteligente(archivo);
        procesados++;
      } else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension)) {
        await procesarArchivoImagenInteligente(archivo);
        procesados++;
      } else if (extension === 'pdf') {
        await procesarArchivoPDFInteligente(archivo);
        procesados++;
      } else {
        console.warn(`Tipo de archivo no soportado: ${extension}`);
        errores++;
      }
    } catch (error) {
      console.error(`Error procesando ${archivo.name}:`, error);
      errores++;
      showToast(`Error en ${archivo.name}: ${error.message}`, 'error');
    }
  }

  progressDiv.style.width = '100%';

  setTimeout(() => {
    statusDiv.classList.add('hidden');

    if (procesados > 0) {
      showToast(`${procesados} archivo(s) procesado(s) correctamente${errores > 0 ? `, ${errores} error(es)` : ''}`,
        errores > 0 ? 'warning' : 'success');
    } else if (errores > 0) {
      showToast(`No se pudo procesar ningún archivo (${errores} error(es))`, 'error');
    }

    renderExtractosListInteligente();
  }, 500);

  // Limpiar input para permitir re-selección del mismo archivo
  document.getElementById('cpst-archivo-universal').value = '';
}

// Procesar XML inteligente (detecta provincia y modalidad del nombre)
async function procesarArchivoXMLInteligente(archivo) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async function (e) {
      try {
        const contenido = e.target.result;

        // Detectar provincia y modalidad del nombre del archivo usando la función existente
        const info = parsearNombreArchivoXML(archivo.name);

        if (!info) {
          console.warn(`⚠️ Archivo XML no reconocido: ${archivo.name}`);
          resolve(); // No es error crítico
          return;
        }

        const provinciaDetectada = info.codigoProvincia;
        const modalidadNombreArchivo = info.modalidad;

        // Usar la función existente que ya sabe parsear los XMLs correctamente
        const resultado = extraerDatosXML(contenido);

        if (!resultado || resultado.numeros.filter(n => n).length === 0) {
          console.warn(`⚠️ No se pudieron extraer números del XML: ${archivo.name}`);
          resolve();
          return;
        }

        // PRIORIDAD: Usar modalidad del CONTENIDO del XML si existe, sino la del nombre del archivo
        const modalidadDelContenido = resultado.modalidad;
        const modalidadFinal = modalidadDelContenido || modalidadNombreArchivo;

        console.log(`[XML] ${archivo.name}: Modalidad nombre archivo=${modalidadNombreArchivo}, contenido XML=${modalidadDelContenido}, usando=${modalidadFinal}`);

        // Verificar que la modalidad coincida con la del sorteo actual
        if (modalidadFinal && cpstModalidadSorteo && modalidadFinal !== cpstModalidadSorteo) {
          console.log(`XML ${archivo.name} es de modalidad ${modalidadFinal}, pero el sorteo actual es ${cpstModalidadSorteo}. Ignorando.`);
          resolve(); // No es error, simplemente no corresponde
          return;
        }

        const numeros = resultado.numeros;
        const letras = resultado.letras || [];

        // Usar la info de provincia del parser
        const provinciaIdx = info.provincia.index;
        const provinciaNombre = info.provincia.nombre;

        // Guardar en BD y agregar a lista local
        const fecha = cpResultadosActuales?.sorteo?.fecha || new Date().toISOString().split('T')[0];
        const modalidad = modalidadFinal || cpstModalidadSorteo || 'M';

        console.log(`[XML] Procesando ${archivo.name}: Provincia=${provinciaNombre}, Modalidad=${modalidad}, Números=${numeros.filter(n => n).length}, Letras=${letras.length}`);

        // VERIFICAR CONTRA PROGRAMACIÓN antes de guardar
        try {
          const verificacion = await programacionAPI.verificarSorteo(fecha, modalidad, 'Quiniela');
          if (verificacion.success && verificacion.data) {
            if (!verificacion.data.encontrado) {
              // No existe sorteo programado para esa fecha/modalidad
              const modalidadNombre = { 'R': 'LA PREVIA', 'P': 'LA PRIMERA', 'M': 'MATUTINA', 'V': 'VESPERTINA', 'N': 'NOCTURNA' }[modalidad] || modalidad;
              console.warn(`⚠️ ${archivo.name}: No hay sorteo de ${modalidadNombre} programado para ${fecha}`);
              if (verificacion.data.modalidadesProgramadas?.length > 0) {
                const disponibles = verificacion.data.modalidadesProgramadas.map(m => m.nombre).join(', ');
                console.warn(`   Modalidades disponibles: ${disponibles}`);
                showToast(`XML ${archivo.name}: No hay ${modalidadNombre} programada para ${fecha}. Disponibles: ${disponibles}`, 'warning');
              } else {
                showToast(`XML ${archivo.name}: No hay sorteos programados para ${fecha}`, 'warning');
              }
              resolve();
              return;
            } else {
              // Sorteo encontrado - mostrar info
              console.log(`✓ ${archivo.name}: Verificado contra programación - Sorteo #${verificacion.data.sorteo.numeroSorteo} (${verificacion.data.sorteo.modalidad_nombre})`);
            }
          }
        } catch (verError) {
          console.warn('No se pudo verificar contra programación:', verError.message);
          // Continuar sin verificar (puede no tener programación cargada)
        }

        if (provinciaIdx !== null && provinciaIdx !== undefined) {
          try {
            const response = await extractosAPI.guardar({
              provincia: provinciaDetectada,
              modalidad: modalidad,
              fecha: fecha,
              numeros: numeros,
              letras: letras.length > 0 ? letras : null,
              fuente: 'XML'
            });

            const extracto = {
              index: provinciaIdx,
              nombre: provinciaNombre,
              numeros: numeros,
              letras: letras,
              fuente: 'xml',
              archivo: archivo.name,
              fromDB: response.success,
              dbId: response.data?.id
            };

            const existente = cpstExtractos.findIndex(e => e.index === provinciaIdx);
            if (existente >= 0) {
              cpstExtractos[existente] = extracto;
            } else {
              cpstExtractos.push(extracto);
            }
          } catch (error) {
            console.warn('Error guardando XML en BD:', error);
            // Igual agregar localmente
            const extracto = {
              index: provinciaIdx,
              nombre: provinciaNombre,
              numeros: numeros,
              letras: letras,
              fuente: 'xml',
              archivo: archivo.name
            };

            const existente = cpstExtractos.findIndex(e => e.index === provinciaIdx);
            if (existente >= 0) {
              cpstExtractos[existente] = extracto;
            } else {
              cpstExtractos.push(extracto);
            }
          }
        }

        resolve();
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error('Error leyendo archivo XML'));
    reader.readAsText(archivo);
  });
}

// Procesar imagen con OCR inteligente
async function procesarArchivoImagenInteligente(archivo) {
  if (!window.OCRExtractos || !OCRExtractos.hasApiKey()) {
    throw new Error('OCR no configurado. Configure la API key de Groq.');
  }

  const { base64, mimeType } = await OCRExtractos.imageToBase64(archivo);
  const resultado = await OCRExtractos.procesarImagenQuiniela(base64, mimeType, '');

  if (!resultado.success || !resultado.data) {
    throw new Error('OCR no pudo extraer datos de la imagen');
  }

  const data = resultado.data;

  // Mapear código de provincia a índice
  const codigoToIndex = {
    '51': 0, '53': 1, '55': 2, '72': 3, '00': 4, '64': 5, '59': 6
  };

  const provinciaIdx = data.provincia ? codigoToIndex[data.provincia] : null;
  const provinciaNombres = ['CABA', 'Buenos Aires', 'Córdoba', 'Santa Fe', 'Montevideo', 'Mendoza', 'Entre Ríos'];

  // Verificar modalidad
  const modalidadMap = { 'Previa': 'R', 'Primera': 'P', 'Matutina': 'M', 'Vespertina': 'V', 'Nocturna': 'N' };
  const modalidadDetectada = modalidadMap[data.modalidad] || data.modalidad?.[0]?.toUpperCase();

  if (modalidadDetectada && cpstModalidadSorteo && modalidadDetectada !== cpstModalidadSorteo) {
    console.log(`Imagen detectada como ${data.modalidad}, pero sorteo actual es ${cpstModalidadSorteo}. Ignorando.`);
    return;
  }

  const fecha = data.fecha || cpResultadosActuales?.sorteo?.fecha || new Date().toISOString().split('T')[0];
  const modalidad = modalidadDetectada || cpstModalidadSorteo || 'M';

  if (provinciaIdx !== null && provinciaIdx !== undefined && data.numeros) {
    try {
      const response = await extractosAPI.guardar({
        provincia: data.provincia,
        modalidad: modalidad,
        fecha: fecha,
        numeros: data.numeros,
        letras: data.letras || null,
        fuente: 'OCR'
      });

      const extracto = {
        index: provinciaIdx,
        nombre: provinciaNombres[provinciaIdx],
        numeros: data.numeros,
        letras: data.letras || [],
        fuente: 'ocr',
        archivo: archivo.name,
        fromDB: response.success,
        dbId: response.data?.id
      };

      const existente = cpstExtractos.findIndex(e => e.index === provinciaIdx);
      if (existente >= 0) {
        cpstExtractos[existente] = extracto;
      } else {
        cpstExtractos.push(extracto);
      }
    } catch (error) {
      console.warn('Error guardando imagen OCR en BD:', error);
      const extracto = {
        index: provinciaIdx,
        nombre: provinciaNombres[provinciaIdx],
        numeros: data.numeros,
        letras: data.letras || [],
        fuente: 'ocr',
        archivo: archivo.name
      };

      const existente = cpstExtractos.findIndex(e => e.index === provinciaIdx);
      if (existente >= 0) {
        cpstExtractos[existente] = extracto;
      } else {
        cpstExtractos.push(extracto);
      }
    }
  } else {
    throw new Error(`No se pudo detectar provincia de la imagen (detectada: ${data.provincia})`);
  }
}

// Procesar PDF con OCR
async function procesarArchivoPDFInteligente(archivo) {
  if (!window.OCRExtractos || !OCRExtractos.hasApiKey()) {
    throw new Error('OCR no configurado. Configure la API key de Groq.');
  }

  // Convertir PDF a imagen usando el método del módulo OCR
  const { base64, mimeType } = await OCRExtractos.pdfToImage(archivo);

  // Procesar con OCR
  const resultado = await OCRExtractos.procesarImagenQuiniela(base64, mimeType, '');

  if (!resultado.success || !resultado.data) {
    throw new Error('OCR no pudo extraer datos del PDF');
  }

  const data = resultado.data;

  const codigoToIndex = {
    '51': 0, '53': 1, '55': 2, '72': 3, '00': 4, '64': 5, '59': 6
  };

  const provinciaIdx = data.provincia ? codigoToIndex[data.provincia] : null;
  const provinciaNombres = ['CABA', 'Buenos Aires', 'Córdoba', 'Santa Fe', 'Montevideo', 'Mendoza', 'Entre Ríos'];

  const modalidadMap = { 'Previa': 'R', 'Primera': 'P', 'Matutina': 'M', 'Vespertina': 'V', 'Nocturna': 'N' };
  const modalidadDetectada = modalidadMap[data.modalidad] || data.modalidad?.[0]?.toUpperCase();

  if (modalidadDetectada && cpstModalidadSorteo && modalidadDetectada !== cpstModalidadSorteo) {
    console.log(`PDF detectado como ${data.modalidad}, pero sorteo actual es ${cpstModalidadSorteo}. Ignorando.`);
    return;
  }

  const fecha = data.fecha || cpResultadosActuales?.sorteo?.fecha || new Date().toISOString().split('T')[0];
  const modalidad = modalidadDetectada || cpstModalidadSorteo || 'M';

  if (provinciaIdx !== null && provinciaIdx !== undefined && data.numeros) {
    try {
      const response = await extractosAPI.guardar({
        provincia: data.provincia,
        modalidad: modalidad,
        fecha: fecha,
        numeros: data.numeros,
        letras: data.letras || null,
        fuente: 'PDF-OCR'
      });

      const extracto = {
        index: provinciaIdx,
        nombre: provinciaNombres[provinciaIdx],
        numeros: data.numeros,
        letras: data.letras || [],
        fuente: 'pdf',
        archivo: archivo.name,
        fromDB: response.success,
        dbId: response.data?.id
      };

      const existente = cpstExtractos.findIndex(e => e.index === provinciaIdx);
      if (existente >= 0) {
        cpstExtractos[existente] = extracto;
      } else {
        cpstExtractos.push(extracto);
      }
    } catch (error) {
      console.warn('Error guardando PDF en BD:', error);
      // Igual agregar localmente
      const extracto = {
        index: provinciaIdx,
        nombre: provinciaNombres[provinciaIdx],
        numeros: data.numeros,
        letras: data.letras || [],
        fuente: 'pdf',
        archivo: archivo.name
      };

      const existente = cpstExtractos.findIndex(e => e.index === provinciaIdx);
      if (existente >= 0) {
        cpstExtractos[existente] = extracto;
      } else {
        cpstExtractos.push(extracto);
      }
    }
  } else {
    throw new Error(`No se pudo detectar provincia del PDF (detectada: ${data.provincia})`);
  }
}

// Render mejorado de la lista de extractos
function renderExtractosListInteligente() {
  const container = document.getElementById('cpst-extractos-lista');
  if (!container) return;

  if (cpstExtractos.length === 0) {
    container.innerHTML = `
      <div class="extractos-vacio">
        <i class="fas fa-inbox" style="font-size: 2rem; margin-bottom: 0.5rem; opacity: 0.5;"></i>
        <p>No hay extractos cargados</p>
        <small>Arrastrá archivos a la zona de arriba o usá el modo manual</small>
      </div>
    `;
    return;
  }

  let html = '';

  // Ordenar por nombre de provincia
  const extractosOrdenados = [...cpstExtractos].sort((a, b) => a.nombre.localeCompare(b.nombre));

  extractosOrdenados.forEach((ex, idx) => {
    const nums = ex.numeros || [];
    const letras = ex.letras || [];
    const originalIdx = cpstExtractos.findIndex(e => e.index === ex.index);

    // Determinar icono según fuente
    let iconClass = 'fa-file-alt';
    let iconType = 'xml';
    if (ex.fuente === 'ocr') { iconClass = 'fa-image'; iconType = 'imagen'; }
    else if (ex.fuente === 'pdf') { iconClass = 'fa-file-pdf'; iconType = 'pdf'; }
    else if (ex.fromDB && !ex.fuente) { iconClass = 'fa-database'; iconType = 'bd'; }

    // Formato compacto de números: mostrar primeros 5 y últimos 2
    const numerosPreview = `${nums.slice(0, 5).join('-')}...${nums.slice(18).join('-')}`;

    html += `
      <div class="extracto-card ${ex.fromDB ? 'desde-bd' : ''}">
        <div class="extracto-icon ${iconType}">
          <i class="fas ${iconClass}"></i>
        </div>
        <div class="extracto-info">
          <div class="extracto-titulo">
            ${ex.nombre}
            <span class="badge-fuente ${ex.fuente || (ex.fromDB ? 'bd' : 'manual')}">${ex.fuente?.toUpperCase() || (ex.fromDB ? 'BD' : 'MANUAL')}</span>
          </div>
          <div class="extracto-numeros" title="${nums.join(' | ')}">
            ${numerosPreview}
            ${letras.length > 0 ? ` | Letras: ${letras.join('')}` : ''}
          </div>
        </div>
        <div class="extracto-acciones">
          <button class="btn btn-sm btn-secondary" onclick="verDetalleExtracto(${originalIdx})" title="Ver detalle">
            <i class="fas fa-eye"></i>
          </button>
          <button class="btn btn-sm btn-danger" onclick="eliminarExtracto(${originalIdx})" title="Eliminar">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// Ver detalle de un extracto en modal
function verDetalleExtracto(idx) {
  const ex = cpstExtractos[idx];
  if (!ex) return;

  const nums = ex.numeros || [];
  const letras = ex.letras || [];

  let numerosHTML = '<table style="width: 100%; font-family: monospace; border-collapse: collapse;">';
  numerosHTML += '<tr style="color: var(--text-muted); font-size: 0.8rem;">';
  for (let i = 1; i <= 10; i++) numerosHTML += `<td style="text-align: center; padding: 4px; border: 1px solid var(--border-color);">${i}</td>`;
  numerosHTML += '</tr><tr>';
  for (let i = 0; i < 10; i++) numerosHTML += `<td style="text-align: center; padding: 8px; border: 1px solid var(--border-color); font-weight: bold; background: var(--bg-input);">${nums[i] || '-'}</td>`;
  numerosHTML += '</tr><tr style="color: var(--text-muted); font-size: 0.8rem;">';
  for (let i = 11; i <= 20; i++) numerosHTML += `<td style="text-align: center; padding: 4px; border: 1px solid var(--border-color);">${i}</td>`;
  numerosHTML += '</tr><tr>';
  for (let i = 10; i < 20; i++) numerosHTML += `<td style="text-align: center; padding: 8px; border: 1px solid var(--border-color); font-weight: bold; background: var(--bg-input);">${nums[i] || '-'}</td>`;
  numerosHTML += '</tr></table>';

  let letrasHTML = '';
  if (letras.length > 0) {
    letrasHTML = `<div style="margin-top: 1rem;"><strong>Letras:</strong> <span style="font-family: monospace; font-size: 1.2rem; background: var(--primary); color: white; padding: 4px 12px; border-radius: 6px;">${letras.join(' ')}</span></div>`;
  }

  const modalContent = `
    <div style="padding: 1.5rem;">
      <h3 style="margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
        <i class="fas fa-list-ol"></i> ${ex.nombre}
        ${ex.fromDB ? '<span class="badge badge-primary" style="font-size: 0.7rem;">Guardado en BD</span>' : ''}
      </h3>
      ${ex.archivo ? `<p class="text-muted" style="margin-bottom: 1rem;"><i class="fas fa-file"></i> ${ex.archivo}</p>` : ''}
      ${numerosHTML}
      ${letrasHTML}
    </div>
  `;

  // Mostrar en un modal simple
  showModalSimple('Detalle del Extracto', modalContent);
}

// Modal simple reutilizable
function showModalSimple(titulo, contenido) {
  // Remover modal existente si hay
  const existente = document.getElementById('modal-simple');
  if (existente) existente.remove();

  const modal = document.createElement('div');
  modal.id = 'modal-simple';
  modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 9999;';
  modal.innerHTML = `
    <div style="background: var(--bg-card); border-radius: 12px; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto; position: relative;">
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.5rem; border-bottom: 1px solid var(--border-color);">
        <h3 style="margin: 0;">${titulo}</h3>
        <button onclick="document.getElementById('modal-simple').remove()" style="background: none; border: none; color: var(--text-primary); font-size: 1.5rem; cursor: pointer; padding: 0.5rem;">&times;</button>
      </div>
      ${contenido}
    </div>
  `;

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });

  document.body.appendChild(modal);
}

// ============================================
// FIN ZONA INTELIGENTE
// ============================================

async function ejecutarEscrutinio() {
  // Validaciones según el juego
  if (cpstJuegoSeleccionado === 'Quiniela') {
    if (cpstExtractos.length === 0) {
      showToast('Cargue al menos un extracto', 'warning');
      return;
    }
  } else if (cpstJuegoSeleccionado === 'Poceada' || cpstJuegoSeleccionado === 'Tombolina') {
    // Para Poceada o Tombolina necesitamos el extracto de 20 números
    if (!cpstExtractoPoceada || cpstExtractoPoceada.numeros.length < 20) {
      showToast(`Cargue el extracto de ${cpstJuegoSeleccionado} (20 números)`, 'warning');
      return;
    }
  }

  if (!cpstDatosControlPrevio) {
    showToast('Cargue los datos del sorteo primero', 'warning');
    return;
  }

  // NUEVO: Verificar que tenemos registros reales del TXT
  if (!cpstRegistrosNTF || cpstRegistrosNTF.length === 0) {
    showToast('No hay registros del TXT. Procese el ZIP en Control Previo primero.', 'warning');
    return;
  }

  // Obtener registros anulados del control previo
  const registrosAnulados = cpstDatosControlPrevio.registrosAnulados || 0;

  showToast(`Ejecutando escrutinio ${cpstJuegoSeleccionado}: ${formatNumber(cpstRegistrosNTF.length)} válidos + ${formatNumber(registrosAnulados)} anulados...`, 'info');

  try {
    const token = getToken();

    if (cpstJuegoSeleccionado === 'Poceada') {
      // Ejecutar escrutinio de Poceada
      const response = await fetch(`${API_BASE}/control-posterior/poceada/escrutinio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          registrosNTF: cpstRegistrosNTF,
          extracto: cpstExtractoPoceada,
          datosControlPrevio: cpstDatosControlPrevio,
          registrosAnulados: registrosAnulados
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message);

      cpstResultados = data.data;
      mostrarResultadosEscrutinioPoceada(cpstResultados);
      showToast('Escrutinio Poceada completado', 'success');

    } else if (cpstJuegoSeleccionado === 'Tombolina') {
      // Ejecutar escrutinio de Tombolina usando api.js
      const response = await controlPosteriorAPI.escrutinioTombolina({
        registrosNTF: cpstRegistrosNTF,
        extracto: cpstExtractoPoceada,
        datosControlPrevio: cpstDatosControlPrevio
      });

      cpstResultados = response.data;
      mostrarResultadosEscrutinioTombolina(cpstResultados);
      showToast('Escrutinio Tombolina completado', 'success');

    } else {
      // Ejecutar escrutinio de Quiniela (código existente)
      console.log('[ESCRUTINIO] Extractos a enviar:', cpstExtractos.map(e => ({
        index: e.index,
        nombre: e.nombre,
        numerosCount: e.numeros?.length,
        letras: e.letras
      })));

      const response = await fetch(`${API_BASE}/control-posterior/quiniela/escrutinio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          registrosNTF: cpstRegistrosNTF,
          extractos: cpstExtractos,
          datosControlPrevio: cpstDatosControlPrevio,
          registrosAnulados: registrosAnulados
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message);

      cpstResultados = data.data;
      mostrarResultadosEscrutinio(cpstResultados);
      showToast('Escrutinio completado', 'success');
    }

  } catch (error) {
    console.error('Error:', error);
    showToast(error.message || 'Error ejecutando escrutinio', 'error');
  }
}

// Mostrar resultados específicos de Poceada

function getTextoGanadores(cantidad) {
  if (!cantidad || cantidad === 0) return 'VACANTE';
  if (cantidad === 1) return 'UN (1) GANADOR';
  const basicos = {
    2: 'DOS', 3: 'TRES', 4: 'CUATRO', 5: 'CINCO',
    6: 'SEIS', 7: 'SIETE', 8: 'OCHO', 9: 'NUEVE', 10: 'DIEZ'
  };
  if (basicos[cantidad]) return `${basicos[cantidad]} (${cantidad}) GANADORES`;
  return `${cantidad} GANADORES`;
}

function mostrarResultadosEscrutinioPoceada(resultado) {
  document.getElementById('cpst-resultados').classList.remove('hidden');

  // Ocultar tabla de Quiniela, mostrar tabla de Poceada
  document.getElementById('cpst-detalle-quiniela')?.classList.add('hidden');
  document.getElementById('cpst-detalle-poceada')?.classList.remove('hidden');

  // Mostrar extractos sorteados (números)
  renderExtractosSorteados();

  // Tarjetas de Tickets
  if (resultado.comparacion) {
    const reg = resultado.comparacion.registros;
    const ticketsValidos = reg.controlPosterior || 0;
    const ticketsAnulados = reg.anulados || 0;
    const ticketsTotal = ticketsValidos + ticketsAnulados;

    document.getElementById('cpst-tickets-total').textContent = formatNumber(ticketsTotal);
    document.getElementById('cpst-tickets-validos').textContent = formatNumber(ticketsValidos);
    document.getElementById('cpst-tickets-anulados').textContent = formatNumber(ticketsAnulados);
  }

  // Resumen general
  document.getElementById('cpst-total-ganadores').textContent = formatNumber(resultado.totalGanadores);
  document.getElementById('cpst-total-premios').textContent = '$' + formatNumber(resultado.totalPremios);

  // Tasa de devolución
  if (resultado.comparacion && resultado.comparacion.recaudacion.controlPrevio > 0) {
    const tasa = (resultado.totalPremios / resultado.comparacion.recaudacion.controlPrevio * 100).toFixed(2);
    document.getElementById('cpst-tasa-devolucion').textContent = tasa + '%';
  }

  // Tabla comparación (igual que Quiniela)
  if (resultado.comparacion) {
    const tbody = document.querySelector('#cpst-tabla-comparacion tbody');
    tbody.innerHTML = '';

    const reg = resultado.comparacion.registros;
    const apu = resultado.comparacion.apuestas;
    const rec = resultado.comparacion.recaudacion;

    // Calcular tickets totales (válidos + anulados)
    const ticketsTotalPrevio = reg.controlPrevio + (reg.anulados || 0);
    const ticketsTotalPosterior = reg.controlPosterior + (reg.anulados || 0);
    const ticketsTotalCoincide = ticketsTotalPrevio === ticketsTotalPosterior;

    // Tickets (Total)
    tbody.innerHTML += `
      <tr>
        <td><strong>Tickets (Total)</strong></td>
        <td>${formatNumber(ticketsTotalPrevio)}</td>
        <td>${formatNumber(ticketsTotalPosterior)}</td>
        <td class="${ticketsTotalCoincide ? 'text-success' : 'text-danger'}">${ticketsTotalCoincide ? '✓ OK' : '✗ DIFERENCIA'}</td>
      </tr>
    `;

    // Tickets Válidos
    tbody.innerHTML += `
      <tr>
        <td>Tickets Válidos</td>
        <td>${formatNumber(reg.controlPrevio)}</td>
        <td>${formatNumber(reg.controlPosterior)}</td>
        <td class="${reg.coincide ? 'text-success' : 'text-danger'}">${reg.coincide ? '✓ OK' : '✗ DIFERENCIA'}</td>
      </tr>
    `;

    // Anulados
    tbody.innerHTML += `
      <tr>
        <td>Anulados</td>
        <td>${formatNumber(reg.anulados || 0)}</td>
        <td>${formatNumber(reg.anulados || 0)}</td>
        <td class="text-success">✓ OK</td>
      </tr>
    `;

    tbody.innerHTML += `
      <tr>
        <td>Apuestas</td>
        <td>${formatNumber(apu.controlPrevio)}</td>
        <td>${formatNumber(apu.controlPosterior)}</td>
        <td class="${apu.coincide ? 'text-success' : 'text-danger'}">${apu.coincide ? '✓ OK' : '✗ DIFERENCIA'}</td>
      </tr>
      <tr>
        <td>Recaudación</td>
        <td>$${formatNumber(rec.controlPrevio)}</td>
        <td>$${formatNumber(rec.controlPosterior)}</td>
        <td class="${rec.coincide ? 'text-success' : 'text-danger'}">${rec.coincide ? '✓ OK' : '✗ DIFERENCIA'}</td>
      </tr>
    `;
  }

  // Tabla de detalle por nivel de aciertos
  const niveles = resultado.porNivel || {};

  // 8 aciertos (Primer Premio)
  const n8 = niveles[8] || { ganadores: 0, premioUnitario: 0, totalPremios: 0, pozoVacante: 0 };
  const textNo8 = n8.ganadoresTexto || getTextoGanadores(n8.ganadores);

  document.getElementById('cpst-poc-gan-8').innerHTML = `${formatNumber(n8.ganadores)}<br><small class="text-muted" style="font-size: 0.7em;">${textNo8}</small>`;
  document.getElementById('cpst-poc-premio-8').textContent = '$' + formatNumber(n8.premioUnitario);
  document.getElementById('cpst-poc-total-8').textContent = '$' + formatNumber(n8.totalPremios);
  document.getElementById('cpst-poc-vacante-8').textContent = n8.ganadores === 0 ? '$' + formatNumber(n8.pozoVacante) : '-';

  // 7 aciertos (Segundo Premio)
  const n7 = niveles[7] || { ganadores: 0, premioUnitario: 0, totalPremios: 0, pozoVacante: 0 };
  const textNo7 = n7.ganadoresTexto || getTextoGanadores(n7.ganadores);

  document.getElementById('cpst-poc-gan-7').innerHTML = `${formatNumber(n7.ganadores)}<br><small class="text-muted" style="font-size: 0.7em;">${textNo7}</small>`;
  document.getElementById('cpst-poc-premio-7').textContent = '$' + formatNumber(n7.premioUnitario);
  document.getElementById('cpst-poc-total-7').textContent = '$' + formatNumber(n7.totalPremios);
  document.getElementById('cpst-poc-vacante-7').textContent = n7.ganadores === 0 ? '$' + formatNumber(n7.pozoVacante) : '-';

  // 6 aciertos (Tercer Premio)
  const n6 = niveles[6] || { ganadores: 0, premioUnitario: 0, totalPremios: 0, pozoVacante: 0 };
  const textNo6 = n6.ganadoresTexto || getTextoGanadores(n6.ganadores);

  document.getElementById('cpst-poc-gan-6').innerHTML = `${formatNumber(n6.ganadores)}<br><small class="text-muted" style="font-size: 0.7em;">${textNo6}</small>`;
  document.getElementById('cpst-poc-premio-6').textContent = '$' + formatNumber(n6.premioUnitario);
  document.getElementById('cpst-poc-total-6').textContent = '$' + formatNumber(n6.totalPremios);
  document.getElementById('cpst-poc-vacante-6').textContent = n6.ganadores === 0 ? '$' + formatNumber(n6.pozoVacante) : '-';

  // Estímulo Agente (Agenciero)
  // Se inserta dinámicamente si no existe, o se actualiza
  const tablaBody = document.querySelector('#cpst-tabla-poceada tbody');

  // Eliminar fila de agenciero anterior si existe para evitar duplicados al re-ejecutar
  const filaAgencieroOld = document.getElementById('cpst-poc-row-agenciero');
  if (filaAgencieroOld) filaAgencieroOld.remove();

  const agData = resultado.agenciero || { ganadores: 0, premioUnitario: 0, totalPremios: 0, pozoVacante: 0 };
  const textAg = agData.ganadoresTexto || getTextoGanadores(agData.ganadores);

  // Insertar fila de estímulo después del 1er premio (o al final)
  const filaAgenciero = document.createElement('tr');
  filaAgenciero.id = 'cpst-poc-row-agenciero';
  filaAgenciero.style.background = 'var(--surface-hover)';

  let agencieroDetalle = '';
  if (agData.ganadores > 0 && agData.detalles && agData.detalles.length > 0) {
    const agencias = agData.detalles.map(d => `<span class="badge badge-info">${d.ctaCte || d.agencia}</span>`).join(' ');
    agencieroDetalle = `<div style="margin-top: 4px; font-size: 0.8em;">Cta Cte: ${agencias}</div>`;
  }

  filaAgenciero.innerHTML = `
    <td><span class="badge badge-info">ESTÍMULO AGENTE</span></td>
    <td><strong>Ag. Vendedor</strong></td>
    <td>
      ${formatNumber(agData.ganadores)}<br>
      <small class="text-muted" style="font-size: 0.7em;">${textAg}</small>
      ${agencieroDetalle}
    </td>
    <td>$${formatNumber(agData.premioUnitario)}</td>
    <td>$${formatNumber(agData.totalPremios)}</td>
    <td>0.5%</td>
    <td>${agData.pozoVacante > 0 ? '$' + formatNumber(agData.pozoVacante) : '-'}</td>
  `;

  // Insertar después de la fila nivel 8 (Primer Premio)
  const filaNivel8 = document.querySelector('#cpst-tabla-poceada tbody .nivel-8');
  if (filaNivel8 && filaNivel8.nextSibling) {
    tablaBody.insertBefore(filaAgenciero, filaNivel8.nextSibling);
  } else {
    tablaBody.appendChild(filaAgenciero);
  }

  // Premio de Letras (Cuatro de Cuatro / Letras Coincidentes)
  // Eliminar fila de letras anterior si existe
  const filaLetrasOld = document.getElementById('cpst-poc-row-letras');
  if (filaLetrasOld) filaLetrasOld.remove();

  const letData = niveles['letras'] || { ganadores: 0, premioUnitario: 0, totalPremios: 0, pozoVacante: 0 };
  const textLet = letData.ganadoresTexto || getTextoGanadores(letData.ganadores);

  const filaLetras = document.createElement('tr');
  filaLetras.id = 'cpst-poc-row-letras';
  filaLetras.className = 'nivel-letras';
  filaLetras.innerHTML = `
    <td><span class="badge badge-success">🔡 PREMIO LETRAS</span></td>
    <td><strong>4 de 4</strong></td>
    <td>
      ${formatNumber(letData.ganadores)}<br>
      <small class="text-muted" style="font-size: 0.7em;">${textLet}</small>
    </td>
    <td>$${formatNumber(letData.premioUnitario)}</td>
    <td>$${formatNumber(letData.totalPremios)}</td>
    <td>-</td>
    <td>${letData.ganadores === 0 && letData.pozoVacante > 0 ? '$' + formatNumber(letData.pozoVacante) : '-'}</td>
  `;

  // Insertar después del 3er premio
  const filaNivel6 = document.querySelector('#cpst-tabla-poceada tbody .nivel-6');
  if (filaNivel6 && filaNivel6.nextSibling) {
    tablaBody.insertBefore(filaLetras, filaNivel6.nextSibling);
  } else {
    tablaBody.appendChild(filaLetras);
  }

  // Totales
  const totalGanadores = n8.ganadores + n7.ganadores + n6.ganadores + (letData ? letData.ganadores : 0);
  const totalPremios = n8.totalPremios + n7.totalPremios + n6.totalPremios + (letData ? letData.totalPremios : 0);
  const totalVacante = (n8.ganadores === 0 ? n8.pozoVacante : 0) + (n7.ganadores === 0 ? n7.pozoVacante : 0) + (n6.ganadores === 0 ? n6.pozoVacante : 0) + (letData && letData.ganadores === 0 ? letData.pozoVacante : 0);

  document.getElementById('cpst-poc-gan-total').textContent = formatNumber(totalGanadores);
  document.getElementById('cpst-poc-total-premios').textContent = '$' + formatNumber(totalPremios);
  document.getElementById('cpst-poc-vacante-total').textContent = '$' + formatNumber(totalVacante);

  // Tabla de desglose por cantidad de números jugados
  const porMultiples = resultado.porCantidadNumeros || {};
  const tbodyMultiples = document.getElementById('cpst-tabla-poceada-multiples-body');
  tbodyMultiples.innerHTML = '';

  for (let cant = 8; cant <= 15; cant++) {
    const datos = porMultiples[cant] || { combinaciones: COMBINACIONES_MULTIPLES_POCEADA[cant] || 0, registros: 0, gan8: 0, gan7: 0, gan6: 0, totalPremios: 0 };
    if (datos.registros > 0) {
      tbodyMultiples.innerHTML += `
        <tr>
          <td><strong>${cant} números</strong></td>
          <td>${formatNumber(datos.combinaciones)} comb.</td>
          <td>${formatNumber(datos.registros)}</td>
          <td>${datos.gan8 > 0 ? `<span class="badge badge-warning">${datos.gan8}</span>` : '-'}</td>
          <td>${datos.gan7 > 0 ? `<span class="badge badge-primary">${datos.gan7}</span>` : '-'}</td>
          <td>${datos.gan6 > 0 ? `<span class="badge badge-secondary">${datos.gan6}</span>` : '-'}</td>
          <td>$${formatNumber(datos.totalPremios)}</td>
        </tr>
      `;
    }
  }

  if (tbodyMultiples.innerHTML === '') {
    tbodyMultiples.innerHTML = '<tr><td colspan="7" class="text-muted">No hay registros de apuestas múltiples</td></tr>';
  }

  // Actualizar detalle por tipo (ocultar el de Quiniela)
  const premiosXML = resultado.premiosXML || {};
  document.getElementById('cpst-detalle-tipos').innerHTML = `
    <div class="alert" style="background: var(--bg-input); padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
      <h4 style="margin-bottom: 0.5rem;"><i class="fas fa-info-circle"></i> Extracto Utilizado</h4>
      <div style="display: flex; gap: 2rem; flex-wrap: wrap; margin-top: 0.5rem;">
        <div>
          <strong>Números (20):</strong>
          <span style="font-family: monospace; font-size: 0.95rem; color: var(--primary);">
            ${cpstExtractoPoceada.numeros.slice(0, 10).map(n => n.toString().padStart(2, '0')).join(' - ')}<br>
            ${cpstExtractoPoceada.numeros.slice(10, 20).map(n => n.toString().padStart(2, '0')).join(' - ')}
          </span>
        </div>
        <div>
          <strong>Letras:</strong>
          <span style="font-family: monospace; font-size: 1.1rem; color: var(--primary);">
            ${cpstExtractoPoceada.letras.join(' - ')}
          </span>
        </div>
      </div>
    </div>
    <div class="alert" style="background: var(--bg-secondary); padding: 1rem; border-radius: 8px; border-left: 4px solid var(--warning);">
      <h4 style="margin-bottom: 0.5rem;"><i class="fas fa-trophy"></i> Premios del XML (Control Previo)</h4>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-top: 0.5rem;">
        <div>
          <small class="text-muted">Primer Premio (8 aciertos)</small>
          <div style="font-size: 1.2rem; font-weight: bold; color: var(--warning);">$${formatNumber(premiosXML.primerPremio || 0)}</div>
        </div>
        <div>
          <small class="text-muted">Segundo Premio (7 aciertos)</small>
          <div style="font-size: 1.2rem; font-weight: bold; color: var(--primary);">$${formatNumber(premiosXML.segundoPremio || 0)}</div>
        </div>
        <div>
          <small class="text-muted">Tercer Premio (6 aciertos)</small>
          <div style="font-size: 1.2rem; font-weight: bold; color: var(--text-secondary);">$${formatNumber(premiosXML.tercerPremio || 0)}</div>
        </div>
      </div>
    </div>
  `;

  // NUEVO: Poblar tabla de provincias para Poceada
  const tbodyProv = document.querySelector('#cpst-tabla-poceada-provincias tbody');
  if (tbodyProv && resultado.reportePorExtracto) {
    tbodyProv.innerHTML = '';
    resultado.reportePorExtracto.forEach(rep => {
      if (rep.totalGanadores === 0 && rep.totalPagado === 0) return;

      const p = rep.porNivel || {};
      tbodyProv.innerHTML += `
        <tr>
          <td><strong>${rep.nombre}</strong></td>
          <td class="text-success"><strong>$${formatNumber(rep.totalPagado)}</strong></td>
          <td><strong>${rep.totalGanadores}</strong></td>
          <td>${p[8]?.ganadores || 0}</td><td>$${formatNumber(p[8]?.pagado || 0)}</td>
          <td>${p[7]?.ganadores || 0}</td><td>$${formatNumber(p[7]?.pagado || 0)}</td>
          <td>${p[6]?.ganadores || 0}</td><td>$${formatNumber(p[6]?.pagado || 0)}</td>
          <td>${p['letras']?.ganadores || 0}</td><td>$${formatNumber(p['letras']?.pagado || 0)}</td>
        </tr>
      `;
    });

    if (tbodyProv.innerHTML === '') {
      tbodyProv.innerHTML = '<tr><td colspan="11" class="text-center text-muted">No se encontraron ganadores en ninguna provincia</td></tr>';
    }
  }

  // Actulizar ventas por agencia
  mostrarVentasAgenciaPosterior();
}

// La función generarRegistrosSimulados fue removida
// Ahora se usan los registros reales parseados del archivo TXT (cpstRegistrosNTF)

function mostrarResultadosEscrutinioTombolina(resultado) {
  document.getElementById('cpst-resultados').classList.remove('hidden');

  // Ocultar otras tablas, mostrar la de Tombolina
  document.getElementById('cpst-detalle-quiniela')?.classList.add('hidden');
  document.getElementById('cpst-detalle-poceada')?.classList.add('hidden');
  document.getElementById('cpst-detalle-tombolina')?.classList.remove('hidden');

  // Resumen lateral (extracto utilizado)
  const detalleTipos = document.getElementById('cpst-detalle-tipos');
  if (detalleTipos && cpstExtractoPoceada) {
    detalleTipos.innerHTML = `
      <div class="alert" style="background: var(--bg-input); padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
        <h4 style="margin-bottom: 0.5rem;"><i class="fas fa-info-circle"></i> Extracto Utilizado (20 números)</h4>
        <div style="display: flex; gap: 2rem; flex-wrap: wrap; margin-top: 0.5rem;">
          <div>
            <span style="font-family: monospace; font-size: 1.1rem; color: var(--primary); letter-spacing: 2px;">
              ${cpstExtractoPoceada.numeros.slice(0, 10).map(n => n.toString().padStart(2, '0')).join(' - ')}<br>
              ${cpstExtractoPoceada.numeros.slice(10, 20).map(n => n.toString().padStart(2, '0')).join(' - ')}
            </span>
          </div>
        </div>
      </div>
    `;
  }

  // Resumen de tickets y recaudación (tomado del Control Previo)
  const cp = resultado.datosControlPrevio || {};
  const recValida = parseFloat(cp.totalRecaudacion || cp.recaudacion) || 0;
  const recAnulada = parseFloat(cp.totalRecaudacionAnulada || cp.recaudacionAnulada) || 0;
  const recTotal = recValida + recAnulada;
  const ticketsValidos = parseInt(cp.totalApuestas || cp.registros) || 0;
  const ticketsAnulados = parseInt(cp.totalAnulados || cp.anulados) || 0;
  const ticketsTotal = ticketsValidos + ticketsAnulados;

  document.getElementById('cpst-tickets-total').textContent = formatNumber(ticketsTotal);
  document.getElementById('cpst-tickets-validos').textContent = formatNumber(ticketsValidos);
  document.getElementById('cpst-tickets-anulados').textContent = formatNumber(ticketsAnulados);

  document.getElementById('cpst-recaudacion-total').textContent = '$' + formatNumber(recTotal);
  document.getElementById('cpst-recaudacion-valida').textContent = '$' + formatNumber(recValida);
  document.getElementById('cpst-recaudacion-anulada').textContent = '$' + formatNumber(recAnulada);

  // Resumen general de resultados
  document.getElementById('cpst-total-ganadores').textContent = formatNumber(resultado.totalGanadores);
  document.getElementById('cpst-total-premios').textContent = '$' + formatNumber(resultado.totalPremios);

  // Tasa de devolución
  const tasaDev = recValida > 0 ? (resultado.totalPremios / recValida * 100) : 0;
  const tasaElem = document.getElementById('cpst-tasa-devolucion');
  if (tasaElem) tasaElem.textContent = tasaDev.toFixed(2) + '%';

  // Tabla Tombolina
  const tbody = document.querySelector('#cpst-tabla-tombolina tbody');
  if (tbody) {
    tbody.innerHTML = '';

    // El reporte del backend tiene: aciertos7, aciertos6, etc. y 'letras'
    const niveles = [7, 6, 5, 4, 3];
    niveles.forEach(n => {
      const data = resultado.reporte[`aciertos${n}`];
      if (data && data.ganadores > 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>Categoría ${n} Aciertos</strong></td>
          <td>Múltiples combinaciones</td>
          <td>${formatNumber(data.ganadores)}</td>
          <td>Variable x Multiplicador</td>
          <td>$${formatNumber(data.premio)}</td>
        `;
        tbody.appendChild(tr);
      }
    });

    // Fila Letras
    const dataLetras = resultado.reporte.letras;
    if (dataLetras && dataLetras.ganadores > 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="badge badge-purple" style="background: #6f42c1; color: white;">🔤 LETRAS</span></td>
        <td>4 Letras Exactas</td>
        <td>${formatNumber(dataLetras.ganadores)}</td>
        <td>$1.000 (Fijo)</td>
        <td>$${formatNumber(dataLetras.premio)}</td>
      `;
      tbody.appendChild(tr);
    }

    if (resultado.totalGanadores === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center">No se encontraron ganadores</td></tr>';
    }
  }

  // Listado de ganadores detallados (Tickets)
  const tbodyGan = document.querySelector('#cpst-tabla-ganadores-tombolina tbody');
  if (tbodyGan && resultado.ganadoresDetalle) {
    tbodyGan.innerHTML = '';
    resultado.ganadoresDetalle.forEach(gan => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${gan.ticket || '-'}</strong></td>
        <td>${gan.agencia || '-'}</td>
        <td><span class="badge ${gan.tipo.includes('Letras') ? 'badge-purple' : 'badge-primary'}" style="${gan.tipo.includes('Letras') ? 'background: #6f42c1; color: white;' : ''}">${gan.tipo}</span></td>
        <td>${gan.numerosApostados || '-'}</td>
        <td>${gan.aciertos || 0}</td>
        <td class="text-success" style="font-weight: bold;">$${formatNumber(gan.premio)}</td>
      `;
      tbodyGan.appendChild(tr);
    });

    // Agregar fila para el Agenciero (Estímulo)
    if (resultado.totalAgenciero > 0) {
      const trAg = document.createElement('tr');
      trAg.style.background = 'rgba(245, 158, 11, 0.1)';
      trAg.innerHTML = `
        <td colspan="5"><strong>ESTÍMULO AGENCIERO (1% de Premios)</strong></td>
        <td class="text-orange" style="font-weight: bold; color: #f59e0b;">$${formatNumber(resultado.totalAgenciero)}</td>
      `;
      tbodyGan.appendChild(trAg);
    }

    if (resultado.ganadoresDetalle.length === 0 && (!resultado.totalAgenciero || resultado.totalAgenciero === 0)) {
      tbodyGan.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No hay tickets ganadores registrados</td></tr>';
    }
  }

  // Si hay comparación con control previo, mostrarla
  if (resultado.datosControlPrevio) {
    // Aquí podrías agregar lógica para mostrar comparación si el backend la envía
  }

  // NUEVO: Poblar tabla de provincias para Tombolina
  const tbodyProv = document.querySelector('#cpst-tabla-tombolina-provincias tbody');
  if (tbodyProv && resultado.reportePorExtracto) {
    tbodyProv.innerHTML = '';
    resultado.reportePorExtracto.forEach(rep => {
      if (rep.totalGanadores === 0 && rep.totalPagado === 0) return;

      const p = rep.porNivel || {};
      tbodyProv.innerHTML += `
               <tr>
                <td><strong>${rep.nombre}</strong></td>
                <td class="text-success"><strong>$${formatNumber(rep.totalPagado)}</strong></td>
                <td><strong>${rep.totalGanadores}</strong></td>
                <td>${p[7]?.ganadores || 0}</td><td>$${formatNumber(p[7]?.pagado || 0)}</td>
                <td>${p[6]?.ganadores || 0}</td><td>$${formatNumber(p[6]?.pagado || 0)}</td>
                <td>${p[5]?.ganadores || 0}</td><td>$${formatNumber(p[5]?.pagado || 0)}</td>
                <td>${p[4]?.ganadores || 0}</td><td>$${formatNumber(p[4]?.pagado || 0)}</td>
                <td>${p[3]?.ganadores || 0}</td><td>$${formatNumber(p[3]?.pagado || 0)}</td>
                <td>${p['letras']?.ganadores || 0}</td><td>$${formatNumber(p['letras']?.pagado || 0)}</td>
               </tr>
            `;
    });

    if (tbodyProv.innerHTML === '') {
      tbodyProv.innerHTML = '<tr><td colspan="15" class="text-center text-muted">No se encontraron ganadores en ninguna provincia</td></tr>';
    }
  }

  // Actualizar ventas por agencia
  mostrarVentasAgenciaPosterior();
}

// Función para exportar ganadores de Tombolina a CSV
function exportarGanadoresTombolina() {
  if (!cpstResultados || !cpstResultados.ganadoresDetalle) {
    showToast('No hay datos para exportar', 'warning');
    return;
  }

  const ganadores = cpstResultados.ganadoresDetalle;
  let csv = 'Ticket;Agencia;Tipo;Numeros Apostados;Aciertos;Premio\n';

  ganadores.forEach(g => {
    csv += `${g.ticket || ''};${g.agencia || ''};${g.tipo || ''};${g.numerosApostados || ''};${g.aciertos || 0};${g.premio || 0}\n`;
  });

  if (cpstResultados.totalAgenciero > 0) {
    csv += `ESTIMULO AGENCIERO;;;;;${cpstResultados.totalAgenciero}\n`;
  }

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `Ganadores_Tombolina_Sorteo_${cpstResultados.numeroSorteo || 'Sorteo'}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast('Exportación completada', 'success');
}

/**
 * Agrupa y muestra las ventas por agencia en Control Posterior
 */
function mostrarVentasAgenciaPosterior() {
  const tbody = document.querySelector('#cpst-tabla-ventas-agencia tbody');
  if (!tbody) return;

  if (!cpstRegistrosNTF || cpstRegistrosNTF.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No hay registros de apuestas cargados</td></tr>';
    return;
  }

  const agenciasMap = new Map();
  const esPoceada = cpstJuegoSeleccionado === 'Poceada';

  cpstRegistrosNTF.forEach(reg => {
    let prov = '51';
    let ag = '';

    if (esPoceada) {
      if (reg.agenciaCompleta) {
        prov = reg.agenciaCompleta.substring(0, 2);
        ag = reg.agenciaCompleta.substring(2);
      } else {
        ag = reg.agencia || '';
      }
    } else {
      const agStr = String(reg.agencia || '').trim();
      if (agStr.length >= 7) {
        prov = agStr.substring(0, 2);
        ag = agStr.substring(2);
      } else {
        ag = agStr;
      }
    }

    const key = prov + '-' + ag;
    if (!agenciasMap.has(key)) {
      agenciasMap.set(key, { prov, ag, tickets: 0, apuestas: 0, recaudacion: 0 });
    }

    const item = agenciasMap.get(key);
    item.tickets++;

    // Calcular apuestas según el juego
    let nroApuestas = 1;
    if (esPoceada) {
      const cantNum = parseInt(reg.cantidadNumeros) || 8;
      nroApuestas = COMBINACIONES_MULTIPLES_POCEADA[cantNum] || 1;
    } else if (reg.loteriasJugadas) {
      nroApuestas = 0;
      for (let i = 0; i < 7; i++) {
        nroApuestas += parseInt(reg.loteriasJugadas.charAt(i)) || 0;
      }
    }

    item.apuestas += nroApuestas;
    item.recaudacion += parseFloat(reg.valorApuesta || 0);
  });

  // Convertir a array y ordenar por recaudación desc
  const tableData = Array.from(agenciasMap.values()).sort((a, b) => b.recaudacion - a.recaudacion);
  window.cpstVentasAgenciaData = tableData; // Guardar para filtrar

  renderVentasAgenciaPosterior(tableData);
}

function renderVentasAgenciaPosterior(data) {
  const tbody = document.querySelector('#cpst-tabla-ventas-agencia tbody');
  if (!tbody) return;

  tbody.innerHTML = data.map(item => `
    <tr>
      <td><span class="badge badge-secondary">${item.prov}</span></td>
      <td><strong>${item.ag}</strong></td>
      <td>${formatNumber(item.tickets)}</td>
      <td>${formatNumber(item.apuestas)}</td>
      <td class="text-success"><strong>$${formatNumber(item.recaudacion)}</strong></td>
    </tr>
  `).join('');

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">No se encontraron agencias que coincidan</td></tr>';
  }
}

function filtrarVentasAgenciaPosterior() {
  const query = document.getElementById('cpst-buscar-agencia').value.toLowerCase();
  if (!window.cpstVentasAgenciaData) return;

  const filtered = window.cpstVentasAgenciaData.filter(item =>
    item.ag.toLowerCase().includes(query) ||
    item.prov.includes(query)
  );
  renderVentasAgenciaPosterior(filtered);
}

function exportarVentasAgenciaPosterior() {
  if (!window.cpstVentasAgenciaData || window.cpstVentasAgenciaData.length === 0) {
    showToast('No hay datos para exportar', 'warning');
    return;
  }

  let csv = 'Provincia;Agencia/Cta Cte;Tickets;Apuestas;Recaudacion\n';
  window.cpstVentasAgenciaData.forEach(item => {
    csv += `${item.prov};${item.ag};${item.tickets};${item.apuestas};${item.recaudacion}\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `Ventas_Agencia_${cpstJuegoSeleccionado}_Sorteo_${cpstNumeroSorteo || 'Reporte'}.csv`);
  link.click();
}

function mostrarResultadosEscrutinio(resultado) {
  document.getElementById('cpst-resultados').classList.remove('hidden');

  // Mostrar tabla de Quiniela, ocultar tabla de Poceada
  document.getElementById('cpst-detalle-quiniela')?.classList.remove('hidden');
  document.getElementById('cpst-detalle-poceada')?.classList.add('hidden');

  // Mostrar extractos sorteados (números)
  renderExtractosSorteados();

  // Tarjetas de Tickets
  if (resultado.comparacion) {
    const reg = resultado.comparacion.registros;
    const ticketsValidos = reg.controlPosterior || 0;
    const ticketsAnulados = reg.anulados || 0;
    const ticketsTotal = ticketsValidos + ticketsAnulados;

    document.getElementById('cpst-tickets-total').textContent = formatNumber(ticketsTotal);
    document.getElementById('cpst-tickets-validos').textContent = formatNumber(ticketsValidos);
    document.getElementById('cpst-tickets-anulados').textContent = formatNumber(ticketsAnulados);
  }

  // Resumen
  document.getElementById('cpst-total-ganadores').textContent = formatNumber(resultado.totalGanadores);
  document.getElementById('cpst-total-premios').textContent = '$' + formatNumber(resultado.totalPremios);

  // Tasa de devolución
  if (resultado.comparacion && resultado.comparacion.recaudacion.controlPrevio > 0) {
    const tasa = (resultado.totalPremios / resultado.comparacion.recaudacion.controlPrevio * 100).toFixed(2);
    document.getElementById('cpst-tasa-devolucion').textContent = tasa + '%';
  }

  // Tabla comparación
  if (resultado.comparacion) {
    const tbody = document.querySelector('#cpst-tabla-comparacion tbody');
    tbody.innerHTML = '';

    const reg = resultado.comparacion.registros;
    const apu = resultado.comparacion.apuestas;
    const rec = resultado.comparacion.recaudacion;

    // Calcular tickets totales (válidos + anulados)
    const ticketsTotalPrevio = reg.controlPrevio + (reg.anulados || 0);
    const ticketsTotalPosterior = reg.controlPosterior + (reg.anulados || 0);
    const ticketsTotalCoincide = ticketsTotalPrevio === ticketsTotalPosterior;

    // Tickets (Total)
    tbody.innerHTML += `
      <tr>
        <td><strong>Tickets (Total)</strong></td>
        <td>${formatNumber(ticketsTotalPrevio)}</td>
        <td>${formatNumber(ticketsTotalPosterior)}</td>
        <td class="${ticketsTotalCoincide ? 'text-success' : 'text-danger'}">${ticketsTotalCoincide ? '✓ OK' : '✗ DIFERENCIA'}</td>
      </tr>
    `;

    // Tickets Válidos
    tbody.innerHTML += `
      <tr>
        <td>Tickets Válidos</td>
        <td>${formatNumber(reg.controlPrevio)}</td>
        <td>${formatNumber(reg.controlPosterior)}</td>
        <td class="${reg.coincide ? 'text-success' : 'text-danger'}">${reg.coincide ? '✓ OK' : '✗ DIFERENCIA'}</td>
      </tr>
    `;

    // Anulados
    tbody.innerHTML += `
      <tr>
        <td>Anulados</td>
        <td>${formatNumber(reg.anulados || 0)}</td>
        <td>${formatNumber(reg.anulados || 0)}</td>
        <td class="text-success">✓ OK</td>
      </tr>
    `;

    tbody.innerHTML += `
      <tr>
        <td>Apuestas</td>
        <td>${formatNumber(apu.controlPrevio)}</td>
        <td>${formatNumber(apu.controlPosterior)}</td>
        <td class="${apu.coincide ? 'text-success' : 'text-danger'}">${apu.coincide ? '✓ OK' : '✗ DIFERENCIA'}</td>
      </tr>
      <tr>
        <td>Recaudación</td>
        <td>$${formatNumber(rec.controlPrevio)}</td>
        <td>$${formatNumber(rec.controlPosterior)}</td>
        <td class="${rec.coincide ? 'text-success' : 'text-danger'}">${rec.coincide ? '✓ OK' : '✗ DIFERENCIA'}</td>
      </tr>
    `;
  }

  // Tabla por extracto con ganadores y monto por cada modalidad
  const tbodyExt = document.querySelector('#cpst-tabla-extractos tbody');
  tbodyExt.innerHTML = '';

  // Filtrar solo los extractos que están cargados (tienen datos)
  const extractosCargados = resultado.reportePorExtracto.filter(rep => rep.cargado !== false);

  for (const rep of extractosCargados) {
    tbodyExt.innerHTML += `
      <tr>
        <td><strong>${rep.nombre}</strong></td>
        <td class="text-success"><strong>$${formatNumber(rep.totalPagado)}</strong></td>
        <td><strong>${rep.totalGanadores}</strong></td>
        <td>${rep.porCifras[1].ganadores}</td>
        <td>$${formatNumber(rep.porCifras[1].pagado)}</td>
        <td>${rep.porCifras[2].ganadores}</td>
        <td>$${formatNumber(rep.porCifras[2].pagado)}</td>
        <td>${rep.porCifras[3].ganadores}</td>
        <td>$${formatNumber(rep.porCifras[3].pagado)}</td>
        <td>${rep.porCifras[4].ganadores}</td>
        <td>$${formatNumber(rep.porCifras[4].pagado)}</td>
        <td>${rep.redoblona.ganadores}</td>
        <td>$${formatNumber(rep.redoblona.pagado)}</td>
        <td>${rep.letras.ganadores}</td>
        <td>$${formatNumber(rep.letras.pagado)}</td>
      </tr>
    `;
  }

  // Fila de totales
  let tot1cGan = 0, tot1cPrem = 0, tot2cGan = 0, tot2cPrem = 0, tot3cGan = 0, tot3cPrem = 0;
  let tot4cGan = 0, tot4cPrem = 0, totRedGan = 0, totRedPrem = 0, totLetGan = 0, totLetPrem = 0;
  let totGan = 0, totPrem = 0;

  for (const rep of extractosCargados) {
    totGan += rep.totalGanadores; totPrem += rep.totalPagado;
    tot1cGan += rep.porCifras[1].ganadores; tot1cPrem += rep.porCifras[1].pagado;
    tot2cGan += rep.porCifras[2].ganadores; tot2cPrem += rep.porCifras[2].pagado;
    tot3cGan += rep.porCifras[3].ganadores; tot3cPrem += rep.porCifras[3].pagado;
    tot4cGan += rep.porCifras[4].ganadores; tot4cPrem += rep.porCifras[4].pagado;
    totRedGan += rep.redoblona.ganadores; totRedPrem += rep.redoblona.pagado;
    totLetGan += rep.letras.ganadores; totLetPrem += rep.letras.pagado;
  }

  tbodyExt.innerHTML += `
    <tr style="background: var(--surface-hover); font-weight: bold;">
      <td>TOTAL</td>
      <td class="text-success">$${formatNumber(totPrem)}</td>
      <td>${totGan}</td>
      <td>${tot1cGan}</td><td>$${formatNumber(tot1cPrem)}</td>
      <td>${tot2cGan}</td><td>$${formatNumber(tot2cPrem)}</td>
      <td>${tot3cGan}</td><td>$${formatNumber(tot3cPrem)}</td>
      <td>${tot4cGan}</td><td>$${formatNumber(tot4cPrem)}</td>
      <td>${totRedGan}</td><td>$${formatNumber(totRedPrem)}</td>
      <td>${totLetGan}</td><td>$${formatNumber(totLetPrem)}</td>
    </tr>
  `;

  // Detalle por tipo con ganadores, importe y aciertos
  let total1c = 0, total2c = 0, total3c = 0, total4c = 0, totalRed = 0, totalLet = 0;
  let gan1c = 0, gan2c = 0, gan3c = 0, gan4c = 0, ganRed = 0, ganLet = 0;
  let ac1c = 0, ac2c = 0, ac3c = 0, ac4c = 0, acRed = 0, acLet = 0;

  for (const rep of resultado.reportePorExtracto) {
    total1c += rep.porCifras[1].pagado; gan1c += rep.porCifras[1].ganadores; ac1c += rep.porCifras[1].aciertos || 0;
    total2c += rep.porCifras[2].pagado; gan2c += rep.porCifras[2].ganadores; ac2c += rep.porCifras[2].aciertos || 0;
    total3c += rep.porCifras[3].pagado; gan3c += rep.porCifras[3].ganadores; ac3c += rep.porCifras[3].aciertos || 0;
    total4c += rep.porCifras[4].pagado; gan4c += rep.porCifras[4].ganadores; ac4c += rep.porCifras[4].aciertos || 0;
    totalRed += rep.redoblona.pagado; ganRed += rep.redoblona.ganadores; acRed += rep.redoblona.aciertos || 0;
    totalLet += rep.letras.pagado; ganLet += rep.letras.ganadores; acLet += rep.letras.aciertos || 0;
  }

  document.getElementById('cpst-detalle-tipos').innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem;">
      <div class="stat-card" style="padding: 1rem;">
        <div class="stat-label">1 Cifra (x7)</div>
        <div class="stat-value" style="font-size: 1.2rem;">$${formatNumber(total1c)}</div>
        <div style="font-size: 0.85rem; margin-top: 0.5rem;">
          <span style="color: var(--success);">🎫 ${gan1c} tickets</span> · 
          <span style="color: var(--info);">🎯 ${ac1c} aciertos</span>
        </div>
      </div>
      <div class="stat-card" style="padding: 1rem;">
        <div class="stat-label">2 Cifras (x70)</div>
        <div class="stat-value" style="font-size: 1.2rem;">$${formatNumber(total2c)}</div>
        <div style="font-size: 0.85rem; margin-top: 0.5rem;">
          <span style="color: var(--success);">🎫 ${gan2c} tickets</span> · 
          <span style="color: var(--info);">🎯 ${ac2c} aciertos</span>
        </div>
      </div>
      <div class="stat-card" style="padding: 1rem;">
        <div class="stat-label">3 Cifras (x600)</div>
        <div class="stat-value" style="font-size: 1.2rem;">$${formatNumber(total3c)}</div>
        <div style="font-size: 0.85rem; margin-top: 0.5rem;">
          <span style="color: var(--success);">🎫 ${gan3c} tickets</span> · 
          <span style="color: var(--info);">🎯 ${ac3c} aciertos</span>
        </div>
      </div>
      <div class="stat-card" style="padding: 1rem;">
        <div class="stat-label">4 Cifras (x3500)</div>
        <div class="stat-value" style="font-size: 1.2rem;">$${formatNumber(total4c)}</div>
        <div style="font-size: 0.85rem; margin-top: 0.5rem;">
          <span style="color: var(--success);">🎫 ${gan4c} tickets</span> · 
          <span style="color: var(--info);">🎯 ${ac4c} aciertos</span>
        </div>
      </div>
      <div class="stat-card" style="padding: 1rem;">
        <div class="stat-label">Redoblona (x70)</div>
        <div class="stat-value" style="font-size: 1.2rem;">$${formatNumber(totalRed)}</div>
        <div style="font-size: 0.85rem; margin-top: 0.5rem;">
          <span style="color: var(--success);">🎫 ${ganRed} tickets</span> · 
          <span style="color: var(--info);">🎯 ${acRed} aciertos</span>
        </div>
      </div>
      <div class="stat-card" style="padding: 1rem;">
        <div class="stat-label">Letras ($1000 fijo)</div>
        <div class="stat-value" style="font-size: 1.2rem;">$${formatNumber(totalLet)}</div>
        <div style="font-size: 0.85rem; margin-top: 0.5rem;">
          <span style="color: var(--success);">🎫 ${ganLet} tickets</span> · 
          <span style="color: var(--info);">🎯 ${acLet} aciertos</span>
        </div>
      </div>
    </div>
    <div style="margin-top: 1rem; padding: 0.75rem; background: var(--surface-hover); border-radius: 8px; font-size: 0.85rem;">
      <strong>Leyenda:</strong> 
      🎫 <strong>Tickets</strong> = Boletos/registros que ganaron | 
      🎯 <strong>Aciertos</strong> = Coincidencias contra el extracto (un ticket puede tener múltiples aciertos si jugó a varias posiciones)
    </div>
  `;

  // Actualizar ventas por agencia
  mostrarVentasAgenciaPosterior();
}

// Renderizar los números de los extractos sorteados
function renderExtractosSorteados() {
  const container = document.getElementById('cpst-extractos-numeros');
  if (!container) return;

  // Filtrar solo extractos con números cargados
  const extractosCargados = cpstExtractos.filter(ext => {
    if (!ext.numeros || ext.numeros.length === 0) return false;
    return ext.numeros.some(n => n && n !== '0000' && n !== '----' && n !== '');
  });

  if (extractosCargados.length === 0) {
    container.innerHTML = '<div class="extractos-vacio">No hay extractos cargados</div>';
    return;
  }

  let html = '';
  for (const ext of extractosCargados) {
    const letrasStr = (ext.letras || []).filter(l => l).join(' ');

    html += `
      <div class="extracto-sorteado">
        <div class="extracto-sorteado-header">
          <span class="extracto-sorteado-nombre">${ext.nombre || 'Extracto'}</span>
          ${letrasStr ? `<span class="extracto-sorteado-letras">${letrasStr}</span>` : ''}
        </div>
        <div class="extracto-fila-label">Posiciones 1-10</div>
        <div class="extracto-sorteado-numeros">
          ${(ext.numeros || []).slice(0, 10).map((num, i) => `
            <div class="extracto-numero ${i === 0 ? 'pos-cabeza' : ''}">
              <span class="extracto-numero-pos">${i + 1}</span>
              ${num || '----'}
            </div>
          `).join('')}
        </div>
        <div class="extracto-fila-label">Posiciones 11-20</div>
        <div class="extracto-sorteado-numeros">
          ${(ext.numeros || []).slice(10, 20).map((num, i) => `
            <div class="extracto-numero">
              <span class="extracto-numero-pos">${i + 11}</span>
              ${num || '----'}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

async function descargarExcel() {
  if (!cpstResultados) {
    showToast('Ejecute el escrutinio primero', 'warning');
    return;
  }

  showToast('Generando Excel...', 'info');

  try {
    const token = getToken();
    const response = await fetch(`${API_BASE}/control-posterior/quiniela/excel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        resultado: cpstResultados,
        numeroSorteo: cpstNumeroSorteo
      })
    });

    if (!response.ok) throw new Error('Error generando Excel');

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ControlPosterior_${cpstNumeroSorteo || 'sorteo'}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);

    showToast('Excel descargado', 'success');
  } catch (error) {
    showToast(error.message || 'Error descargando Excel', 'error');
  }
}

async function generarPDFControlPosterior() {
  return imprimirReportePosterior();
}

async function generarActaNotarial() {
  // Validaciones
  const jefe = document.getElementById('acta-jefe').value;
  const escribano = document.getElementById('acta-escribano').value;
  const numeroSorteo = document.getElementById('acta-numero-sorteo').value;

  if (!jefe || !escribano || !numeroSorteo) {
    showToast('Complete los campos obligatorios: Jefe, Escribano y N° Sorteo', 'warning');
    return;
  }

  // Recopilar datos
  const datos = {
    juego: document.getElementById('acta-juego').value,
    modalidad: document.getElementById('acta-modalidad').value,
    numeroSorteo: numeroSorteo,
    fecha: document.getElementById('acta-fecha').value,
    jefe: jefe,
    estadoCivil: document.getElementById('acta-estado-civil').value,
    escribano: escribano,
    operadorSorteo: document.getElementById('acta-operador-sorteo').value,
    operadorTecnica: document.getElementById('acta-operador-tecnica').value,
    tipoActa: document.querySelector('input[name="tipo-acta"]:checked').value,
    horaInicio: document.getElementById('acta-hora-inicio').value,
    horaProgramada: document.getElementById('acta-hora-programada').value,
    numeroRng: document.getElementById('acta-numero-rng').value,
    ultimoRng: document.getElementById('acta-ultimo-rng').value,
    sorteoSustituto: document.getElementById('acta-sorteo-sustituto').value,
    jurisdicciones: obtenerJurisdicciones(),
    observaciones: document.getElementById('acta-observaciones').value
  };

  showToast('Generando Acta PDF...', 'info');

  try {
    const token = getToken();
    const response = await fetch(`${API_BASE}/actas/notarial/generar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(datos)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Error generando PDF');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => window.URL.revokeObjectURL(url), 30000);

    showToast('Acta generada correctamente', 'success');

  } catch (error) {
    console.error('Error:', error);
    showToast(error.message || 'Error generando acta', 'error');
  }
}

// ══════════════════════════════════════════════════════════════
// MÓDULO: AGENCIAS
// ══════════════════════════════════════════════════════════════

let listaAgencias = [];

function initAgencias() {
  // Configurar drag & drop
  const uploadArea = document.getElementById('agencias-upload-area');
  const fileInput = document.getElementById('agencias-excel-input');

  if (uploadArea && fileInput) {
    uploadArea.addEventListener('click', () => fileInput.click());

    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('drag-over');
    });

    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('drag-over');
    });

    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('drag-over');

      const files = e.dataTransfer.files;
      if (files.length > 0 && (files[0].name.endsWith('.xlsx') || files[0].name.endsWith('.xls'))) {
        fileInput.files = files;
        cargarExcelAgencias();
      } else {
        showToast('Solo se permiten archivos Excel (.xlsx, .xls)', 'error');
      }
    });
  }

  // Cargar lista de agencias al iniciar
  cargarListaAgencias();
}

async function cargarExcelAgencias() {
  const fileInput = document.getElementById('agencias-excel-input');
  const resultadoDiv = document.getElementById('agencias-carga-resultado');
  const reemplazar = document.getElementById('agencias-reemplazar').checked;

  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    showToast('Seleccioná un archivo Excel', 'error');
    return;
  }

  const file = fileInput.files[0];

  try {
    resultadoDiv.classList.remove('hidden');
    resultadoDiv.innerHTML = '<div class="alert alert-info"><i class="fas fa-spinner fa-spin"></i> Procesando Excel...</div>';

    // Pasar flag reemplazar
    const response = await agenciasAPI.cargarExcel(file, reemplazar);

    if (response.success) {
      const data = response.data;
      let mensaje = `<div class="alert alert-success">
        <h4><i class="fas fa-check-circle"></i> Excel procesado correctamente</h4>
        <ul>
          <li><strong>Total procesadas:</strong> ${data.total}</li>
          <li><strong>Insertadas:</strong> ${data.insertadas}</li>
          <li><strong>Actualizadas:</strong> ${data.actualizadas}</li>
        </ul>
      </div>`;

      if (data.errores && data.errores.length > 0) {
        mensaje += `<div class="alert alert-warning">
          <h4><i class="fas fa-exclamation-triangle"></i> Errores en el Excel (${data.errores.length})</h4>
          <ul style="max-height: 200px; overflow-y: auto;">
            ${data.errores.map(e => `<li>Fila ${e.fila}: ${e.error}</li>`).join('')}
          </ul>
        </div>`;
      }

      if (data.erroresBD && data.erroresBD.length > 0) {
        mensaje += `<div class="alert alert-error">
          <h4><i class="fas fa-times-circle"></i> Errores en base de datos (${data.erroresBD.length})</h4>
          <ul style="max-height: 200px; overflow-y: auto;">
            ${data.erroresBD.map(e => `<li>Agencia ${e.agencia}: ${e.error}</li>`).join('')}
          </ul>
        </div>`;
      }

      resultadoDiv.innerHTML = mensaje;

      // Limpiar input
      fileInput.value = '';

      // Recargar lista de agencias
      await cargarListaAgencias();

      showToast(`Excel procesado: ${data.insertadas} insertadas, ${data.actualizadas} actualizadas`, 'success');
    } else {
      throw new Error(response.message || 'Error procesando Excel');
    }

  } catch (error) {
    console.error('Error cargando Excel:', error);
    resultadoDiv.innerHTML = `<div class="alert alert-error">
      <i class="fas fa-times-circle"></i> ${error.message || 'Error procesando archivo Excel'}
    </div>`;
    showToast(error.message || 'Error cargando Excel', 'error');
  }
}

async function cargarListaAgencias() {
  const loading = document.getElementById('agencias-loading');
  const tablaBody = document.getElementById('agencias-tabla-body');

  try {
    loading.classList.remove('hidden');
    tablaBody.innerHTML = '<tr><td colspan="6" class="text-center"><i class="fas fa-spinner fa-spin"></i> Cargando...</td></tr>';

    const response = await agenciasAPI.obtenerTodas({ activas: 'true' });

    if (response.success) {
      listaAgencias = response.data || [];
      renderAgenciasTabla(listaAgencias);
    } else {
      throw new Error(response.message || 'Error cargando agencias');
    }

  } catch (error) {
    console.error('Error cargando agencias:', error);
    tablaBody.innerHTML = `<tr><td colspan="6" class="text-center text-error">
      <i class="fas fa-exclamation-circle"></i> ${error.message || 'Error cargando agencias'}
    </td></tr>`;
    showToast(error.message || 'Error cargando agencias', 'error');
  } finally {
    loading.classList.add('hidden');
  }
}

function renderAgenciasTabla(agencias) {
  const tablaBody = document.getElementById('agencias-tabla-body');

  if (!agencias || agencias.length === 0) {
    tablaBody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No hay agencias cargadas</td></tr>';
    return;
  }

  tablaBody.innerHTML = agencias.map(ag => `
    <tr style="font-size: 0.8rem;">
      <td><span class="badge badge-secondary" style="font-size: 0.7rem;">${ag.provincia || '??'}</span></td>
      <td style="font-family: 'JetBrains Mono', monospace; font-weight: 600; color: var(--primary-color); font-size: 0.8rem;">${ag.cuenta_corriente || '-'}</td>
      <td style="font-family: 'JetBrains Mono', monospace; font-size: 0.8rem;">${ag.digito_verificador || '-'}</td>
      <td style="font-size: 0.8rem; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${ag.nombre || ''}">${ag.nombre || '-'}</td>
      <td style="font-size: 0.75rem; color: var(--text-secondary); max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${ag.direccion || ''}">${ag.direccion || '-'}</td>
      <td style="font-size: 0.75rem; color: var(--text-secondary); max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${ag.localidad || ''}">${ag.localidad || '-'}</td>
      <td style="font-size: 0.7rem; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${ag.email || ''}">${ag.email || '-'}</td>
      <td>
        <span class="badge ${ag.activa ? 'badge-success' : 'badge-danger'}" style="font-size: 0.65rem; padding: 2px 6px;">
          ${ag.activa ? 'HAB' : 'INHAB'}
        </span>
      </td>
    </tr>
  `).join('');
}

function filtrarAgencias() {
  const busqueda = document.getElementById('agencias-buscar').value.toLowerCase().trim();

  if (!busqueda) {
    renderAgenciasTabla(listaAgencias);
    return;
  }

  // Intentar interpretar la búsqueda como número para comparaciones inteligentes
  const busquedaNum = !isNaN(busqueda) ? parseInt(busqueda, 10) : null;

  const filtradas = listaAgencias.filter(ag => {
    // 1. Búsqueda textual estándar (includes)
    const matchTexto = (
      ag.numero.toLowerCase().includes(busqueda) ||
      (ag.provincia && ag.provincia.toLowerCase().includes(busqueda)) ||
      (ag.cuenta_corriente && ag.cuenta_corriente.toString().toLowerCase().includes(busqueda)) ||
      (ag.nombre && ag.nombre.toLowerCase().includes(busqueda)) ||
      (ag.email && ag.email.toLowerCase().includes(busqueda)) ||
      (ag.direccion && ag.direccion.toLowerCase().includes(busqueda)) ||
      (ag.localidad && ag.localidad.toLowerCase().includes(busqueda)) ||
      (ag.digito_verificador && ag.digito_verificador.includes(busqueda))
    );

    if (matchTexto) return true;

    // 2. Búsqueda numérica inteligente (ignora ceros a la izquierda)
    if (busquedaNum !== null) {
      // Comparar Cuenta Corriente numéricamente (ej: '00011' == 11)
      if (ag.cuenta_corriente) {
        const cuentaNum = parseInt(ag.cuenta_corriente, 10);
        if (cuentaNum === busquedaNum) return true;
        // También si la cuenta convertida a string sin ceros contiene la búsqueda
        if (cuentaNum.toString().includes(busquedaNum.toString())) return true;
      }

      // Comparar Número completo numéricamente
      if (ag.numero) {
        const numeroNum = parseInt(ag.numero, 10);
        if (numeroNum === busquedaNum) return true;
        // Si el número sin ceros contiene la búsqueda (ej: 5100011 -> contiene 11)
        if (numeroNum.toString().includes(busquedaNum.toString())) return true;
      }
    }

    return false;
  });

  renderAgenciasTabla(filtradas);
}

// ====================================
// PROGRAMACIÓN DE SORTEOS
// ====================================

let programacionData = [];
let programacionPage = 0;
const programacionLimit = 50;

function initProgramacion() {
  // Setear mes actual en filtro
  const mesInput = document.getElementById('programacion-filtro-mes');
  if (mesInput) {
    const now = new Date();
    mesInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  buscarProgramacion();
  cargarHistorialProgramacion();
}

async function borrarProgramacion() {
  const juegoSelect = document.getElementById('programacion-juego');
  const juego = juegoSelect.value === 'quiniela' ? 'Quiniela' : 'Poceada';

  if (!confirm(`¿Está seguro de BORRAR TODA la programación de ${juego}?\n\nEsta acción no se puede deshacer.`)) {
    return;
  }

  try {
    showToast('Borrando programación...', 'info');

    const response = await fetch(`${API_BASE}/programacion/borrar`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
      },
      body: JSON.stringify({ juego })
    });

    const data = await response.json();

    if (data.success) {
      showToast(`Programación de ${juego} eliminada: ${data.data.sorteosEliminados} sorteos`, 'success');
      buscarProgramacion();
      cargarHistorialProgramacion();
    } else {
      showToast(data.message || 'Error al borrar', 'error');
    }
  } catch (error) {
    console.error('Error borrando programación:', error);
    showToast('Error: ' + error.message, 'error');
  }
}

async function cargarProgramacionExcel() {
  const juegoSelect = document.getElementById('programacion-juego');
  const archivoInput = document.getElementById('programacion-archivo');
  const resultDiv = document.getElementById('programacion-upload-result');

  const juego = juegoSelect.value;
  const archivo = archivoInput.files[0];

  if (!archivo) {
    resultDiv.className = 'alert alert-warning';
    resultDiv.textContent = 'Seleccione un archivo Excel';
    resultDiv.classList.remove('hidden');
    return;
  }

  try {
    resultDiv.className = 'alert alert-info';
    resultDiv.textContent = 'Cargando...';
    resultDiv.classList.remove('hidden');

    const formData = new FormData();
    formData.append('archivo', archivo);

    const response = await fetch(`${API_BASE}/programacion/cargar/${juego}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getToken()}`
      },
      body: formData
    });

    const data = await response.json();

    if (data.success) {
      resultDiv.className = 'alert alert-success';
      resultDiv.innerHTML = `
        <strong>✓ ${data.message}</strong><br>
        Registros procesados: ${data.data.registrosProcesados}<br>
        Nuevos: ${data.data.insertados} | Actualizados: ${data.data.actualizados}<br>
        Mes: ${data.data.mesCarga}
      `;
      archivoInput.value = '';
      buscarProgramacion();
      cargarHistorialProgramacion();
    } else {
      resultDiv.className = 'alert alert-error';
      resultDiv.textContent = data.message || 'Error al cargar el archivo';
    }
  } catch (error) {
    console.error('Error cargando Excel:', error);
    resultDiv.className = 'alert alert-error';
    resultDiv.textContent = 'Error: ' + error.message;
  }
}

/**
 * Cargar Excel de programación con DETECCIÓN AUTOMÁTICA del juego
 * Lee la columna "Juego" del Excel para identificar automáticamente el tipo de juego
 */
async function cargarProgramacionExcelGenerico() {
  const archivoInput = document.getElementById('programacion-archivo');
  const resultDiv = document.getElementById('programacion-upload-result');

  const archivo = archivoInput.files[0];

  if (!archivo) {
    resultDiv.className = 'alert alert-warning';
    resultDiv.textContent = 'Seleccione un archivo Excel';
    resultDiv.classList.remove('hidden');
    return;
  }

  try {
    resultDiv.className = 'alert alert-info';
    resultDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Detectando juegos y cargando programación...';
    resultDiv.classList.remove('hidden');

    const formData = new FormData();
    formData.append('archivo', archivo);

    const response = await fetch(`${API_BASE}/programacion/cargar/generico`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getToken()}`
      },
      body: formData
    });

    const data = await response.json();

    if (data.success) {
      // Construir resumen detallado por juego
      let resumenHtml = `<strong>✓ ${data.message}</strong><br>`;
      resumenHtml += `<strong>Total procesados:</strong> ${data.data.registrosProcesados} registros<br>`;
      resumenHtml += `<strong>Mes de carga:</strong> ${data.data.mesCarga}<br><br>`;

      // Mostrar detalle por juego detectado
      if (data.data.resumenPorJuego && Object.keys(data.data.resumenPorJuego).length > 0) {
        resumenHtml += '<strong>Desglose por juego:</strong><br>';
        for (const [juego, stats] of Object.entries(data.data.resumenPorJuego)) {
          const badgeClass = getBadgeClassForJuego(juego);
          resumenHtml += `<span class="badge ${badgeClass}" style="margin-right: 0.5rem;">${juego}</span> `;
          resumenHtml += `${stats.total} registros (${stats.insertados} nuevos, ${stats.actualizados} actualizados)<br>`;
        }
      }

      resultDiv.className = 'alert alert-success';
      resultDiv.innerHTML = resumenHtml;
      archivoInput.value = '';
      buscarProgramacion();
      cargarHistorialProgramacion();

      // Mostrar toast con resumen
      const juegos = data.data.juegosDetectados || [];
      showToast(`Cargados ${data.data.registrosProcesados} sorteos de: ${juegos.join(', ')}`, 'success');
    } else {
      resultDiv.className = 'alert alert-error';
      resultDiv.textContent = data.message || 'Error al cargar el archivo';
    }
  } catch (error) {
    console.error('Error cargando Excel:', error);
    resultDiv.className = 'alert alert-error';
    resultDiv.textContent = 'Error: ' + error.message;
  }
}

/**
 * Obtener clase de badge según el nombre del juego
 */
function getBadgeClassForJuego(juego) {
  const lower = juego.toLowerCase();
  if (lower.includes('quiniela') && !lower.includes('poceada')) return 'badge-primary';
  if (lower.includes('quini 6')) return 'badge-success';
  if (lower.includes('brinco')) return 'badge-warning';
  if (lower.includes('loto 5')) return 'badge-info';
  if (lower.includes('loto plus')) return 'badge-purple';
  if (lower.includes('poceada')) return 'badge-danger';
  if (lower.includes('tombolina')) return 'badge-dark';
  return 'badge-secondary';
}


async function buscarProgramacion() {
  const juego = document.getElementById('programacion-filtro-juego')?.value;
  const mes = document.getElementById('programacion-filtro-mes')?.value;
  const modalidad = document.getElementById('programacion-filtro-modalidad')?.value;

  try {
    const params = new URLSearchParams();
    if (juego) params.append('juego', juego); // Solo filtrar si hay juego seleccionado
    if (mes) params.append('mes', mes);
    if (modalidad) params.append('modalidad', modalidad);
    params.append('limit', programacionLimit);
    params.append('offset', programacionPage * programacionLimit);

    const response = await fetch(`${API_BASE}/programacion?${params}`, {
      headers: {
        'Authorization': `Bearer ${getToken()}`
      }
    });

    const data = await response.json();

    if (data.success) {
      programacionData = data.data.sorteos || [];
      renderTablaProgramacion(programacionData);
      renderPaginacionProgramacion(data.data.total);
    } else {
      showToast(data.message || 'Error al buscar programación', 'error');
    }
  } catch (error) {
    console.error('Error buscando programación:', error);
    showToast('Error: ' + error.message, 'error');
  }
}


function renderTablaProgramacion(sorteos) {
  const tbody = document.querySelector('#table-programacion tbody');
  if (!tbody) return;

  if (sorteos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="12" class="text-center text-muted">No hay sorteos cargados para este período</td></tr>';
    return;
  }

  tbody.innerHTML = sorteos.map(s => `
    <tr>
      <td><strong>${s.numero_sorteo}</strong></td>
      <td><span class="badge ${getBadgeClassForJuego(s.juego)}">${s.juego}</span></td>
      <td>${formatDate(s.fecha_sorteo)}</td>
      <td>${s.hora_sorteo || '-'}</td>
      <td><span class="badge badge-${getModalidadColor(s.modalidad_codigo)}">${s.modalidad_nombre || s.modalidad_codigo || '-'}</span></td>
      <td class="text-center">${s.prov_caba ? '✓' : ''}</td>
      <td class="text-center">${s.prov_bsas ? '✓' : ''}</td>
      <td class="text-center">${s.prov_cordoba ? '✓' : ''}</td>
      <td class="text-center">${s.prov_santafe ? '✓' : ''}</td>
      <td class="text-center">${s.prov_montevideo ? '✓' : ''}</td>
      <td class="text-center">${s.prov_mendoza ? '✓' : ''}</td>
      <td class="text-center">${s.prov_entrerios ? '✓' : ''}</td>
    </tr>
  `).join('');
}


function getModalidadColor(codigo) {
  const colores = {
    'R': 'purple',
    'P': 'blue',
    'M': 'orange',
    'V': 'green',
    'N': 'dark'
  };
  return colores[codigo] || 'secondary';
}

function renderPaginacionProgramacion(total) {
  const container = document.getElementById('programacion-paginacion');
  if (!container) return;

  const totalPages = Math.ceil(total / programacionLimit);
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = '<div class="pagination-controls">';

  if (programacionPage > 0) {
    html += `<button class="btn btn-sm" onclick="cambiarPaginaProgramacion(${programacionPage - 1})"><i class="fas fa-chevron-left"></i></button>`;
  }

  html += `<span class="pagination-info">Página ${programacionPage + 1} de ${totalPages}</span>`;

  if (programacionPage < totalPages - 1) {
    html += `<button class="btn btn-sm" onclick="cambiarPaginaProgramacion(${programacionPage + 1})"><i class="fas fa-chevron-right"></i></button>`;
  }

  html += '</div>';
  container.innerHTML = html;
}

function cambiarPaginaProgramacion(newPage) {
  programacionPage = newPage;
  buscarProgramacion();
}

async function cargarHistorialProgramacion() {
  try {
    const response = await fetch(`${API_BASE}/programacion/historial?juego=Quiniela&limit=10`, {
      headers: {
        'Authorization': `Bearer ${getToken()}`
      }
    });

    const data = await response.json();

    if (data.success) {
      renderHistorialProgramacion(data.data);
    }
  } catch (error) {
    console.error('Error cargando historial:', error);
  }
}

function renderHistorialProgramacion(cargas) {
  const tbody = document.querySelector('#table-programacion-cargas tbody');
  if (!tbody) return;

  if (!cargas || cargas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No hay cargas registradas</td></tr>';
    return;
  }

  tbody.innerHTML = cargas.map(c => `
    <tr>
      <td>${formatDateTime(c.created_at)}</td>
      <td>${c.juego}</td>
      <td>${c.mes_carga}</td>
      <td>${c.archivo_nombre || '-'}</td>
      <td>${c.registros_cargados}</td>
      <td>${c.registros_actualizados}</td>
    </tr>
  `).join('');
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-AR');
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleString('es-AR');
}

// ====================================
// DASHBOARD - SORTEOS DEL DÍA
// ====================================

let dashboardFechaActual = new Date().toISOString().split('T')[0];

async function cargarDashboard() {
  // Configurar fecha inicial
  const fechaInput = document.getElementById('dashboard-fecha-input');
  if (fechaInput) {
    fechaInput.value = dashboardFechaActual;
    fechaInput.addEventListener('change', (e) => {
      dashboardFechaActual = e.target.value;
      cargarSorteosDelDia();
    });
  }

  // Actualizar título
  const fechaTitulo = document.getElementById('dashboard-fecha');
  if (fechaTitulo) {
    const fechaObj = new Date(dashboardFechaActual + 'T12:00:00');
    const opciones = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    fechaTitulo.textContent = 'Sorteos del ' + fechaObj.toLocaleDateString('es-AR', opciones);
  }

  await cargarSorteosDelDia();
}

async function cargarSorteosDelDia() {
  const tbody = document.getElementById('tbody-sorteos-dia');
  const sinProgramacion = document.getElementById('dashboard-sin-programacion');
  const tablaSorteos = document.getElementById('tabla-sorteos-dia');

  try {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center"><i class="fas fa-spinner fa-spin"></i> Cargando...</td></tr>';

    const response = await fetch(`${API_BASE}/programacion/dia?fecha=${dashboardFechaActual}`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });

    const data = await response.json();

    if (!data.success) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-danger">Error cargando sorteos</td></tr>';
      return;
    }

    const { sorteos, estadisticas } = data.data;

    // Actualizar estadísticas
    document.getElementById('stat-total-sorteos').textContent = estadisticas.total;
    document.getElementById('stat-pendientes').textContent = estadisticas.pendientes;
    document.getElementById('stat-control-previo').textContent = estadisticas.controlPrevio;
    document.getElementById('stat-escrutados').textContent = estadisticas.escrutados;
    document.getElementById('stat-recaudacion-total').textContent = '$' + formatNumber(estadisticas.recaudacionTotal || 0);
    document.getElementById('stat-premios-total').textContent = '$' + formatNumber(estadisticas.premiosTotales || 0);

    // Mostrar/ocultar según haya sorteos
    if (sorteos.length === 0) {
      tablaSorteos.closest('.card').classList.add('hidden');
      sinProgramacion.classList.remove('hidden');
      return;
    }

    tablaSorteos.closest('.card').classList.remove('hidden');
    sinProgramacion.classList.add('hidden');

    // Renderizar tabla
    tbody.innerHTML = sorteos.map(s => {
      const estadoBadge = `<span class="badge badge-${s.estadoColor}"><i class="fas fa-${s.estadoIcono}"></i> ${getEstadoNombre(s.estado)}</span>`;

      const recaudacion = s.controlPrevio ? '$' + formatNumber(s.controlPrevio.recaudacion) : '-';
      const premios = s.controlPosterior ? '$' + formatNumber(s.controlPosterior.premiosPagados) : '-';

      // Acciones: Mostrar siempre ambos botones
      const acciones = `
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn btn-sm btn-primary" onclick="irAControlPrevio('${s.numero_sorteo}')" title="Control Previo">
            <i class="fas fa-clipboard-check"></i>
          </button>
          <button class="btn btn-sm btn-success" onclick="irAControlPosterior('${s.numero_sorteo}')" title="Control Posterior">
            <i class="fas fa-calculator"></i>
          </button>
        </div>
      `;


      return `
        <tr>
          <td><strong>${s.numero_sorteo}</strong></td>
          <td><span class="badge ${getBadgeClassForJuego(s.juego)}">${s.juego}</span></td>
          <td>${s.hora_sorteo || '-'}</td>
          <td><span class="badge badge-${getModalidadColor(s.modalidad_codigo)}">${s.modalidad_nombre || '-'}</span></td>
          <td>${estadoBadge}</td>
          <td>${recaudacion}</td>
          <td>${premios}</td>
          <td>${acciones}</td>
        </tr>
      `;

    }).join('');

  } catch (error) {
    console.error('Error cargando dashboard:', error);
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-danger">Error de conexión</td></tr>';
  }
}

function getEstadoNombre(estado) {
  const nombres = {
    'pendiente': 'Pendiente',
    'control_previo': 'Ctrl. Previo',
    'escrutado': 'Escrutado'
  };
  return nombres[estado] || estado;
}

function irAControlPrevio(numeroSorteo) {
  // Guardar número de sorteo para referencia
  sessionStorage.setItem('sorteoSeleccionado', numeroSorteo);
  navigateTo('control-previo');
  showToast(`Cargue el archivo ZIP del sorteo ${numeroSorteo}`, 'info');
}

function irAControlPosterior(numeroSorteo) {
  sessionStorage.setItem('sorteoSeleccionado', numeroSorteo);
  navigateTo('control-posterior');
  showToast(`Cargue los extractos para el sorteo ${numeroSorteo}`, 'info');
}

function verDetallesSorteo(numeroSorteo) {
  showToast(`Sorteo ${numeroSorteo} - Funcionalidad próximamente`, 'info');
}

// =============================================
// REPORTES - INICIALIZACIÓN Y TABS
// =============================================

let dashboardData = [];
let dashboardSelectedGames = ['todos'];
let controlPrevioData = [];
let escrutiniosData = [];

// Inicializar vista de reportes
function initReportes() {
  // Configurar fechas por defecto (últimos 30 días)
  const hoy = new Date().toISOString().split('T')[0];
  const hace30Dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const hace7Dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Dashboard
  document.getElementById('dash-fecha-desde').value = hace30Dias;
  document.getElementById('dash-fecha-hasta').value = hoy;

  // Control Previo
  document.getElementById('cp-fecha-desde').value = hace7Dias;
  document.getElementById('cp-fecha-hasta').value = hoy;

  // Escrutinios
  document.getElementById('esc-fecha-desde').value = hace7Dias;
  document.getElementById('esc-fecha-hasta').value = hoy;

  // Configurar tabs
  document.querySelectorAll('[data-reportes-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      // Cambiar tab activo
      document.querySelectorAll('[data-reportes-tab]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Mostrar contenido correspondiente
      const tabId = btn.dataset.reportesTab;
      document.querySelectorAll('.reportes-tab-content').forEach(content => {
        content.classList.add('hidden');
      });
      document.getElementById(`reportes-tab-${tabId}`).classList.remove('hidden');

      // Cargar datos del tab si es necesario
      if (tabId === 'dashboard' && dashboardData.length === 0) {
        buscarDashboard();
      } else if (tabId === 'control-previo' && controlPrevioData.length === 0) {
        buscarControlPrevio();
      } else if (tabId === 'escrutinios' && escrutiniosData.length === 0) {
        buscarEscrutinios();
      }
    });
  });

  // Cargar datos iniciales del dashboard
  cargarFiltrosDashboard();
  buscarDashboard();
}

// =============================================
// DASHBOARD DE REPORTES
// =============================================

// Toggle selección de juego en dashboard
function toggleDashboardGame(gameType) {
  const checkbox = document.getElementById(`dash-game-${gameType}`);

  if (gameType === 'todos') {
    // Si se selecciona "todos", desmarcar los individuales
    ['quiniela', 'poceada', 'tombolina', 'quini6', 'brinco', 'loto', 'loto5'].forEach(game => {
      const el = document.getElementById(`dash-game-${game}`);
      if (el) el.checked = false;
    });
    dashboardSelectedGames = checkbox.checked ? ['todos'] : [];
  } else {
    // Si se selecciona un juego individual, desmarcar "todos"
    const todosEl = document.getElementById('dash-game-todos');
    if (todosEl) todosEl.checked = false;

    if (checkbox.checked) {
      if (!dashboardSelectedGames.includes(gameType)) {
        dashboardSelectedGames = dashboardSelectedGames.filter(g => g !== 'todos');
        dashboardSelectedGames.push(gameType);
      }
    } else {
      dashboardSelectedGames = dashboardSelectedGames.filter(g => g !== gameType);
    }

    // Si no hay ninguno seleccionado, seleccionar "todos"
    if (dashboardSelectedGames.length === 0) {
      document.getElementById('dash-game-todos').checked = true;
      dashboardSelectedGames = ['todos'];
    }
  }

  // Actualizar indicador
  updateDashboardGameIndicator();
}

// Actualizar indicador de juegos seleccionados
function updateDashboardGameIndicator() {
  const indicator = document.getElementById('dash-game-indicator');

  if (dashboardSelectedGames.includes('todos')) {
    indicator.textContent = 'Todos los juegos';
    indicator.className = 'badge bg-info';
  } else if (dashboardSelectedGames.length === 1) {
    const juego = dashboardSelectedGames[0];
    indicator.textContent = juego.toUpperCase();

    // Colores por juego
    const colors = {
      'quiniela': 'bg-primary',
      'poceada': 'bg-warning',
      'tombolina': 'bg-success',
      'quini6': 'bg-info',
      'brinco': 'bg-secondary',
      'loto': 'bg-danger',
      'loto5': 'bg-dark'
    };

    indicator.className = `badge ${colors[juego] || 'bg-secondary'}`;
  } else {
    indicator.textContent = dashboardSelectedGames.map(g => g.toUpperCase()).join(' + ');
    indicator.className = 'badge bg-secondary text-wrap';
  }
}

// Cargar filtros disponibles
async function cargarFiltrosDashboard() {
  try {
    // Cargar filtros y agencias en paralelo
    const [filtrosRes, agenciasRes] = await Promise.all([
      fetch(`${API_BASE}/historial/dashboard/filtros`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      }),
      fetch(`${API_BASE}/agencias?activas=true`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      })
    ]);

    const filtrosData = await filtrosRes.json();
    if (filtrosData.success) {
      console.log('Filtros dashboard:', filtrosData.data);
    }

    // Poblar select de agencias
    const agenciasData = await agenciasRes.json();
    if (agenciasData.success && agenciasData.data) {
      const select = document.getElementById('dash-agencia');
      select.innerHTML = '<option value="">Todas las agencias (' + agenciasData.data.length + ')</option>';
      agenciasData.data.forEach(ag => {
        const opt = document.createElement('option');
        opt.value = ag.numero;
        opt.textContent = ag.numero + ' - ' + (ag.nombre || ag.barrio || 'Sin nombre');
        select.appendChild(opt);
      });
    }
  } catch (error) {
    console.error('Error cargando filtros:', error);
  }
}

// Buscar datos del dashboard
async function buscarDashboard() {
  const fechaDesde = document.getElementById('dash-fecha-desde').value;
  const fechaHasta = document.getElementById('dash-fecha-hasta').value;
  const sorteoDesde = document.getElementById('dash-sorteo-desde').value;
  const sorteoHasta = document.getElementById('dash-sorteo-hasta').value;
  const agencia = document.getElementById('dash-agencia').value;
  const tipoConsulta = document.getElementById('dash-tipo-consulta').value;

  // Determinar juego a filtrar
  let juego = '';
  if (!dashboardSelectedGames.includes('todos')) {
    if (dashboardSelectedGames.length === 1) {
      juego = dashboardSelectedGames[0];
    }
  }

  // Mostrar loading
  document.getElementById('dash-loading').classList.remove('hidden');
  document.getElementById('dash-no-data').classList.add('hidden');
  document.getElementById('table-dashboard-body').innerHTML = '';

  try {
    // Mapear tipo de consulta para el backend
    let tipoBackend = tipoConsulta;
    if (tipoConsulta === 'agencias') tipoBackend = 'totalizado';
    if (tipoConsulta === 'agencias_venta') tipoBackend = 'agencias_venta';
    if (tipoConsulta === 'agrupado_agencia') tipoBackend = 'totalizado';

    // Cargar datos y estadísticas en paralelo
    const [datosResponse, statsResponse] = await Promise.all([
      fetch(`${API_BASE}/historial/dashboard/datos?` + new URLSearchParams({
        fechaDesde: fechaDesde || '',
        fechaHasta: fechaHasta || '',
        sorteoDesde: sorteoDesde || '',
        sorteoHasta: sorteoHasta || '',
        juego: juego || '',
        agencia: agencia || '',
        tipoConsulta: tipoBackend
      }), {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      }),
      fetch(`${API_BASE}/historial/dashboard/stats?` + new URLSearchParams({
        fechaDesde: fechaDesde || '',
        fechaHasta: fechaHasta || '',
        sorteoDesde: sorteoDesde || '',
        sorteoHasta: sorteoHasta || '',
        juego: juego || ''
      }), {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      })
    ]);

    const datosData = await datosResponse.json();
    const statsData = await statsResponse.json();

    document.getElementById('dash-loading').classList.add('hidden');

    // Actualizar estadísticas
    if (statsData.success) {
      actualizarStatsDashboard(statsData.data);
    }

    // Actualizar tabla
    if (datosData.success) {
      dashboardData = datosData.data.data || [];

      document.getElementById('dash-results-count').textContent = dashboardData.length;

      if (dashboardData.length === 0) {
        document.getElementById('dash-no-data').classList.remove('hidden');
      } else {
        renderTablaDashboard(tipoConsulta);
      }
    } else {
      showToast('Error cargando datos: ' + (datosData.error || 'Error desconocido'), 'error');
      document.getElementById('dash-no-data').classList.remove('hidden');
    }

  } catch (error) {
    console.error('Error buscando dashboard:', error);
    document.getElementById('dash-loading').classList.add('hidden');
    document.getElementById('dash-no-data').classList.remove('hidden');
    showToast('Error de conexión', 'error');
  }
}

// Actualizar tarjetas de estadísticas
function actualizarStatsDashboard(stats) {
  document.getElementById('dash-stat-recaudacion').textContent = '$' + formatNumber(stats.total_recaudacion || 0);
  document.getElementById('dash-stat-premios').textContent = '$' + formatNumber(stats.total_premios || 0);
  document.getElementById('dash-stat-apuestas').textContent = formatNumber(stats.total_apuestas || 0);
  document.getElementById('dash-stat-tickets').textContent = formatNumber(stats.total_tickets || 0);
  document.getElementById('dash-stat-sorteos').textContent = formatNumber(stats.total_sorteos || 0);
  document.getElementById('dash-stat-provincias').textContent = formatNumber(stats.total_provincias_activas || 0);
  document.getElementById('dash-stat-agencias').textContent = formatNumber(stats.total_agencias_premiadas || 0);

  // Actualizar agencias con venta si existe el elemento
  const agenciasVentaEl = document.getElementById('dash-stat-agencias-venta');
  if (agenciasVentaEl) {
    agenciasVentaEl.textContent = formatNumber(stats.total_agencias_venta || 0);
  }
}

// Variable global para ordenamiento de tabla
let dashboardSortColumn = null;
let dashboardSortDirection = 'desc';

// Ordenar datos del dashboard por columna
function sortDashboardData(column) {
  if (dashboardSortColumn === column) {
    dashboardSortDirection = dashboardSortDirection === 'desc' ? 'asc' : 'desc';
  } else {
    dashboardSortColumn = column;
    dashboardSortDirection = 'desc';
  }
  const tipoConsulta = document.getElementById('dash-tipo-consulta')?.value || 'agencias';
  renderTablaDashboard(tipoConsulta);
}

// Generar header sorteable
function sortableHeader(label, column, align) {
  const isActive = dashboardSortColumn === column;
  const icon = isActive ? (dashboardSortDirection === 'asc' ? '&#9650;' : '&#9660;') : '&#9650;&#9660;';
  const cls = `sortable-header ${align || ''} ${isActive ? 'sort-' + dashboardSortDirection : ''}`;
  return `<th class="${cls}" onclick="sortDashboardData('${column}')">${label} <span class="sort-icon">${icon}</span></th>`;
}

// Ordenar array por columna y dirección
function sortDataBy(data, column, direction) {
  return [...data].sort((a, b) => {
    let va = a[column];
    let vb = b[column];

    // Lógica especial para columna agencia/cuenta corriente
    if (column === 'agencia' || column === 'cta_cte') {
      // Normalizar: quitar guiones y prefijos para comparar como números si aplica
      const cleanA = String(va || '').replace(/[^\d]/g, '');
      const cleanB = String(vb || '').replace(/[^\d]/g, '');

      // Si ambos son agencias numéricas (ej: CABA)
      if (cleanA && cleanB && !isNaN(cleanA) && !isNaN(cleanB)) {
        const numA = parseInt(cleanA);
        const numB = parseInt(cleanB);
        return direction === 'asc' ? numA - numB : numB - numA;
      }

      // Si son provincias o mixtos, usar localeCompare
      return direction === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    }

    // Lógica estándar para otras columnas
    if (va === null || va === undefined) va = 0;
    if (vb === null || vb === undefined) vb = 0;

    if (typeof va === 'string' && !isNaN(parseFloat(va))) va = parseFloat(va);
    if (typeof vb === 'string' && !isNaN(parseFloat(vb))) vb = parseFloat(vb);

    if (typeof va === 'string') return direction === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    return direction === 'asc' ? va - vb : vb - va;
  });
}

// Renderizar tabla según tipo de consulta
function renderTablaDashboard(tipoConsulta) {
  const thead = document.getElementById('table-dashboard-header');
  const tbody = document.getElementById('table-dashboard-body');

  if (tipoConsulta === 'agencias' || tipoConsulta === 'totalizado') {
    // Vista por Agencia - Premios pagados + recaudación + cancelaciones/devoluciones
    thead.innerHTML = `
      <tr>
        ${sortableHeader('Agencia / Provincia', 'agencia', '')}
        <th>Juego</th>
        ${sortableHeader('Sorteos', 'total_sorteos', 'text-end')}
        ${sortableHeader('Recaudaci\u00f3n', 'total_recaudacion', 'text-end')}
        ${sortableHeader('Cancelaciones', 'cancelaciones', 'text-end')}
        ${sortableHeader('Devoluciones', 'devoluciones', 'text-end')}
        ${sortableHeader('Tickets', 'total_tickets', 'text-end')}
        ${sortableHeader('Apuestas', 'total_apuestas', 'text-end')}
        ${sortableHeader('Anulados', 'total_anulados', 'text-end')}
        ${sortableHeader('Ganadores', 'total_ganadores', 'text-end')}
        ${sortableHeader('Premios Pagados', 'total_premios', 'text-end')}
      </tr>
    `;

    // Ordenar por columna seleccionada o premios por defecto
    const sortCol = dashboardSortColumn || 'total_premios';
    const sortDir = dashboardSortColumn ? dashboardSortDirection : 'desc';
    const datosOrdenados = sortDataBy(dashboardData, sortCol, sortDir);

    tbody.innerHTML = datosOrdenados.map((item, idx) => {
      // Determinar si es una provincia (no CABA 51)
      const esProvincia = item.codigo_provincia && item.codigo_provincia !== '51';

      // Formatear cuenta corriente: quitar guiones para que quede como número puro si es agencia
      const ctaCtePura = (item.cta_cte || item.agencia || '').replace(/-/g, '');

      const displayAgencia = esProvincia
        ? `<span class="badge bg-secondary" style="font-size: 0.85rem; padding: 0.4rem 0.6rem;">${item.nombre || item.agencia}</span>`
        : `<strong style="font-family: monospace; font-size: 0.95rem;">${ctaCtePura}</strong>`;

      const esHipicas = item.juego === 'hipicas';

      return `
        <tr>
          <td>${displayAgencia}</td>
          <td><span class="badge game-${item.juego}">${(item.juego || '').toUpperCase()}</span></td>
          <td class="text-end">${formatNumber(item.total_sorteos || 0)}</td>
          <td class="text-end text-primary">$${formatNumber(item.total_recaudacion || 0)}</td>
          <td class="text-end" style="color: #ff9800;">${esHipicas ? '$' + formatNumber(item.cancelaciones || 0) : '-'}</td>
          <td class="text-end" style="color: #ff9800;">${esHipicas ? '$' + formatNumber(item.devoluciones || 0) : '-'}</td>
          <td class="text-end">${esHipicas ? '-' : formatNumber(item.total_tickets || 0)}</td>
          <td class="text-end">${esHipicas ? '-' : formatNumber(item.total_apuestas || 0)}</td>
          <td class="text-end text-warning">${esHipicas ? '-' : formatNumber(item.total_anulados || 0)}</td>
          <td class="text-end">${esHipicas ? '-' : formatNumber(item.total_ganadores || 0)}</td>
          <td class="text-end text-success"><strong>$${formatNumber(item.total_premios || 0)}</strong></td>
        </tr>
      `;
    }).join('');

  } else if (tipoConsulta === 'agencias_venta') {
    // Vista por Agencia - Ventas/Recaudación
    thead.innerHTML = `
      <tr>
        ${sortableHeader('Agencia / Provincia', 'agencia', '')}
        <th>Juego</th>
        ${sortableHeader('Sorteos', 'total_sorteos', 'text-end')}
        ${sortableHeader('Recaudaci\u00f3n', 'total_recaudacion', 'text-end')}
        ${sortableHeader('Cancelaciones', 'cancelaciones', 'text-end')}
        ${sortableHeader('Devoluciones', 'devoluciones', 'text-end')}
        ${sortableHeader('Tickets', 'total_tickets', 'text-end')}
        ${sortableHeader('Apuestas', 'total_apuestas', 'text-end')}
        ${sortableHeader('Anulados', 'total_anulados', 'text-end')}
        ${sortableHeader('$ Anulados', 'total_recaudacion_anulada', 'text-end')}
        ${sortableHeader('Premios', 'total_premios', 'text-end')}
      </tr>
    `;

    const sortCol = dashboardSortColumn || 'total_recaudacion';
    const sortDir = dashboardSortColumn ? dashboardSortDirection : 'desc';
    const datosOrdenados = sortDataBy(dashboardData, sortCol, sortDir);

    tbody.innerHTML = datosOrdenados.map((item, idx) => {
      const esProvinciaAgrupada = item.codigo_provincia && item.codigo_provincia !== '51';
      const displayAgencia = esProvinciaAgrupada
        ? `<span class="badge bg-secondary">${item.nombre || item.agencia}</span>`
        : `<strong>${item.agencia || item.codigo || '-'}</strong>`;

      const esHipicas = item.juego === 'hipicas';

      return `
        <tr>
          <td>${displayAgencia}</td>
          <td><span class="badge game-${item.juego}">${(item.juego || '').toUpperCase()}</span></td>
          <td class="text-end">${formatNumber(item.total_sorteos || 0)}</td>
          <td class="text-end text-primary"><strong>$${formatNumber(item.total_recaudacion || 0)}</strong></td>
          <td class="text-end" style="color: #ff9800;">${esHipicas ? '$' + formatNumber(item.cancelaciones || 0) : '-'}</td>
          <td class="text-end" style="color: #ff9800;">${esHipicas ? '$' + formatNumber(item.devoluciones || 0) : '-'}</td>
          <td class="text-end">${esHipicas ? '-' : formatNumber(item.total_tickets || 0)}</td>
          <td class="text-end">${esHipicas ? '-' : formatNumber(item.total_apuestas || 0)}</td>
          <td class="text-end text-warning">${esHipicas ? '-' : formatNumber(item.total_anulados || 0)}</td>
          <td class="text-end text-warning">${esHipicas ? '-' : '$' + formatNumber(item.total_recaudacion_anulada || 0)}</td>
          <td class="text-end text-success"><strong>$${formatNumber(item.total_premios || 0)}</strong></td>
        </tr>
      `;
    }).join('');

  } else if (tipoConsulta === 'detallado') {
    thead.innerHTML = `
      <tr>
        ${sortableHeader('Fecha', 'fecha', '')}
        ${sortableHeader('Sorteo', 'sorteo', '')}
        <th>Modalidad</th>
        <th>Juego</th>
        ${sortableHeader('Tickets', 'total_tickets', 'text-end')}
        ${sortableHeader('Apuestas', 'total_apuestas', 'text-end')}
        ${sortableHeader('Anulados', 'total_anulados', 'text-end')}
        ${sortableHeader('Recaudaci\u00f3n', 'recaudacion_total', 'text-end')}
        ${sortableHeader('Cancelaciones', 'cancelaciones', 'text-end')}
        ${sortableHeader('Devoluciones', 'devoluciones', 'text-end')}
        ${sortableHeader('Premios', 'total_premios', 'text-end')}
        ${sortableHeader('Ganadores', 'total_ganadores', 'text-end')}
      </tr>
    `;

    const sortCol = dashboardSortColumn || 'fecha';
    const sortDir = dashboardSortColumn ? dashboardSortDirection : 'desc';
    const datosOrdenados = sortDataBy(dashboardData, sortCol, sortDir);

    tbody.innerHTML = datosOrdenados.map(item => `
      <tr>
        <td>${formatDate(item.fecha)}</td>
        <td><strong>${item.sorteo}</strong></td>
        <td><span class="badge badge-modalidad-${item.modalidad}">${getModalidadNombre(item.modalidad)}</span></td>
        <td><span class="badge game-${item.juego}">${item.juego.toUpperCase()}</span></td>
        <td class="text-end">${formatNumber(item.total_tickets || 0)}</td>
        <td class="text-end">${formatNumber(item.total_apuestas || 0)}</td>
        <td class="text-end text-warning">${formatNumber(item.total_anulados || 0)}</td>
        <td class="text-end text-primary"><strong>$${formatNumber(item.recaudacion_total || 0)}</strong></td>
        <td class="text-end" style="color: #ff9800;">$${formatNumber(item.cancelaciones || 0)}</td>
        <td class="text-end" style="color: #ff9800;">$${formatNumber(item.devoluciones || 0)}</td>
        <td class="text-end text-success"><strong>$${formatNumber(item.total_premios || 0)}</strong></td>
        <td class="text-end">${formatNumber(item.total_ganadores || 0)}</td>
      </tr>
    `).join('');

  } else if (tipoConsulta === 'comparativo') {
    thead.innerHTML = `
      <tr>
        <th>Juego</th>
        <th class="text-end">Sorteos</th>
        <th class="text-end">Tickets</th>
        <th class="text-end">Apuestas</th>
        <th class="text-end">Anulados</th>
        <th class="text-end">Recaudación</th>
        <th class="text-end">Cancelaciones</th>
        <th class="text-end">Devoluciones</th>
        <th class="text-end">Premios</th>
        <th class="text-end">Ganadores</th>
        <th class="text-end">% Premios</th>
      </tr>
    `;

    tbody.innerHTML = dashboardData.map(item => {
      const porcentaje = item.total_recaudacion > 0
        ? ((item.total_premios / item.total_recaudacion) * 100).toFixed(2)
        : 0;
      return `
        <tr>
          <td><span class="badge game-${item.juego}">${item.juego.toUpperCase()}</span></td>
          <td class="text-end">${formatNumber(item.total_sorteos || 0)}</td>
          <td class="text-end">${formatNumber(item.total_tickets || 0)}</td>
          <td class="text-end">${formatNumber(item.total_apuestas || 0)}</td>
          <td class="text-end text-warning">${formatNumber(item.total_anulados || 0)}</td>
          <td class="text-end text-primary"><strong>$${formatNumber(item.total_recaudacion || 0)}</strong></td>
          <td class="text-end" style="color: #ff9800;">$${formatNumber(item.cancelaciones || 0)}</td>
          <td class="text-end" style="color: #ff9800;">$${formatNumber(item.devoluciones || 0)}</td>
          <td class="text-end text-success"><strong>$${formatNumber(item.total_premios || 0)}</strong></td>
          <td class="text-end">${formatNumber(item.total_ganadores || 0)}</td>
          <td class="text-end"><span class="badge bg-info">${porcentaje}%</span></td>
        </tr>
      `;
    }).join('');

  } else if (tipoConsulta === 'agrupado_agencia') {
    // Agrupar datos por agencia/cta_cte sumando todos los juegos
    const agrupado = {};
    dashboardData.forEach(item => {
      // Clave: usar agencia o cta_cte limpio
      const clave = (item.cta_cte || item.agencia || 'SIN-AGENCIA').replace(/-/g, '').trim();
      if (!agrupado[clave]) {
        agrupado[clave] = {
          agencia: clave,
          nombre: item.nombre || clave,
          codigo_provincia: item.codigo_provincia,
          juegos: new Set(),
          total_sorteos: 0,
          total_recaudacion: 0,
          cancelaciones: 0,
          devoluciones: 0,
          total_tickets: 0,
          total_apuestas: 0,
          total_anulados: 0,
          total_ganadores: 0,
          total_premios: 0
        };
      }
      const g = agrupado[clave];
      g.juegos.add(item.juego);
      g.total_sorteos += parseInt(item.total_sorteos) || 0;
      g.total_recaudacion += parseFloat(item.total_recaudacion) || 0;
      g.cancelaciones += parseFloat(item.cancelaciones) || 0;
      g.devoluciones += parseFloat(item.devoluciones) || 0;
      g.total_tickets += parseInt(item.total_tickets) || 0;
      g.total_apuestas += parseInt(item.total_apuestas) || 0;
      g.total_anulados += parseInt(item.total_anulados) || 0;
      g.total_ganadores += parseInt(item.total_ganadores) || 0;
      g.total_premios += parseFloat(item.total_premios) || 0;
    });

    const listaAgrupada = Object.values(agrupado);

    // Ordenar
    const sortCol = dashboardSortColumn || 'total_recaudacion';
    const sortDir = dashboardSortColumn ? dashboardSortDirection : 'desc';
    listaAgrupada.sort((a, b) => {
      const va = a[sortCol] || 0;
      const vb = b[sortCol] || 0;
      return sortDir === 'asc' ? va - vb : vb - va;
    });

    // Actualizar contador
    const countEl = document.getElementById('dash-results-count');
    if (countEl) countEl.textContent = listaAgrupada.length;

    thead.innerHTML = `
      <tr>
        ${sortableHeader('Agencia', 'agencia', '')}
        <th>Juegos</th>
        ${sortableHeader('Sorteos', 'total_sorteos', 'text-end')}
        ${sortableHeader('Recaudación', 'total_recaudacion', 'text-end')}
        ${sortableHeader('Cancelaciones', 'cancelaciones', 'text-end')}
        ${sortableHeader('Devoluciones', 'devoluciones', 'text-end')}
        ${sortableHeader('Tickets', 'total_tickets', 'text-end')}
        ${sortableHeader('Apuestas', 'total_apuestas', 'text-end')}
        ${sortableHeader('Anulados', 'total_anulados', 'text-end')}
        ${sortableHeader('Ganadores', 'total_ganadores', 'text-end')}
        ${sortableHeader('Premios', 'total_premios', 'text-end')}
      </tr>
    `;

    tbody.innerHTML = listaAgrupada.map(item => {
      const esProvincia = item.codigo_provincia && item.codigo_provincia !== '51' && item.codigo_provincia !== 'CABA';
      const displayAgencia = esProvincia
        ? `<span class="badge bg-secondary" style="font-size: 0.85rem; padding: 0.4rem 0.6rem;">${item.nombre}</span>`
        : `<strong style="font-family: monospace; font-size: 0.95rem;">${item.agencia}</strong>`;

      const juegosArr = [...item.juegos];
      const juegoBadges = juegosArr.map(j => `<span class="badge game-${j}" style="font-size: 0.7rem; margin: 1px;">${j.toUpperCase().substring(0,4)}</span>`).join(' ');

      return `
        <tr>
          <td>${displayAgencia}</td>
          <td>${juegoBadges}</td>
          <td class="text-end">${formatNumber(item.total_sorteos)}</td>
          <td class="text-end text-primary"><strong>$${formatNumber(item.total_recaudacion)}</strong></td>
          <td class="text-end" style="color: #ff9800;">${item.cancelaciones > 0 ? '$' + formatNumber(item.cancelaciones) : '-'}</td>
          <td class="text-end" style="color: #ff9800;">${item.devoluciones > 0 ? '$' + formatNumber(item.devoluciones) : '-'}</td>
          <td class="text-end">${item.total_tickets > 0 ? formatNumber(item.total_tickets) : '-'}</td>
          <td class="text-end">${item.total_apuestas > 0 ? formatNumber(item.total_apuestas) : '-'}</td>
          <td class="text-end text-warning">${item.total_anulados > 0 ? formatNumber(item.total_anulados) : '-'}</td>
          <td class="text-end">${item.total_ganadores > 0 ? formatNumber(item.total_ganadores) : '-'}</td>
          <td class="text-end text-success"><strong>$${formatNumber(item.total_premios)}</strong></td>
        </tr>
      `;
    }).join('');
  }
}

// Obtener nombre de modalidad
function getModalidadNombre(modalidad) {
  const nombres = {
    'R': 'Previa',
    'P': 'Primera',
    'M': 'Matutina',
    'V': 'Vespertina',
    'N': 'Nocturna',
    'H': 'Hipicas',
    'U': 'Única'
  };
  return nombres[modalidad] || modalidad;
}

// Limpiar filtros del dashboard
function limpiarFiltrosDashboard() {
  const hoy = new Date().toISOString().split('T')[0];
  const hace30Dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  document.getElementById('dash-fecha-desde').value = hace30Dias;
  document.getElementById('dash-fecha-hasta').value = hoy;
  document.getElementById('dash-sorteo-desde').value = '';
  document.getElementById('dash-sorteo-hasta').value = '';
  document.getElementById('dash-agencia').value = '';
  document.getElementById('dash-tipo-consulta').value = 'agencias';

  // Resetear juegos
  document.getElementById('dash-game-todos').checked = true;
  document.getElementById('dash-game-quiniela').checked = false;
  document.getElementById('dash-game-poceada').checked = false;
  dashboardSelectedGames = ['todos'];
  updateDashboardGameIndicator();

  // Recargar datos
  buscarDashboard();
}

// Exportar dashboard a CSV
function exportarDashboardCSV() {
  if (dashboardData.length === 0) {
    showToast('No hay datos para exportar', 'warning');
    return;
  }

  const tipoConsulta = document.getElementById('dash-tipo-consulta').value;
  let headers, rows;

  if (tipoConsulta === 'detallado') {
    headers = ['Fecha', 'Sorteo', 'Modalidad', 'Juego', 'Tickets', 'Apuestas', 'Anulados', 'Recaudación', 'Premios', 'Ganadores'];
    rows = dashboardData.map(item => [
      item.fecha,
      item.sorteo,
      item.modalidad,
      item.juego,
      item.total_tickets || 0,
      item.total_apuestas || 0,
      item.total_anulados || 0,
      item.recaudacion_total || 0,
      item.total_premios || 0,
      item.total_ganadores || 0
    ]);
  } else if (tipoConsulta === 'totalizado') {
    headers = ['Agencia', 'Identificación', 'Juego', 'Sorteos', 'Ganadores', 'Premios'];
    rows = dashboardData.map(item => [
      item.nombre_display || item.agencia,
      item.agencia,
      item.juego,
      item.total_sorteos || 0,
      item.total_ganadores || 0,
      item.total_premios || 0
    ]);
  } else {
    headers = ['Juego', 'Sorteos', 'Tickets', 'Apuestas', 'Anulados', 'Recaudación', 'Premios', 'Ganadores'];
    rows = dashboardData.map(item => [
      item.juego,
      item.total_sorteos || 0,
      item.total_tickets || 0,
      item.total_apuestas || 0,
      item.total_anulados || 0,
      item.total_recaudacion || 0,
      item.total_premios || 0,
      item.total_ganadores || 0
    ]);
  }

  // Generar CSV
  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `reporte_${tipoConsulta}_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();

  URL.revokeObjectURL(url);
  showToast('Archivo CSV descargado', 'success');
}

// Cerrar modal del dashboard
function cerrarModalDashDetalle() {
  document.getElementById('modal-dash-detalle').classList.add('hidden');
}

// =============================================
// HISTORIAL ANTIGUO (conservado para compatibilidad)
// =============================================

// Buscar historial según filtros (versión legacy)
async function buscarHistorial() {
  // Redirigir al nuevo dashboard
  buscarDashboard();
}

// Cerrar modal genérico
function cerrarModal(el) {
  if (el) el.remove();
}

// =============================================
// OCR EXTRACTOS
// =============================================

let ocrImagenActual = null;
let ocrPdfActual = null;
let extractosPendientes = [];

// Inicializar OCR al cargar la vista de extractos
function initOCRExtractos() {
  // Área Unificada (Smart Upload)
  const unifiedArea = document.getElementById('extracto-unified-area');
  const unifiedInput = document.getElementById('extracto-unified-input');

  if (unifiedArea && unifiedInput) {
    unifiedArea.addEventListener('click', () => unifiedInput.click());
    unifiedArea.addEventListener('dragover', e => {
      e.preventDefault();
      unifiedArea.style.borderColor = 'var(--success)';
      unifiedArea.style.background = 'rgba(16, 185, 129, 0.1)';
    });
    unifiedArea.addEventListener('dragleave', () => {
      unifiedArea.style.borderColor = 'var(--primary)';
      unifiedArea.style.background = 'rgba(37, 99, 235, 0.05)';
    });
    unifiedArea.addEventListener('drop', e => {
      e.preventDefault();
      unifiedArea.style.borderColor = 'var(--primary)';
      unifiedArea.style.background = 'rgba(37, 99, 235, 0.05)';
      if (e.dataTransfer.files.length) {
        handleSmartFiles(e.dataTransfer.files);
      }
    });
    unifiedInput.addEventListener('change', () => {
      if (unifiedInput.files.length) handleSmartFiles(unifiedInput.files);
    });
  }

  // Generar inputs para carga manual
  generarInputsExtractoManual();

  // Mostrar/ocultar letras según provincia en modal de edición y manual
  const provinciaSelect = document.getElementById('extracto-provincia');
  if (provinciaSelect) {
    provinciaSelect.addEventListener('change', () => {
      const letrasContainer = document.getElementById('letras-container-manual');
      if (letrasContainer) {
        letrasContainer.style.display = provinciaSelect.value === '51' ? 'block' : 'none';
      }
    });
  }
}

// Lógica de detección de archivos
async function handleSmartFiles(files) {
  for (const file of files) {
    const ext = file.name.split('.').pop().toLowerCase();

    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      cargarImagenPreview(file);
      showToast(`Imagen detectada: ${file.name}`, 'info');
    } else if (ext === 'pdf') {
      procesarPdfOCR_Simple(file);
      showToast(`Procesando PDF: ${file.name}`, 'info');
    } else if (ext === 'xml') {
      procesarXml_Simple(file, file.name); // Pasar el nombre del archivo
    } else {
      showToast(`Formato no soportado: ${ext}`, 'warning');
    }
  }
}

function toggleManualInput() {
  const container = document.getElementById('manual-input-container');
  container.classList.toggle('hidden');
  if (!container.classList.contains('hidden')) {
    container.scrollIntoView({ behavior: 'smooth' });
    const dateInput = document.getElementById('extracto-fecha-manual');
    if (!dateInput.value) dateInput.value = new Date().toISOString().split('T')[0];
  }
}

function cancelarProcesamiento() {
  ocrImagenActual = null;
  ocrPdfActual = null;
  document.getElementById('ocr-preview').classList.add('hidden');
}

function generarInputsExtractoManual() {
  const container = document.getElementById('extracto-numeros-manual');
  const letrasContainer = document.getElementById('letras-container-manual');

  if (container) {
    container.innerHTML = '';
    for (let i = 1; i <= 20; i++) {
      container.innerHTML += `
        <div class="form-group" style="margin: 0;">
          <input type="text" class="numero-input manual-num" id="manual-num-${i}" 
                 placeholder="${i}" maxlength="4" data-pos="${i}">
        </div>
      `;
    }
  }

  if (letrasContainer) {
    letrasContainer.innerHTML = '';
    for (let i = 1; i <= 4; i++) {
      letrasContainer.innerHTML += `
        <input type="text" class="letra-input manual-letra" id="manual-letra-${i}" 
               placeholder="${i}" maxlength="1">
      `;
    }
  }
}

function limpiarExtractoManual() {
  document.querySelectorAll('.manual-num').forEach(input => input.value = '');
  document.querySelectorAll('.manual-letra').forEach(input => input.value = '');
}

function guardarExtractoManual() {
  const provincia = document.getElementById('extracto-provincia').value;
  const fecha = document.getElementById('extracto-fecha-manual').value;
  const modalidad = document.getElementById('extracto-modalidad-manual').value;
  const sorteo = document.getElementById('extracto-sorteo-manual').value;

  if (!fecha) return showToast('Ingrese la fecha', 'warning');

  const numeros = [];
  document.querySelectorAll('.manual-num').forEach(input => {
    numeros.push(input.value || '0000');
  });

  const letras = [];
  document.querySelectorAll('.manual-letra').forEach(input => {
    if (input.value) letras.push(input.value.toUpperCase());
  });

  mostrarResultadoOCR({
    provincia,
    fecha,
    modalidad,
    sorteo,
    numeros,
    letras: letras.join('')
  });

  showToast('Extracto manual agregado', 'success');
  toggleManualInput();
}

async function procesarPdfOCR_Simple(file) {
  try {
    showToast('Convirtiendo PDF a imagen...', 'info');
    const { base64, mimeType } = await OCRExtractos.pdfToImage(file);
    ocrImagenActual = { base64, mimeType };

    document.getElementById('ocr-preview').classList.remove('hidden');
    document.getElementById('ocr-preview-img').src = `data:${mimeType};base64,${base64}`;

    showToast('Listo para procesar con IA', 'success');
  } catch (error) {
    showToast('Error procesando PDF: ' + error.message, 'error');
  }
}

async function procesarXml_Simple(file, fileName = '') {
  showToast('Procesando XML...', 'info');
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const xmlString = e.target.result;
      const parser = new DOMParser();
      const xml = parser.parseFromString(xmlString, 'text/xml');

      // Extraer info del nombre del archivo (Patrón: QNL[Prov][Mod]...)
      let fileProv = '';
      let fileMod = '';
      if (fileName) {
        const fUpper = fileName.toUpperCase();
        const match = fUpper.match(/QNL(\d{2})([RPMVN])/);
        if (match) {
          fileProv = match[1];
          fileMod = match[2];
          console.log(`[SIMBA] Info detectada en nombre de archivo: Prov=${fileProv}, Mod=${fileMod}`);
        }
      }

      const parseError = xml.querySelector('parsererror');
      if (parseError) {
        showToast('XML inválido', 'error');
        return;
      }

      // Buscar bloques de sorteo (pueden ser varios)
      let sorteosDocs = xml.querySelectorAll('DatosSorteo, Sorteo, sorteo, extracto');
      if (sorteosDocs.length === 0) {
        // Si no hay bloques, tratar la raíz como un sorteo
        sorteosDocs = [xml];
      }

      let procesados = 0;

      sorteosDocs.forEach(doc => {
        let numeros = [];
        let letras = [];

        // 1. Extraer Números
        const suerteNode = doc.querySelector('Suerte');
        if (suerteNode) {
          for (let i = 1; i <= 20; i++) {
            const node = suerteNode.querySelector(`N${i.toString().padStart(2, '0')}`);
            if (node) numeros.push(node.textContent.trim());
          }
          const letrasNode = suerteNode.querySelector('Letras, letras');
          if (letrasNode) letras = letrasNode.textContent.trim().split(/\s+/).join('');
        }

        if (numeros.length === 0) {
          for (let i = 1; i <= 20; i++) {
            const node = doc.querySelector(`posicion${i}, pos${i}, n${i}, N${i}, num${i}`);
            if (node) numeros.push(node.textContent.trim());
          }
        }

        if (numeros.length === 0) {
          const numNodes = doc.querySelectorAll('numero, valor');
          if (numNodes.length >= 10) {
            numNodes.forEach(n => numeros.push(n.textContent.trim()));
          }
        }

        if (numeros.length > 0) {
          // 3. Extraer Data
          const fechaNode = doc.querySelector('FechaSorteo, Fecha, fecha');
          const sorteoNumNode = doc.querySelector('SorteoNum, NumeroSorteo, sorteo');
          const entidadNode = doc.querySelector('Entidad, Provincia, provincia');
          const juegoNode = doc.querySelector('Juego, modalidad, Modalidad');

          let provincia = fileProv || document.getElementById('extracto-provincia').value;
          if (entidadNode) {
            const ent = entidadNode.textContent.trim().toUpperCase();
            if (ent.includes('CIUDAD') || ent.includes('CABA') || ent === '51') provincia = '51';
            else if (ent.includes('BUENOS AIRES') || ent.includes('BSAS') || ent === '53') provincia = '53';
            else if (ent.includes('SANTA FE') || ent === '72') provincia = '72';
            else if (ent.includes('CORDOBA') || ent === '55') provincia = '55';
            else if (ent.includes('MONTEVIDEO') || ent === '00') provincia = '00';
          }

          let fecha = new Date().toISOString().split('T')[0];
          if (fechaNode) {
            const fText = fechaNode.textContent.trim();
            if (fText.includes('/')) {
              const parts = fText.split('/');
              if (parts.length === 3) {
                let [d, m, y] = parts;
                if (y.length === 2) y = '20' + y;
                fecha = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
              }
            } else if (fText.includes('-')) {
              fecha = fText.split('T')[0];
            }
          }

          // Intentar mapear modalidad buscando palabras clave o nombre de archivo
          let modalidad = fileMod || 'M'; // Primero la del archivo, sino Matutina
          if (juegoNode) {
            const jText = juegoNode.textContent.trim().toUpperCase();
            if (jText.includes('PREVIA')) modalidad = 'R';
            else if (jText.includes('PRIMERA')) modalidad = 'P';
            else if (jText.includes('MATUTINA')) modalidad = 'M';
            else if (jText.includes('VESPERTINA')) modalidad = 'V';
            else if (jText.includes('NOCTURNA')) modalidad = 'N';
            else if (!fileMod) modalidad = jText.substring(0, 1);
          } else if (doc.querySelector('Modalidad, modalidad')) {
            const mText = doc.querySelector('Modalidad, modalidad').textContent.trim().toUpperCase();
            if (!fileMod) modalidad = mText.substring(0, 1);
          }

          mostrarResultadoOCR({
            provincia,
            fecha,
            modalidad,
            sorteo: sorteoNumNode ? sorteoNumNode.textContent.trim() : '',
            numeros,
            letras: Array.isArray(letras) ? letras.join('') : letras
          });
          procesados++;
        }
      });

      if (procesados > 0) {
        showToast(`${procesados} extracto(s) leído(s) del XML`, 'success');
      } else {
        showToast('No se encontraron sorteos válidos en el XML', 'warning');
      }
    } catch (e) {
      console.error('Error XML:', e);
      showToast('Error procesando XML', 'error');
    }
  };
  reader.readAsText(file);
}

function actualizarEstadoApiKey() {
  // Key está en config.js, no se requiere acción
}

function cargarImagenPreview(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    ocrImagenActual = file;
    document.getElementById('ocr-preview').classList.remove('hidden');
    document.getElementById('ocr-preview-img').src = e.target.result;

    // Auto-scroll to preview
    document.getElementById('ocr-preview').scrollIntoView({ behavior: 'smooth' });
  };
  reader.readAsDataURL(file);
}

async function capturarPantallaExtracto() {
  try {
    showToast('Seleccioná la ventana a capturar...', 'info');
    const captura = await OCRExtractos.capturarPantalla();

    ocrImagenActual = { base64: captura.base64, mimeType: captura.mimeType };
    document.getElementById('ocr-preview').classList.remove('hidden');
    document.getElementById('ocr-preview-img').src = captura.dataUrl;

    showToast('Captura realizada. Hacé clic en Extraer con IA', 'success');
  } catch (error) {
    showToast('Error en captura: ' + error.message, 'error');
  }
}

async function procesarImagenOCR() {
  if (!ocrImagenActual) {
    showToast('Primero seleccioná una imagen o capturá pantalla', 'warning');
    return;
  }

  const btn = document.getElementById('btn-procesar-ocr-simple');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando con IA...';

  try {
    let base64, mimeType;

    if (ocrImagenActual instanceof File) {
      const result = await OCRExtractos.imageToBase64(ocrImagenActual);
      base64 = result.base64;
      mimeType = result.mimeType;
    } else {
      base64 = ocrImagenActual.base64;
      mimeType = ocrImagenActual.mimeType;
    }

    const provinciaHint = document.getElementById('extracto-provincia').value;
    const resultado = await OCRExtractos.procesarImagenQuiniela(base64, mimeType, provinciaHint);

    if (resultado.success) {
      mostrarResultadoOCR(resultado.data);
      showToast('Imagen procesada correctamente', 'success');
      cancelarProcesamiento();
    } else {
      showToast('Error procesando imagen', 'error');
    }
  } catch (error) {
    console.error('Error OCR:', error);
    showToast('Error: ' + error.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

function mostrarResultadoOCR(data) {
  // 1. Normalizar Modalidad (Convertir nombre a código si es necesario)
  let modCode = data.modalidad || 'M';
  const modMap = {
    'LA PREVIA': 'R', 'PREVIA': 'R', 'R': 'R',
    'LA PRIMERA': 'P', 'PRIMERA': 'P', 'P': 'P',
    'MATUTINA': 'M', 'M': 'M',
    'VESPERTINA': 'V', 'V': 'V',
    'NOCTURNA': 'N', 'N': 'N'
  };

  // Limpiar texto de modalidad (quitar acentos y pasar a mayúsculas)
  const cleanMod = modCode.toString().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  modCode = modMap[cleanMod] || modCode;

  // 2. Normalizar Provincia
  const provincia = data.provincia || document.getElementById('extracto-provincia').value;
  const provMap = {
    '51': 'CABA', '53': 'Buenos Aires', '55': 'Córdoba',
    '72': 'Santa Fe', '59': 'Entre Ríos', '64': 'Mendoza', '00': 'Montevideo',
    '151': 'Montevideo', '211': 'Montevideo'
  };
  const provinciaName = provMap[provincia] || provincia;

  const modalNames = {
    'R': 'La Previa', 'P': 'La Primera', 'M': 'Matutina', 'V': 'Vespertina', 'N': 'Nocturna'
  };

  // 3. Normalizar FECHA a YYYY-MM-DD (Evitar formatos DD-MM-YYYY que rompen la búsqueda)
  let fechaNorm = data.fecha || new Date().toISOString().split('T')[0];
  if (fechaNorm.includes('-')) {
    const parts = fechaNorm.split('-');
    if (parts[0].length === 2) { // Es DD-MM-YYYY
      fechaNorm = `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
  }

  const extracto = {
    id: Date.now() + Math.random(),
    provincia: provincia,
    provinciaName: provinciaName,
    modalidad: modCode,
    modalidadName: modalNames[modCode] || modCode,
    sorteo: data.sorteo || '',
    fecha: fechaNorm,
    hora: data.hora || '',
    numeros: data.numeros || [],
    letras: data.letras || ''
  };

  // Evitar duplicados exactos (mismo provincia, fecha, modalidad)
  const isDuplicate = extractosPendientes.some(e =>
    e.provincia === extracto.provincia &&
    e.fecha === extracto.fecha &&
    e.modalidad === extracto.modalidad
  );

  if (!isDuplicate) {
    extractosPendientes.push(extracto);
    // Ordenar por Provincia y luego por Modalidad
    const orderMod = { 'R': 1, 'P': 2, 'M': 3, 'V': 4, 'N': 5 };
    extractosPendientes.sort((a, b) => {
      if (a.provinciaName !== b.provinciaName) return a.provinciaName.localeCompare(b.provinciaName);
      return (orderMod[a.modalidad] || 9) - (orderMod[b.modalidad] || 9);
    });
  }

  renderExtractosPendientes();
  document.getElementById('extractos-pendientes-container').style.display = 'block';
}

function renderExtractosPendientes() {
  const container = document.getElementById('extractos-pendientes-list');

  container.innerHTML = extractosPendientes.map(ext => `
    <div class="card mb-2" id="extracto-pending-${ext.id}">
      <div class="card-body p-3">
        <div class="d-flex justify-content-between align-items-start mb-2">
          <div>
            <span class="badge bg-primary">${ext.provinciaName}</span>
            <span class="badge bg-secondary">${ext.modalidadName}</span>
            ${ext.sorteo ? `<span class="badge bg-info">Sorteo ${ext.sorteo}</span>` : ''}
            <span class="text-muted ms-2">${ext.fecha}</span>
          </div>
          <div class="d-flex gap-1">
            <button class="btn btn-sm btn-secondary" onclick="editarExtractoPendiente(${ext.id})" title="Corregir datos">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn btn-sm btn-danger" onclick="eliminarExtractoPendiente(${ext.id})" title="Eliminar">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>
        <div class="numeros-preview" style="display: grid; grid-template-columns: repeat(10, 1fr); gap: 2px;">
          ${ext.numeros.map((n, i) => `<span class="num-badge" title="Posición ${i + 1}" style="${n === '0000' || n === '000' ? 'border: 1px solid var(--danger); background: rgba(239, 68, 68, 0.1);' : ''}">${n}</span>`).join('')}
        </div>
        ${ext.letras ? `<div class="mt-1"><small>Letras: <strong>${ext.letras}</strong></small></div>` : ''}
      </div>
    </div>
  `).join('');
}

function eliminarExtractoPendiente(id) {
  extractosPendientes = extractosPendientes.filter(e => e.id !== id);
  renderExtractosPendientes();

  if (extractosPendientes.length === 0) {
    document.getElementById('extractos-pendientes-container').style.display = 'none';
  }
}

/**
 * MODAL PARA CORREGIR EXTRACTO
 */
function editarExtractoPendiente(id) {
  const ext = extractosPendientes.find(e => e.id === id);
  if (!ext) return;

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'modal-edit-extracto';

  // Opciones de provincia
  const provinciasOpt = [
    { v: '51', n: 'CABA' }, { v: '53', n: 'Buenos Aires' }, { v: '55', n: 'Córdoba' },
    { v: '72', n: 'Santa Fe' }, { v: '59', n: 'Entre Ríos' }, { v: '64', n: 'Mendoza' },
    { v: '00', n: 'Montevideo' }
  ];

  // Opciones de modalidad
  const modalidadesOpt = [
    { v: 'R', n: 'La Previa' }, { v: 'P', n: 'La Primera' }, { v: 'M', n: 'Matutina' },
    { v: 'V', n: 'Vespertina' }, { v: 'N', n: 'Nocturna' }
  ];

  modal.innerHTML = `
    <div class="modal-content modal-lg">
      <div class="modal-header">
        <h3><i class="fas fa-edit"></i> Corregir Extracto Detectado</h3>
        <button class="btn-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="row g-3 mb-4">
          <div class="col-md-4">
            <label class="form-label">Provincia</label>
            <select id="edit-ext-provincia" class="form-control">
              ${provinciasOpt.map(p => `<option value="${p.v}" ${p.v === ext.provincia ? 'selected' : ''}>${p.n}</option>`).join('')}
            </select>
          </div>
          <div class="col-md-4">
            <label class="form-label">Modalidad</label>
            <select id="edit-ext-modalidad" class="form-control">
              ${modalidadesOpt.map(m => `<option value="${m.v}" ${m.v === ext.modalidad ? 'selected' : ''}>${m.n}</option>`).join('')}
            </select>
          </div>
          <div class="col-md-4">
            <label class="form-label">Fecha</label>
            <input type="date" id="edit-ext-fecha" class="form-control" value="${ext.fecha}">
          </div>
        </div>

        <h5>Números Detectados</h5>
        <div class="numeros-grid" style="grid-template-columns: repeat(5, 1fr);">
          ${ext.numeros.map((n, i) => `
            <div class="form-group" style="margin-bottom: 0.5rem;">
              <label style="font-size: 0.7rem; margin-bottom: 2px;">Pos ${i + 1}</label>
              <input type="text" class="form-control text-center edit-num-input" 
                     data-index="${i}" value="${n}" maxlength="4" style="font-family: monospace;">
            </div>
          `).join('')}
        </div>

        <div class="mt-4">
          <h5>Letras (CABA/Montevideo)</h5>
          <input type="text" id="edit-ext-letras" class="form-control" 
                 value="${Array.isArray(ext.letras) ? ext.letras.join('') : ext.letras}" 
                 placeholder="Ej: ABCD" maxlength="4" style="text-transform: uppercase; letter-spacing: 5px; font-weight: bold;">
        </div>
      </div>
      <div class="modal-footer" style="padding: 1rem; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: 1rem;">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
        <button class="btn btn-primary" onclick="actualizarExtractoPendiente(${id})">
          <i class="fas fa-check"></i> Aplicar Cambios
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function actualizarExtractoPendiente(id) {
  const extIndex = extractosPendientes.findIndex(e => e.id === id);
  if (extIndex === -1) return;

  const modal = document.getElementById('modal-edit-extracto');

  // Obtener nuevos valores
  const provincia = document.getElementById('edit-ext-provincia').value;
  const modalidad = document.getElementById('edit-ext-modalidad').value;
  const fecha = document.getElementById('edit-ext-fecha').value;
  const letras = document.getElementById('edit-ext-letras').value.toUpperCase();

  const numeros = [];
  document.querySelectorAll('.edit-num-input').forEach(input => {
    numeros[parseInt(input.dataset.index)] = input.value;
  });

  const provinciaName = {
    '51': 'CABA', '53': 'Buenos Aires', '55': 'Córdoba',
    '72': 'Santa Fe', '59': 'Entre Ríos', '64': 'Mendoza', '00': 'Montevideo'
  }[provincia] || provincia;

  const modalidadName = {
    'R': 'La Previa', 'P': 'La Primera', 'M': 'Matutina', 'V': 'Vespertina', 'N': 'Nocturna'
  }[modalidad] || modalidad;

  // Actualizar objeto
  extractosPendientes[extIndex] = {
    ...extractosPendientes[extIndex],
    provincia,
    provinciaName,
    modalidad,
    modalidadName,
    fecha,
    numeros,
    letras
  };

  renderExtractosPendientes();
  modal.remove();
  showToast('Extracto corregido', 'success');
}

function limpiarExtractosPendientes() {
  extractosPendientes = [];
  document.getElementById('extractos-pendientes-container').style.display = 'none';
  document.getElementById('extractos-pendientes-list').innerHTML = '';
}

async function guardarExtractosPendientes() {
  if (extractosPendientes.length === 0) {
    showToast('No hay extractos para guardar', 'warning');
    return;
  }

  const btn = document.querySelector('#extractos-pendientes-container .btn-success');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

  try {
    // Preparar datos para el endpoint
    const extractosData = extractosPendientes.map(ext => ({
      provincia: ext.provincia,
      modalidad: ext.modalidad,
      fecha: ext.fecha,
      numeros: ext.numeros,
      letras: ext.letras || '',
      fuente: 'OCR'
    }));

    const result = await extractosAPI.guardarBulk(extractosData);

    if (result && result.success) {
      const cantidad = (result.data && result.data.guardados) || extractosData.length;
      showToast(`${cantidad} extracto(s) guardado(s) correctamente`, 'success');
      limpiarExtractosPendientes();
    } else {
      showToast('Error: ' + (result?.message || 'No se pudo guardar'), 'error');
    }
  } catch (error) {
    console.error('[SIMBA] Error guardando extractos:', error);
    showToast('Error al guardar: ' + error.message, 'error');
  } finally {
    const btn = document.querySelector('#extractos-pendientes-container .btn-success');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
}

// Config API Key
function toggleApiKeyVisibility() {
  const input = document.getElementById('groq-api-key');
  input.type = input.type === 'password' ? 'text' : 'password';
}

function guardarApiKey() {
  const key = document.getElementById('groq-api-key').value.trim();
  if (!key) {
    showToast('Ingresá una API key', 'warning');
    return;
  }

  OCRExtractos.setApiKey(key);
  actualizarEstadoApiKey();
  showToast('API key guardada', 'success');
}

async function testApiKey() {
  const resultEl = document.getElementById('api-test-result');
  resultEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Probando conexión...';

  try {
    // Crear una imagen de prueba simple (1x1 pixel blanco)
    const testImage = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const response = await fetch(OCRExtractos.CONFIG.API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + OCRExtractos.CONFIG.API_KEY
      },
      body: JSON.stringify({
        model: OCRExtractos.CONFIG.MODEL,
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 10
      })
    });

    if (response.ok) {
      resultEl.innerHTML = '<div class="alert alert-success"><i class="fas fa-check-circle"></i> Conexión exitosa! La API key funciona correctamente.</div>';
    } else if (response.status === 401) {
      resultEl.innerHTML = '<div class="alert alert-danger"><i class="fas fa-times-circle"></i> API key inválida. Verificá que esté correcta.</div>';
    } else {
      resultEl.innerHTML = `<div class="alert alert-warning"><i class="fas fa-exclamation-triangle"></i> Error ${response.status}</div>`;
    }
  } catch (error) {
    resultEl.innerHTML = `<div class="alert alert-danger"><i class="fas fa-times-circle"></i> Error de conexión: ${error.message}</div>`;
  }
}

function cargarExtractoXML() {
  // TODO: Implementar carga de XML
  showToast('Función de XML en desarrollo', 'info');
}

// Exportar historial a CSV (versión legacy)
function exportarHistorial() {
  exportarDashboardCSV();
}

// Formatear fecha/hora
function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleString('es-AR');
}

// =============================================
// CONTROL PREVIO - TAB
// =============================================

// Buscar Control Previo
async function buscarControlPrevio() {
  const fechaDesde = document.getElementById('cp-fecha-desde').value;
  const fechaHasta = document.getElementById('cp-fecha-hasta').value;
  const juego = document.getElementById('cp-juego').value;

  const tbody = document.querySelector('#table-historial-cp tbody');
  const emptyMsg = document.getElementById('historial-cp-empty');

  try {
    tbody.innerHTML = '<tr><td colspan="10" class="text-center"><i class="fas fa-spinner fa-spin"></i> Cargando...</td></tr>';
    emptyMsg.classList.add('hidden');

    let url = `${API_BASE}/historial/control-previo?`;
    if (fechaDesde) url += `fechaDesde=${fechaDesde}&`;
    if (fechaHasta) url += `fechaHasta=${fechaHasta}&`;
    if (juego) url += `juego=${juego}&`;

    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });

    const data = await response.json();

    if (!data.success || data.data.length === 0) {
      tbody.innerHTML = '';
      emptyMsg.classList.remove('hidden');
      controlPrevioData = [];
      return;
    }

    controlPrevioData = data.data;
    emptyMsg.classList.add('hidden');

    tbody.innerHTML = controlPrevioData.map(item => `
      <tr>
        <td>${formatDate(item.fecha)}</td>
        <td><strong>${item.numero_sorteo}</strong></td>
        <td><span class="badge badge-modalidad-${item.modalidad || 'N'}">${getModalidadNombre(item.modalidad || 'N')}</span></td>
        <td><span class="badge game-${item.juego}">${item.juego.toUpperCase()}</span></td>
        <td class="text-end">${formatNumber(item.total_registros)}</td>
        <td class="text-end">${formatNumber(item.total_apuestas)}</td>
        <td class="text-end text-warning">${formatNumber(item.total_anulados || 0)}</td>
        <td class="text-end text-primary"><strong>$${formatNumber(item.total_recaudacion)}</strong></td>
        <td>${item.usuario_nombre || '-'}</td>
        <td>
          <button class="btn btn-sm btn-secondary" onclick="verDetalleControlPrevio(${item.id}, '${item.juego}')" title="Ver detalle">
            <i class="fas fa-eye"></i>
          </button>
        </td>
      </tr>
    `).join('');

  } catch (error) {
    console.error('Error cargando control previo:', error);
    tbody.innerHTML = '<tr><td colspan="10" class="text-center text-danger">Error cargando datos</td></tr>';
  }
}

// Ver detalle de Control Previo
async function verDetalleControlPrevio(id, juego) {
  try {
    const response = await fetch(`${API_BASE}/historial/control-previo/${id}?juego=${juego}`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });

    const data = await response.json();

    if (!data.success) {
      showToast('Error obteniendo detalle', 'error');
      return;
    }

    const item = data.data;
    let datosAdicionales = {};
    try {
      datosAdicionales = item.datos_adicionales ? JSON.parse(item.datos_adicionales) : {};
    } catch (e) { }

    // Mostrar modal con detalles
    const html = `
      <div class="modal-overlay" onclick="cerrarModal(this)">
        <div class="modal-content modal-lg" onclick="event.stopPropagation()">
          <div class="modal-header">
            <h3><i class="fas fa-file-import"></i> Control Previo - Sorteo ${item.numero_sorteo}</h3>
            <button class="btn-close" onclick="cerrarModal(this.closest('.modal-overlay'))">&times;</button>
          </div>
          <div class="modal-body">
            <div class="row mb-4">
              <div class="col-md-3">
                <div class="stat-card">
                  <div class="stat-value">${formatNumber(item.total_registros)}</div>
                  <div class="stat-label">Registros</div>
                </div>
              </div>
              <div class="col-md-3">
                <div class="stat-card">
                  <div class="stat-value">${formatNumber(item.total_apuestas)}</div>
                  <div class="stat-label">Apuestas</div>
                </div>
              </div>
              <div class="col-md-3">
                <div class="stat-card">
                  <div class="stat-value text-warning">${formatNumber(item.total_anulados || 0)}</div>
                  <div class="stat-label">Anulados</div>
                </div>
              </div>
              <div class="col-md-3">
                <div class="stat-card">
                  <div class="stat-value text-success">$${formatNumber(item.total_recaudacion)}</div>
                  <div class="stat-label">Recaudación</div>
                </div>
              </div>
            </div>
            <p><strong>Fecha:</strong> ${formatDate(item.fecha)}</p>
            <p><strong>Modalidad:</strong> ${getModalidadNombre(item.modalidad || 'N')}</p>
            <p><strong>Archivo:</strong> ${item.nombre_archivo_zip || '-'}</p>
            <p><strong>Procesado:</strong> ${formatDateTime(item.created_at)}</p>
            ${datosAdicionales.provincias ? `
              <h4 class="mt-4">Detalle por Provincia</h4>
              <table class="table table-sm">
                <thead><tr><th>Provincia</th><th>Registros</th><th>Apuestas</th><th>Recaudación</th></tr></thead>
                <tbody>
                  ${Object.entries(datosAdicionales.provincias).map(([prov, d]) => `
                    <tr>
                      <td>${d.nombre || prov}</td>
                      <td>${formatNumber(d.registros || 0)}</td>
                      <td>${formatNumber(d.apuestas || 0)}</td>
                      <td>$${formatNumber(d.recaudacion || 0)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : ''}
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

  } catch (error) {
    console.error('Error:', error);
    showToast('Error obteniendo detalle', 'error');
  }
}

// Exportar Control Previo a CSV
function exportarControlPrevioCSV() {
  if (controlPrevioData.length === 0) {
    showToast('No hay datos para exportar', 'warning');
    return;
  }

  const headers = ['Fecha', 'Sorteo', 'Modalidad', 'Juego', 'Registros', 'Apuestas', 'Anulados', 'Recaudación', 'Usuario'];
  const rows = controlPrevioData.map(item => [
    item.fecha,
    item.numero_sorteo,
    item.modalidad || 'N',
    item.juego,
    item.total_registros || 0,
    item.total_apuestas || 0,
    item.total_anulados || 0,
    item.total_recaudacion || 0,
    item.usuario_nombre || ''
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `control_previo_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();

  URL.revokeObjectURL(url);
  showToast('Archivo CSV descargado', 'success');
}

// =============================================
// ESCRUTINIOS - TAB
// =============================================

// Buscar Escrutinios
async function buscarEscrutinios() {
  const fechaDesde = document.getElementById('esc-fecha-desde').value;
  const fechaHasta = document.getElementById('esc-fecha-hasta').value;
  const juego = document.getElementById('esc-juego').value;

  const tbody = document.querySelector('#table-historial-escrutinio tbody');
  const emptyMsg = document.getElementById('historial-escrutinio-empty');

  try {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center"><i class="fas fa-spinner fa-spin"></i> Cargando...</td></tr>';
    emptyMsg.classList.add('hidden');

    let url = `${API_BASE}/historial/escrutinios?`;
    if (fechaDesde) url += `fechaDesde=${fechaDesde}&`;
    if (fechaHasta) url += `fechaHasta=${fechaHasta}&`;
    if (juego) url += `juego=${juego}&`;

    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });

    const data = await response.json();

    if (!data.success || data.data.length === 0) {
      tbody.innerHTML = '';
      emptyMsg.classList.remove('hidden');
      escrutiniosData = [];
      return;
    }

    escrutiniosData = data.data;
    emptyMsg.classList.add('hidden');

    tbody.innerHTML = escrutiniosData.map(item => `
      <tr>
        <td>${formatDate(item.fecha)}</td>
        <td><strong>${item.numero_sorteo}</strong></td>
        <td><span class="badge badge-modalidad-${item.modalidad || 'N'}">${getModalidadNombre(item.modalidad || 'N')}</span></td>
        <td><span class="badge game-${item.juego}">${item.juego.toUpperCase()}</span></td>
        <td class="text-end">${formatNumber(item.total_ganadores)}</td>
        <td class="text-end text-success"><strong>$${formatNumber(item.total_premios)}</strong></td>
        <td>${item.usuario_nombre || '-'}</td>
        <td>
          <button class="btn btn-sm btn-secondary" onclick="verDetalleEscrutinio(${item.id}, '${item.juego}')" title="Ver detalle">
            <i class="fas fa-eye"></i>
          </button>
          <button class="btn btn-sm btn-info" onclick="verPremiosPorAgencia(${item.id}, '${item.juego}')" title="Ver por agencia">
            <i class="fas fa-store"></i>
          </button>
        </td>
      </tr>
    `).join('');

  } catch (error) {
    console.error('Error cargando escrutinios:', error);
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-danger">Error cargando datos</td></tr>';
  }
}

// Ver detalle de Escrutinio
async function verDetalleEscrutinio(id, juego) {
  try {
    const response = await fetch(`${API_BASE}/historial/escrutinios/${id}?juego=${juego}`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });

    const data = await response.json();

    if (!data.success) {
      showToast('Error obteniendo detalle', 'error');
      return;
    }

    const item = data.data;
    let resumenPremios = {};
    try {
      resumenPremios = item.resumen_premios ? JSON.parse(item.resumen_premios) : {};
    } catch (e) { }

    const html = `
      <div class="modal-overlay" onclick="cerrarModal(this)">
        <div class="modal-content modal-lg" onclick="event.stopPropagation()">
          <div class="modal-header">
            <h3><i class="fas fa-trophy"></i> Escrutinio - Sorteo ${item.numero_sorteo}</h3>
            <button class="btn-close" onclick="cerrarModal(this.closest('.modal-overlay'))">&times;</button>
          </div>
          <div class="modal-body">
            <div class="row mb-4">
              <div class="col-md-6">
                <div class="stat-card">
                  <div class="stat-value">${formatNumber(item.total_ganadores)}</div>
                  <div class="stat-label">Total Ganadores</div>
                </div>
              </div>
              <div class="col-md-6">
                <div class="stat-card">
                  <div class="stat-value text-success">$${formatNumber(item.total_premios)}</div>
                  <div class="stat-label">Total Premios</div>
                </div>
              </div>
            </div>
            <p><strong>Fecha:</strong> ${formatDate(item.fecha)}</p>
            <p><strong>Modalidad:</strong> ${getModalidadNombre(item.modalidad || 'N')}</p>
            <p><strong>Procesado:</strong> ${formatDateTime(item.created_at)}</p>
            ${resumenPremios.porTipo ? `
              <h4 class="mt-4">Desglose por Tipo de Premio</h4>
              <table class="table table-sm">
                <thead><tr><th>Tipo</th><th>Ganadores</th><th>Premios</th></tr></thead>
                <tbody>
                  ${Object.entries(resumenPremios.porTipo).map(([tipo, d]) => `
                    <tr>
                      <td>${tipo}</td>
                      <td>${formatNumber(d.ganadores || 0)}</td>
                      <td>$${formatNumber(d.premios || 0)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : ''}
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

  } catch (error) {
    console.error('Error:', error);
    showToast('Error obteniendo detalle', 'error');
  }
}

// Ver premios por agencia
async function verPremiosPorAgencia(escrutinioId, juego) {
  try {
    const response = await fetch(`${API_BASE}/historial/escrutinios/${escrutinioId}/agencias?juego=${juego}`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });

    const data = await response.json();

    if (!data.success) {
      showToast('Error obteniendo datos', 'error');
      return;
    }

    const items = data.data;

    const html = `
      <div class="modal-overlay" onclick="cerrarModal(this)">
        <div class="modal-content modal-xl" onclick="event.stopPropagation()">
          <div class="modal-header">
            <h3><i class="fas fa-store"></i> Premios por Agencia/Provincia</h3>
            <button class="btn-close" onclick="cerrarModal(this.closest('.modal-overlay'))">&times;</button>
          </div>
          <div class="modal-body">
            ${items.length === 0 ? `
              <div class="text-center text-muted py-4">
                <i class="fas fa-info-circle fa-2x mb-3"></i>
                <p>No hay datos de agencias ganadoras para este escrutinio</p>
              </div>
            ` : `
            <div class="table-container" style="max-height: 400px; overflow-y: auto;">
              <table class="table table-sm">
                <thead>
                  <tr>
                    <th>Provincia</th>
                    <th>Agencia / Tipo</th>
                    <th class="text-end">Ganadores</th>
                    <th class="text-end">Premios</th>
                  </tr>
                </thead>
                <tbody>
                  ${items.map(item => `
                    <tr>
                      <td>${item.provincia_nombre || item.nombre_display || item.codigo_provincia}</td>
                      <td>${item.tipo_agrupacion === 'provincia' ? '<em>Acumulado Provincia</em>' : (item.codigo_agencia || item.cta_cte)}</td>
                      <td class="text-end">${formatNumber(item.total_ganadores || 0)}</td>
                      <td class="text-end text-success"><strong>$${formatNumber(item.total_premios || 0)}</strong></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
            `}
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

  } catch (error) {
    console.error('Error:', error);
    showToast('Error obteniendo datos', 'error');
  }
}

// Exportar Escrutinios a CSV
function exportarEscrutiniosCSV() {
  if (escrutiniosData.length === 0) {
    showToast('No hay datos para exportar', 'warning');
    return;
  }

  const headers = ['Fecha', 'Sorteo', 'Modalidad', 'Juego', 'Ganadores', 'Premios', 'Usuario'];
  const rows = escrutiniosData.map(item => [
    item.fecha,
    item.numero_sorteo,
    item.modalidad || 'N',
    item.juego,
    item.total_ganadores || 0,
    item.total_premios || 0,
    item.usuario_nombre || ''
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `escrutinios_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();

  URL.revokeObjectURL(url);
  showToast('Archivo CSV descargado', 'success');
}

// Cerrar modal genérico
function cerrarModal(el) {
  if (el) el.remove();
}

// ============================================================
// JUEGOS OFFLINE - Hipicas, Telekino, Money Las Vegas
// ============================================================

function initJuegosOffline() {
  console.log('[SIMBA] Inicializando Juegos Offline');

  // Seleccionar Hipicas por defecto
  seleccionarJuegoOffline('hipicas');

  // Setup upload area
  setupHipicasUpload();

  // Limpiar resultados previos
  const resultadosCard = document.getElementById('hipicas-resultados-card');
  if (resultadosCard) resultadosCard.style.display = 'none';

  const archivoInfo = document.getElementById('hipicas-archivo-info');
  if (archivoInfo) archivoInfo.style.display = 'none';
}

function seleccionarJuegoOffline(juego) {
  // Toggle cards
  document.querySelectorAll('.juego-card').forEach(card => {
    card.classList.remove('active');
    if (card.dataset.juego === juego) {
      card.classList.add('active');
    }
  });

  // Toggle secciones
  document.querySelectorAll('[id^="seccion-"]').forEach(sec => {
    if (sec.closest('#view-juegos-offline')) {
      sec.style.display = 'none';
    }
  });

  const seccion = document.getElementById(`seccion-${juego}`);
  if (seccion) seccion.style.display = 'block';
}

function setupHipicasUpload() {
  const uploadArea = document.getElementById('hipicas-upload-area');
  const fileInput = document.getElementById('hipicas-archivo-input');

  if (!uploadArea || !fileInput) return;

  // Limpiar listeners previos clonando el elemento
  const newUploadArea = uploadArea.cloneNode(true);
  uploadArea.parentNode.replaceChild(newUploadArea, uploadArea);

  const newFileInput = document.getElementById('hipicas-archivo-input');

  // Click para seleccionar archivo
  newUploadArea.addEventListener('click', (e) => {
    if (e.target.tagName !== 'INPUT') {
      newFileInput.click();
    }
  });

  // File input change
  newFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      procesarArchivoHipicas(e.target.files[0]);
    }
  });

  // Drag & Drop
  newUploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    newUploadArea.style.borderColor = 'var(--accent)';
    newUploadArea.style.background = 'rgba(0, 255, 136, 0.05)';
  });

  newUploadArea.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    newUploadArea.style.borderColor = '';
    newUploadArea.style.background = '';
  });

  newUploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    newUploadArea.style.borderColor = '';
    newUploadArea.style.background = '';

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (!file.name.toLowerCase().endsWith('.txt')) {
        showToast('Solo se permiten archivos TXT', 'error');
        return;
      }
      procesarArchivoHipicas(file);
    }
  });
}

async function procesarArchivoHipicas(file) {
  const archivoInfo = document.getElementById('hipicas-archivo-info');
  const nombreArchivo = document.getElementById('hipicas-nombre-archivo');
  const lineasInfo = document.getElementById('hipicas-lineas-info');
  const resultadosCard = document.getElementById('hipicas-resultados-card');
  const uploadArea = document.getElementById('hipicas-upload-area');

  // Mostrar info del archivo
  if (archivoInfo) archivoInfo.style.display = 'block';
  if (nombreArchivo) nombreArchivo.textContent = file.name;
  if (lineasInfo) lineasInfo.textContent = `${(file.size / 1024).toFixed(1)} KB`;

  // Cambiar estilo del upload area
  if (uploadArea) {
    uploadArea.style.borderColor = 'var(--accent)';
    uploadArea.innerHTML = `
      <div style="padding: 1rem;">
        <i class="fas fa-spinner fa-spin fa-2x" style="color: var(--accent);"></i>
        <p style="margin-top: 0.5rem; color: var(--accent);">Procesando ${file.name}...</p>
      </div>
    `;
  }

  try {
    const response = await juegosOfflineAPI.hipicas.procesarTXT(file);

    if (response.success) {
      showToast(response.message || `Hipicas procesado: ${response.data.insertados} nuevos, ${response.data.actualizados} actualizados`, 'success');
      mostrarResultadosHipicas(response.data);
    } else {
      throw new Error(response.message || 'Error procesando archivo');
    }
  } catch (error) {
    console.error('Error procesando TXT Hipicas:', error);
    showToast('Error: ' + error.message, 'error');
    if (resultadosCard) resultadosCard.style.display = 'none';
  } finally {
    // Restaurar upload area
    if (uploadArea) {
      uploadArea.style.borderColor = '';
      uploadArea.innerHTML = `
        <i class="fas fa-cloud-upload-alt fa-3x" style="color: var(--text-muted); margin-bottom: 1rem;"></i>
        <h4>Arrastrá el archivo TXT aquí</h4>
        <p style="color: var(--text-muted); margin: 0.5rem 0;">o hacé click para seleccionarlo</p>
        <input type="file" id="hipicas-archivo-input" accept=".txt" hidden>
        <span class="badge" style="margin-top: 0.5rem;">Formato: TXT de Turfito</span>
      `;
      // Re-setup upload listeners
      setupHipicasUpload();
    }
  }
}

function mostrarResultadosHipicas(datos) {
  const resultadosCard = document.getElementById('hipicas-resultados-card');
  if (!resultadosCard) return;
  resultadosCard.style.display = 'block';

  // Stats
  document.getElementById('hipicas-total-agencias').textContent = datos.totalAgencias || 0;
  document.getElementById('hipicas-recaudacion-total').textContent = formatMoneyHipicas(datos.recaudacionTotal || 0);
  document.getElementById('hipicas-total-premios').textContent = formatMoneyHipicas(datos.totalPremios || 0);
  document.getElementById('hipicas-total-sorteos').textContent = datos.totalSorteos || 0;

  // Tabla de resultados
  const tbody = document.querySelector('#hipicas-tabla-resultados tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const registros = datos.registros || [];

  // Totales para footer
  let totalRecaudacion = 0;
  let totalCancelaciones = 0;
  let totalDevoluciones = 0;
  let totalPremios = 0;

  registros.forEach(reg => {
    totalRecaudacion += reg.recaudacion_total || 0;
    totalCancelaciones += reg.importe_cancelaciones || 0;
    totalDevoluciones += reg.devoluciones || 0;
    totalPremios += reg.total_premios || 0;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${reg.sorteo || '-'}</td>
      <td>${reg.hipodromo_nombre || '-'}</td>
      <td>${reg.reunion || '-'}</td>
      <td>${reg.agency || '-'}</td>
      <td style="text-align: right;">${formatMoneyHipicas(reg.recaudacion_total || 0)}</td>
      <td style="text-align: right;">${formatMoneyHipicas(reg.importe_cancelaciones || 0)}</td>
      <td style="text-align: right;">${formatMoneyHipicas(reg.devoluciones || 0)}</td>
      <td style="text-align: right;">${formatMoneyHipicas(reg.total_premios || 0)}</td>
    `;
    tbody.appendChild(tr);
  });

  // Footer totals
  document.getElementById('hipicas-foot-recaudacion').textContent = formatMoneyHipicas(totalRecaudacion);
  document.getElementById('hipicas-foot-cancelaciones').textContent = formatMoneyHipicas(totalCancelaciones);
  document.getElementById('hipicas-foot-devoluciones').textContent = formatMoneyHipicas(totalDevoluciones);
  document.getElementById('hipicas-foot-premios').textContent = formatMoneyHipicas(totalPremios);

  // Info de procesamiento
  if (datos.lineasProcesadas || datos.insertados !== undefined) {
    const infoHtml = `
      <div style="margin-top: 1rem; padding: 0.75rem; background: var(--bg-input); border-radius: 8px; font-size: 0.85rem; color: var(--text-muted);">
        <i class="fas fa-info-circle"></i>
        Líneas procesadas: ${datos.lineasProcesadas || 0} |
        Ignoradas: ${datos.lineasIgnoradas || 0} |
        Nuevos: ${datos.insertados || 0} |
        Actualizados: ${datos.actualizados || 0}
        ${datos.errores ? `<br><span style="color: var(--danger);"><i class="fas fa-exclamation-triangle"></i> Errores: ${datos.errores.join(', ')}</span>` : ''}
      </div>
    `;
    const existingInfo = resultadosCard.querySelector('.procesamiento-info');
    if (existingInfo) existingInfo.remove();

    const infoDiv = document.createElement('div');
    infoDiv.className = 'procesamiento-info';
    infoDiv.innerHTML = infoHtml;
    resultadosCard.querySelector('.card-body').appendChild(infoDiv);
  }
}

function formatMoneyHipicas(amount) {
  return '$' + Number(amount || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function cargarHistorialHipicas() {
  const fecha = document.getElementById('hipicas-filtro-fecha')?.value || '';
  const hipodromo = document.getElementById('hipicas-filtro-hipodromo')?.value || '';
  const tbody = document.getElementById('hipicas-tabla-historial');

  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 2rem;"><i class="fas fa-spinner fa-spin"></i> Cargando...</td></tr>';

  try {
    const params = {};
    if (fecha) params.fecha = fecha;
    if (hipodromo) params.hipodromo = hipodromo;

    const response = await juegosOfflineAPI.hipicas.obtenerFacturacion(params);

    if (!response.success || !response.data?.registros?.length) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 2rem; color: var(--text-muted);"><i class="fas fa-inbox"></i> No hay registros</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    response.data.registros.forEach(reg => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${reg.fecha_sorteo ? reg.fecha_sorteo.substring(0, 10) : '-'}</td>
        <td>${reg.sorteo || '-'}</td>
        <td>${reg.hipodromo_nombre || '-'}</td>
        <td>${reg.agency || '-'}</td>
        <td style="text-align: right;">${formatMoneyHipicas(reg.recaudacion_total)}</td>
        <td style="text-align: right;">${formatMoneyHipicas(reg.importe_cancelaciones)}</td>
        <td style="text-align: right;">${formatMoneyHipicas(reg.devoluciones)}</td>
        <td style="text-align: right;">${formatMoneyHipicas(reg.total_premios)}</td>
        <td>
          <button class="btn btn-sm" style="background: var(--danger); color: white; padding: 0.25rem 0.5rem; font-size: 0.75rem;"
                  onclick="eliminarRegistroHipicas(${reg.id})" title="Eliminar">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (error) {
    console.error('Error cargando historial hipicas:', error);
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 2rem; color: var(--danger);"><i class="fas fa-exclamation-triangle"></i> Error: ${error.message}</td></tr>`;
  }
}

async function eliminarRegistroHipicas(id) {
  if (!confirm('¿Estás seguro de eliminar este registro?')) return;

  try {
    const response = await juegosOfflineAPI.hipicas.eliminarFacturacion(id);
    if (response.success) {
      showToast('Registro eliminado', 'success');
      cargarHistorialHipicas();
    }
  } catch (error) {
    showToast('Error eliminando: ' + error.message, 'error');
  }
}

function exportarHipicasExcel() {
  const tabla = document.getElementById('hipicas-tabla-resultados');
  if (!tabla) return;

  const rows = tabla.querySelectorAll('tbody tr');
  if (rows.length === 0) {
    showToast('No hay datos para exportar', 'warning');
    return;
  }

  const headers = ['Sorteo', 'Hipódromo', 'Reunión', 'Agencia', 'Recaudación', 'Cancelaciones', 'Devoluciones', 'Premios'];
  const csvRows = [headers.join(',')];

  rows.forEach(row => {
    const cells = row.querySelectorAll('td');
    const rowData = Array.from(cells).map(cell => {
      let val = cell.textContent.trim().replace(/\$/g, '').replace(/,/g, '');
      if (val.includes(' ')) val = `"${val}"`;
      return val;
    });
    csvRows.push(rowData.join(','));
  });

  const csvContent = csvRows.join('\n');
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `hipicas_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();

  URL.revokeObjectURL(url);
  showToast('Archivo CSV descargado', 'success');
}

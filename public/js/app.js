// Control de Loterías - App Principal

let currentUser = null;
let juegos = [];
let sorteos = [];
let provincias = [];

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  setupEventListeners();
});

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
  
  // Cargar datos base (cuando tengamos los endpoints)
  // await cargarDatosBase();
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
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.remove('hidden');
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
  
  showToast('Procesando archivo...', 'info');
  
  try {
    const response = await controlPrevioAPI.procesarQuiniela(cpArchivoSeleccionado);
    cpResultadosActuales = response.data;
    
    // NUEVO: Guardar los registros parseados del TXT para Control Posterior
    cpRegistrosNTF = response.data.registrosNTF || [];
    console.log(`Control Previo: ${cpRegistrosNTF.length} registros parseados del TXT`);
    
    mostrarResultadosCP(response.data);
    showToast('Archivo procesado correctamente', 'success');
  } catch (error) {
    console.error('Error:', error);
    showToast(error.message || 'Error procesando archivo', 'error');
  }
}

function mostrarResultadosCP(data) {
  const calc = data.datosCalculados;
  const oficial = data.datosOficiales;
  
  // Mostrar sección de resultados
  document.getElementById('cp-resultados').classList.remove('hidden');
  
  // Resumen principal
  document.getElementById('cp-registros').textContent = formatNumber(calc.registros);
  document.getElementById('cp-apuestas').textContent = formatNumber(calc.apuestasTotal);
  // Recaudación sin decimales
  document.getElementById('cp-recaudacion').textContent = '$' + formatNumber(Math.round(calc.recaudacion));
  document.getElementById('cp-anulados').textContent = formatNumber(calc.registrosAnulados);
  
  // Recaudación anulada (si existe el elemento)
  const recAnuladaEl = document.getElementById('cp-recaudacion-anulada');
  if (recAnuladaEl) {
    recAnuladaEl.textContent = '$' + formatNumber(calc.recaudacionAnulada || 0);
  }
  
  // Badge de sorteo
  document.getElementById('cp-sorteo-badge').textContent = `Sorteo: ${calc.numeroSorteo}`;
  
  // Tabla de recaudación por provincia
  const tbodyRecProv = document.querySelector('#cp-tabla-recaudacion-prov tbody');
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
  
  // Tabla de provincias
  const tbody = document.querySelector('#cp-tabla-provincias tbody');
  tbody.innerHTML = '';
  
  const totalApuestas = calc.apuestasTotal || 1;
  for (const [codigo, prov] of Object.entries(calc.provincias)) {
    if (prov.apuestas > 0) {
      const porcentaje = ((prov.apuestas / totalApuestas) * 100).toFixed(2);
      tbody.innerHTML += `
        <tr>
          <td><strong>${prov.nombre}</strong> (${codigo})</td>
          <td>${formatNumber(prov.apuestas)}</td>
          <td>${porcentaje}%</td>
        </tr>
      `;
    }
  }
  
  // Comparación con XML
  const tbodyComp = document.getElementById('cp-tabla-comparacion');
  tbodyComp.innerHTML = '';
  
  if (oficial) {
    const comparaciones = [
      { concepto: 'Registros Válidos', calc: calc.registros, oficial: oficial.registrosValidos },
      { concepto: 'Registros Anulados', calc: calc.registrosAnulados, oficial: oficial.registrosAnulados },
      { concepto: 'Apuestas en Sorteo', calc: calc.apuestasTotal, oficial: oficial.apuestasEnSorteo },
      { concepto: 'Recaudación Bruta', calc: calc.recaudacion, oficial: oficial.recaudacionBruta, esMonto: true }
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
  } else {
    tbodyComp.innerHTML = '<tr><td colspan="4" class="text-muted">No se encontró archivo XML de control previo</td></tr>';
    document.getElementById('cp-verificacion-badge').innerHTML = 
      '<span class="badge badge-warning">Sin XML</span>';
  }
  
  // Verificación de seguridad
  const seg = data.seguridad;
  const segContent = document.getElementById('cp-seguridad-content');
  segContent.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
      <div class="file-item">
        <span><i class="fas ${seg.archivos.txt ? 'fa-check-circle text-success' : 'fa-times-circle text-danger'}"></i> Archivo TXT</span>
      </div>
      <div class="file-item">
        <span><i class="fas ${seg.archivos.xml ? 'fa-check-circle text-success' : 'fa-times-circle text-danger'}"></i> Archivo XML</span>
      </div>
      <div class="file-item">
        <span><i class="fas ${seg.archivos.hash ? 'fa-check-circle text-success' : 'fa-times-circle text-danger'}"></i> Hash TXT</span>
      </div>
      <div class="file-item">
        <span><i class="fas ${seg.archivos.hashCP ? 'fa-check-circle text-success' : 'fa-times-circle text-danger'}"></i> Hash CP</span>
      </div>
      <div class="file-item">
        <span><i class="fas ${seg.archivos.pdf ? 'fa-check-circle text-success' : 'fa-times-circle text-danger'}"></i> PDF Seguridad</span>
      </div>
      <div class="file-item">
        <span><i class="fas ${seg.verificado ? 'fa-check-circle text-success' : (seg.verificado === false ? 'fa-times-circle text-danger' : 'fa-question-circle text-warning')}"></i> 
        Hash ${seg.verificado ? 'Verificado' : (seg.verificado === false ? 'NO Coincide' : 'No verificable')}</span>
      </div>
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
      agenciasAmigasDiv.classList.add('hidden');
      agenciasAmigasDiv.innerHTML = '';
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
  
  // Online
  document.getElementById('cp-online-registros').textContent = formatNumber(calc.online.registros);
  document.getElementById('cp-online-apuestas').textContent = formatNumber(calc.online.apuestas);
  document.getElementById('cp-online-recaudacion').textContent = '$' + formatNumber(calc.online.recaudacion);
  document.getElementById('cp-online-anulados').textContent = formatNumber(calc.online.anulados);
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
  
  try {
    const calc = cpResultadosActuales.datosCalculados;
    await controlPrevioAPI.guardarQuiniela({
      numeroSorteo: calc.numeroSorteo,
      registros: calc.registros,
      apuestas: calc.apuestasTotal,
      recaudacion: calc.recaudacion,
      provincias: calc.provincias,
      datosXml: cpResultadosActuales.datosOficiales
    });
    showToast('Datos guardados correctamente', 'success');
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

function formatNumber(num) {
  return (num || 0).toLocaleString('es-AR');
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
    const response = await fetch('/api/actas/control-previo/generar', {
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
  
  // Mostrar extractos cargados
  renderExtractosList();
}

function cargarDatosControlPrevio() {
  if (!cpResultadosActuales) {
    showToast('No hay datos de Control Previo. Procese un archivo primero.', 'warning');
    return;
  }
  
  // Usar los datos del control previo
  cpstDatosControlPrevio = cpResultadosActuales.datosCalculados;
  cpstNumeroSorteo = cpstDatosControlPrevio.numeroSorteo;
  
  // Detectar modalidad predominante del sorteo
  cpstModalidadSorteo = detectarModalidadSorteo(cpstDatosControlPrevio.tiposSorteo);
  
  // NUEVO: Cargar los registros parseados del TXT
  cpstRegistrosNTF = cpRegistrosNTF || [];
  
  // Mostrar datos cargados
  document.getElementById('cpst-datos-cargados').classList.remove('hidden');
  document.getElementById('cpst-sorteo').textContent = cpstNumeroSorteo;
  document.getElementById('cpst-registros').textContent = formatNumber(cpstDatosControlPrevio.registros);
  document.getElementById('cpst-recaudacion').textContent = '$' + formatNumber(cpstDatosControlPrevio.recaudacion);
  
  // Mostrar modalidad detectada
  const modalidadNombre = MODALIDADES_NOMBRE[cpstModalidadSorteo] || cpstModalidadSorteo;
  const modalidadEl = document.getElementById('cpst-modalidad');
  if (modalidadEl) {
    modalidadEl.textContent = modalidadNombre;
  }
  
  // Mostrar cuántos registros reales hay
  const cantRegistros = cpstRegistrosNTF.length;
  showToast(`Datos cargados: ${formatNumber(cantRegistros)} líneas. Modalidad: ${modalidadNombre}. Al cargar XMLs solo se procesarán los de esta modalidad.`, 'success');
}

// Detectar la modalidad predominante del sorteo
function detectarModalidadSorteo(tiposSorteo) {
  if (!tiposSorteo || Object.keys(tiposSorteo).length === 0) {
    return '';
  }
  
  // Encontrar la modalidad con más apuestas
  let maxApuestas = 0;
  let modalidadPrincipal = '';
  
  for (const [modalidad, datos] of Object.entries(tiposSorteo)) {
    if (datos.apuestas > maxApuestas) {
      maxApuestas = datos.apuestas;
      modalidadPrincipal = modalidad;
    }
  }
  
  return modalidadPrincipal;
}

async function cargarZipPosterior(input) {
  if (!input.files.length) return;
  
  const file = input.files[0];
  showToast('Procesando archivo ZIP...', 'info');
  
  try {
    const token = getToken();
    const formData = new FormData();
    formData.append('archivo', file);
    
    const response = await fetch('/api/control-previo/quiniela/procesar', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.message);
    
    cpResultadosActuales = data.data;
    
    // NUEVO: Guardar los registros parseados del TXT
    cpRegistrosNTF = data.data.registrosNTF || [];
    console.log(`ZIP cargado: ${cpRegistrosNTF.length} registros parseados del TXT`);
    
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
    fechaFormateada: fecha ? `${fecha.slice(6,8)}/${fecha.slice(4,6)}/${fecha.slice(0,4)}` : ''
  };
}

// Cargar desde archivo(s) XML - soporta múltiples archivos con filtrado por modalidad
function cargarExtractoXML(input) {
  if (!input.files.length) return;
  
  const files = Array.from(input.files);
  
  // SIEMPRE usar procesarMultiplesXML para filtrar por modalidad
  procesarMultiplesXML(files);
}

// Procesar múltiples archivos XML
async function procesarMultiplesXML(files) {
  const archivosInfo = [];
  const modalidades = {};
  
  // Primero analizar todos los nombres
  for (const file of files) {
    const info = parsearNombreArchivoXML(file.name);
    if (info) {
      archivosInfo.push({ file, info });
      
      // Agrupar por modalidad
      if (!modalidades[info.modalidad]) {
        modalidades[info.modalidad] = [];
      }
      modalidades[info.modalidad].push({ file, info });
    } else {
      console.warn(`Archivo no reconocido: ${file.name}`);
    }
  }
  
  if (archivosInfo.length === 0) {
    showToast('No se reconocieron archivos XML válidos', 'warning');
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
  
  // Procesar cada archivo
  let procesados = 0;
  let errores = 0;
  
  for (const { file, info } of archivosModalidad) {
    try {
      const contenido = await leerArchivoComoTexto(file);
      const resultado = extraerDatosXML(contenido);
      
      if (resultado) {
        // Agregar extracto con la provincia correcta
        cpstExtractos.push({
          index: info.provincia.index,
          nombre: info.provincia.nombre,
          numeros: resultado.numeros,
          letras: resultado.letras
        });
        procesados++;
      } else {
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

// Extraer datos del XML (números y letras)
function extraerDatosXML(xmlString) {
  try {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlString, 'text/xml');
    
    const parseError = xml.querySelector('parsererror');
    if (parseError) return null;
    
    let numeros = [];
    let letras = [];
    
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
      
      const letrasNode = suerteNode.querySelector('Letras');
      if (letrasNode) {
        const letrasTexto = letrasNode.textContent.trim();
        letras = letrasTexto.split(/\s+/).filter(l => l.length === 1);
      }
    }
    
    // Formato alternativo
    if (numeros.filter(n => n).length === 0) {
      for (let i = 1; i <= 20; i++) {
        const node = xml.querySelector(`posicion${i}, pos${i}, n${i}, N${i.toString().padStart(2,'0')}`);
        if (node) {
          numeros[i - 1] = node.textContent.trim();
        }
      }
    }
    
    if (numeros.filter(n => n).length === 0) return null;
    
    return { numeros, letras };
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

// Cargar desde imagen (OCR)
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
  mensaje.textContent = 'Cargando motor OCR...';
  progress.style.width = '10%';
  
  try {
    // Cargar Tesseract.js dinámicamente si no está cargado
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
    
    // Extraer números del texto reconocido
    const texto = result.data.text;
    const numeros = extraerNumerosDeTexto(texto);
    const letras = extraerLetrasDeTexto(texto);
    
    progress.style.width = '100%';
    
    if (numeros.length > 0) {
      llenarInputsExtracto(numeros, letras);
      showToast(`OCR completado: ${numeros.length} números detectados`, 'success');
    } else {
      showToast('No se detectaron números. Intente con mejor calidad de imagen.', 'warning');
    }
    
    setTimeout(() => status.classList.add('hidden'), 2000);
    
  } catch (error) {
    console.error('Error OCR:', error);
    showToast('Error procesando imagen con OCR', 'error');
    status.classList.add('hidden');
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

// Cargar desde PDF
async function cargarExtractoPDF(input) {
  if (!input.files.length) return;
  
  const file = input.files[0];
  const status = document.getElementById('cpst-pdf-status');
  status.classList.remove('hidden');
  
  try {
    // Enviar al servidor para procesar
    const formData = new FormData();
    formData.append('archivo', file);
    
    const token = getToken();
    const response = await fetch('/api/control-posterior/quiniela/procesar-pdf', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    
    const data = await response.json();
    
    if (data.success && data.data) {
      llenarInputsExtracto(data.data.numeros, data.data.letras);
      showToast('Extracto extraído del PDF', 'success');
    } else {
      // Fallback: usar OCR en la primera página
      showToast('Intentando OCR en el PDF...', 'info');
      await procesarPDFconOCR(file);
    }
    
  } catch (error) {
    console.error('Error PDF:', error);
    showToast('Error procesando PDF', 'error');
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

function agregarExtracto() {
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
    showToast('Ingrese al menos algunos números del extracto', 'warning');
    return;
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
  const container = document.getElementById('cpst-extractos-lista');
  if (!container) return;
  
  if (cpstExtractos.length === 0) {
    container.innerHTML = '<p class="text-muted">No hay extractos cargados</p>';
    return;
  }
  
  // Contenedor grid para los extractos
  let html = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1rem;">';
  
  html += cpstExtractos.map((ex, idx) => {
    const nums = ex.numeros || [];
    const letras = ex.letras || [];
    
    // Números en formato compacto: 2 filas de 10
    let numerosHTML = `
      <table style="width: 100%; font-family: monospace; font-size: 0.7rem; border-collapse: collapse; margin-top: 0.5rem;">
        <tr style="color: var(--text-muted); font-size: 0.6rem;">
          ${[1,2,3,4,5,6,7,8,9,10].map(n => `<td style="text-align: center; padding: 1px;">${n}</td>`).join('')}
        </tr>
        <tr style="background: var(--surface-hover);">
          ${nums.slice(0, 10).map(n => `<td style="text-align: center; padding: 2px; font-weight: bold;">${n || '-'}</td>`).join('')}
        </tr>
        <tr style="color: var(--text-muted); font-size: 0.6rem;">
          ${[11,12,13,14,15,16,17,18,19,20].map(n => `<td style="text-align: center; padding: 1px;">${n}</td>`).join('')}
        </tr>
        <tr style="background: var(--bg-input);">
          ${nums.slice(10, 20).map(n => `<td style="text-align: center; padding: 2px; font-weight: bold;">${n || '-'}</td>`).join('')}
        </tr>
      </table>
    `;
    
    // Letras
    let letrasHTML = '';
    if (letras.length > 0 && letras.some(l => l)) {
      letrasHTML = `<div style="margin-top: 0.3rem; text-align: right; font-size: 0.75rem;">
        Letras: <strong style="font-family: monospace; background: var(--primary); color: white; padding: 2px 6px; border-radius: 4px;">${letras.join(' ')}</strong>
      </div>`;
    }
    
    return `
      <div style="padding: 0.5rem; background: var(--surface); border-radius: 8px; border: 1px solid var(--border);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
          <strong style="color: var(--primary); font-size: 0.85rem;">${ex.nombre}</strong>
          <button class="btn btn-sm" style="padding: 2px 6px; background: var(--danger); color: white; border: none; border-radius: 4px; cursor: pointer;" onclick="eliminarExtracto(${idx})" title="Eliminar">✕</button>
        </div>
        ${numerosHTML}
        ${letrasHTML}
      </div>
    `;
  }).join('');
  
  html += '</div>';
  container.innerHTML = html;
}

function eliminarExtracto(idx) {
  cpstExtractos.splice(idx, 1);
  renderExtractosList();
}

async function ejecutarEscrutinio() {
  if (cpstExtractos.length === 0) {
    showToast('Cargue al menos un extracto', 'warning');
    return;
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
  
  showToast(`Ejecutando escrutinio: ${formatNumber(cpstRegistrosNTF.length)} válidos + ${formatNumber(registrosAnulados)} anulados...`, 'info');
  
  try {
    const token = getToken();
    const response = await fetch('/api/control-posterior/quiniela/escrutinio', {
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
    
  } catch (error) {
    console.error('Error:', error);
    showToast(error.message || 'Error ejecutando escrutinio', 'error');
  }
}

// La función generarRegistrosSimulados fue removida
// Ahora se usan los registros reales parseados del archivo TXT (cpstRegistrosNTF)

function mostrarResultadosEscrutinio(resultado) {
  document.getElementById('cpst-resultados').classList.remove('hidden');
  
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
    
    // Registros: comparar solo válidos
    tbody.innerHTML += `
      <tr>
        <td>Registros (válidos)</td>
        <td>${formatNumber(reg.controlPrevio)}</td>
        <td>${formatNumber(reg.controlPosterior)}</td>
        <td class="${reg.coincide ? 'text-success' : 'text-danger'}">${reg.coincide ? '✓ OK' : '✗ DIFERENCIA'}</td>
      </tr>
    `;
    
    // Mostrar anulados como fila informativa si existen
    if (reg.anulados > 0) {
      tbody.innerHTML += `
        <tr style="background: var(--surface-hover);">
          <td><small class="text-muted">↳ Anulados (no escrutados)</small></td>
          <td><small class="text-muted">-</small></td>
          <td><small class="text-muted">${formatNumber(reg.anulados)}</small></td>
          <td><small class="text-muted">info</small></td>
        </tr>
      `;
    }
    
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
}

async function descargarExcel() {
  if (!cpstResultados) {
    showToast('Ejecute el escrutinio primero', 'warning');
    return;
  }
  
  showToast('Generando Excel...', 'info');
  
  try {
    const token = getToken();
    const response = await fetch('/api/control-posterior/quiniela/excel', {
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
  if (!cpstResultados) {
    showToast('Ejecute el escrutinio primero', 'warning');
    return;
  }
  
  showToast('Generando PDF...', 'info');
  
  try {
    const token = getToken();
    const response = await fetch('/api/control-posterior/quiniela/pdf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        resultado: cpstResultados,
        numeroSorteo: cpstNumeroSorteo,
        modalidad: cpstModalidadSorteo,
        comparacion: cpstResultados.comparacion,
        datosControlPrevio: cpstDatosControlPrevio,
        extractos: cpstExtractos
      })
    });
    
    if (!response.ok) throw new Error('Error generando PDF');
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => window.URL.revokeObjectURL(url), 30000);
    
    showToast('PDF generado', 'success');
  } catch (error) {
    showToast(error.message || 'Error generando PDF', 'error');
  }
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
    const response = await fetch('/api/actas/notarial/generar', {
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

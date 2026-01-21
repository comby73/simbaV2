// Control de Loterías - App Principal

let currentUser = null;
let juegos = [];
let sorteos = [];
let provincias = [];

const PREFIJOS_JUEGOS = {
  'QNL': { nombre: 'Quiniela', api: 'procesarQuiniela' },
  'PCD': { nombre: 'Poceada', api: 'procesarPoceada' }
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
  
  const juegoConfig = detectarTipoJuego(cpArchivoSeleccionado.name);
  if (!juegoConfig) {
    showToast('No se pudo detectar el tipo de juego (Prefijos: QNL, PCD)', 'error');
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
      document.getElementById('cp-pozo-arrastre').textContent = '$' + formatNumber(data.pozoArrastre || 0);
    } else {
      pcdEspecífico.classList.add('hidden');
    }
  }

  // Resumen principal
  document.getElementById('cp-registros').textContent = formatNumber(calc.registros);
  document.getElementById('cp-apuestas').textContent = formatNumber(calc.apuestasTotal || calc.apuestas);
  // Recaudación sin decimales
  document.getElementById('cp-recaudacion').textContent = '$' + formatNumber(Math.round(calc.recaudacion));
  document.getElementById('cp-anulados').textContent = formatNumber(calc.anulados || calc.registrosAnulados);
  
  // Recaudación anulada (si existe el elemento)
  const recAnuladaEl = document.getElementById('cp-recaudacion-anulada');
  if (recAnuladaEl) {
    recAnuladaEl.textContent = '$' + formatNumber(calc.recaudacionAnulada || 0);
  }
  
  // Badge de sorteo
  document.getElementById('cp-sorteo-badge').textContent = `Sorteo: ${data.sorteo || calc.numeroSorteo}`;
  
  // Tablas
  if (isPoceada) {
    renderTablasPoceada(data);
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
      const comparaciones = [
        { concepto: 'Registros Válidos', calc: comp.registros?.calculado || 0, oficial: comp.registros?.oficial || 0, diff: comp.registros?.diferencia || 0 },
        { concepto: 'Registros Anulados', calc: comp.anulados?.calculado || 0, oficial: comp.anulados?.oficial || 0, diff: comp.anulados?.diferencia || 0 },
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
      const comparaciones = isPoceada ? [
        { concepto: 'Registros Válidos', calc: calc.registros || 0, oficial: oficial.registrosValidos || 0 },
        { concepto: 'Registros Anulados', calc: calc.anulados || 0, oficial: oficial.registrosAnulados || 0 },
        { concepto: 'Apuestas en Sorteo', calc: calc.apuestasTotal || 0, oficial: oficial.apuestas || 0 },
        { concepto: 'Recaudación Bruta', calc: calc.recaudacion || 0, oficial: oficial.recaudacion || 0, esMonto: true }
      ] : [
        { concepto: 'Registros Válidos', calc: calc.registros || 0, oficial: oficial.registrosValidos || 0 },
        { concepto: 'Registros Anulados', calc: calc.registrosAnulados || 0, oficial: oficial.registrosAnulados || 0 },
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

function corregirPozoManualmente() {
  const actual = document.getElementById('cp-pozo-arrastre').textContent.replace('$', '').replace(/\./g, '').replace(',', '.').trim();
  const nuevo = prompt('Ingrese el monto del pozo de arrastre:', actual);
  if (nuevo !== null) {
    const monto = parseFloat(nuevo.replace(',', '.'));
    if (!isNaN(monto)) {
      document.getElementById('cp-pozo-arrastre').textContent = '$' + formatNumber(monto);
      cpResultadosActuales.pozoArrastre = monto;
      showToast('Pozo de arrastre actualizado localmente', 'success');
    }
  }
}

function formatNumber(num) {
  return (num || 0).toLocaleString('es-AR');
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
    const response = await fetch(`${API_BASE}/actas/control-posterior/generar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        tipoJuego: cpstJuegoSeleccionado,
        numeroSorteo: cpstResultados.numeroSorteo || 'S/N',
        fechaSorteo: cpstResultados.fechaSorteo || '',
        resultado: cpstResultados
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
  cpstJuegoSeleccionado = juego;
  
  // Actualizar título
  const titulo = document.getElementById('cpst-titulo');
  const subtitulo = document.getElementById('cpst-subtitulo');
  if (titulo) titulo.textContent = `Control Posterior - ${juego}`;
  if (subtitulo) {
    subtitulo.textContent = juego === 'Poceada' 
      ? 'Escrutinio de ganadores por aciertos (6, 7 u 8)'
      : 'Análisis de ganadores post-sorteo';
  }
  
  // Actualizar estilos de las tarjetas de radio
  document.querySelectorAll('input[name="cpst-juego"]').forEach(radio => {
    const card = radio.closest('.radio-card');
    if (card) {
      if (radio.value === juego) {
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
    extractoQuiniela?.classList.add('hidden');
    extractoPoceada?.classList.remove('hidden');
    detalleQuiniela?.classList.add('hidden');
    detallePoceada?.classList.remove('hidden');
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
  
  // Mostrar extractos cargados
  renderExtractosList();
}

function cargarDatosControlPrevio() {
  if (!cpResultadosActuales) {
    showToast('No hay datos de Control Previo. Procese un archivo primero.', 'warning');
    return;
  }
  
  // Detectar tipo de juego y seleccionar automáticamente
  const tipoJuegoDetectado = cpResultadosActuales.tipoJuego || 'Quiniela';
  if (tipoJuegoDetectado === 'Poceada') {
    seleccionarJuegoPosterior('Poceada');
  } else {
    seleccionarJuegoPosterior('Quiniela');
  }
  
  // Usar los datos del control previo - INCLUIR datosOficiales para los premios
  cpstDatosControlPrevio = {
    ...(cpResultadosActuales.datosCalculados || cpResultadosActuales.resumen || {}),
    datosOficiales: cpResultadosActuales.datosOficiales || null,
    comparacion: cpResultadosActuales.comparacion || null
  };
  cpstNumeroSorteo = cpstDatosControlPrevio.numeroSorteo || cpResultadosActuales.sorteo?.numero || '';
  
  // Tomar modalidad SOLO de la programación (basado en número de sorteo)
  // NO usar el código del NTF (SR, etc.) - la programación ya tiene la modalidad correcta
  const modalidadProgramacion = cpResultadosActuales.sorteo?.modalidad?.codigo;
  if (modalidadProgramacion) {
    cpstModalidadSorteo = modalidadProgramacion;
    console.log(`Modalidad desde programación (sorteo ${cpstNumeroSorteo}): ${modalidadProgramacion} (${cpResultadosActuales.sorteo?.modalidad?.nombre})`);
  } else {
    // Sin programación cargada - no se puede filtrar automáticamente
    cpstModalidadSorteo = '';
    console.warn(`⚠️ Sorteo ${cpstNumeroSorteo} no encontrado en programación. Cargue la programación primero.`);
  }
  
  // Cargar los registros parseados del TXT
  cpstRegistrosNTF = cpRegistrosNTF || cpResultadosActuales.registrosNTF || [];
  
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
  
  // Mostrar cuántos registros reales hay
  const cantRegistros = cpstRegistrosNTF.length;
  showToast(`Datos cargados: ${formatNumber(cantRegistros)} registros. Juego: ${cpstJuegoSeleccionado}. Al ejecutar escrutinio se procesarán solo registros de este juego.`, 'success');
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
    showToast('No se pudo detectar el tipo de juego. El nombre debe empezar con QNL (Quiniela) o PCD (Poceada)', 'error');
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
    const endpoint = juegoConfig.nombre === 'Poceada' 
      ? `${API_BASE}/control-previo/poceada/procesar`
      : `${API_BASE}/control-previo/quiniela/procesar`;
    
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
  // Validaciones según el juego
  if (cpstJuegoSeleccionado === 'Quiniela') {
    if (cpstExtractos.length === 0) {
      showToast('Cargue al menos un extracto', 'warning');
      return;
    }
  } else if (cpstJuegoSeleccionado === 'Poceada') {
    if (!cpstExtractoPoceada || cpstExtractoPoceada.numeros.length < 20 || cpstExtractoPoceada.letras.length < 4) {
      showToast('Cargue el extracto de Poceada (20 números del sorteo + 4 letras)', 'warning');
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
      
    } else {
      // Ejecutar escrutinio de Quiniela (código existente)
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
    
    tbody.innerHTML += `
      <tr>
        <td>Registros (válidos)</td>
        <td>${formatNumber(reg.controlPrevio)}</td>
        <td>${formatNumber(reg.controlPosterior)}</td>
        <td class="${reg.coincide ? 'text-success' : 'text-danger'}">${reg.coincide ? '✓ OK' : '✗ DIFERENCIA'}</td>
      </tr>
    `;
    
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
}

// La función generarRegistrosSimulados fue removida
// Ahora se usan los registros reales parseados del archivo TXT (cpstRegistrosNTF)

function mostrarResultadosEscrutinio(resultado) {
  document.getElementById('cpst-resultados').classList.remove('hidden');
  
  // Mostrar tabla de Quiniela, ocultar tabla de Poceada
  document.getElementById('cpst-detalle-quiniela')?.classList.remove('hidden');
  document.getElementById('cpst-detalle-poceada')?.classList.add('hidden');
  
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

async function buscarProgramacion() {
  const mes = document.getElementById('programacion-filtro-mes')?.value;
  const modalidad = document.getElementById('programacion-filtro-modalidad')?.value;
  
  try {
    const params = new URLSearchParams();
    params.append('juego', 'Quiniela');
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
    tbody.innerHTML = '<tr><td colspan="11" class="text-center text-muted">No hay sorteos cargados para este período</td></tr>';
    return;
  }
  
  tbody.innerHTML = sorteos.map(s => `
    <tr>
      <td><strong>${s.numero_sorteo}</strong></td>
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
      
      // Acciones según estado
      let acciones = '';
      if (s.estado === 'pendiente') {
        acciones = `<button class="btn btn-sm btn-primary" onclick="irAControlPrevio('${s.numero_sorteo}')" title="Cargar Control Previo">
          <i class="fas fa-clipboard-check"></i>
        </button>`;
      } else if (s.estado === 'control_previo') {
        acciones = `<button class="btn btn-sm btn-success" onclick="irAControlPosterior('${s.numero_sorteo}')" title="Ejecutar Escrutinio">
          <i class="fas fa-calculator"></i>
        </button>`;
      } else {
        acciones = `<button class="btn btn-sm btn-secondary" onclick="verDetallesSorteo('${s.numero_sorteo}')" title="Ver Detalles">
          <i class="fas fa-eye"></i>
        </button>`;
      }
      
      return `
        <tr>
          <td><strong>${s.numero_sorteo}</strong></td>
          <td>${s.juego}</td>
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

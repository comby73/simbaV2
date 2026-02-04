// Detectar el entorno: producción, Apache local (XAMPP), Node.js directo, o archivo
const isFile = window.location.protocol === 'file:' || window.location.protocol === 'null:';
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.startsWith('192.168.') || window.location.hostname.startsWith('10.');
const isProduction = !isLocal;
const isApache = (window.location.port === '' || window.location.port === '80') && !isFile && isLocal;

// Configurar API_BASE según el entorno:
const API_BASE = isFile ? 'http://localhost/simbaV2/public/api' : (isProduction ? '/api' : (isApache ? '/simbaV2/public/api' : '/api'));

console.log(`[SIMBA] Entorno detectado: ${isProduction ? 'Producción' : 'Desarrollo'} | API_BASE: ${API_BASE}`);

const getToken = () => localStorage.getItem('cl_token');
const setToken = (token) => localStorage.setItem('cl_token', token);
const removeToken = () => localStorage.removeItem('cl_token');

const getUser = () => {
  const user = localStorage.getItem('cl_user');
  return user ? JSON.parse(user) : null;
};
const setUser = (user) => localStorage.setItem('cl_user', JSON.stringify(user));
const removeUser = () => localStorage.removeItem('cl_user');

async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const token = getToken();

  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers
    },
    ...options
  };

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 30000);
  config.signal = controller.signal;

  try {
    console.log(`[SIMBA] Solicitud API: ${url}`, options.body ? JSON.parse(options.body) : '');
    const response = await fetch(url, config);
    clearTimeout(id);

    const contentType = response.headers.get("content-type");
    let data;
    if (contentType && contentType.includes("application/json")) {
      data = await response.json();
    } else {
      const text = await response.text();
      data = { success: response.ok, message: text || 'Respuesta sin formato JSON' };
    }

    if (!response.ok) {
      if (response.status === 401) {
        console.warn('[SIMBA] Sesión expirada o no autorizada (401)');
        handleLogout();
      }
      throw new Error(data.message || `Error del servidor (${response.status})`);
    }

    return data;
  } catch (error) {
    clearTimeout(id);
    if (error.name === 'AbortError') throw new Error('Tiempo de espera agotado.');
    console.error('[SIMBA] Error en apiRequest:', error);
    throw error;
  }
}

function handleLogout() {
  removeToken();
  removeUser();
  window.location.reload();
}

// Auth API
const authAPI = {
  login: async (username, password) => {
    const response = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    if (response.success) {
      setToken(response.data.token);
      setUser(response.data.user);
    }
    return response;
  },
  getProfile: () => apiRequest('/auth/profile'),
  verify: () => apiRequest('/auth/verify'),
  changePassword: (currentPassword, newPassword) =>
    apiRequest('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword })
    })
};

// Control Previo API
const controlPrevioAPI = {
  procesarQuiniela: async (file) => {
    const formData = new FormData();
    formData.append('archivo', file);
    const token = getToken();
    const response = await fetch(`${API_BASE}/control-previo/quiniela/procesar`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Error procesando archivo');
    return data;
  },

  procesarPoceada: async (file) => {
    const formData = new FormData();
    formData.append('archivo', file);
    const token = getToken();
    const response = await fetch(`${API_BASE}/control-previo/poceada/procesar-zip`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Error procesando Poceada');
    return data;
  },

  procesarTombolina: async (file) => {
    const formData = new FormData();
    formData.append('archivo', file);
    const token = getToken();
    const response = await fetch(`${API_BASE}/control-previo/tombolina/procesar`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Error procesando Tombolina');
    return data;
  },

  guardarQuiniela: (datos) => apiRequest('/control-previo/quiniela/guardar', {
    method: 'POST',
    body: JSON.stringify(datos)
  }),

  guardarPoceada: (datos) => apiRequest('/control-previo/poceada/guardar-resultado', {
    method: 'POST',
    body: JSON.stringify({ data: datos })
  }),

  procesarLoto: async (file) => {
    const formData = new FormData();
    formData.append('archivo', file);
    const token = getToken();
    const response = await fetch(`${API_BASE}/control-previo/loto/procesar-zip`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Error procesando Loto');
    return data;
  },

  procesarLoto5: async (file) => {
    const formData = new FormData();
    formData.append('archivo', file);
    const token = getToken();
    const response = await fetch(`${API_BASE}/control-previo/loto5/procesar-zip`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Error procesando Loto 5');
    return data;
  },

  buscarPozoPoceada: (sorteo) => apiRequest(`/control-previo/poceada/buscar-pozo/${sorteo}`),

  getHistorial: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/control-previo/historial${query ? `?${query}` : ''}`);
  }
};

// Control Posterior API
const controlPosteriorAPI = {
  escrutinioQuiniela: (datos) => apiRequest('/control-posterior/quiniela/escrutinio', {
    method: 'POST',
    body: JSON.stringify(datos)
  }),

  escrutinioPoceada: (datos) => apiRequest('/control-posterior/poceada/escrutinio', {
    method: 'POST',
    body: JSON.stringify(datos)
  }),

  escrutinioTombolina: (datos) => apiRequest('/control-posterior/tombolina-escrutinio', {
    method: 'POST',
    body: JSON.stringify(datos)
  }),

  escrutinioLoto: (datos) => apiRequest('/control-posterior/loto/escrutinio', {
    method: 'POST',
    body: JSON.stringify(datos)
  }),

  escrutinioLoto5: (datos) => apiRequest('/control-posterior/loto5/escrutinio', {
    method: 'POST',
    body: JSON.stringify(datos)
  }),

  procesarXmlExtracto: async (file) => {
    const formData = new FormData();
    formData.append('archivo', file);
    const token = getToken();
    const response = await fetch(`${API_BASE}/control-posterior/quiniela/procesar-xml`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    return await response.json();
  }
};

// Agencias API
const agenciasAPI = {
  obtenerTodas: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/agencias${query ? `?${query}` : ''}`);
  },
  buscar: (numero) => apiRequest(`/agencias/buscar/${numero}`),
  cargarExcel: async (file, reemplazar = false) => {
    const formData = new FormData();
    formData.append('excel', file);
    formData.append('reemplazar', reemplazar);
    const token = getToken();
    const response = await fetch(`${API_BASE}/agencias/cargar-excel`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Error cargando Excel de agencias');
    return data;
  }
};

// Extractos API
const extractosAPI = {
  listar: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/extractos${query ? `?${query}` : ''}`);
  },
  guardarBulk: (extractos) => apiRequest('/extractos/bulk', {
    method: 'POST',
    body: JSON.stringify({ extractos })
  })
};

// Programación API
const programacionAPI = {
  verificarSorteo: (fecha, modalidad, juego = 'Quiniela') => {
    return apiRequest(`/programacion/verificar?fecha=${fecha}&modalidad=${modalidad}&juego=${juego}`);
  },
  getSorteosPorFecha: (fecha, juego) => {
    let url = `/programacion/fecha?fecha=${fecha}`;
    if (juego) url += `&juego=${juego}`;
    return apiRequest(url);
  },
  getSorteoPorNumero: (numero, juego) => {
    let url = `/programacion/sorteo/${numero}`;
    if (juego) url += `?juego=${juego}`;
    return apiRequest(url);
  }
};

// Juegos Offline API
const juegosOfflineAPI = {
  hipicas: {
    procesarTXT: async (file) => {
      const formData = new FormData();
      formData.append('archivo', file);
      const token = getToken();
      const response = await fetch(`${API_BASE}/juegos-offline/hipicas/procesar-txt`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Error procesando archivo TXT');
      return data;
    },

    obtenerFacturacion: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return apiRequest(`/juegos-offline/hipicas/facturacion${query ? `?${query}` : ''}`);
    },

    eliminarFacturacion: (id) => apiRequest(`/juegos-offline/hipicas/facturacion/${id}`, {
      method: 'DELETE'
    })
  }
};

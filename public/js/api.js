// API Client
// Detectar el entorno: producción, Apache local (XAMPP), Node.js directo, o archivo
const isFile = window.location.protocol === 'file:' || window.location.protocol === 'null:';
const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
const isApache = (window.location.port === '' || window.location.port === '80') && !isFile && !isProduction;

// Configurar API_BASE según el entorno:
// - Producción (Hostinger): /api
// - Apache local (XAMPP): /simbaV2/public/api  
// - Node.js directo: /api
// - Archivo local: http://localhost:3000/api
const API_BASE = isFile ? 'http://localhost:3000/api' : (isProduction ? '/api' : (isApache ? '/simbaV2/public/api' : '/api'));

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

  try {
    const response = await fetch(url, config);
    const data = await response.json();
    
    if (!response.ok) {
      if (response.status === 401) {
        handleLogout();
      }
      throw new Error(data.message || 'Error en la solicitud');
    }
    
    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
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

// Users API
const usersAPI = {
  getAll: () => apiRequest('/users'),
  getById: (id) => apiRequest(`/users/${id}`),
  getRoles: () => apiRequest('/users/roles'),
  
  create: (data) => apiRequest('/users', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  
  update: (id, data) => apiRequest(`/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  
  resetPassword: (id, newPassword) => apiRequest(`/users/${id}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ newPassword })
  })
};

function handleLogout() {
  removeToken();
  removeUser();
  window.location.reload();
}

// Control Previo API
const controlPrevioAPI = {
  procesarQuiniela: async (file) => {
    const formData = new FormData();
    formData.append('archivo', file);
    
    const token = getToken();
    const response = await fetch(`${API_BASE}/control-previo/quiniela/procesar`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });
    
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Error procesando archivo');
    }
    return data;
  },

  procesarPoceada: async (file) => {
    const formData = new FormData();
    formData.append('archivo', file);
    
    const token = getToken();
    const response = await fetch(`${API_BASE}/control-previo/poceada/procesar-zip`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });
    
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Error procesando Poceada');
    }
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
  cargarExcel: async (file, reemplazar = false) => {
    const formData = new FormData();
    formData.append('excel', file);
    formData.append('reemplazar', reemplazar);
    
    const token = getToken();
    const response = await fetch(`${API_BASE}/agencias/cargar-excel`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });
    
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Error cargando Excel');
    }
    return data;
  },
  
  obtenerTodas: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/agencias${query ? `?${query}` : ''}`);
  },
  
  buscar: (numero) => apiRequest(`/agencias/buscar/${numero}`)
};

// Extractos API
const extractosAPI = {
  listar: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/extractos${query ? `?${query}` : ''}`);
  },
  getById: (id) => apiRequest(`/extractos/${id}`),
  guardar: (data) => apiRequest('/extractos', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  guardarBulk: (extractos) => apiRequest('/extractos/bulk', {
    method: 'POST',
    body: JSON.stringify({ extractos })
  }),
  eliminar: (id) => apiRequest(`/extractos/${id}`, {
    method: 'DELETE'
  })
};

// API Client
// Detectar si estamos en Apache (puerto 80) o Node.js directo (puerto 3000)
const isApache = window.location.port === '' || window.location.port === '80';
const API_BASE = isApache ? '/simbaV2/public/api' : '/api';

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
  
  guardarQuiniela: (datos) => apiRequest('/control-previo/quiniela/guardar', {
    method: 'POST',
    body: JSON.stringify(datos)
  }),
  
  getHistorial: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/control-previo/historial${query ? `?${query}` : ''}`);
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

(function () {
  const scoringState = {
    initialized: false,
    loadedFromApi: false,
    loadError: '',
    activeTab: 'ranking',
    selectedAgencyId: null,
    agencies: [],
    filteredAgencies: [],
    summary: null,
    period: '',
    admin: {
      canEdit: false,
      datasets: [],
      historyPeriods: [],
      currentDataset: 'asesores',
      rows: [],
      filteredRows: [],
      selectedRowKey: null,
      isNew: false
    }
  };

  function getScoringUser() {
    const user = typeof getUser === 'function' ? getUser() : null;
    return user || {};
  }

  function canAccessScoring() {
    const user = getScoringUser();
    const username = String(user.username || '').toLowerCase();
    return user.rol === 'admin' || username === 'ogonzalez';
  }

  function canEditScoringConfig() {
    return getScoringUser().rol === 'admin';
  }

  async function initScoring() {
    if (!canAccessScoring()) {
      const container = document.getElementById('scoring-ranking-body');
      if (container) {
        container.innerHTML = '<tr><td colspan="9" class="scoring-empty-state">No tenes permisos para acceder a Scoring.</td></tr>';
      }
      return;
    }

    if (!scoringState.initialized) {
      bindScoringEvents();
      scoringState.initialized = true;
    }

    scoringState.admin.canEdit = canEditScoringConfig();
    await Promise.all([loadScoringData(), loadConfigSummary()]);
    renderScoring();
  }

  async function loadScoringData() {
    try {
      const params = {};
      if (scoringState.period) {
        params.periodo = scoringState.period;
      }
      const response = window.scoringAPI
        ? await window.scoringAPI.obtenerResumen(params)
        : await apiRequest(`/scoring-agencias/resumen${params.periodo ? `?periodo=${encodeURIComponent(params.periodo)}` : ''}`);
      if (response && response.success && response.data) {
        hydrateStateFromPayload(normalizeApiPayload(response.data, 'api'));
        scoringState.loadedFromApi = true;
        scoringState.loadError = '';
        setPeriodInputValue(scoringState.period);
        return;
      }
      throw new Error('La API de scoring no devolvio datos validos.');
    } catch (error) {
      scoringState.loadedFromApi = false;
      scoringState.loadError = error?.message || 'No se pudieron cargar los datos reales de scoring.';
    }

    hydrateStateFromPayload(buildEmptyPayload(scoringState.period || ''));
    setPeriodInputValue(scoringState.period);
  }

  async function loadConfigSummary() {
    if (!window.scoringAPI) {
      return;
    }

    try {
      const response = await window.scoringAPI.obtenerConfiguracion();
      if (response && response.success && response.data) {
        scoringState.admin.canEdit = !!response.data.puedeEditar;
        scoringState.admin.datasets = Array.isArray(response.data.datasets) ? response.data.datasets : [];
        scoringState.admin.historyPeriods = Array.isArray(response.data.periodosHistorial) ? response.data.periodosHistorial : [];
        if (!scoringState.period && response.data.periodoActual) {
          scoringState.period = response.data.periodoActual;
          setPeriodInputValue(scoringState.period);
        }
        if (!scoringState.admin.datasets.some(item => item.id === scoringState.admin.currentDataset)) {
          scoringState.admin.currentDataset = scoringState.admin.datasets[0]?.id || 'asesores';
        }
        await loadConfigDataset();
        return;
      }
    } catch (error) {
      updateConfigSummaryMessage(error.message || 'No se pudo cargar la configuracion de scoring');
    }

    scoringState.admin.datasets = [];
    scoringState.admin.historyPeriods = [];
    scoringState.admin.rows = [];
    scoringState.admin.filteredRows = [];
    scoringState.admin.selectedRowKey = null;
  }

  async function loadConfigDataset() {
    if (!window.scoringAPI || !scoringState.admin.currentDataset) {
      return;
    }

    try {
      const response = await window.scoringAPI.obtenerDataset(scoringState.admin.currentDataset, {
        limit: scoringState.admin.currentDataset === 'historial' ? 300 : 500
      });
      const rows = Array.isArray(response?.data?.rows) ? response.data.rows : [];
      scoringState.admin.rows = rows;
      scoringState.admin.filteredRows = rows.slice();
      if (!rows.some(row => row.__rowKey === scoringState.admin.selectedRowKey)) {
        scoringState.admin.selectedRowKey = rows[0]?.__rowKey || null;
        scoringState.admin.isNew = false;
      }
      updateConfigSummaryMessage();
    } catch (error) {
      scoringState.admin.rows = [];
      scoringState.admin.filteredRows = [];
      scoringState.admin.selectedRowKey = null;
      updateConfigSummaryMessage(error.message || 'No se pudo cargar el dataset seleccionado');
    }
  }

  function normalizeApiPayload(data, source) {
    const agencies = Array.isArray(data.ranking) ? data.ranking.map(item => ({
      id: String(item.ctaCte || item.agencia || item.id || ''),
      name: item.agenciaNombre || item.agencia || item.nombre || 'Agencia',
      advisor: item.asesor || 'Sin asesor',
      category: item.categoria || 'PLATA',
      categoryClass: categoryClass(item.categoria || 'PLATA'),
      score: Number(item.scoreFinal || item.score || 0),
      baseScore: Number(item.scoreBase || item.baseScore || item.scoreFinal || 0),
      movement: item.movilidad || 'Estable',
      probability: Number(item.probabilidadAscenso || item.probabilidad || 0),
      priority: normalizePriority(item.prioridad || 'MEDIA'),
      axis: item.ejeMayorImpacto || item.eje || 'VENTAS',
      clientCategory: item.categoriaCliente || 'Regular',
      clientCoefficient: Number(item.coefCliente || 1),
      ascentGap: Number(item.distAscenso || 0),
      descentMargin: Number(item.distDescenso || 0),
      impactLabel: item.impactoPotencial || item.mensajeImpacto || 'Sin simulacion disponible.',
      recommendation: item.recomendacion || item.accion || 'Sin recomendacion operativa.',
      factors: Array.isArray(item.factores) ? item.factores : []
    })) : [];

    const summary = data.kpis ? {
      averageScore: Number(data.kpis.scorePromedio || 0),
      scoreDelta: Number(data.kpis.variacion || 0),
      agenciesEvaluated: Number(data.kpis.agenciasEvaluadas || agencies.length),
      highPriority: Number(data.kpis.prioridadAlta || 0),
      upliftCandidates: Number(data.kpis.candidatasSubida || 0),
      topAdvisor: data.kpis.asesorTop || 'No definido',
      categories: Array.isArray(data.distribucionCategorias) ? data.distribucionCategorias.map(item => ({
        name: item.categoria,
        count: Number(item.cantidad || 0),
        colorClass: categoryClass(item.categoria)
      })) : [],
      priorities: buildSummaryPriorities(data, agencies),
      chips: buildSummaryChips(data, agencies)
    } : buildEmptyPayload(data.periodo?.clave || '').summary;

    return {
      source,
      period: data.periodo?.clave || data.periodo || '',
      summary,
      agencies
    };
  }

  function hydrateStateFromPayload(payload) {
    scoringState.period = payload.period;
    scoringState.summary = payload.summary;
    scoringState.agencies = payload.agencies.slice();
    scoringState.filteredAgencies = payload.agencies.slice();
    scoringState.selectedAgencyId = scoringState.selectedAgencyId || (payload.agencies[0] && payload.agencies[0].id);
  }

  function bindScoringEvents() {
    const search = document.getElementById('scoring-search');
    const filterCategory = document.getElementById('scoring-filter-category');
    const filterPriority = document.getElementById('scoring-filter-priority');
    const refreshBtn = document.getElementById('scoring-btn-refresh');
    const focusBtn = document.getElementById('scoring-btn-focus-top');
    const applyPeriodBtn = document.getElementById('scoring-btn-apply-period');
    const autoPeriodBtn = document.getElementById('scoring-btn-period-auto');
    const periodInput = document.getElementById('scoring-period-input');
    const configDataset = document.getElementById('scoring-config-dataset');
    const configSearch = document.getElementById('scoring-config-search');
    const configRefresh = document.getElementById('scoring-config-refresh');
    const configNew = document.getElementById('scoring-config-new');
    const configSave = document.getElementById('scoring-config-save');
    const configCancel = document.getElementById('scoring-config-cancel');
    const configDelete = document.getElementById('scoring-config-delete');
    const configSnapshot = document.getElementById('scoring-config-snapshot');
    const configForm = document.getElementById('scoring-config-form');

    if (search) search.addEventListener('input', applyFilters);
    if (filterCategory) filterCategory.addEventListener('change', applyFilters);
    if (filterPriority) filterPriority.addEventListener('change', applyFilters);

    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        await refreshScoringView(refreshBtn);
      });
    }

    if (applyPeriodBtn) {
      applyPeriodBtn.addEventListener('click', async () => {
        scoringState.period = String(periodInput?.value || '').trim().toUpperCase();
        await refreshScoringView(applyPeriodBtn);
      });
    }

    if (autoPeriodBtn) {
      autoPeriodBtn.addEventListener('click', async () => {
        scoringState.period = '';
        setPeriodInputValue('');
        await refreshScoringView(autoPeriodBtn);
      });
    }

    if (periodInput) {
      periodInput.addEventListener('keydown', async event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          scoringState.period = String(periodInput.value || '').trim().toUpperCase();
          await refreshScoringView(applyPeriodBtn || refreshBtn);
        }
      });
    }

    if (focusBtn) {
      focusBtn.addEventListener('click', () => {
        const target = scoringState.agencies
          .filter(item => item.priority === 'ALTA')
          .sort((left, right) => right.probability - left.probability)[0] || scoringState.agencies[0];
        if (!target) return;
        scoringState.selectedAgencyId = target.id;
        switchScoringTab('ficha');
        renderAgencyDetail();
        highlightSelectedRow();
      });
    }

    // Tab navigation
    document.querySelectorAll('.scoring-tab[data-scoring-tab]').forEach(tab => {
      tab.addEventListener('click', () => switchScoringTab(tab.dataset.scoringTab));
    });

    ['ventas', 'loto', 'cliente'].forEach(key => {
      const slider = document.getElementById(`scoring-sim-${key}`);
      if (!slider) return;
      slider.addEventListener('input', () => {
        const valueEl = document.getElementById(`scoring-sim-${key}-value`);
        if (valueEl) valueEl.textContent = `+${slider.value}`;
        renderSimulator();
      });
    });

    if (configDataset) {
      configDataset.addEventListener('change', async () => {
        scoringState.admin.currentDataset = configDataset.value || 'asesores';
        await loadConfigDataset();
        renderConfigPanel();
      });
    }

    if (configSearch) {
      configSearch.addEventListener('input', applyConfigFilters);
    }

    if (configRefresh) {
      configRefresh.addEventListener('click', async () => {
        await loadConfigSummary();
        renderConfigPanel();
      });
    }

    if (configNew) {
      configNew.addEventListener('click', () => {
        scoringState.admin.selectedRowKey = null;
        scoringState.admin.isNew = true;
        renderConfigForm();
      });
    }

    if (configSave) {
      configSave.addEventListener('click', saveConfigRecord);
    }

    if (configCancel) {
      configCancel.addEventListener('click', () => {
        scoringState.admin.isNew = false;
        renderConfigForm();
      });
    }

    if (configDelete) {
      configDelete.addEventListener('click', deleteConfigRecord);
    }

    if (configSnapshot) {
      configSnapshot.addEventListener('click', createSnapshot);
    }

    if (configForm) {
      configForm.addEventListener('submit', async event => {
        event.preventDefault();
        await saveConfigRecord();
      });
    }
  }

  async function refreshScoringView(button) {
    const originalHtml = button ? button.innerHTML : '';
    if (button) {
      button.disabled = true;
      button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Actualizando';
    }
    await loadScoringData();
    renderScoring();
    if (button) {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
    if (typeof showToast === 'function') {
      showToast(scoringState.loadedFromApi ? 'Scoring actualizado con datos reales' : scoringState.loadError, scoringState.loadedFromApi ? 'success' : 'error');
    }
  }

  function setPeriodInputValue(value) {
    const input = document.getElementById('scoring-period-input');
    if (input && document.activeElement !== input) {
      input.value = value || '';
    }
  }

  function renderScoring() {
    switchScoringTab(scoringState.activeTab);
    renderHero();
    renderStats();
    renderSummary();
    populateCategoryFilter();
    applyFilters();
    renderAgencyDetail();
    renderSimulator();
    renderConfigPanel();
  }

  function switchScoringTab(tabId) {
    scoringState.activeTab = tabId;
    document.querySelectorAll('.scoring-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.scoringTab === tabId);
    });
    document.querySelectorAll('.scoring-tab-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `scoring-panel-${tabId}`);
    });
  }

  function renderHero() {
    const summary = scoringState.summary;
    setPeriodInputValue(scoringState.period);
    document.getElementById('scoring-period-badge').textContent = scoringState.period || 'Auto';
    document.getElementById('scoring-source-badge').textContent = scoringState.loadedFromApi ? 'Datos reales' : 'Sin datos';
    document.getElementById('scoring-hero-score').textContent = formatNumber(summary.averageScore, 1);
    document.getElementById('scoring-hero-foot').textContent = scoringState.loadError
      ? scoringState.loadError
      : (summary.scoreDelta >= 0
        ? `+${formatNumber(summary.scoreDelta, 1)} vs periodo anterior`
        : `${formatNumber(summary.scoreDelta, 1)} vs periodo anterior`);

    const miniGrid = document.getElementById('scoring-hero-mini-grid');
    miniGrid.innerHTML = [
      { label: 'Agencias evaluadas', value: summary.agenciesEvaluated },
      { label: 'Prioridad alta', value: summary.highPriority },
      { label: 'Candidatas a subir', value: summary.upliftCandidates },
      { label: 'Asesor destacado', value: summary.topAdvisor }
    ].map(item => `
      <div class="scoring-mini-card scoring-fade-in">
        <span>${item.label}</span>
        <strong>${item.value}</strong>
      </div>
    `).join('');
  }

  function renderStats() {
    const summary = scoringState.summary;
    const highPotential = scoringState.agencies.filter(item => item.probability >= 0.7).length;
    const lowClient = scoringState.agencies.filter(item => item.clientCoefficient < 0.95).length;
    const stats = [
      { label: 'Score promedio', value: formatNumber(summary.averageScore, 1), foot: 'Indicador consolidado de red', accent: 'linear-gradient(90deg, #22d3ee, #0ea5e9)' },
      { label: 'Foco inmediato', value: summary.highPriority, foot: 'Agencias en prioridad alta', accent: 'linear-gradient(90deg, #fb7185, #f97316)' },
      { label: 'Ascenso probable', value: highPotential, foot: 'Probabilidad >= 70%', accent: 'linear-gradient(90deg, #34d399, #10b981)' },
      { label: 'Cliente penaliza', value: lowClient, foot: 'Coeficiente menor a 0.95', accent: 'linear-gradient(90deg, #f59e0b, #facc15)' }
    ];

    const grid = document.getElementById('scoring-stats-grid');
    grid.innerHTML = stats.map(item => `
      <div class="scoring-stat scoring-fade-in" style="--scoring-accent:${item.accent};">
        <div class="scoring-stat-label">${item.label}</div>
        <div class="scoring-stat-value">${item.value}</div>
        <div class="scoring-stat-foot">${item.foot}</div>
      </div>
    `).join('');
  }

  function renderSummary() {
    const summary = scoringState.summary;
    document.getElementById('scoring-summary-chips').innerHTML = summary.chips
      .map(item => `<span class="scoring-chip">${item}</span>`)
      .join('');

    const total = Math.max(1, summary.categories.reduce((acc, item) => acc + item.count, 0));
    document.getElementById('scoring-distribution-bars').innerHTML = summary.categories.map(item => `
      <div class="scoring-distribution-item scoring-fade-in">
        <div class="scoring-distribution-top">
          <span class="scoring-table-chip ${item.colorClass}">${item.name}</span>
          <strong>${item.count}</strong>
        </div>
        <div class="scoring-bar-track">
          <div class="scoring-bar-fill" style="width:${(item.count / total) * 100}%;"></div>
        </div>
      </div>
    `).join('');

    document.getElementById('scoring-priority-list').innerHTML = summary.priorities.length
      ? summary.priorities.map(item => `
        <div class="scoring-priority-item scoring-fade-in">
          <div class="scoring-priority-top">
            <strong>${item.title}</strong>
          </div>
          <p>${item.text}</p>
        </div>
      `).join('')
      : '<div class="scoring-empty-state">No hay observaciones ampliadas para este periodo.</div>';
  }

  function populateCategoryFilter() {
    const select = document.getElementById('scoring-filter-category');
    if (!select) return;
    const current = select.value;
    const categories = Array.from(new Set(scoringState.agencies.map(item => item.category)));
    select.innerHTML = '<option value="">Todas las categorias</option>' + categories
      .map(category => `<option value="${category}">${category}</option>`)
      .join('');
    select.value = current;
  }

  function applyFilters() {
    const search = String(document.getElementById('scoring-search')?.value || '').trim().toLowerCase();
    const category = document.getElementById('scoring-filter-category')?.value || '';
    const priority = document.getElementById('scoring-filter-priority')?.value || '';

    scoringState.filteredAgencies = scoringState.agencies.filter(item => {
      const matchesSearch = !search
        || item.name.toLowerCase().includes(search)
        || item.advisor.toLowerCase().includes(search)
        || item.id.toLowerCase().includes(search);
      const matchesCategory = !category || item.category === category;
      const matchesPriority = !priority || item.priority === priority;
      return matchesSearch && matchesCategory && matchesPriority;
    });

    if (!scoringState.filteredAgencies.some(item => item.id === scoringState.selectedAgencyId)) {
      scoringState.selectedAgencyId = scoringState.filteredAgencies[0] ? scoringState.filteredAgencies[0].id : null;
    }

    renderRanking();
    renderAgencyDetail();
    renderSimulator();
  }

  function renderRanking() {
    const tbody = document.getElementById('scoring-ranking-body');
    const caption = document.getElementById('scoring-ranking-caption');
    if (!tbody) return;

    if (caption) {
      caption.textContent = scoringState.loadError
        ? scoringState.loadError
        : `Mostrando ${scoringState.filteredAgencies.length} agencias. Hace click en una fila para ver su detalle.`;
    }

    if (!scoringState.filteredAgencies.length) {
      tbody.innerHTML = `<tr><td colspan="9" class="scoring-empty-state">${scoringState.loadError || 'No hay agencias para el filtro seleccionado.'}</td></tr>`;
      return;
    }

    tbody.innerHTML = scoringState.filteredAgencies.map((item, idx) => {
      const pos = idx + 1;
      const medal = pos === 1 ? '<i class="fas fa-trophy scoring-medal gold"></i>'
        : pos === 2 ? '<i class="fas fa-medal scoring-medal silver"></i>'
        : pos === 3 ? '<i class="fas fa-medal scoring-medal bronze"></i>'
        : `<span class="scoring-pos">${pos}</span>`;
      const movIcon = item.movement === 'Mejora' ? '<i class="fas fa-arrow-up scoring-mov-up"></i>'
        : item.movement === 'Baja' ? '<i class="fas fa-arrow-down scoring-mov-down"></i>'
        : '<i class="fas fa-minus scoring-mov-stable"></i>';
      return `
      <tr class="scoring-fade-in ${item.id === scoringState.selectedAgencyId ? 'active' : ''}" data-scoring-id="${item.id}">
        <td class="scoring-rank-cell">${medal}</td>
        <td>
          <div class="scoring-table-name">
            <strong>${item.name}</strong>
            <small>${item.id}</small>
          </div>
        </td>
        <td>${item.advisor}</td>
        <td><span class="scoring-pill score">${formatNumber(item.score, 1)}</span></td>
        <td><span class="scoring-table-chip ${item.categoryClass}">${item.category}</span></td>
        <td>${movIcon} ${item.movement}</td>
        <td>${Math.round(item.probability * 100)}%</td>
        <td><span class="scoring-table-chip ${priorityClass(item.priority)}">${item.priority}</span></td>
        <td>${item.axis}</td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('tr[data-scoring-id]').forEach(row => {
      row.addEventListener('click', () => {
        scoringState.selectedAgencyId = row.dataset.scoringId;
        switchScoringTab('ficha');
        renderAgencyDetail();
        renderSimulator();
        highlightSelectedRow();
      });
    });
  }

  function highlightSelectedRow() {
    document.querySelectorAll('#scoring-ranking-body tr[data-scoring-id]').forEach(row => {
      row.classList.toggle('active', row.dataset.scoringId === scoringState.selectedAgencyId);
    });
  }

  function renderAgencyDetail() {
    const detail = document.getElementById('scoring-agency-detail');
    const categoryBadge = document.getElementById('scoring-selected-category');
    if (!detail || !categoryBadge) return;

    const agency = getSelectedAgency();
    if (!agency) {
      categoryBadge.textContent = '-';
      categoryBadge.className = 'scoring-category-badge';
      detail.innerHTML = `<div class="scoring-empty-state">${scoringState.loadError || 'Selecciona una agencia para ver su ficha.'}</div>`;
      return;
    }

    categoryBadge.textContent = agency.category;
    categoryBadge.className = `scoring-category-badge ${agency.categoryClass}`;
    detail.innerHTML = `
      <div class="scoring-agency-header scoring-fade-in">
        <div>
          <h4>${agency.name}</h4>
          <div class="scoring-agency-subtitle">Asesor ${agency.advisor} · Cliente ${agency.clientCategory} · Principal foco ${agency.axis}</div>
        </div>
        <span class="scoring-pill ${priorityClass(agency.priority)}">${agency.priority}</span>
      </div>

      <div class="scoring-gauge scoring-fade-in">
        <div class="scoring-gauge-subtitle">Score final de la agencia</div>
        <div class="scoring-gauge-main">
          <div class="scoring-gauge-value">${formatNumber(agency.score, 1)}</div>
          <div class="scoring-muted">Base ${formatNumber(agency.baseScore, 1)} · coef. cliente ${formatNumber(agency.clientCoefficient, 2)}</div>
        </div>
        <div class="scoring-bar-track">
          <div class="scoring-bar-fill" style="width:${Math.min(100, agency.score)}%;"></div>
        </div>
      </div>

      <div class="scoring-metric-grid scoring-fade-in">
        <div class="scoring-metric-card">
          <span>Movilidad</span>
          <strong>${agency.movement}</strong>
        </div>
        <div class="scoring-metric-card">
          <span>Prob. ascenso</span>
          <strong>${Math.round(agency.probability * 100)}%</strong>
        </div>
        <div class="scoring-metric-card">
          <span>Falta para subir</span>
          <strong>${formatNumber(agency.ascentGap, 1)} puntos base</strong>
        </div>
        <div class="scoring-metric-card">
          <span>Margen antes de bajar</span>
          <strong>${formatNumber(agency.descentMargin, 1)} puntos</strong>
        </div>
      </div>

      <div class="scoring-fade-in">
        <div class="scoring-block-title">Como se forma el score</div>
        <div class="scoring-factor-list">
          ${agency.factors.map(factor => `
            <div class="scoring-factor-row">
              <label>${factor.label}</label>
              <div class="scoring-bar-track"><div class="scoring-bar-fill" style="width:${Math.max(0, Math.min(100, factor.value))}%;"></div></div>
              <span>${formatNumber(factor.value, 1)}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="scoring-agency-recommendation scoring-fade-in">
        <strong>${agency.impactLabel}</strong>
        <div>${agency.recommendation}</div>
      </div>
    `;
  }

  function renderSimulator() {
    const result = document.getElementById('scoring-simulator-result');
    if (!result) return;

    const agency = getSelectedAgency();
    if (!agency) {
      result.innerHTML = '<div class="scoring-empty-state">Selecciona una agencia para simular escenarios.</div>';
      return;
    }

    const ventas = Number(document.getElementById('scoring-sim-ventas')?.value || 0);
    const loto = Number(document.getElementById('scoring-sim-loto')?.value || 0);
    const cliente = Number(document.getElementById('scoring-sim-cliente')?.value || 0);
    const simulated = Math.min(100, agency.score + ventas * 0.55 + loto * 0.45 + cliente * 0.35);
    const gain = simulated - agency.score;

    result.innerHTML = `
      <strong>${formatNumber(simulated, 1)} score proyectado</strong>
      <div class="scoring-muted">Impacto estimado: +${formatNumber(gain, 1)} puntos finales sobre ${agency.name}.</div>
      <div style="margin-top:0.75rem;">${simulated >= agency.score + agency.ascentGap ? 'El escenario podria alcanzar el proximo corte si se sostiene la ejecucion.' : 'El escenario mejora la posicion, pero todavia no alcanza el proximo corte estimado.'}</div>
    `;
  }

  function renderConfigPanel() {
    renderConfigDatasets();
    renderHistoryPeriods();
    renderConfigTable();
    renderConfigForm();
  }

  function renderConfigDatasets() {
    const select = document.getElementById('scoring-config-dataset');
    const newButton = document.getElementById('scoring-config-new');
    const saveButton = document.getElementById('scoring-config-save');
    const deleteButton = document.getElementById('scoring-config-delete');
    const snapshotButton = document.getElementById('scoring-config-snapshot');
    if (!select) return;

    const current = scoringState.admin.currentDataset;
    select.innerHTML = scoringState.admin.datasets.map(item => `<option value="${item.id}">${item.label}</option>`).join('');
    select.value = scoringState.admin.datasets.some(item => item.id === current) ? current : (scoringState.admin.datasets[0]?.id || '');

    if (newButton) newButton.disabled = !scoringState.admin.canEdit;
    if (saveButton) saveButton.disabled = !scoringState.admin.canEdit;
    if (deleteButton) deleteButton.disabled = !scoringState.admin.canEdit;
    if (snapshotButton) snapshotButton.disabled = !scoringState.admin.canEdit;
  }

  function renderHistoryPeriods() {
    const container = document.getElementById('scoring-config-periods');
    if (!container) return;

    if (!scoringState.admin.historyPeriods.length) {
      container.innerHTML = '<span class="scoring-chip">Sin snapshots historicos cargados</span>';
      return;
    }

    container.innerHTML = scoringState.admin.historyPeriods
      .map(item => `<span class="scoring-chip">${item.periodo} · ${item.total}</span>`)
      .join('');
  }

  function applyConfigFilters() {
    const term = String(document.getElementById('scoring-config-search')?.value || '').trim().toLowerCase();
    if (!term) {
      scoringState.admin.filteredRows = scoringState.admin.rows.slice();
    } else {
      scoringState.admin.filteredRows = scoringState.admin.rows.filter(row => Object.values(row).some(value => String(value ?? '').toLowerCase().includes(term)));
    }

    if (!scoringState.admin.filteredRows.some(row => row.__rowKey === scoringState.admin.selectedRowKey)) {
      scoringState.admin.selectedRowKey = scoringState.admin.filteredRows[0]?.__rowKey || null;
      scoringState.admin.isNew = false;
    }

    renderConfigTable();
    renderConfigForm();
  }

  function renderConfigTable() {
    const head = document.getElementById('scoring-config-head');
    const body = document.getElementById('scoring-config-body');
    const dataset = getCurrentDatasetMeta();
    if (!head || !body) return;

    if (!dataset) {
      head.innerHTML = '';
      body.innerHTML = '<tr><td class="scoring-empty-state">No hay configuracion disponible.</td></tr>';
      return;
    }

    head.innerHTML = `<tr>${dataset.columns.map(column => `<th>${column.label}</th>`).join('')}</tr>`;
    if (!scoringState.admin.filteredRows.length) {
      body.innerHTML = `<tr><td colspan="${dataset.columns.length}" class="scoring-empty-state">No hay registros para el filtro aplicado.</td></tr>`;
      return;
    }

    body.innerHTML = scoringState.admin.filteredRows.map(row => `
      <tr class="${row.__rowKey === scoringState.admin.selectedRowKey ? 'active' : ''}" data-config-row="${row.__rowKey}">
        ${dataset.columns.map(column => `<td>${formatConfigValue(row[column.name], column.type)}</td>`).join('')}
      </tr>
    `).join('');

    body.querySelectorAll('tr[data-config-row]').forEach(row => {
      row.addEventListener('click', () => {
        scoringState.admin.selectedRowKey = row.dataset.configRow;
        scoringState.admin.isNew = false;
        renderConfigTable();
        renderConfigForm();
      });
    });
  }

  function renderConfigForm() {
    const form = document.getElementById('scoring-config-form');
    const caption = document.getElementById('scoring-config-form-caption');
    const modeBadge = document.getElementById('scoring-config-mode');
    const deleteButton = document.getElementById('scoring-config-delete');
    const dataset = getCurrentDatasetMeta();
    if (!form || !caption || !modeBadge) return;

    if (!dataset) {
      form.innerHTML = '<div class="scoring-empty-state">Sin dataset seleccionado.</div>';
      caption.textContent = 'Selecciona un dataset para consultar sus registros.';
      modeBadge.textContent = 'Sin datos';
      if (deleteButton) deleteButton.disabled = true;
      return;
    }

    const currentRow = getSelectedConfigRow();
    const row = currentRow || buildEmptyConfigRow(dataset);
    const isNew = scoringState.admin.isNew || !currentRow;
    form.innerHTML = dataset.columns.map(column => `
      <label class="scoring-config-field">
        <span>${column.label}${column.required ? ' *' : ''}</span>
        <input
          class="form-control"
          name="${column.name}"
          type="${inputTypeForColumn(column.type)}"
          value="${escapeHtmlInput(formatInputValue(row[column.name], column.type))}"
          ${scoringState.admin.canEdit ? '' : 'disabled'}
        >
      </label>
    `).join('');

    caption.textContent = isNew
      ? `Alta rapida en ${dataset.label}. Completa las claves y guarda.`
      : `Editando ${dataset.label}. Las claves identifican el registro actual.`;
    modeBadge.textContent = scoringState.admin.canEdit ? (isNew ? 'Nuevo' : 'Edicion') : 'Consulta';
    if (deleteButton) {
      deleteButton.disabled = !scoringState.admin.canEdit || isNew || !currentRow;
    }
  }

  async function saveConfigRecord() {
    if (!scoringState.admin.canEdit) {
      return;
    }

    const dataset = getCurrentDatasetMeta();
    const form = document.getElementById('scoring-config-form');
    if (!dataset || !form) {
      return;
    }

    const formData = new FormData(form);
    const record = {};
    dataset.columns.forEach(column => {
      const value = formData.get(column.name);
      record[column.name] = value === '' ? null : value;
    });

    try {
      await window.scoringAPI.guardarDataset(dataset.id, record);
      const nextKey = buildRowKey(dataset, record);
      await loadConfigSummary();
      scoringState.admin.selectedRowKey = nextKey;
      scoringState.admin.isNew = false;
      applyConfigFilters();
      renderConfigPanel();
      if (typeof showToast === 'function') {
        showToast('Registro de scoring guardado', 'success');
      }
    } catch (error) {
      if (typeof showToast === 'function') {
        showToast(error.message || 'No se pudo guardar el registro', 'error');
      }
    }
  }

  async function deleteConfigRecord() {
    if (!scoringState.admin.canEdit) {
      return;
    }

    const dataset = getCurrentDatasetMeta();
    const row = getSelectedConfigRow();
    if (!dataset || !row) {
      return;
    }

    if (!window.confirm('Se eliminara el registro seleccionado. Continuar?')) {
      return;
    }

    const keys = dataset.keyFields.reduce((acc, key) => {
      acc[key] = row[key];
      return acc;
    }, {});

    try {
      await window.scoringAPI.eliminarDataset(dataset.id, keys);
      await loadConfigSummary();
      renderConfigPanel();
      if (typeof showToast === 'function') {
        showToast('Registro eliminado', 'success');
      }
    } catch (error) {
      if (typeof showToast === 'function') {
        showToast(error.message || 'No se pudo eliminar el registro', 'error');
      }
    }
  }

  async function createSnapshot() {
    if (!scoringState.admin.canEdit) {
      return;
    }

    try {
      await window.scoringAPI.generarSnapshot(scoringState.period || '');
      await loadConfigSummary();
      renderConfigPanel();
      if (typeof showToast === 'function') {
        showToast(`Snapshot guardado para ${scoringState.period || 'periodo actual'}`, 'success');
      }
    } catch (error) {
      if (typeof showToast === 'function') {
        showToast(error.message || 'No se pudo generar el snapshot', 'error');
      }
    }
  }

  function updateConfigSummaryMessage(customMessage) {
    const container = document.getElementById('scoring-config-summary');
    const dataset = getCurrentDatasetMeta();
    if (!container) return;
    if (customMessage) {
      container.textContent = customMessage;
      return;
    }
    if (!dataset) {
      container.textContent = 'No hay datasets auxiliares cargados.';
      return;
    }
    const total = dataset.total ?? scoringState.admin.rows.length;
    container.textContent = `${dataset.label}: ${total} registros. ${scoringState.admin.canEdit ? 'Edicion habilitada para admin.' : 'Modo consulta.'}`;
  }

  function buildEmptyPayload(period) {
    return {
      period: period || '',
      summary: {
        averageScore: 0,
        scoreDelta: 0,
        agenciesEvaluated: 0,
        highPriority: 0,
        upliftCandidates: 0,
        topAdvisor: '-',
        categories: [],
        priorities: [],
        chips: ['Sin datos reales cargados']
      },
      agencies: []
    };
  }

  function buildSummaryChips(data, agencies) {
    const chips = [];
    chips.push(`${agencies.length} agencias procesadas`);
    if (data?.periodo?.clave) chips.push(`Periodo ${data.periodo.clave}`);
    if (data?.kpis?.prioridadAlta) chips.push(`${data.kpis.prioridadAlta} en prioridad alta`);
    return chips;
  }

  function buildSummaryPriorities(data, agencies) {
    const topCategory = Array.isArray(data?.distribucionCategorias)
      ? data.distribucionCategorias.slice().sort((a, b) => Number(b.cantidad || 0) - Number(a.cantidad || 0))[0]
      : null;
    const notes = [];
    if (topCategory && Number(topCategory.cantidad || 0) > 0) {
      notes.push({
        title: 'Categoria mas frecuente',
        text: `${topCategory.categoria}: ${topCategory.cantidad} agencias en este corte.`
      });
    }
    if (data?.kpis?.prioridadAlta) {
      notes.push({
        title: 'Seguimiento inmediato',
        text: `${data.kpis.prioridadAlta} agencias quedaron con prioridad alta.`
      });
    }
    if (agencies.length) {
      const bestAgency = agencies.slice().sort((a, b) => b.score - a.score)[0];
      notes.push({
        title: 'Mejor score del periodo',
        text: `${bestAgency.name} lidera con ${formatNumber(bestAgency.score, 1)} puntos.`
      });
    }
    return notes.slice(0, 3);
  }

  function getCurrentDatasetMeta() {
    return scoringState.admin.datasets.find(item => item.id === scoringState.admin.currentDataset) || null;
  }

  function getSelectedConfigRow() {
    return scoringState.admin.rows.find(row => row.__rowKey === scoringState.admin.selectedRowKey) || null;
  }

  function buildEmptyConfigRow(dataset) {
    return dataset.columns.reduce((acc, column) => {
      acc[column.name] = '';
      return acc;
    }, {});
  }

  function buildRowKey(dataset, row) {
    return dataset.keyFields.map(key => `${key}:${normalizeRowKeyValue(key, row[key])}`).join('|');
  }

  function normalizeRowKeyValue(key, value) {
    if (key === 'cta_cte') {
      const normalized = String(value || '').trim();
      return /^\d{8}$/.test(normalized) ? normalized.slice(0, 7) : normalized;
    }
    return String(value ?? '').trim();
  }

  function getSelectedAgency() {
    return scoringState.filteredAgencies.find(item => item.id === scoringState.selectedAgencyId)
      || scoringState.agencies.find(item => item.id === scoringState.selectedAgencyId)
      || null;
  }

  function formatNumber(value, decimals) {
    return Number(value || 0).toLocaleString('es-AR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  function formatConfigValue(value, type) {
    if (value === null || value === undefined || value === '') {
      return '—';
    }
    if (type === 'integer') {
      return Number(value).toLocaleString('es-AR');
    }
    if (type === 'number') {
      return formatNumber(value, 2);
    }
    return String(value);
  }

  function inputTypeForColumn(type) {
    if (type === 'integer' || type === 'number') return 'number';
    if (type === 'datetime') return 'datetime-local';
    return 'text';
  }

  function formatInputValue(value, type) {
    if (value === null || value === undefined) {
      return '';
    }
    if (type === 'datetime') {
      return String(value).replace(' ', 'T').slice(0, 16);
    }
    return String(value);
  }

  function escapeHtmlInput(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalizePriority(priority) {
    const text = String(priority || '').toUpperCase();
    if (text.includes('ALTA')) return 'ALTA';
    if (text.includes('BAJA')) return 'BAJA';
    return 'MEDIA';
  }

  function categoryClass(category) {
    const normalized = String(category || '').toLowerCase();
    if (normalized.includes('diamante')) return 'cat-diamante';
    if (normalized.includes('platino')) return 'cat-platino';
    if (normalized.includes('oro')) return 'cat-oro';
    if (normalized.includes('plata')) return 'cat-plata';
    if (normalized.includes('bronce')) return 'cat-bronce';
    return 'cat-cerrado';
  }

  function priorityClass(priority) {
    if (priority === 'ALTA') return 'priority-high';
    if (priority === 'BAJA') return 'priority-low';
    return 'priority-medium';
  }

  window.initScoring = initScoring;
})();
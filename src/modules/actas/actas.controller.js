const PDFDocument = require('pdfkit');

// Generar PDF de Acta de Control Previo
const generarActaControlPrevio = async (req, res) => {
  try {
    const datos = req.body;
    
    // Detectar tipo de juego
    const tipoJuego = datos.tipoJuego || 'Quiniela';
    
    if (tipoJuego === 'Poceada') {
      return generarActaControlPrevioPoceada(req, res, datos);
    }
    if (tipoJuego === 'Tombolina') {
      return generarActaControlPrevioTombolina(req, res, datos);
    }
    if (tipoJuego === 'Loto') {
      return generarActaControlPrevioLoto(req, res, datos);
    }
    if (tipoJuego === 'Loto 5' || tipoJuego === 'Loto5') {
      return generarActaControlPrevioLoto5(req, res, datos);
    }
    if (tipoJuego === 'Quini 6' || tipoJuego === 'QUINI 6' || tipoJuego === 'Quini6') {
      return generarActaControlPrevioQuini6(req, res, datos);
    }
    if (tipoJuego === 'Brinco' || tipoJuego === 'BRINCO') {
      return generarActaControlPrevioBrinco(req, res, datos);
    }
    // GENERAR ACTA CONTROL PREVIO - TOMBOLINA
    async function generarActaControlPrevioTombolina(req, res, datos) {
      try {
        const calc = datos.datosCalculados || {};
        // Crear documento PDF
        const doc = new PDFDocument({ 
          size: 'A4',
          margins: { top: 50, bottom: 50, left: 50, right: 50 }
        });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=Acta_ControlPrevio_Tombolina_${calc.numeroSorteo || 'sorteo'}.pdf`);
        doc.pipe(res);

        const fechaHoy = new Date().toLocaleDateString('es-AR', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
        const horaHoy = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

        // ENCABEZADO
        doc.fontSize(10).fillColor('#666')
           .text('LOTERÍA DE LA CIUDAD DE BUENOS AIRES S.E.', 50, 30)
           .text('CONTROL PREVIO', 450, 30, { align: 'right' });
        doc.moveTo(50, 55).lineTo(545, 55).stroke('#ddd');

        // TÍTULO
        doc.fontSize(20).fillColor('#1e293b')
           .text('ACTA DE CONTROL PREVIO', 50, 80, { align: 'center' });
        doc.fontSize(14).fillColor('#2563eb')
           .text('TOMBOLINA DE LA CIUDAD', 50, 105, { align: 'center' });

        // INFORMACIÓN DEL SORTEO
        doc.roundedRect(50, 135, 495, 85, 5).fillAndStroke('#f8fafc', '#e2e8f0');
        doc.fontSize(10).fillColor('#666').text('SORTEO N°', 70, 150);
        doc.fontSize(18).fillColor('#2563eb').text(calc.numeroSorteo || '-', 70, 165);
        doc.fontSize(9).fillColor('#666').text('ARCHIVO PROCESADO', 250, 150);
        doc.fontSize(10).fillColor('#333').text(datos.archivo || '-', 250, 165);
        doc.fontSize(9).fillColor('#666').text('FECHA PROCESAMIENTO', 250, 180);
        doc.fontSize(10).fillColor('#333').text(new Date().toLocaleString('es-AR'), 250, 192);

        // RESUMEN DE DATOS
        let y = 235;
        doc.fontSize(12).fillColor('#1e293b')
           .text('RESUMEN DE DATOS', 50, y, { underline: true });
        y += 25;
        const ticketsTotal = (calc.registros || 0) + (calc.anulados || 0);
        const boxWidth = 95;
        const boxHeight = 55;
        const boxes = [
          { label: 'Tickets (Total)', value: formatearNumero(ticketsTotal), color: '#2563eb' },
          { label: 'Tickets Válidos', value: formatearNumero(calc.registros), color: '#10b981' },
          { label: 'Anulados', value: formatearNumero(calc.anulados), color: '#ef4444' },
          { label: 'Apuestas', value: formatearNumero(calc.apuestasTotal), color: '#7c3aed' },
          { label: 'Recaudación', value: formatearMoneda(calc.recaudacion), color: '#f59e0b' }
        ];
        boxes.forEach((box, i) => {
          const x = 50 + (i * (boxWidth + 5));
          doc.roundedRect(x, y, boxWidth, boxHeight, 3).fillAndStroke('#f1f5f9', '#e2e8f0');
          doc.fontSize(7).fillColor('#666').text(box.label, x + 5, y + 8, { width: boxWidth - 10 });
          doc.fontSize(12).fillColor(box.color).text(box.value, x + 5, y + 25, { width: boxWidth - 10 });
        });
        y += boxHeight + 25;

        // CUADRO: Apuestas y recaudación por cantidad de números jugados
        doc.fontSize(11).fillColor('#1e293b').text('Apuestas y recaudación por cantidad de números jugados', 50, y, { underline: true });
        y += 18;
        // Encabezado
        doc.fontSize(9).fillColor('#666');
        doc.rect(50, y, 300, 18).fill('#f1f5f9');
        doc.fillColor('#334155').text('Cantidad de Números', 55, y + 5);
        doc.text('Apuestas', 180, y + 5);
        doc.text('Recaudación', 260, y + 5);
        y += 18;
        // Filas
        const nums = [7, 6, 5, 4, 3];
        const recaudacionPorNumeros = datos.recaudacionPorNumeros || {};
        for (const n of nums) {
          doc.fontSize(10).fillColor('#333').text(`${n} números`, 55, y + 3);
          doc.text(formatearNumero((calc.apuestasPorNumeros && calc.apuestasPorNumeros[n]) || 0), 180, y + 3);
          doc.text(formatearMoneda((recaudacionPorNumeros[n]) || 0), 260, y + 3);
          y += 15;
        }
        y += 10;

        // ANÁLISIS DE HASH TXT / XML
        doc.fontSize(11).fillColor('#1e293b').text('Verificación de integridad de archivos (hash)', 50, y, { underline: true });
        y += 18;
        const seg = datos.seguridad || {};
        // Encabezado
        doc.fontSize(9).fillColor('#666');
        doc.rect(50, y, 400, 18).fill('#f1f5f9');
        doc.fillColor('#334155').text('Archivo', 55, y + 5);
        doc.text('Hash Calculado', 150, y + 5);
        doc.text('Hash Oficial', 320, y + 5);
        doc.text('Estado', 420, y + 5);
        y += 18;
        // TXT
        doc.fontSize(9).fillColor('#333');
        let estadoTxt = '-';
        if (seg.hashOficial && seg.hashCalculado) {
          estadoTxt = seg.verificado ? 'OK' : 'NO COINCIDE';
        } else {
          estadoTxt = 'No disponible';
        }
        doc.text('TXT', 55, y + 3);
        doc.text(seg.hashCalculado || '-', 150, y + 3, { width: 160 });
        doc.text(seg.hashOficial || '-', 320, y + 3, { width: 90 });
        doc.fillColor(seg.verificado ? '#10b981' : '#ef4444').text(estadoTxt, 420, y + 3);
        y += 15;
        // XML
        doc.fontSize(9).fillColor('#333');
        let estadoXml = '-';
        if (seg.hashXmlOficial && seg.hashXmlCalculado) {
          estadoXml = seg.verificadoXml ? 'OK' : 'NO COINCIDE';
        } else {
          estadoXml = 'No disponible';
        }
        doc.text('XML', 55, y + 3);
        doc.text(seg.hashXmlCalculado || '-', 150, y + 3, { width: 160 });
        doc.text(seg.hashXmlOficial || '-', 320, y + 3, { width: 90 });
        doc.fillColor(seg.verificadoXml ? '#10b981' : '#ef4444').text(estadoXml, 420, y + 3);
        y += 25;

        doc.end();
      } catch (error) {
        console.error('Error generando acta Tombolina:', error);
        res.status(500).json({
          success: false,
          message: 'Error generando acta PDF Tombolina: ' + error.message
        });
      }
    }
    
    // Continuar con Quiniela
    if (!datos || !datos.datosCalculados) {
      return res.status(400).json({
        success: false,
        message: 'Datos de control previo requeridos'
      });
    }

    const calc = datos.datosCalculados;
    const oficial = datos.datosOficiales || {};
    const seguridad = datos.seguridad || {};
    
    // Crear documento PDF
    const doc = new PDFDocument({ 
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 }
    });
    
    // Configurar respuesta
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=Acta_ControlPrevio_${calc.numeroSorteo || 'sorteo'}.pdf`);
    
    // Pipe del PDF a la respuesta
    doc.pipe(res);

    const fechaHoy = new Date().toLocaleDateString('es-AR', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    const horaHoy = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

    // Nombres de tipos de sorteo
    const nombresTipos = {
      'A': 'Primera Mañana', 'AS': 'Primera Sábado',
      'M': 'Matutina', 'MS': 'Matutina Sábado',
      'V': 'Vespertina', 'VS': 'Vespertina Sábado',
      'U': 'Uruguay', 'US': 'Uruguay Sábado',
      'N': 'Nocturna', 'NS': 'Nocturna Sábado'
    };

    // ========== ENCABEZADO ==========
    doc.fontSize(10).fillColor('#666')
       .text('LOTERÍA DE LA CIUDAD DE BUENOS AIRES S.E.', 50, 30)
       .text('CONTROL PREVIO', 450, 30, { align: 'right' });
    
    doc.moveTo(50, 55).lineTo(545, 55).stroke('#ddd');

    // ========== TÍTULO ==========
    doc.fontSize(20).fillColor('#1e293b')
       .text('ACTA DE CONTROL PREVIO', 50, 80, { align: 'center' });
    
    doc.fontSize(14).fillColor('#2563eb')
       .text('QUINIELA DE LA CIUDAD', 50, 105, { align: 'center' });

    // ========== INFORMACIÓN DEL SORTEO ==========
    doc.roundedRect(50, 135, 495, 85, 5).fillAndStroke('#f8fafc', '#e2e8f0');
    
    doc.fontSize(10).fillColor('#666').text('SORTEO N°', 70, 150);
    doc.fontSize(18).fillColor('#2563eb').text(calc.numeroSorteo || '-', 70, 165);
    
    // Mostrar modalidad desde programación (si está disponible)
    const validacionProg = datos.validacionProgramacion || {};
    const sorteoInfo = datos.sorteo || {};
    let modalidadTexto = '-';
    if (validacionProg.modalidad && validacionProg.modalidad.nombre) {
      modalidadTexto = validacionProg.modalidad.nombre + ' (' + validacionProg.modalidad.codigo + ')';
    } else if (sorteoInfo.modalidad && sorteoInfo.modalidad.nombre) {
      modalidadTexto = sorteoInfo.modalidad.nombre + ' (' + sorteoInfo.modalidad.codigo + ')';
    }
    doc.fontSize(9).fillColor('#666').text('MODALIDAD', 70, 185);
    doc.fontSize(11).fillColor('#10b981').text(modalidadTexto, 70, 198);
    
    doc.fontSize(9).fillColor('#666').text('ARCHIVO PROCESADO', 250, 150);
    doc.fontSize(10).fillColor('#333').text(datos.archivo || '-', 250, 165);
    
    doc.fontSize(9).fillColor('#666').text('FECHA PROCESAMIENTO', 250, 180);
    doc.fontSize(10).fillColor('#333').text(new Date(datos.fechaProcesamiento).toLocaleString('es-AR'), 250, 192);

    // ========== RESUMEN DE DATOS ==========
    let y = 235;
    
    doc.fontSize(12).fillColor('#1e293b')
       .text('RESUMEN DE DATOS', 50, y, { underline: true });
    y += 25;

    // Crear cajas de estadísticas (5 en una fila)
    const ticketsTotal = (calc.registros || 0) + (calc.registrosAnulados || 0);
    const boxWidth = 95;
    const boxHeight = 55;
    const boxes = [
      { label: 'Tickets (Total)', value: formatearNumero(ticketsTotal), color: '#2563eb' },
      { label: 'Tickets Válidos', value: formatearNumero(calc.registros), color: '#10b981' },
      { label: 'Anulados', value: formatearNumero(calc.registrosAnulados), color: '#ef4444' },
      { label: 'Apuestas', value: formatearNumero(calc.apuestasTotal), color: '#7c3aed' },
      { label: 'Recaudación', value: formatearMoneda(calc.recaudacion), color: '#f59e0b' }
    ];

    boxes.forEach((box, i) => {
      const x = 50 + (i * (boxWidth + 5));
      doc.roundedRect(x, y, boxWidth, boxHeight, 3).fillAndStroke('#f1f5f9', '#e2e8f0');
      doc.fontSize(7).fillColor('#666').text(box.label, x + 5, y + 8, { width: boxWidth - 10 });
      doc.fontSize(12).fillColor(box.color).text(box.value, x + 5, y + 25, { width: boxWidth - 10 });
    });

    y += boxHeight + 25;

    // ========== TABLAS EN DOS COLUMNAS ==========
    const yTablas = y;
    
    // --- COLUMNA IZQUIERDA: POR TIPO DE SORTEO ---
    doc.fontSize(11).fillColor('#1e293b')
       .text('DESGLOSE POR TIPO DE SORTEO', 50, y, { underline: true });
    y += 20;

    // Encabezado tabla tipo sorteo
    doc.fontSize(9).fillColor('#666');
    doc.rect(50, y, 220, 18).fill('#f1f5f9');
    doc.fillColor('#334155').text('Tipo', 55, y + 5);
    doc.text('Registros', 160, y + 5);
    doc.text('Recaudación', 210, y + 5);
    y += 18;

    // Filas tipo sorteo
    doc.fontSize(9).fillColor('#333');
    for (const [tipo, datosT] of Object.entries(calc.tiposSorteo || {})) {
      const nombreTipo = nombresTipos[tipo] || tipo;
      doc.text(nombreTipo, 55, y + 3);
      doc.text(formatearNumero(datosT.apuestas), 160, y + 3);
      doc.text(formatearMoneda(datosT.recaudacion), 210, y + 3);
      y += 15;
    }
    
    const yFinTipoSorteo = y;

    // --- COLUMNA DERECHA: POR PROVINCIA ---
    let yProv = yTablas;
    doc.fontSize(11).fillColor('#1e293b')
       .text('DESGLOSE POR PROVINCIA', 300, yProv, { underline: true });
    yProv += 20;
    
    doc.fontSize(9).fillColor('#666');
    doc.rect(300, yProv, 245, 18).fill('#f1f5f9');
    doc.fillColor('#334155').text('Provincia', 305, yProv + 5);
    doc.text('Apuestas', 430, yProv + 5);
    doc.text('% Total', 500, yProv + 5);
    yProv += 18;

    doc.fontSize(9).fillColor('#333');
    const totalApuestas = calc.apuestasTotal || 1;
    for (const [codigo, prov] of Object.entries(calc.provincias || {})) {
      if (prov.apuestas > 0) {
        const porcentaje = ((prov.apuestas / totalApuestas) * 100).toFixed(1);
        doc.text(prov.nombre, 305, yProv + 3);
        doc.text(formatearNumero(prov.apuestas), 430, yProv + 3);
        doc.text(porcentaje + '%', 500, yProv + 3);
        yProv += 15;
      }
    }

    // Continuar desde la fila más baja de las dos columnas
    y = Math.max(yFinTipoSorteo, yProv) + 20;

    // ========== COMPARACIÓN CON DATOS OFICIALES ==========
    
    doc.fontSize(11).fillColor('#1e293b')
       .text('COMPARACIÓN CON DATOS OFICIALES (UTE)', 50, y, { underline: true });
    y += 20;

    if (oficial.registrosValidos !== undefined) {
      // Encabezado
      doc.rect(50, y, 495, 18).fill('#f1f5f9');
      doc.fontSize(9).fillColor('#334155');
      doc.text('Concepto', 55, y + 5);
      doc.text('Calculado', 200, y + 5);
      doc.text('Oficial (UTE)', 300, y + 5);
      doc.text('Diferencia', 420, y + 5);
      y += 18;

      // Calcular tickets totales
      const ticketsTotalCalc = (calc.registros || 0) + (calc.registrosAnulados || 0);
      const ticketsTotalOficial = (oficial.registrosValidos || 0) + (oficial.registrosAnulados || 0);

      const comparaciones = [
        { concepto: 'Tickets (Total)', calc: ticketsTotalCalc, oficial: ticketsTotalOficial },
        { concepto: 'Tickets Válidos', calc: calc.registros, oficial: oficial.registrosValidos },
        { concepto: 'Anulados', calc: calc.registrosAnulados, oficial: oficial.registrosAnulados },
        { concepto: 'Apuestas en Sorteo', calc: calc.apuestasTotal, oficial: oficial.apuestasEnSorteo },
        { concepto: 'Recaudación Bruta', calc: calc.recaudacion, oficial: oficial.recaudacionBruta, esMonto: true }
      ];

      doc.fontSize(9);
      for (const item of comparaciones) {
        const diff = (item.calc || 0) - (item.oficial || 0);
        doc.fillColor('#333').text(item.concepto, 55, y + 3);
        doc.text(item.esMonto ? formatearMoneda(item.calc) : formatearNumero(item.calc), 200, y + 3);
        doc.text(item.esMonto ? formatearMoneda(item.oficial) : formatearNumero(item.oficial), 300, y + 3);
        doc.fillColor(diff === 0 ? '#10b981' : '#ef4444')
           .text(diff === 0 ? '✓ OK' : (diff > 0 ? '+' : '') + (item.esMonto ? formatearMoneda(diff) : formatearNumero(diff)), 420, y + 3);
        y += 15;
      }
    } else {
      doc.fontSize(9).fillColor('#666').text('No se encontró archivo XML de control previo', 55, y);
      y += 20;
    }

    // ========== QUINIELA ONLINE ==========
    y += 15;
    doc.fontSize(11).fillColor('#1e293b')
       .text('QUINIELA ONLINE (Agencia 88880)', 50, y, { underline: true });
    y += 15;

    const online = calc.online || {};
    doc.fontSize(9).fillColor('#333');
    doc.text(`Registros: ${formatearNumero(online.registros || 0)}  |  Apuestas: ${formatearNumero(online.apuestas || 0)}  |  Recaudación: ${formatearMoneda(online.recaudacion || 0)}  |  Anulados: ${formatearNumero(online.anulados || 0)}`, 55, y);

    // ========== VALIDACIÓN CONTRA PROGRAMACIÓN (compacto) ==========
    y += 25;
    const validacion = datos.validacionProgramacion || {};
    
    doc.fontSize(11).fillColor('#1e293b')
       .text('VALIDACIÓN CONTRA PROGRAMACIÓN', 50, y, { underline: true });
    y += 15;

    if (validacion.encontrado) {
      const sorteo = validacion.sorteo || {};
      doc.fontSize(9).fillColor('#10b981')
         .text(`✓ Sorteo ${sorteo.numero} - ${sorteo.modalidad_nombre || 'Sin modalidad'} (${formatearFecha(sorteo.fecha)})`, 55, y);
      y += 12;
      
      // Resumen compacto de provincias (solo las que tienen problema)
      const provConProblema = (validacion.provincias || []).filter(p => p.estado !== 'OK');
      if (provConProblema.length > 0) {
        doc.fontSize(8).fillColor('#ef4444');
        const problemas = provConProblema.map(p => `${p.nombre}: ${p.estado}`).join(' | ');
        doc.text(`Provincias con alertas: ${problemas}`, 55, y);
        y += 10;
      } else {
        doc.fontSize(8).fillColor('#10b981')
           .text('✓ Todas las provincias coinciden con la programación', 55, y);
        y += 10;
      }
    } else {
      doc.fontSize(9).fillColor('#f59e0b')
         .text('⚠ Sorteo no encontrado en programación', 55, y);
      y += 12;
    }

    // ========== AGENCIAS AMIGAS (compacto) ==========
    y += 10;
    const estadAgAmigas = datos.estadisticasAgenciasAmigas || calc.estadisticasAgenciasAmigas || {};
    const erroresAgAmigas = datos.erroresAgenciasAmigas || [];
    
    doc.fontSize(10).fillColor('#1e293b')
       .text('AGENCIAS AMIGAS:', 50, y);
    
    const agAmigasResumen = `Total: ${formatearNumero(estadAgAmigas.total || 0)} | Válidas: ${formatearNumero(estadAgAmigas.validas || 0)} | Inválidas: ${formatearNumero(estadAgAmigas.invalidas || 0)}`;
    doc.fontSize(9).fillColor('#333').text(agAmigasResumen, 180, y);
    y += 12;

    if (erroresAgAmigas.length > 0) {
      doc.fontSize(8).fillColor('#ef4444')
         .text(`⚠ ${erroresAgAmigas.length} agencias no registradas`, 55, y);
      y += 10;
    }

    // ========== VERIFICACIÓN DE SEGURIDAD (compacto en una línea) ==========
    y += 10;
    doc.fontSize(10).fillColor('#1e293b').text('VERIFICACIÓN:', 50, y);

    if (seguridad.archivos) {
      const arch = seguridad.archivos;
      const items = ['TXT', 'XML', 'Hash'].map(label => {
        const ok = label === 'TXT' ? arch.txt : label === 'XML' ? arch.xml : arch.hash;
        return ok ? `✓${label}` : `✗${label}`;
      }).join('  ');
      
      doc.fontSize(9).fillColor('#333').text(items, 150, y);
      
      if (seguridad.verificado !== null) {
        const hashStatus = seguridad.verificado ? '✓ Hash OK' : '✗ Hash NO COINCIDE';
        doc.fillColor(seguridad.verificado ? '#10b981' : '#ef4444').text(hashStatus, 350, y);
      }
    }

    // ========== FIRMAS ==========
    y += 40;
    // Asegurar que las firmas estén en la parte inferior de la página actual
    if (y < 680) {
      y = 680;
    }
    
    doc.moveTo(100, y).lineTo(250, y).stroke('#333');
    doc.moveTo(350, y).lineTo(500, y).stroke('#333');
    
    doc.fontSize(10).fillColor('#666');
    doc.text('Operador', 100, y + 5, { width: 150, align: 'center' });
    doc.text('Supervisor', 350, y + 5, { width: 150, align: 'center' });

    // ========== PIE DE PÁGINA ==========
    doc.fontSize(8).fillColor('#999');
    doc.text(`Generado: ${fechaHoy} - ${horaHoy}`, 50, 780);
    doc.text('Sistema SIMBA v2.0', 450, 780, { align: 'right' });

    // Finalizar documento
    doc.end();

  } catch (error) {
    console.error('Error generando acta:', error);
    res.status(500).json({
      success: false,
      message: 'Error generando acta PDF: ' + error.message
    });
  }
};

// Utilidades de formato
function formatearNumero(num) {
  return (num || 0).toLocaleString('es-AR');
}

function formatearFecha(fecha) {
  if (!fecha) return '-';
  try {
    const d = new Date(fecha);
    return d.toLocaleDateString('es-AR');
  } catch (e) {
    return String(fecha);
  }
}

function formatearMoneda(num) {
  return '$ ' + (num || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Generar Acta Notarial de Sorteo
const generarActaNotarial = async (req, res) => {
  try {
    const datos = req.body;
    
    if (!datos.jefe || !datos.escribano || !datos.numeroSorteo) {
      return res.status(400).json({
        success: false,
        message: 'Faltan datos obligatorios: jefe, escribano, numeroSorteo'
      });
    }

    // Crear documento PDF
    const doc = new PDFDocument({ 
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 60, right: 60 }
    });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=Acta_${datos.juego}_${datos.numeroSorteo}.pdf`);
    
    doc.pipe(res);

    // Parsear fecha
    const fechaObj = new Date(datos.fecha + 'T12:00:00');
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 
                   'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const dia = fechaObj.getDate();
    const mes = meses[fechaObj.getMonth()];
    const año = fechaObj.getFullYear();

    // ========== ENCABEZADO ==========
    doc.fontSize(16).fillColor('#1e293b')
       .text('ACTA NOTARIAL', { align: 'center' });
    
    doc.fontSize(14).fillColor('#2563eb')
       .text(`SORTEO ${datos.juego} DE LA CIUDAD`, { align: 'center' });
    
    doc.fontSize(12).fillColor('#333')
       .text(`MODALIDAD ${datos.modalidad} - JUGADA N° ${datos.numeroSorteo}`, { align: 'center' });
    
    doc.moveDown(2);

    // ========== CUERPO DEL ACTA (texto corrido sin saltos) ==========
    let cuerpo = '';
    
    if (datos.tipoActa === 'RNG') {
      cuerpo = `En la Ciudad Autónoma de Buenos Aires, República Argentina, a los ${dia} días del mes de ${mes} del año ${año}, yo, el Escribano autorizante de sorteos de la "LOTERÍA DE LA CIUDAD DE BUENOS AIRES S.E.", me presento en el Salón de Sorteos de la mencionada entidad, ubicado en la Av. Santa Fe 4358 de esta Ciudad, a petición de quien comparece ante mí, ${datos.jefe}, mayor de edad, de nacionalidad argentina, estado civil ${datos.estadoCivil}, con domicilio legal en este lugar. Reconociéndole como persona de mi conocimiento, certifico y declaro: que ${datos.jefe}, actuando en representación de la "LOTERÍA DE LA CIUDAD DE BUENOS AIRES S.E.", manifiesta tener las facultades necesarias y un legítimo interés en el presente acto; y solicita que fiscalice todos los procesos vinculados al sorteo conforme a las normativas vigentes. Para llevar a cabo este propósito, el solicitante, previo al inicio del procedimiento, informa que ha recibido el archivo digital conteniendo la totalidad de las apuestas participantes, las cuales han sido incorporadas mediante un proceso informático auditable. Una vez completada esta información, se procede a verificar la integridad del mencionado archivo digital mediante la validación de su huella digital (hash), la cual es contrastada con el comprobante de seguridad emitido por la Unidad Técnica de Escribanía (UTE). Acto seguido, siendo las ${datos.horaInicio || '__:__'} horas, hora programada ${datos.horaProgramada || '__:__'} horas, se ejecuta el sorteo mediante el sistema de Generador de Números Aleatorios (RNG), verificándose que el número de inicio sea consecutivo al utilizado en el sorteo anterior. El número RNG utilizado es: ${datos.numeroRng || '______'}, siendo el último número RNG: ${datos.ultimoRng || '______'}. El resultado obtenido se anexa junto al extracto que detalla todos los datos correspondientes a las jurisdicciones siguientes: ${datos.jurisdicciones}. Una vez concluido este acto, procedemos a suscribir los anexos que forman parte integral de la presente acta. Leo la presente a mi requirente, quien la aprueba y firma en dos ejemplares idénticos y con el mismo propósito. Ambas copias tienen igual validez y eficacia jurídica. Todo esto se lleva a cabo en mi presencia, a quien doy fe de lo acontecido.`;
    
    } else if (datos.tipoActa === 'BOLILLEROS') {
      cuerpo = `En la Ciudad Autónoma de Buenos Aires, República Argentina, a los ${dia} días del mes de ${mes} del año ${año}, yo, el Escribano autorizante de sorteos de la "LOTERÍA DE LA CIUDAD DE BUENOS AIRES S.E.", me presento en el Salón de Sorteos de la mencionada entidad, ubicado en la Av. Santa Fe 4358 de esta Ciudad, a petición de quien comparece ante mí, ${datos.jefe}, mayor de edad, de nacionalidad argentina, estado civil ${datos.estadoCivil}, con domicilio legal en este lugar. Reconociéndole como persona de mi conocimiento, certifico y declaro: que ${datos.jefe}, actuando en representación de la "LOTERÍA DE LA CIUDAD DE BUENOS AIRES S.E.", manifiesta tener las facultades necesarias y un legítimo interés en el presente acto; y solicita que fiscalice todos los procesos vinculados al sorteo conforme a las normativas vigentes. Para llevar a cabo este propósito, el solicitante, previo al inicio del procedimiento, informa que ha recibido el archivo digital conteniendo la totalidad de las apuestas participantes. Seguidamente, el requirente establece comunicación con la Lotería de la Provincia de Buenos Aires, notificando que están preparados para llevar a cabo el sorteo. Acto inmediato, y siendo las ${datos.horaInicio || '__:__'} horas, se da inicio al mencionado sorteo utilizando bolilleros neumáticos. El resultado obtenido se anexa junto al extracto que detalla todos los datos correspondientes a las jurisdicciones siguientes: ${datos.jurisdicciones}. Una vez concluido este acto, procedemos a suscribir los anexos que forman parte integral de la presente acta. Leo la presente a mi requirente, quien la aprueba y firma en dos ejemplares idénticos y con el mismo propósito. Ambas copias tienen igual validez y eficacia jurídica. Todo esto se lleva a cabo en mi presencia, a quien doy fe de lo acontecido.`;
    
    } else if (datos.tipoActa === 'SUSTITUTO') {
      cuerpo = `En la Ciudad Autónoma de Buenos Aires, República Argentina, a los ${dia} días del mes de ${mes} del año ${año}, el suscrito Escribano Público autorizado para actuar en sorteos de la "LOTERÍA DE LA CIUDAD DE BUENOS AIRES S.E.", me constituyo en el Salón de Sorteos de dicha entidad, sito en Av. Santa Fe 4358, de esta Ciudad, en respuesta a la solicitud de ${datos.jefe}, de nacionalidad argentina, mayor de edad, de estado civil ${datos.estadoCivil}, con domicilio legal en esta jurisdicción. Dicho solicitante es reconocido por mí como persona de mi conocimiento. Por medio del presente, certifico y declaro que ${datos.jefe}, actuando en su calidad de representante de la "LOTERÍA DE LA CIUDAD DE BUENOS AIRES S.E.", manifiesta poseer las facultades necesarias y un legítimo interés en el acto a realizarse; y requiere mi presencia para fiscalizar todos los procesos vinculados al sorteo SUSTITUTO, correspondiente al extracto de la modalidad ${datos.modalidad} N° ${datos.sorteoSustituto || datos.numeroSorteo}, con el objetivo de completar las apuestas de su jurisdicción que, por razones técnicas o administrativas, no fueron oportunamente incluidas. El resultado obtenido se anexa junto al extracto que detalla todos los datos correspondientes a las jurisdicciones siguientes: ${datos.jurisdicciones}. Una vez concluido este acto, procedemos a suscribir los anexos que forman parte integral de la presente acta. Leo la presente a mi requirente, quien la aprueba y firma en dos ejemplares idénticos y con el mismo propósito.`;
    }

    // Agregar observaciones si existen (en la misma línea)
    if (datos.observaciones) {
      cuerpo += ` ${datos.observaciones}`;
    }

    // Escribir cuerpo con formato justificado
    doc.fontSize(11).fillColor('#333')
       .text(cuerpo, {
         align: 'justify',
         lineGap: 4
       });

    // ========== FIRMAS ==========
    doc.moveDown(4);
    
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const firmaY = doc.y + 20;
    
    // Líneas de firma
    doc.moveTo(doc.page.margins.left + 30, firmaY)
       .lineTo(doc.page.margins.left + 180, firmaY)
       .stroke('#333');
    
    doc.moveTo(doc.page.margins.left + pageWidth - 180, firmaY)
       .lineTo(doc.page.margins.left + pageWidth - 30, firmaY)
       .stroke('#333');
    
    // Nombres
    doc.fontSize(10).fillColor('#333');
    doc.text(datos.jefe, doc.page.margins.left + 30, firmaY + 5, { 
      width: 150, align: 'center' 
    });
    doc.text(datos.escribano, doc.page.margins.left + pageWidth - 180, firmaY + 5, { 
      width: 150, align: 'center' 
    });
    
    // Cargos
    doc.fontSize(9).fillColor('#666');
    doc.text('JEFE DE SORTEO', doc.page.margins.left + 30, firmaY + 20, { 
      width: 150, align: 'center' 
    });
    doc.text('ESCRIBANO', doc.page.margins.left + pageWidth - 180, firmaY + 20, { 
      width: 150, align: 'center' 
    });

    // Finalizar documento
    doc.end();

  } catch (error) {
    console.error('Error generando acta notarial:', error);
    res.status(500).json({
      success: false,
      message: 'Error generando acta PDF: ' + error.message
    });
  }
};

// ========================================
// GENERAR ACTA CONTROL PREVIO - LOTO
// ========================================
async function generarActaControlPrevioLoto(req, res, datos) {
  try {
    const resumen = datos.resumen || {};
    const modalidades = datos.modalidades || {};
    const datosOficiales = datos.datosOficiales || {};
    const comparacion = datos.comparacion || {};
    const seguridad = datos.seguridad || {};
    const provincias = datos.provincias || {};
    
    // Crear documento PDF multipágina - márgenes reducidos
    const doc = new PDFDocument({ 
      size: 'A4',
      margins: { top: 30, bottom: 30, left: 35, right: 35 },
      autoFirstPage: true
    });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=Acta_ControlPrevio_Loto_${datos.sorteo || 'sorteo'}.pdf`);
    doc.pipe(res);

    const fechaHoy = new Date().toLocaleDateString('es-AR', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    const horaHoy = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

    // ========== ENCABEZADO ==========
    doc.fontSize(8).fillColor('#666')
       .text('LOTERÍA DE LA CIUDAD DE BUENOS AIRES S.E.', 35, 20)
       .text('CONTROL PREVIO', 480, 20, { align: 'right' });
    doc.moveTo(35, 35).lineTo(560, 35).stroke('#ddd');

    // ========== TÍTULO ==========
    doc.fontSize(14).fillColor('#f59e0b')
       .text('LOTO DE LA CIUDAD', 35, 42, { align: 'center' });
    doc.fontSize(9).fillColor('#1e293b')
       .text('Memorando - Control Previo', 35, 58, { align: 'center' });

    // ========== INFO SORTEO (más compacto) ==========
    doc.roundedRect(35, 72, 525, 35, 3).fillAndStroke('#fffbeb', '#fbbf24');
    doc.fontSize(7).fillColor('#666').text('SORTEO N°', 45, 78);
    doc.fontSize(12).fillColor('#f59e0b').text(datos.sorteo || '-', 45, 88);
    doc.fontSize(7).fillColor('#666').text('ARCHIVO', 150, 78);
    doc.fontSize(7).fillColor('#333').text(datos.archivo || '-', 150, 88);
    doc.fontSize(7).fillColor('#666').text('FECHA', 380, 78);
    doc.fontSize(7).fillColor('#333').text(new Date(datos.fechaProcesamiento || Date.now()).toLocaleString('es-AR'), 380, 88);

    // ========== RESUMEN GENERAL (más compacto) ==========
    let y = 115;
    doc.fontSize(9).fillColor('#1e293b').text('RESUMEN GENERAL', 35, y, { underline: true });
    y += 12;

    // Cajas resumen más pequeñas
    const ticketsTotal = (resumen.registros || 0) + (resumen.anulados || 0);
    const boxW = 103, boxH = 32;
    const resumenBoxes = [
      { label: 'Tickets Total', value: formatearNumero(ticketsTotal), color: '#2563eb' },
      { label: 'Válidos', value: formatearNumero(resumen.registros), color: '#10b981' },
      { label: 'Anulados', value: formatearNumero(resumen.anulados), color: '#ef4444' },
      { label: 'Apuestas', value: formatearNumero(resumen.apuestasTotal), color: '#7c3aed' },
      { label: 'Recaudación', value: formatearMoneda(resumen.recaudacion), color: '#f59e0b' }
    ];
    resumenBoxes.forEach((box, i) => {
      const x = 35 + (i * (boxW + 2));
      doc.roundedRect(x, y, boxW, boxH, 2).fillAndStroke('#f8fafc', '#e2e8f0');
      doc.fontSize(6).fillColor('#666').text(box.label, x + 3, y + 4, { width: boxW - 6 });
      doc.fontSize(9).fillColor(box.color).text(box.value, x + 3, y + 14, { width: boxW - 6 });
    });
    y += boxH + 8;

    // ========== DESGLOSE POR MODALIDAD (letra reducida) ==========
    const modalidadesOrden = ['Tradicional', 'Match', 'Desquite', 'Sale o Sale', 'Multiplicador'];
    
    for (const modNombre of modalidadesOrden) {
      const modCalc = modalidades[modNombre] || {};
      const modXml = datosOficiales?.modalidades?.[modNombre] || {};
      const premios = modXml.premios || {};
      
      if (!modCalc.registros && !modXml.registrosValidos) continue;

      // Nueva página si es necesario
      if (y > 720) {
        doc.addPage();
        y = 30;
      }

      // Cabecera modalidad - columnas mejor espaciadas para números grandes
      // Col1: Label (35-140), Col2: Monto (145-255), Col3: PozoVacante (260-370), Col4: PozoAsegurar (375-485), Col5: Totales (490-560)
      doc.rect(35, y, 525, 14).fill('#1e3a5f');
      doc.fontSize(8).fillColor('#fff').text(modNombre.toUpperCase(), 42, y + 3);
      doc.fontSize(5).text('Pozo Vacante', 270, y + 4, { width: 100, align: 'right' });
      doc.text('Pozo a Asegurar', 375, y + 4, { width: 100, align: 'right' });
      doc.text('Totales', 490, y + 4, { width: 70, align: 'right' });
      y += 14;

      // Datos generales de la modalidad (compactos)
      const valorApuesta = modXml.recaudacionBruta && modXml.apuestas ? 
        (modXml.recaudacionBruta / modXml.apuestas).toFixed(2) : '-';
      
      const datosGen = [
        { label: 'Nro.Sorteo:', value: datos.sorteo || '-' },
        { label: 'Valor apuesta:', value: valorApuesta !== '-' ? `$${valorApuesta}` : '-' },
        { label: 'Apuestas:', value: formatearNumero(modXml.apuestas || modCalc.apuestas || 0) },
        { label: 'Registros:', value: formatearNumero(modXml.registrosValidos || modCalc.registros || 0) },
        { label: 'Cancelados:', value: formatearNumero(modXml.registrosAnulados || 0) },
        { label: 'Total recaudado:', value: formatearMoneda(modXml.recaudacionBruta || modCalc.recaudacion || 0) },
        { label: 'Arancel:', value: formatearMoneda(modXml.arancel || 0) },
        { label: 'Rec. a distribuir:', value: formatearMoneda(modXml.recaudacionADistribuir || 0) },
        { label: 'Total premios:', value: formatearMoneda(modXml.importeTotalPremios || 0) }
      ];

      doc.fontSize(6);
      datosGen.forEach(item => {
        doc.fillColor('#666').text(item.label, 42, y + 1);
        doc.fillColor('#333').text(item.value, 130, y + 1);
        y += 9;
      });
      y += 3;

      // Tabla de premios - columnas alineadas a la derecha con ancho fijo
      doc.rect(35, y, 525, 10).fill('#f8fafc');
      doc.fillColor('#333').fontSize(5);
      doc.text('Premio agenciero', 42, y + 2);
      doc.text(formatearMoneda(premios.agenciero?.monto || 0), 145, y + 2, { width: 110, align: 'right' });
      doc.text(formatearMoneda(premios.agenciero?.pozoVacante || 0), 260, y + 2, { width: 110, align: 'right' });
      doc.text(formatearMoneda(premios.agenciero?.pozoAsegurar || 0), 375, y + 2, { width: 110, align: 'right' });
      doc.text(formatearMoneda(premios.agenciero?.totales || 0), 490, y + 2, { width: 70, align: 'right' });
      y += 10;

      // Premios por aciertos
      const premiosNivel = [];
      if (modNombre === 'Tradicional' || modNombre === 'Match') {
        premiosNivel.push({ label: 'Premio 6 Ac', data: premios.primerPremio });
        premiosNivel.push({ label: 'Premio 5 Ac', data: premios.segundoPremio });
        premiosNivel.push({ label: 'Premio 4 Ac', data: premios.tercerPremio });
      } else if (modNombre === 'Desquite' || modNombre === 'Sale o Sale') {
        premiosNivel.push({ label: 'Premio 6 Ac', data: premios.primerPremio });
      }

      premiosNivel.forEach(p => {
        if (!p.data) return;
        doc.rect(35, y, 525, 10).fill('#fff');
        doc.fillColor('#333').fontSize(5);
        doc.text(p.label, 42, y + 2);
        doc.text(formatearMoneda(p.data.monto || 0), 145, y + 2, { width: 110, align: 'right' });
        doc.text(formatearMoneda(p.data.pozoVacante || 0), 260, y + 2, { width: 110, align: 'right' });
        doc.text(formatearMoneda(p.data.pozoAsegurar || 0), 375, y + 2, { width: 110, align: 'right' });
        doc.text(formatearMoneda(p.data.totales || 0), 490, y + 2, { width: 70, align: 'right' });
        y += 10;
      });

      // Fondo compensador/reserva
      const fondo = premios.fondoCompensador || premios.fondoReserva;
      if (fondo) {
        doc.rect(35, y, 525, 10).fill('#f0fdf4');
        doc.fillColor('#166534').fontSize(5);
        doc.text('Fondo compensador', 42, y + 2);
        doc.text(formatearMoneda(fondo.monto || 0), 145, y + 2, { width: 110, align: 'right' });
        y += 10;
      }

      // Total a premios
      doc.rect(35, y, 525, 10).fill('#fef3c7');
      doc.fillColor('#92400e').font('Helvetica-Bold').fontSize(5);
      doc.text('Total a premios', 42, y + 2);
      doc.text(formatearMoneda(modXml.importeTotalPremios || 0), 145, y + 2, { width: 110, align: 'right' });
      doc.font('Helvetica');
      y += 15;
    }

    // ========== COMPARACIÓN TXT vs XML ==========
    if (y > 680) { doc.addPage(); y = 30; }
    
    doc.fontSize(9).fillColor('#1e293b').text('COMPARACIÓN TXT vs XML (UTE)', 35, y, { underline: true });
    y += 12;

    doc.rect(35, y, 525, 12).fill('#f1f5f9');
    doc.fontSize(5).fillColor('#475569');
    doc.text('Concepto', 42, y + 3);
    doc.text('Calculado (TXT)', 145, y + 3, { width: 120, align: 'right' });
    doc.text('Oficial (XML)', 280, y + 3, { width: 120, align: 'right' });
    doc.text('Diferencia', 420, y + 3, { width: 120, align: 'right' });
    y += 12;

    const compItems = [
      { label: 'Registros Válidos', calc: comparacion.registros?.calculado, ofi: comparacion.registros?.oficial, diff: comparacion.registros?.diferencia },
      { label: 'Apuestas', calc: comparacion.apuestas?.calculado, ofi: comparacion.apuestas?.oficial, diff: comparacion.apuestas?.diferencia },
      { label: 'Recaudación', calc: comparacion.recaudacion?.calculado, ofi: comparacion.recaudacion?.oficial, diff: comparacion.recaudacion?.diferencia, money: true }
    ];

    doc.fontSize(5);
    compItems.forEach(item => {
      doc.fillColor('#333');
      doc.text(item.label, 42, y + 1);
      doc.text(item.money ? formatearMoneda(item.calc) : formatearNumero(item.calc), 145, y + 1, { width: 120, align: 'right' });
      doc.text(item.money ? formatearMoneda(item.ofi) : formatearNumero(item.ofi), 280, y + 1, { width: 120, align: 'right' });
      const diffOk = (item.diff || 0) === 0;
      doc.fillColor(diffOk ? '#10b981' : '#ef4444');
      doc.text(diffOk ? '✓ OK' : (item.money ? formatearMoneda(item.diff) : formatearNumero(item.diff)), 420, y + 1, { width: 120, align: 'right' });
      y += 10;
    });
    y += 8;

    // ========== VERIFICACIÓN HASH ==========
    doc.fontSize(9).fillColor('#1e293b').text('VERIFICACIÓN DE INTEGRIDAD', 35, y, { underline: true });
    y += 10;
    
    const hashTxtOk = seguridad.verificado;
    const hashXmlOk = seguridad.verificadoXml;
    
    doc.fontSize(6).fillColor('#333');
    doc.text('Hash TXT:', 42, y);
    doc.fillColor(hashTxtOk ? '#10b981' : '#ef4444');
    doc.text(hashTxtOk ? '✓ Verificado OK' : '✗ No coincide', 100, y);
    doc.fillColor('#333').text('Hash XML:', 200, y);
    doc.fillColor(hashXmlOk ? '#10b981' : '#ef4444');
    doc.text(hashXmlOk ? '✓ Verificado OK' : '✗ No coincide', 260, y);
    y += 15;

    // ========== FIRMAS ==========
    if (y > 750) { doc.addPage(); y = 30; }
    y = Math.max(y + 20, 760);
    
    doc.moveTo(80, y).lineTo(200, y).stroke('#333');
    doc.moveTo(380, y).lineTo(500, y).stroke('#333');
    doc.fontSize(7).fillColor('#666');
    doc.text('Operador', 80, y + 3, { width: 120, align: 'center' });
    doc.text('Supervisor', 380, y + 3, { width: 120, align: 'center' });

    // Pie de página
    doc.fontSize(6).fillColor('#999');
    doc.text(`Generado: ${fechaHoy} - ${horaHoy} | Sistema SIMBA v2.0`, 35, 810, { align: 'center', width: 525 });

    doc.end();

  } catch (error) {
    console.error('Error generando acta Loto:', error);
    res.status(500).json({
      success: false,
      message: 'Error generando acta PDF Loto: ' + error.message
    });
  }
}

// ========================================
// GENERAR ACTA CONTROL PREVIO - LOTO 5
// ========================================
async function generarActaControlPrevioLoto5(req, res, datos) {
  try {
    const resumen = datos.resumen || {};
    const datosOficiales = datos.datosOficiales || {};
    const premiosXml = datosOficiales.premios || {};
    const comparacion = datos.comparacion || {};
    const seguridad = datos.seguridad || {};
    const provincias = datos.provincias || {};

    // Crear documento PDF
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 30, bottom: 30, left: 35, right: 35 },
      autoFirstPage: true
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=Acta_ControlPrevio_Loto5_${datos.sorteo || 'sorteo'}.pdf`);
    doc.pipe(res);

    const fechaHoy = new Date().toLocaleDateString('es-AR', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    const horaHoy = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

    // ========== ENCABEZADO ==========
    doc.fontSize(8).fillColor('#666')
       .text('LOTERÍA DE LA CIUDAD DE BUENOS AIRES S.E.', 35, 20)
       .text('CONTROL PREVIO', 480, 20, { align: 'right' });
    doc.moveTo(35, 35).lineTo(560, 35).stroke('#ddd');

    // ========== TÍTULO ==========
    doc.fontSize(14).fillColor('#10b981')
       .text('LOTO 5 DE LA CIUDAD', 35, 42, { align: 'center' });
    doc.fontSize(9).fillColor('#1e293b')
       .text('Memorando - Control Previo', 35, 58, { align: 'center' });

    // ========== INFO SORTEO ==========
    doc.roundedRect(35, 72, 525, 35, 3).fillAndStroke('#f0fdf4', '#10b981');
    doc.fontSize(7).fillColor('#666').text('SORTEO N°', 45, 78);
    doc.fontSize(12).fillColor('#10b981').text(datos.sorteo || '-', 45, 88);
    doc.fontSize(7).fillColor('#666').text('ARCHIVO', 150, 78);
    doc.fontSize(7).fillColor('#333').text(datos.archivo || '-', 150, 88);
    doc.fontSize(7).fillColor('#666').text('FECHA', 380, 78);
    doc.fontSize(7).fillColor('#333').text(new Date(datos.fechaProcesamiento || Date.now()).toLocaleString('es-AR'), 380, 88);

    // ========== RESUMEN GENERAL ==========
    let y = 115;
    doc.fontSize(9).fillColor('#1e293b').text('RESUMEN GENERAL', 35, y, { underline: true });
    y += 12;

    // Cajas resumen
    const ticketsTotal = (resumen.registros || 0) + (resumen.anulados || 0);
    const boxW = 103, boxH = 32;
    const resumenBoxes = [
      { label: 'Tickets Total', value: formatearNumero(ticketsTotal), color: '#2563eb' },
      { label: 'Válidos', value: formatearNumero(resumen.registros), color: '#10b981' },
      { label: 'Anulados', value: formatearNumero(resumen.anulados), color: '#ef4444' },
      { label: 'Apuestas', value: formatearNumero(resumen.apuestasTotal), color: '#7c3aed' },
      { label: 'Recaudación', value: formatearMoneda(resumen.recaudacion), color: '#10b981' }
    ];
    resumenBoxes.forEach((box, i) => {
      const x = 35 + (i * (boxW + 2));
      doc.roundedRect(x, y, boxW, boxH, 2).fillAndStroke('#f8fafc', '#e2e8f0');
      doc.fontSize(6).fillColor('#666').text(box.label, x + 3, y + 4, { width: boxW - 6 });
      doc.fontSize(9).fillColor(box.color).text(box.value, x + 3, y + 14, { width: boxW - 6 });
    });
    y += boxH + 10;

    // ========== COMPARACIÓN CON XML ==========
    if (comparacion && Object.keys(comparacion).length > 0) {
      doc.fontSize(9).fillColor('#1e293b').text('COMPARACIÓN TXT vs XML', 35, y, { underline: true });
      y += 12;

      // Encabezado tabla
      doc.rect(35, y, 525, 12).fill('#f1f5f9');
      doc.fontSize(6).fillColor('#666');
      doc.text('CONCEPTO', 42, y + 3, { width: 150 });
      doc.text('CALCULADO (TXT)', 200, y + 3, { width: 100, align: 'right' });
      doc.text('OFICIAL (XML)', 310, y + 3, { width: 100, align: 'right' });
      doc.text('DIFERENCIA', 420, y + 3, { width: 100, align: 'right' });
      y += 12;

      const filas = [
        { label: 'Tickets Válidos', calc: comparacion.registros?.calculado, ofic: comparacion.registros?.oficial, diff: comparacion.registros?.diferencia },
        { label: 'Anulados', calc: comparacion.anulados?.calculado, ofic: comparacion.anulados?.oficial, diff: comparacion.anulados?.diferencia },
        { label: 'Apuestas', calc: comparacion.apuestas?.calculado, ofic: comparacion.apuestas?.oficial, diff: comparacion.apuestas?.diferencia },
        { label: 'Recaudación', calc: comparacion.recaudacion?.calculado, ofic: comparacion.recaudacion?.oficial, diff: comparacion.recaudacion?.diferencia, esMonto: true }
      ];

      filas.forEach(f => {
        doc.rect(35, y, 525, 10).fill('#fff');
        doc.fontSize(6).fillColor('#333');
        doc.text(f.label, 42, y + 2);
        doc.text(f.esMonto ? formatearMoneda(f.calc || 0) : formatearNumero(f.calc || 0), 200, y + 2, { width: 100, align: 'right' });
        doc.text(f.esMonto ? formatearMoneda(f.ofic || 0) : formatearNumero(f.ofic || 0), 310, y + 2, { width: 100, align: 'right' });
        const colorDiff = (f.diff || 0) === 0 ? '#10b981' : '#ef4444';
        doc.fillColor(colorDiff).text((f.diff || 0) === 0 ? '✓ OK' : (f.diff || 0), 420, y + 2, { width: 100, align: 'right' });
        y += 10;
      });
      y += 10;
    }

    // ========== DISTRIBUCIÓN DE PREMIOS ==========
    doc.fontSize(9).fillColor('#1e293b').text('DISTRIBUCIÓN DE PREMIOS', 35, y, { underline: true });
    y += 12;

    // Encabezado
    doc.rect(35, y, 525, 14).fill('#059669');
    doc.fontSize(6).fillColor('#fff');
    doc.text('PREMIO', 42, y + 4);
    doc.text('MONTO SORTEO', 180, y + 4, { width: 90, align: 'right' });
    doc.text('POZO VACANTE', 280, y + 4, { width: 90, align: 'right' });
    doc.text('POZO A ASEGURAR', 380, y + 4, { width: 90, align: 'right' });
    doc.text('TOTALES', 480, y + 4, { width: 70, align: 'right' });
    y += 14;

    // Filas de premios
    const premios = [
      { label: '1er Premio (5 aciertos)', data: premiosXml.primerPremio },
      { label: '2do Premio (4 aciertos)', data: premiosXml.segundoPremio },
      { label: '3er Premio (3 ac - Devol.)', data: premiosXml.tercerPremio },
      { label: 'Agenciero', data: premiosXml.agenciero }
    ];

    let totalPremios = 0;
    let totalVacante = 0;

    premios.forEach((p, i) => {
      const bgColor = i % 2 === 0 ? '#f8fafc' : '#fff';
      doc.rect(35, y, 525, 12).fill(bgColor);
      doc.fontSize(6).fillColor('#333');
      doc.text(p.label, 42, y + 3);
      doc.text(formatearMoneda(p.data?.monto || 0), 180, y + 3, { width: 90, align: 'right' });
      doc.fillColor(p.data?.pozoVacante > 0 ? '#ef4444' : '#666')
         .text(p.data?.pozoVacante > 0 ? formatearMoneda(p.data.pozoVacante) : '-', 280, y + 3, { width: 90, align: 'right' });
      doc.fillColor('#333').text(p.data?.pozoAsegurar > 0 ? formatearMoneda(p.data.pozoAsegurar) : '-', 380, y + 3, { width: 90, align: 'right' });
      doc.fillColor('#059669').text(formatearMoneda(p.data?.totales || 0), 480, y + 3, { width: 70, align: 'right' });
      totalPremios += (p.data?.totales || 0);
      totalVacante += (p.data?.pozoVacante || 0);
      y += 12;
    });

    // Fondo de reserva si existe
    if (premiosXml.fondoReserva?.monto > 0) {
      doc.rect(35, y, 525, 12).fill('#f0fdf4');
      doc.fontSize(6).fillColor('#333');
      doc.text('Fondo de Reserva', 42, y + 3);
      doc.text(formatearMoneda(premiosXml.fondoReserva.monto), 480, y + 3, { width: 70, align: 'right' });
      totalPremios += premiosXml.fondoReserva.monto;
      y += 12;
    }

    // Total
    doc.rect(35, y, 525, 14).fill('#059669');
    doc.fontSize(7).fillColor('#fff');
    doc.text('TOTAL', 42, y + 4);
    doc.text(totalVacante > 0 ? formatearMoneda(totalVacante) : '-', 280, y + 4, { width: 90, align: 'right' });
    doc.text(formatearMoneda(totalPremios), 480, y + 4, { width: 70, align: 'right' });
    y += 20;

    // ========== VERIFICACIÓN DE SEGURIDAD ==========
    doc.fontSize(9).fillColor('#1e293b').text('VERIFICACIÓN DE SEGURIDAD', 35, y, { underline: true });
    y += 12;

    doc.rect(35, y, 525, 12).fill('#f1f5f9');
    doc.fontSize(6).fillColor('#666');
    doc.text('ARCHIVO', 42, y + 3);
    doc.text('ESTADO', 480, y + 3, { width: 70, align: 'right' });
    y += 12;

    const archivos = [
      { label: 'Hash TXT', ok: seguridad.verificado },
      { label: 'Hash XML', ok: seguridad.verificadoXml }
    ];
    archivos.forEach(a => {
      doc.rect(35, y, 525, 10).fill('#fff');
      doc.fontSize(6).fillColor('#333').text(a.label, 42, y + 2);
      doc.fillColor(a.ok ? '#10b981' : (a.ok === false ? '#ef4444' : '#666'))
         .text(a.ok ? '✓ OK' : (a.ok === false ? '✗ NO COINCIDE' : 'N/A'), 480, y + 2, { width: 70, align: 'right' });
      y += 10;
    });
    y += 15;

    // ========== DISTRIBUCIÓN POR PROVINCIA ==========
    if (Object.keys(provincias).length > 0) {
      doc.fontSize(9).fillColor('#1e293b').text('DISTRIBUCIÓN POR PROVINCIA', 35, y, { underline: true });
      y += 12;

      doc.rect(35, y, 525, 12).fill('#f1f5f9');
      doc.fontSize(6).fillColor('#666');
      doc.text('PROVINCIA', 42, y + 3);
      doc.text('REGISTROS', 200, y + 3, { width: 80, align: 'right' });
      doc.text('APUESTAS', 290, y + 3, { width: 80, align: 'right' });
      doc.text('RECAUDACIÓN', 380, y + 3, { width: 100, align: 'right' });
      doc.text('%', 490, y + 3, { width: 50, align: 'right' });
      y += 12;

      const totalRec = resumen.recaudacion || 1;
      const provArray = Object.entries(provincias)
        .map(([nombre, p]) => ({ nombre, ...p }))
        .sort((a, b) => (b.recaudacion || 0) - (a.recaudacion || 0))
        .slice(0, 15); // Top 15

      provArray.forEach((p, i) => {
        if (y > 760) return; // Evitar overflow
        const bgColor = i % 2 === 0 ? '#fff' : '#f8fafc';
        doc.rect(35, y, 525, 10).fill(bgColor);
        doc.fontSize(6).fillColor('#333');
        doc.text(p.nombre, 42, y + 2);
        doc.text(formatearNumero(p.registros || 0), 200, y + 2, { width: 80, align: 'right' });
        doc.text(formatearNumero(p.apuestas || 0), 290, y + 2, { width: 80, align: 'right' });
        doc.text(formatearMoneda(p.recaudacion || 0), 380, y + 2, { width: 100, align: 'right' });
        const pct = ((p.recaudacion || 0) / totalRec * 100).toFixed(2);
        doc.text(`${pct}%`, 490, y + 2, { width: 50, align: 'right' });
        y += 10;
      });
    }

    // ========== PIE DE PÁGINA ==========
    doc.fontSize(6).fillColor('#999');
    doc.text(`Generado: ${fechaHoy} - ${horaHoy} | Sistema SIMBA v2.0`, 35, 810, { align: 'center', width: 525 });

    doc.end();

  } catch (error) {
    console.error('Error generando acta Loto 5:', error);
    res.status(500).json({
      success: false,
      message: 'Error generando acta PDF Loto 5: ' + error.message
    });
  }
}

// ========================================
// GENERAR ACTA CONTROL PREVIO - POCEADA
// ========================================
async function generarActaControlPrevioPoceada(req, res, datos) {
  try {
    const resumen = datos.resumen || {};
    const oficial = datos.datosOficiales || {};
    const comparacion = datos.comparacion || {};
    const seguridad = datos.seguridad || {};
    const distribucion = datos.distribucionPremios || {};
    
    // Crear documento PDF - 2 páginas
    const doc = new PDFDocument({ 
      size: 'A4',
      margins: { top: 40, bottom: 40, left: 50, right: 50 },
      autoFirstPage: true
    });
    
    // Configurar respuesta
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=Acta_ControlPrevio_Poceada_${datos.sorteo || 'sorteo'}.pdf`);
    
    // Pipe del PDF a la respuesta
    doc.pipe(res);

    const fechaHoy = new Date().toLocaleDateString('es-AR', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    const horaHoy = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

    // ========== PÁGINA 1 ==========
    
    // ========== ENCABEZADO ==========
    doc.fontSize(10).fillColor('#666')
       .text('CONTROL PREVIO', 450, 30, { align: 'right' });
    
    doc.moveTo(50, 50).lineTo(545, 50).stroke('#ddd');

    // ========== TÍTULO ==========
    doc.fontSize(18).fillColor('#7c3aed')
       .text('QUINIELA POCEADA DE LA CIUDAD', 50, 65, { align: 'center' });

    // ========== INFORMACIÓN DEL SORTEO ==========
    doc.roundedRect(50, 95, 495, 55, 5).fillAndStroke('#f8fafc', '#e2e8f0');
    
    doc.fontSize(9).fillColor('#666').text('SORTEO N°', 70, 105);
    doc.fontSize(16).fillColor('#7c3aed').text(datos.sorteo || '-', 70, 118);
    
    doc.fontSize(9).fillColor('#666').text('ARCHIVO PROCESADO', 200, 105);
    doc.fontSize(10).fillColor('#333').text(datos.archivo || '-', 200, 118);
    
    doc.fontSize(9).fillColor('#666').text('FECHA PROCESAMIENTO', 380, 105);
    doc.fontSize(10).fillColor('#333').text(new Date(datos.fechaProcesamiento || Date.now()).toLocaleString('es-AR'), 380, 118);

    // ========== RESUMEN DE DATOS ==========
    let y = 160;
    
    doc.fontSize(11).fillColor('#1e293b')
       .text('RESUMEN DE DATOS', 50, y, { underline: true });
    y += 20;

    // Cajas de estadísticas (6 en una fila - con Tickets Total)
    const ticketsTotalPoceada = (resumen.registros || 0) + (resumen.anulados || 0);
    const boxWidth = 80;
    const boxHeight = 50;
    const boxes = [
      { label: 'Tickets (Total)', value: formatearNumero(ticketsTotalPoceada), color: '#2563eb' },
      { label: 'Tickets Válidos', value: formatearNumero(resumen.registros), color: '#10b981' },
      { label: 'Anulados', value: formatearNumero(resumen.anulados), color: '#ef4444' },
      { label: 'Apuestas', value: formatearNumero(resumen.apuestasTotal), color: '#7c3aed' },
      { label: 'Recaudación', value: formatearMoneda(resumen.recaudacion), color: '#f59e0b' },
      { label: 'Venta Web', value: formatearNumero(resumen.ventaWeb || 0), color: '#3b82f6' }
    ];

    boxes.forEach((box, i) => {
      const x = 50 + (i * (boxWidth + 3));
      doc.roundedRect(x, y, boxWidth, boxHeight, 3).fillAndStroke('#f1f5f9', '#e2e8f0');
      doc.fontSize(6).fillColor('#666').text(box.label, x + 3, y + 6, { width: boxWidth - 6 });
      doc.fontSize(10).fillColor(box.color).text(box.value, x + 3, y + 22, { width: boxWidth - 6 });
    });

    y += boxHeight + 20;

    // ========== DISTRIBUCIÓN DE PREMIOS CALCULADA ==========
    doc.fontSize(11).fillColor('#1e293b')
       .text('DISTRIBUCIÓN DE PREMIOS CALCULADA (45% de Recaudación)', 50, y, { underline: true });
    y += 18;

    // Tabla de distribución de premios CALCULADOS
    doc.rect(50, y, 495, 16).fill('#7c3aed');
    doc.fontSize(8).fillColor('#fff');
    doc.text('Premio', 55, y + 4);
    doc.text('%', 155, y + 4);
    doc.text('Recaudación', 190, y + 4);
    doc.text('Pozo Vacante', 280, y + 4);
    doc.text('Dif. Asegurar', 370, y + 4);
    doc.text('Importe Final', 460, y + 4);
    y += 16;

    // Usar datos de distribucion (calculados)
    const filasPremiosCalc = [
      { 
        nombre: '1° Premio (8 aciertos)', 
        porcentaje: '62%',
        recaudacion: distribucion.primerPremio?.monto || 0,
        vacante: distribucion.primerPremio?.pozoVacante || 0,
        asegurar: distribucion.primerPremio?.diferenciaAsegurar || 0,
        final: distribucion.primerPremio?.importeFinal || distribucion.primerPremio?.total || 0
      },
      { 
        nombre: '2° Premio (7 aciertos)', 
        porcentaje: '23.5%',
        recaudacion: distribucion.segundoPremio?.monto || 0,
        vacante: distribucion.segundoPremio?.pozoVacante || 0,
        asegurar: 0,
        final: distribucion.segundoPremio?.total || 0
      },
      { 
        nombre: '3° Premio (6 aciertos)', 
        porcentaje: '10%',
        recaudacion: distribucion.terceroPremio?.monto || 0,
        vacante: distribucion.terceroPremio?.pozoVacante || 0,
        asegurar: 0,
        final: distribucion.terceroPremio?.total || 0
      },
      { 
        nombre: 'Agente Vendedor', 
        porcentaje: '0.5%',
        recaudacion: distribucion.agenciero?.monto || 0,
        vacante: distribucion.agenciero?.pozoVacante || 0,
        asegurar: '-',
        final: distribucion.agenciero?.total || 0
      },
      { 
        nombre: 'Fondo de Reserva', 
        porcentaje: '4%',
        recaudacion: distribucion.fondoReserva?.monto || 0,
        vacante: '-',
        asegurar: '-',
        final: distribucion.fondoReserva?.monto || 0
      }
    ];

    doc.fontSize(8);
    let alternate = false;
    for (const fila of filasPremiosCalc) {
      if (alternate) {
        doc.rect(50, y, 495, 14).fill('#f8fafc');
      }
      doc.fillColor('#333').text(fila.nombre, 55, y + 3);
      doc.text(fila.porcentaje, 155, y + 3);
      doc.text(formatearMoneda(fila.recaudacion), 190, y + 3);
      doc.text(typeof fila.vacante === 'number' ? formatearMoneda(fila.vacante) : fila.vacante, 280, y + 3);
      doc.text(typeof fila.asegurar === 'number' ? formatearMoneda(fila.asegurar) : fila.asegurar, 370, y + 3);
      doc.fillColor('#7c3aed').text(formatearMoneda(fila.final), 460, y + 3);
      y += 14;
      alternate = !alternate;
    }
    
    // Total calculado
    doc.rect(50, y, 495, 14).fill('#e0e7ff');
    doc.fillColor('#1e293b').fontSize(8);
    doc.text('TOTAL PREMIOS CALCULADO', 55, y + 3, { continued: false });
    doc.fillColor('#7c3aed').text(formatearMoneda(distribucion.importeTotalPremios || 0), 460, y + 3);
    y += 20;

    // ========== DISTRIBUCIÓN DE PREMIOS UTE (OFICIAL) ==========
    doc.fontSize(11).fillColor('#1e293b')
       .text('DISTRIBUCIÓN DE PREMIOS UTE (OFICIAL)', 50, y, { underline: true });
    y += 18;

    // Tabla de distribución de premios OFICIALES (UTE)
    doc.rect(50, y, 495, 16).fill('#059669');
    doc.fontSize(8).fillColor('#fff');
    doc.text('Premio', 55, y + 4);
    doc.text('%', 155, y + 4);
    doc.text('Recaudación', 190, y + 4);
    doc.text('Pozo Vacante', 280, y + 4);
    doc.text('Dif. Asegurar', 370, y + 4);
    doc.text('Importe Final', 460, y + 4);
    y += 16;

    // Usar datos oficiales del XML
    const premiosOficiales = oficial.premios || {};
    const filasPremiosUTE = [
      { 
        nombre: '1° Premio (8 aciertos)', 
        porcentaje: '62%',
        recaudacion: premiosOficiales.primero?.monto || 0,
        vacante: premiosOficiales.primero?.pozoVacante || 0,
        asegurar: premiosOficiales.primero?.pozoAsegurar || 0,
        final: premiosOficiales.primero?.total || 0
      },
      { 
        nombre: '2° Premio (7 aciertos)', 
        porcentaje: '23.5%',
        recaudacion: premiosOficiales.segundo?.monto || 0,
        vacante: premiosOficiales.segundo?.pozoVacante || 0,
        asegurar: 0,
        final: premiosOficiales.segundo?.total || 0
      },
      { 
        nombre: '3° Premio (6 aciertos)', 
        porcentaje: '10%',
        recaudacion: premiosOficiales.tercero?.monto || 0,
        vacante: premiosOficiales.tercero?.pozoVacante || 0,
        asegurar: 0,
        final: premiosOficiales.tercero?.total || 0
      },
      { 
        nombre: 'Agente Vendedor', 
        porcentaje: '0.5%',
        recaudacion: premiosOficiales.agenciero?.monto || 0,
        vacante: premiosOficiales.agenciero?.pozoVacante || 0,
        asegurar: '-',
        final: premiosOficiales.agenciero?.total || 0
      },
      { 
        nombre: 'Fondo de Reserva', 
        porcentaje: '4%',
        recaudacion: oficial.fondoReserva || 0,
        vacante: '-',
        asegurar: '-',
        final: oficial.fondoReserva || 0
      }
    ];

    doc.fontSize(8);
    alternate = false;
    for (const fila of filasPremiosUTE) {
      if (alternate) {
        doc.rect(50, y, 495, 14).fill('#f0fdf4');
      }
      doc.fillColor('#333').text(fila.nombre, 55, y + 3);
      doc.text(fila.porcentaje, 155, y + 3);
      doc.text(formatearMoneda(fila.recaudacion), 190, y + 3);
      doc.text(typeof fila.vacante === 'number' ? formatearMoneda(fila.vacante) : fila.vacante, 280, y + 3);
      doc.text(typeof fila.asegurar === 'number' ? formatearMoneda(fila.asegurar) : fila.asegurar, 370, y + 3);
      doc.fillColor('#059669').text(formatearMoneda(fila.final), 460, y + 3);
      y += 14;
      alternate = !alternate;
    }
    
    // Total UTE
    const importeTotalUTE = oficial.importeTotalPremios || 
      (premiosOficiales.primero?.total || 0) + 
      (premiosOficiales.segundo?.total || 0) + 
      (premiosOficiales.tercero?.total || 0) + 
      (premiosOficiales.agenciero?.total || 0) + 
      (oficial.fondoReserva || 0);
    
    doc.rect(50, y, 495, 14).fill('#dcfce7');
    doc.fillColor('#1e293b').fontSize(8);
    doc.text('TOTAL PREMIOS UTE', 55, y + 3, { continued: false });
    doc.fillColor('#059669').text(formatearMoneda(importeTotalUTE), 460, y + 3);
    y += 20;

    // ========== COMPARACIÓN CALCULADO vs UTE ==========
    doc.fontSize(11).fillColor('#1e293b')
       .text('COMPARACIÓN CALCULADO vs UTE', 50, y, { underline: true });
    y += 18;

    // Tabla de comparación de premios
    doc.rect(50, y, 495, 16).fill('#f1f5f9');
    doc.fontSize(8).fillColor('#334155');
    doc.text('Concepto', 55, y + 4);
    doc.text('Calculado', 180, y + 4);
    doc.text('UTE (Oficial)', 290, y + 4);
    doc.text('Diferencia', 400, y + 4);
    doc.text('Estado', 480, y + 4);
    y += 16;

    const compPremios = comparacion.premios || {};
    const itemsComparacion = [
      { concepto: '1° Premio', calc: compPremios.primerPremio?.importeFinal?.calculado, oficial: compPremios.primerPremio?.importeFinal?.oficial, diff: compPremios.primerPremio?.importeFinal?.diferencia },
      { concepto: '2° Premio', calc: compPremios.segundoPremio?.importeFinal?.calculado, oficial: compPremios.segundoPremio?.importeFinal?.oficial, diff: compPremios.segundoPremio?.importeFinal?.diferencia },
      { concepto: '3° Premio', calc: compPremios.terceroPremio?.importeFinal?.calculado, oficial: compPremios.terceroPremio?.importeFinal?.oficial, diff: compPremios.terceroPremio?.importeFinal?.diferencia },
      { concepto: 'Agente Vendedor', calc: compPremios.agenciero?.importeFinal?.calculado, oficial: compPremios.agenciero?.importeFinal?.oficial, diff: compPremios.agenciero?.importeFinal?.diferencia },
      { concepto: 'Fondo Reserva', calc: compPremios.fondoReserva?.calculado, oficial: compPremios.fondoReserva?.oficial, diff: compPremios.fondoReserva?.diferencia },
      { concepto: 'TOTAL PREMIOS', calc: compPremios.importeTotalPremios?.calculado, oficial: compPremios.importeTotalPremios?.oficial, diff: compPremios.importeTotalPremios?.diferencia, bold: true }
    ];

    doc.fontSize(8);
    for (const item of itemsComparacion) {
      const ok = Math.abs(item.diff || 0) < 1;
      if (item.bold) {
        doc.rect(50, y, 495, 14).fill('#e0e7ff');
      }
      doc.fillColor(item.bold ? '#1e293b' : '#333').text(item.concepto, 55, y + 3);
      doc.fillColor('#7c3aed').text(formatearMoneda(item.calc || 0), 180, y + 3);
      doc.fillColor('#059669').text(formatearMoneda(item.oficial || 0), 290, y + 3);
      doc.fillColor(ok ? '#666' : '#ef4444').text(formatearMoneda(item.diff || 0), 400, y + 3);
      doc.fillColor(ok ? '#10b981' : '#ef4444').text(ok ? '✓ OK' : '✗ DIF', 480, y + 3);
      y += 14;
    }

    // ========== PÁGINA 2 ==========
    doc.addPage();
    y = 50;

    // Encabezado página 2
    doc.fontSize(10).fillColor('#666')
       .text('LOTERÍA NACIONAL S.E.', 50, 30)
       .text(`SORTEO: ${datos.sorteo || '-'}`, 450, 30, { align: 'right' });
    doc.moveTo(50, 50).lineTo(545, 50).stroke('#ddd');
    y = 60;

    // ========== COMPARACIÓN CON DATOS OFICIALES (REGISTROS) ==========
    doc.fontSize(11).fillColor('#1e293b')
       .text('COMPARACIÓN DE REGISTROS Y RECAUDACIÓN', 50, y, { underline: true });
    y += 18;

    if (comparacion.registros) {
      doc.rect(50, y, 495, 16).fill('#f1f5f9');
      doc.fontSize(8).fillColor('#334155');
      doc.text('Concepto', 55, y + 4);
      doc.text('Calculado', 200, y + 4);
      doc.text('Oficial (UTE)', 310, y + 4);
      doc.text('Estado', 450, y + 4);
      y += 16;

      // Calcular tickets totales para Poceada
      const ticketsTotalCalcPoc = (comparacion.registros?.calculado || 0) + (comparacion.anulados?.calculado || 0);
      const ticketsTotalOficialPoc = (comparacion.registros?.oficial || 0) + (comparacion.anulados?.oficial || 0);

      const items = [
        { concepto: 'Tickets (Total)', calc: ticketsTotalCalcPoc, oficial: ticketsTotalOficialPoc },
        { concepto: 'Tickets Válidos', calc: comparacion.registros?.calculado, oficial: comparacion.registros?.oficial },
        { concepto: 'Anulados', calc: comparacion.anulados?.calculado, oficial: comparacion.anulados?.oficial },
        { concepto: 'Apuestas Totales', calc: comparacion.apuestas?.calculado, oficial: comparacion.apuestas?.oficial },
        { concepto: 'Recaudación Bruta', calc: comparacion.recaudacion?.calculado, oficial: comparacion.recaudacion?.oficial, esMonto: true }
      ];

      doc.fontSize(8);
      for (const item of items) {
        const diff = (item.calc || 0) - (item.oficial || 0);
        const ok = Math.abs(diff) < 1;
        doc.fillColor('#333').text(item.concepto, 55, y + 3);
        doc.text(item.esMonto ? formatearMoneda(item.calc) : formatearNumero(item.calc), 200, y + 3);
        doc.text(item.esMonto ? formatearMoneda(item.oficial) : formatearNumero(item.oficial), 310, y + 3);
        doc.fillColor(ok ? '#10b981' : '#ef4444')
           .text(ok ? '✓ OK' : `✗ Dif: ${item.esMonto ? formatearMoneda(diff) : formatearNumero(diff)}`, 450, y + 3);
        y += 13;
      }
    } else {
      doc.fontSize(9).fillColor('#666').text('No se encontró archivo XML de control previo', 55, y);
      y += 15;
    }

    // ========== DESGLOSE POR PROVINCIA ==========
    y += 15;
    doc.fontSize(11).fillColor('#1e293b')
       .text('DESGLOSE POR PROVINCIA', 50, y, { underline: true });
    y += 18;

    // Encabezado
    doc.rect(50, y, 495, 14).fill('#f1f5f9');
    doc.fontSize(8).fillColor('#334155');
    doc.text('Provincia', 55, y + 3);
    doc.text('Registros', 200, y + 3);
    doc.text('Apuestas', 280, y + 3);
    doc.text('Recaudación', 360, y + 3);
    doc.text('% Total', 460, y + 3);
    y += 14;

    const provincias = datos.provincias || {};
    const totalApuestas = resumen.apuestasTotal || 1;
    
    doc.fontSize(8);
    let provCount = 0;
    for (const [key, prov] of Object.entries(provincias)) {
      if (prov && prov.registros > 0 && provCount < 20) {
        const porcentaje = ((prov.apuestas / totalApuestas) * 100).toFixed(1);
        doc.fillColor('#333')
           .text(key, 55, y + 2)
           .text(formatearNumero(prov.registros), 200, y + 2)
           .text(formatearNumero(prov.apuestas), 280, y + 2)
           .text(formatearMoneda(prov.recaudacion), 360, y + 2)
           .text(porcentaje + '%', 460, y + 2);
        y += 12;
        provCount++;
      }
    }

    // ========== VERIFICACIÓN DE SEGURIDAD ==========
    y += 15;
    doc.fontSize(11).fillColor('#1e293b')
       .text('VERIFICACIÓN DE ARCHIVOS', 50, y, { underline: true });
    y += 16;

    if (seguridad.archivos) {
      const arch = seguridad.archivos;
      const items = [
        { label: 'TXT', ok: arch.txt },
        { label: 'XML CP', ok: arch.xml },
        { label: 'Hash TXT', ok: arch.hash },
        { label: 'Hash XML', ok: arch.hashCP },
        { label: 'PDF', ok: arch.pdf }
      ];
      
      doc.fontSize(9);
      items.forEach((item, i) => {
        const x = 55 + (i * 95);
        doc.fillColor(item.ok ? '#10b981' : '#ef4444')
           .text(`${item.ok ? '✓' : '✗'} ${item.label}`, x, y);
      });
      
      if (seguridad.verificado !== undefined) {
        y += 15;
        doc.fillColor(seguridad.verificado ? '#10b981' : '#ef4444')
           .fontSize(9)
           .text(`Integridad Hash: ${seguridad.verificado ? '✓ VERIFICADO' : '✗ NO COINCIDE'}`, 55, y);
      }
    }

    // ========== FIRMAS ==========
    y = 720;
    doc.moveTo(100, y).lineTo(250, y).stroke('#333');
    doc.moveTo(350, y).lineTo(500, y).stroke('#333');
    
    doc.fontSize(10).fillColor('#666');
    doc.text('Operador', 100, y + 5, { width: 150, align: 'center' });
    doc.text('Supervisor', 350, y + 5, { width: 150, align: 'center' });

    // ========== PIE DE PÁGINA ==========
    doc.fontSize(8).fillColor('#999');
    doc.text(`Generado: ${fechaHoy} - ${horaHoy}`, 50, 780);
    doc.text('Página 2 de 2', 450, 780, { align: 'right' });

    // Finalizar documento
    doc.end();

  } catch (error) {
    console.error('Error generando acta Poceada:', error);
    res.status(500).json({
      success: false,
      message: 'Error generando acta PDF Poceada: ' + error.message
    });
  }
}

// Generar PDF de Acta de Control Posterior (Escrutinio)
const generarActaControlPosterior = async (req, res) => {
  try {
    const datos = req.body;
    const tipoJuego = datos.tipoJuego || 'Quiniela';
    
    // Crear documento PDF
    const doc = new PDFDocument({ 
      size: 'A4',
      margins: { top: 40, bottom: 40, left: 50, right: 50 }
    });
    
    // Configurar respuesta
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=Escrutinio_${tipoJuego}_${datos.numeroSorteo || 'sorteo'}.pdf`);
    
    doc.pipe(res);

    const fechaHoy = new Date().toLocaleDateString('es-AR', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    const horaHoy = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

    const resData = datos.resultado || {};
    
    // Datos del sorteo desde programación (prioridad) o del resultado
    const programacion = datos.programacion || {};
    const modalidad = datos.modalidad || {};
    const numeroSorteoReal = datos.numeroSorteo || programacion.numero || resData.numeroSorteo || 'S/N';
    const fechaSorteoReal = datos.fechaSorteo || (programacion.fecha ? new Date(programacion.fecha).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : resData.fechaSorteo || '-');
    const modalidadNombre = modalidad.nombre || programacion.modalidad || '';

    // ══════════════════════════════════════════════════════════════
    // ENCABEZADO PRINCIPAL
    // ══════════════════════════════════════════════════════════════
    doc.rect(50, 30, 495, 70).fill('#1e3a5f');
    doc.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold')
       .text('ESCRUTINIO - CONTROL POSTERIOR', 60, 42, { align: 'center' });
    doc.fontSize(14).font('Helvetica')
       .text(`${tipoJuego.toUpperCase()} - SORTEO N° ${numeroSorteoReal}`, 60, 65, { align: 'center' });
    if (modalidadNombre) {
      doc.fontSize(11).fillColor('#93c5fd')
         .text(modalidadNombre.toUpperCase(), 60, 82, { align: 'center' });
    }

    // ══════════════════════════════════════════════════════════════
    // DATOS DEL SORTEO
    // ══════════════════════════════════════════════════════════════
    let y = 115;
    doc.rect(50, y, 495, 50).stroke('#e2e8f0');
    
    doc.fillColor('#64748b').fontSize(9).font('Helvetica');
    doc.text('FECHA SORTEO', 70, y + 10);
    doc.fillColor('#1e293b').fontSize(10).font('Helvetica-Bold');
    doc.text(fechaSorteoReal, 70, y + 25);
    
    doc.fillColor('#64748b').fontSize(9).font('Helvetica');
    doc.text('PROCESADO', 300, y + 10);
    doc.fillColor('#1e293b').fontSize(9).font('Helvetica');
    doc.text(`${fechaHoy} - ${horaHoy}`, 300, y + 25);

    y = 175;

    // ══════════════════════════════════════════════════════════════
    // QUINIELA - Reporte completo
    // ══════════════════════════════════════════════════════════════
    if (tipoJuego === 'Quiniela') {
      const reportePorExtracto = resData.reportePorExtracto || [];
      const extractosCargados = reportePorExtracto.filter(rep => rep.cargado !== false && (rep.totalGanadores > 0 || rep.totalPagado > 0));
      
      // ========== RESUMEN GENERAL ==========
      doc.rect(50, y, 495, 22).fill('#1e3a5f');
      doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold')
         .text('RESUMEN GENERAL', 60, y + 6);
      y += 28;
      
      // Cajas de estadísticas
      const recaudacion = resData.comparacion?.recaudacion?.controlPrevio || 0;
      const totalPremios = resData.totalPremios || 0;
      const totalGanadores = resData.totalGanadores || 0;
      const tasaDevolucion = recaudacion > 0 ? (totalPremios / recaudacion * 100) : 0;
      
      // Caja 1: Total Ganadores
      doc.rect(50, y, 120, 45).fill('#f0fdf4').stroke('#22c55e');
      doc.fillColor('#166534').fontSize(8).text('TOTAL GANADORES', 55, y + 8);
      doc.fontSize(16).font('Helvetica-Bold').text(formatearNumero(totalGanadores), 55, y + 22);
      
      // Caja 2: Total Premios
      doc.rect(175, y, 140, 45).fill('#dbeafe').stroke('#3b82f6');
      doc.fillColor('#1e40af').fontSize(8).font('Helvetica').text('TOTAL PREMIOS', 180, y + 8);
      doc.fontSize(16).font('Helvetica-Bold').text(formatearMoneda(totalPremios), 180, y + 22);
      
      // Caja 3: Recaudación
      doc.rect(320, y, 120, 45).fill('#fef3c7').stroke('#f59e0b');
      doc.fillColor('#92400e').fontSize(8).font('Helvetica').text('RECAUDACIÓN', 325, y + 8);
      doc.fontSize(14).font('Helvetica-Bold').text(formatearMoneda(recaudacion), 325, y + 22);
      
      // Caja 4: Tasa Devolución
      doc.rect(445, y, 100, 45).fill('#fae8ff').stroke('#a855f7');
      doc.fillColor('#7e22ce').fontSize(8).font('Helvetica').text('TASA DEVOLUCIÓN', 450, y + 8);
      doc.fontSize(16).font('Helvetica-Bold').text(`${tasaDevolucion.toFixed(2)}%`, 450, y + 22);
      
      y += 55;

      // ========== COMPARACIÓN CON CONTROL PREVIO ==========
      doc.rect(50, y, 495, 20).fill('#334155');
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
         .text('COMPARACIÓN CON CONTROL PREVIO', 60, y + 5);
      y += 25;
      
      const comp = resData.comparacion || {};
      // Calcular tickets totales
      const ticketsTotalPrevio = (comp.registros?.controlPrevio || 0) + (comp.registros?.anulados || 0);
      const ticketsTotalPosterior = (comp.registros?.controlPosterior || 0) + (comp.registros?.anulados || 0);
      const ticketsTotalOk = ticketsTotalPrevio === ticketsTotalPosterior;

      const compRows = [
        { item: 'Tickets (Total)', cp: ticketsTotalPrevio, cs: ticketsTotalPosterior, ok: ticketsTotalOk },
        { item: 'Tickets Válidos', cp: comp.registros?.controlPrevio, cs: comp.registros?.controlPosterior, ok: comp.registros?.coincide },
        { item: 'Anulados', cp: comp.registros?.anulados || 0, cs: comp.registros?.anulados || 0, ok: true },
        { item: 'Apuestas', cp: comp.apuestas?.controlPrevio, cs: comp.apuestas?.controlPosterior, ok: comp.apuestas?.coincide },
        { item: 'Recaudación', cp: comp.recaudacion?.controlPrevio, cs: comp.recaudacion?.controlPosterior, ok: comp.recaudacion?.coincide, isMoney: true }
      ];
      
      // Header
      doc.rect(50, y, 495, 16).fill('#e2e8f0');
      doc.fillColor('#475569').fontSize(8).font('Helvetica-Bold');
      doc.text('CONCEPTO', 60, y + 4);
      doc.text('CONTROL PREVIO', 200, y + 4);
      doc.text('ESCRUTINIO', 330, y + 4);
      doc.text('ESTADO', 470, y + 4);
      y += 18;
      
      doc.font('Helvetica').fillColor('#333').fontSize(9);
      compRows.forEach((row, i) => {
        if (i % 2 === 0) doc.rect(50, y - 2, 495, 16).fill('#f8fafc');
        doc.fillColor('#333');
        doc.text(row.item, 60, y);
        doc.text(row.isMoney ? formatearMoneda(row.cp) : formatearNumero(row.cp), 200, y);
        doc.text(row.isMoney ? formatearMoneda(row.cs) : formatearNumero(row.cs), 330, y);
        doc.fillColor(row.ok ? '#16a34a' : '#dc2626').font('Helvetica-Bold');
        doc.text(row.ok ? '✓ OK' : '✗ DIF', 470, y);
        doc.font('Helvetica');
        y += 16;
      });

      y += 10;

      // ========== GANADORES POR EXTRACTO ==========
      doc.rect(50, y, 495, 20).fill('#1e3a5f');
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
         .text('DETALLE POR EXTRACTO (PROVINCIA)', 60, y + 5);
      y += 25;
      
      // Header tabla extractos
      doc.rect(50, y, 495, 18).fill('#e2e8f0');
      doc.fillColor('#475569').fontSize(8).font('Helvetica-Bold');
      doc.text('EXTRACTO', 55, y + 5);
      doc.text('TOTAL', 125, y + 5, { width: 65, align: 'right' });
      doc.text('1 CIFRA', 195, y + 5, { width: 55, align: 'right' });
      doc.text('2 CIFRAS', 255, y + 5, { width: 55, align: 'right' });
      doc.text('3 CIFRAS', 315, y + 5, { width: 55, align: 'right' });
      doc.text('4 CIFRAS', 375, y + 5, { width: 55, align: 'right' });
      doc.text('REDOB.', 435, y + 5, { width: 50, align: 'right' });
      doc.text('LETRAS', 490, y + 5, { width: 50, align: 'right' });
      y += 20;
      
      // Filas por extracto (2 filas por extracto: ganadores + importes)
      let totGan = 0, totPrem = 0;
      let tot1c = 0, tot2c = 0, tot3c = 0, tot4c = 0, totRed = 0, totLet = 0;
      let prem1c = 0, prem2c = 0, prem3c = 0, prem4c = 0, premRed = 0, premLet = 0;
      
      // Función para formatear importe completo con separación de miles y decimales
      const fmtImporteCompleto = (p) => {
        if (!p || p === 0) return '-';
        return '$' + p.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      };
      
      doc.font('Helvetica').fontSize(8);
      extractosCargados.forEach((rep, i) => {
        // Fondo alternado para cada extracto (cubre las 2 filas)
        if (i % 2 === 0) doc.rect(50, y - 2, 495, 28).fill('#f8fafc');
        
        // Primera fila: Nombre del extracto + cantidad de ganadores
        doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(9);
        doc.text(rep.nombre.substring(0, 14), 55, y);
        doc.font('Helvetica').fillColor('#333').fontSize(9);
        doc.text(rep.totalGanadores || '-', 125, y, { width: 65, align: 'right' });
        doc.text(rep.porCifras[1].ganadores || '-', 195, y, { width: 55, align: 'right' });
        doc.text(rep.porCifras[2].ganadores || '-', 255, y, { width: 55, align: 'right' });
        doc.text(rep.porCifras[3].ganadores || '-', 315, y, { width: 55, align: 'right' });
        doc.text(rep.porCifras[4].ganadores || '-', 375, y, { width: 55, align: 'right' });
        doc.text(rep.redoblona.ganadores || '-', 435, y, { width: 50, align: 'right' });
        doc.text(rep.letras.ganadores || '-', 490, y, { width: 50, align: 'right' });
        
        y += 12;
        
        // Segunda fila: Importes pagados (en verde, tamaño legible)
        doc.fillColor('#16a34a').fontSize(8).font('Helvetica-Bold');
        doc.text('', 55, y); // espacio vacío para alinear
        doc.text(fmtImporteCompleto(rep.totalPagado), 125, y, { width: 65, align: 'right' });
        doc.text(fmtImporteCompleto(rep.porCifras[1].pagado), 195, y, { width: 55, align: 'right' });
        doc.text(fmtImporteCompleto(rep.porCifras[2].pagado), 255, y, { width: 55, align: 'right' });
        doc.text(fmtImporteCompleto(rep.porCifras[3].pagado), 315, y, { width: 55, align: 'right' });
        doc.text(fmtImporteCompleto(rep.porCifras[4].pagado), 375, y, { width: 55, align: 'right' });
        doc.text(fmtImporteCompleto(rep.redoblona.pagado), 435, y, { width: 50, align: 'right' });
        doc.text(fmtImporteCompleto(rep.letras.pagado), 490, y, { width: 50, align: 'right' });
        
        // Acumular totales
        totGan += rep.totalGanadores;
        totPrem += rep.totalPagado;
        tot1c += rep.porCifras[1].ganadores;
        tot2c += rep.porCifras[2].ganadores;
        tot3c += rep.porCifras[3].ganadores;
        tot4c += rep.porCifras[4].ganadores;
        totRed += rep.redoblona.ganadores;
        totLet += rep.letras.ganadores;
        prem1c += rep.porCifras[1].pagado;
        prem2c += rep.porCifras[2].pagado;
        prem3c += rep.porCifras[3].pagado;
        prem4c += rep.porCifras[4].pagado;
        premRed += rep.redoblona.pagado;
        premLet += rep.letras.pagado;
        
        y += 16;
        doc.fontSize(8);
      });
      
      // Fila de totales - GANADORES
      doc.rect(50, y, 495, 14).fill('#1e3a5f');
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold');
      doc.text('TOTAL GAN.', 55, y + 3);
      doc.text(totGan, 125, y + 3, { width: 65, align: 'right' });
      doc.text(tot1c, 195, y + 3, { width: 55, align: 'right' });
      doc.text(tot2c, 255, y + 3, { width: 55, align: 'right' });
      doc.text(tot3c, 315, y + 3, { width: 55, align: 'right' });
      doc.text(tot4c, 375, y + 3, { width: 55, align: 'right' });
      doc.text(totRed, 435, y + 3, { width: 50, align: 'right' });
      doc.text(totLet, 490, y + 3, { width: 50, align: 'right' });
      y += 14;
      
      // Fila de totales - IMPORTES
      doc.rect(50, y, 495, 14).fill('#334155');
      doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');
      doc.text('TOTAL $', 55, y + 3);
      doc.text(fmtImporteCompleto(totPrem), 125, y + 3, { width: 65, align: 'right' });
      doc.text(fmtImporteCompleto(prem1c), 195, y + 3, { width: 55, align: 'right' });
      doc.text(fmtImporteCompleto(prem2c), 255, y + 3, { width: 55, align: 'right' });
      doc.text(fmtImporteCompleto(prem3c), 315, y + 3, { width: 55, align: 'right' });
      doc.text(fmtImporteCompleto(prem4c), 375, y + 3, { width: 55, align: 'right' });
      doc.text(fmtImporteCompleto(premRed), 435, y + 3, { width: 50, align: 'right' });
      doc.text(fmtImporteCompleto(premLet), 490, y + 3, { width: 50, align: 'right' });
      
      y += 20;

      // ========== DETALLE POR TIPO DE APUESTA (si hay espacio) ==========
      if (y < 580) {
        doc.rect(50, y, 495, 20).fill('#334155');
        doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
           .text('RESUMEN POR TIPO DE APUESTA', 60, y + 5);
        y += 25;
        
        const tipos = [
          { nombre: '1 Cifra', indice: 'x7', tickets: tot1c, premio: prem1c },
          { nombre: '2 Cifras', indice: 'x70', tickets: tot2c, premio: prem2c },
          { nombre: '3 Cifras', indice: 'x600', tickets: tot3c, premio: prem3c },
          { nombre: '4 Cifras', indice: 'x3500', tickets: tot4c, premio: prem4c },
          { nombre: 'Redoblona', indice: '(*)', tickets: totRed, premio: premRed },
          { nombre: 'Letras', indice: '$1000', tickets: totLet, premio: premLet }
        ];
        
        // Header
        doc.rect(50, y, 495, 14).fill('#e2e8f0');
        doc.fillColor('#475569').fontSize(8).font('Helvetica-Bold');
        doc.text('TIPO', 60, y + 3);
        doc.text('ÍNDICE', 180, y + 3);
        doc.text('GANADORES', 280, y + 3, { width: 70, align: 'right' });
        doc.text('TOTAL PREMIOS', 380, y + 3, { width: 100, align: 'right' });
        y += 16;
        
        doc.font('Helvetica').fontSize(9);
        tipos.forEach((t, i) => {
          if (i % 2 === 0) doc.rect(50, y - 2, 495, 14).fill('#f8fafc');
          doc.fillColor('#333');
          doc.text(t.nombre, 60, y);
          doc.text(t.indice, 180, y);
          doc.text(formatearNumero(t.tickets), 280, y, { width: 70, align: 'right' });
          doc.fillColor('#16a34a').font('Helvetica-Bold');
          doc.text(formatearMoneda(t.premio), 380, y, { width: 100, align: 'right' });
          doc.font('Helvetica');
          y += 14;
        });
      }

      // ========== EXTRACTOS SORTEADOS (Números) ==========
      // Nueva página para los extractos
      doc.addPage();
      y = 50;

      doc.rect(50, y, 495, 22).fill('#1e3a5f');
      doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold')
         .text('EXTRACTOS SORTEADOS', 60, y + 6);
      y += 28;

      // Obtener extractos del request
      const extractosRaw = datos.extractos || [];
      const extractosFiltrados = extractosRaw.filter(ext => {
        if (!ext.numeros || ext.numeros.length === 0) return false;
        return ext.numeros.some(n => n && n !== '0000' && n !== '----' && n !== '');
      });

      if (extractosFiltrados.length > 0) {
        for (const ext of extractosFiltrados) {
          const nums = ext.numeros || [];
          const letras = ext.letras || [];

          // Verificar espacio en página
          if (y > 700) {
            doc.addPage();
            y = 50;
          }

          // Caja del extracto
          doc.rect(50, y, 495, 50).fill('#f8fafc').stroke('#e2e8f0');

          // Nombre del extracto
          doc.fillColor('#1e3a5f').fontSize(10).font('Helvetica-Bold');
          doc.text(ext.nombre || 'Extracto', 60, y + 5);

          // Letras (si hay)
          if (letras.length > 0 && letras.some(l => l)) {
            doc.fillColor('#f59e0b').fontSize(12).font('Helvetica-Bold');
            doc.text(letras.filter(l => l).join('  '), 400, y + 5, { width: 140, align: 'right' });
          }

          // Números 1-10 (primera fila)
          doc.font('Helvetica').fillColor('#333').fontSize(9);
          let numX = 60;
          for (let i = 0; i < 10; i++) {
            const num = nums[i] || '----';
            // Resaltar posición 1 (cabeza)
            if (i === 0) {
              doc.rect(numX - 2, y + 18, 42, 14).fill('#fef3c7');
              doc.fillColor('#92400e').font('Helvetica-Bold');
            } else {
              doc.fillColor('#333').font('Helvetica');
            }
            doc.text(`${i + 1}: ${num}`, numX, y + 20, { width: 40 });
            numX += 48;
          }

          // Números 11-20 (segunda fila)
          doc.font('Helvetica').fillColor('#666').fontSize(8);
          numX = 60;
          for (let i = 10; i < 20; i++) {
            const num = nums[i] || '----';
            doc.text(`${i + 1}: ${num}`, numX, y + 36, { width: 40 });
            numX += 48;
          }

          y += 58;
        }
      } else {
        doc.fillColor('#666').fontSize(10).font('Helvetica');
        doc.text('No hay extractos cargados', 60, y);
        y += 20;
      }

    } else if (tipoJuego === 'Loto') {
      // ══════════════════════════════════════════════════════════════
      // LOTO - 4 Modalidades (Tradicional, Match, Desquite, Sale o Sale)
      // ══════════════════════════════════════════════════════════════
      const porModalidad = resData.porModalidad || {};
      const multiplicador = resData.multiplicador || {};
      // Priorizar extractoUsado del resultado, sino usar extractoLoto enviado por frontend
      const extractoUsado = resData.extractoUsado || datos.extractoLoto || {};
      const xmlDataLoto = datos.xmlDataLoto || {}; // Datos adicionales del XML
      
      // ========== EXTRACTOS DE CADA MODALIDAD ==========
      doc.fontSize(10).fillColor('#1e293b').font('Helvetica-Bold').text('EXTRACTOS DEL SORTEO', 50, y);
      y += 15;

      const modalidadesExtracto = [
        { key: 'tradicional', nombre: 'Tradicional', color: '#f59e0b' },
        { key: 'match', nombre: 'Match', color: '#3b82f6' },
        { key: 'desquite', nombre: 'Desquite', color: '#06b6d4' },
        { key: 'saleOSale', nombre: 'Sale o Sale', color: '#22c55e' }
      ];

      doc.fontSize(8);
      for (const mod of modalidadesExtracto) {
        const nums = extractoUsado[mod.key] || [];
        doc.fillColor(mod.color).font('Helvetica-Bold').text(`${mod.nombre}: `, 60, y, { continued: true });
        doc.fillColor('#333').font('Helvetica').text(nums.length > 0 ? nums.map(n => String(n).padStart(2, '0')).join(' - ') : '-');
        y += 12;
      }
      
      if (extractoUsado.plus != null) {
        doc.fillColor('#dc2626').font('Helvetica-Bold').text(`Número PLUS: `, 60, y, { continued: true });
        doc.fillColor('#333').font('Helvetica').text(String(extractoUsado.plus));
        y += 12;
      }
      y += 10;

      // ========== DETALLE POR MODALIDAD ==========
      doc.fontSize(10).fillColor('#1e293b').font('Helvetica-Bold').text('DETALLE POR MODALIDAD', 50, y);
      y += 15;

      // Cabecera de tabla - columnas redistribuidas para mejor visualización
      doc.rect(50, y, 500, 16).fill('#1e3a5f');
      doc.fontSize(7).fillColor('#ffffff').font('Helvetica-Bold');
      doc.text('MODALIDAD', 55, y + 4);
      doc.text('NIV', 115, y + 4);        // Reducido
      doc.text('GANADORES', 145, y + 4);
      doc.text('POZO XML', 220, y + 4);
      doc.text('PREMIO UNIT.', 305, y + 4);
      doc.text('TOTAL PREMIOS', 390, y + 4);
      doc.text('VACANTE', 480, y + 4);
      y += 18;

      const modalidades = ['Tradicional', 'Match', 'Desquite', 'Sale o Sale'];
      const colores = { 'Tradicional': '#f59e0b', 'Match': '#3b82f6', 'Desquite': '#06b6d4', 'Sale o Sale': '#22c55e' };

      doc.fontSize(7);
      for (const mod of modalidades) {
        const modData = porModalidad[mod];
        if (!modData) continue;

        let niveles;
        if (mod === 'Sale o Sale') {
          // Sale o Sale: Solo mostrar el nivel ganador (cascada 6→5→4→3→2→1)
          const nivelGanador = modData.nivelGanadorSOS || [6, 5, 4, 3, 2, 1].find(n => modData.porNivel?.[n]?.ganadores > 0);
          niveles = nivelGanador ? [nivelGanador] : [6]; // Si no hay ganador, mostrar 6 como vacante
        } else if (mod === 'Desquite') {
          niveles = [6]; // Desquite solo tiene 6 aciertos
        } else {
          niveles = [6, 5, 4]; // Tradicional y Match tienen 6, 5, 4
        }
        
        const xmlPremios = modData.xmlPremios || {};
        
        for (const nivel of niveles) {
          const nd = modData.porNivel?.[nivel] || { ganadores: 0, premioUnitario: 0, totalPremios: 0, pozoVacante: 0 };
          let nombreNivel;
          if (mod === 'Sale o Sale') {
            nombreNivel = `${nivel} ac.`;  // "5 ac.", "4 ac.", etc.
          } else {
            nombreNivel = `${nivel}`;  // Solo el número: "6", "5", "4"
          }
          const pozoKey = nivel === 6 ? 'primerPremio' : (nivel === 5 ? 'segundoPremio' : (nivel === 4 ? 'tercerPremio' : null));
          // Para Sale o Sale, siempre usar primerPremio (el pozo acumulado)
          const pozoXml = mod === 'Sale o Sale' 
            ? (xmlPremios.primerPremio?.totales || 0)
            : (pozoKey && xmlPremios[pozoKey] ? xmlPremios[pozoKey].totales || 0 : 0);

          doc.fillColor(colores[mod]).font('Helvetica-Bold').text(mod, 55, y);
          doc.fillColor('#333').font('Helvetica');
          doc.text(nombreNivel, 115, y);
          doc.text(formatearNumero(nd.ganadores), 145, y);
          doc.text(formatearMoneda(pozoXml), 220, y);
          doc.text(formatearMoneda(nd.premioUnitario), 305, y);
          doc.text(formatearMoneda(nd.totalPremios), 390, y);
          doc.fillColor(nd.ganadores === 0 && pozoXml > 0 ? '#ef4444' : '#333');
          doc.text(nd.ganadores === 0 && pozoXml > 0 ? formatearMoneda(pozoXml) : '-', 480, y);
          y += 11;
        }

        // Agenciero
        if (modData.agenciero && (modData.agenciero.ganadores > 0 || (modData.xmlPremios?.agenciero?.totales || 0) > 0)) {
          const ag = modData.agenciero;
          const agXml = modData.xmlPremios?.agenciero?.totales || 0;
          doc.rect(50, y - 2, 500, 11).fill('#fff7ed');
          doc.fillColor('#9a3412').font('Helvetica-Bold').text('AGENCIERO', 115, y);
          doc.font('Helvetica');
          doc.text(formatearNumero(ag.ganadores || 0), 145, y);
          doc.text(formatearMoneda(agXml), 220, y);
          doc.text(formatearMoneda(ag.premioUnitario || 0), 305, y);
          doc.text(formatearMoneda(ag.totalPremios || 0), 390, y);
          doc.text('-', 480, y);
          y += 11;
        }
        
        y += 3;
      }

      // Multiplicador - SIEMPRE mostrar
      const plusNumero = multiplicador.numeroPLUS ?? extractoUsado.plus ?? '-';
      const multGanadores = multiplicador.ganadores || 0;
      doc.rect(50, y - 2, 500, 11).fill('#fef3c7');
      doc.fillColor('#92400e').font('Helvetica-Bold').text('MULTIPLICADOR', 55, y);
      doc.font('Helvetica');
      doc.text(`PLUS: ${plusNumero}`, 115, y);
      doc.text(multGanadores > 0 ? formatearNumero(multGanadores) : 'Sin ganadores', 145, y);
      doc.text('-', 220, y);
      doc.text('-', 305, y);
      doc.text(multGanadores > 0 ? formatearMoneda(multiplicador.premioExtra || 0) : '-', 390, y);
      doc.text('-', 480, y);
      y += 15;

      // Total
      doc.rect(50, y, 500, 14).fill('#1e3a5f');
      doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');
      doc.text('TOTAL GENERAL', 55, y + 3);
      doc.text(formatearNumero(resData.totalGanadores || 0), 145, y + 3);
      doc.text(formatearMoneda(resData.totalPremios || 0), 390, y + 3);
      y += 20;

      // ========== COMPARACIÓN CONTROL PREVIO ==========
      doc.fontSize(10).fillColor('#1e293b').font('Helvetica-Bold').text('COMPARACIÓN CON CONTROL PREVIO', 50, y);
      y += 15;

      const comp = resData.comparacion || {};
      
      const compTable = [
        { item: 'Registros Válidos', cp: comp.registros?.controlPrevio, cs: comp.registros?.controlPosterior, ok: comp.registros?.coincide },
        { item: 'Apuestas Totales', cp: comp.apuestas?.controlPrevio, cs: comp.apuestas?.controlPosterior, ok: comp.apuestas?.coincide },
        { item: 'Recaudación Bruta', cp: comp.recaudacion?.controlPrevio, cs: comp.recaudacion?.controlPosterior, ok: comp.recaudacion?.coincide, isMoney: true }
      ];

      doc.rect(50, y, 495, 14).fill('#f1f5f9');
      doc.fontSize(7).fillColor('#475569').font('Helvetica-Bold');
      doc.text('CONCEPTO', 60, y + 3);
      doc.text('CONTROL PREVIO', 180, y + 3);
      doc.text('ESCRUTINIO', 330, y + 3);
      doc.text('ESTADO', 480, y + 3);
      y += 16;

      doc.font('Helvetica').fillColor('#333').fontSize(8);
      compTable.forEach(row => {
        doc.text(row.item, 60, y);
        doc.text(row.isMoney ? formatearMoneda(row.cp) : formatearNumero(row.cp), 180, y);
        doc.text(row.isMoney ? formatearMoneda(row.cs) : formatearNumero(row.cs), 330, y);
        doc.fillColor(row.ok ? '#10b981' : '#ef4444').font('Helvetica-Bold');
        doc.text(row.ok ? '✓ OK' : '✗ DIF', 480, y);
        doc.font('Helvetica').fillColor('#333');
        y += 14;
      });

      // ========== RESUMEN FINAL ==========
      y += 10;
      doc.rect(50, y, 495, 36).fill('#f0fdf4').stroke('#22c55e');
      doc.fontSize(9).fillColor('#166534').font('Helvetica-Bold');
      doc.text('TOTAL GANADORES:', 60, y + 8);
      doc.text(formatearNumero(resData.totalGanadores || 0), 180, y + 8);
      doc.text('TOTAL PREMIOS PAGADOS:', 60, y + 22);
      doc.text(formatearMoneda(resData.totalPremios || 0), 180, y + 22);
      y += 45;

    } else if (tipoJuego === 'Quini 6' || tipoJuego === 'QUINI 6' || tipoJuego === 'Quini6') {
      // ══════════════════════════════════════════════════════════════
      // QUINI 6 - Escrutinio completo
      // ══════════════════════════════════════════════════════════════
      const ganadores = resData.ganadores || {};
      const extractoQ6 = resData.extracto || datos.extractoQuini6 || {};
      const porInstancia = resData.porInstancia || {};
      
      // ========== RESUMEN GENERAL ==========
      doc.rect(50, y, 495, 22).fill('#1e3a5f');
      doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold')
         .text('RESUMEN GENERAL', 60, y + 6);
      y += 28;
      
      // Cajas de estadísticas
      const recaudacion = (porInstancia['1']?.recaudacion || 0) + (porInstancia['2']?.recaudacion || 0) + (porInstancia['3']?.recaudacion || 0);
      const totalApuestas = (porInstancia['1']?.apuestas || (porInstancia['1']?.registros || 0)) + 
                           (porInstancia['2']?.apuestas || (porInstancia['2']?.registros || 0) * 2) + 
                           (porInstancia['3']?.apuestas || (porInstancia['3']?.registros || 0) * 3);
      let totalGanadoresQ6 = 0;
      let totalPremiosQ6 = 0;
      
      // Sumar ganadores y premios de todas las modalidades
      for (const nivel of ['6', '5', '4']) {
        totalGanadoresQ6 += (ganadores.tradicionalPrimera?.[nivel]?.cantidad || 0);
        totalGanadoresQ6 += (ganadores.tradicionalSegunda?.[nivel]?.cantidad || 0);
        totalPremiosQ6 += (ganadores.tradicionalPrimera?.[nivel]?.premioTotal || 0);
        totalPremiosQ6 += (ganadores.tradicionalSegunda?.[nivel]?.premioTotal || 0);
      }
      totalGanadoresQ6 += (ganadores.revancha?.['6']?.cantidad || 0);
      totalGanadoresQ6 += (ganadores.siempreSale?.cantidad || 0);
      totalGanadoresQ6 += (ganadores.premioExtra?.['6']?.cantidad || 0);
      totalPremiosQ6 += (ganadores.revancha?.['6']?.premioTotal || 0);
      totalPremiosQ6 += (ganadores.siempreSale?.premioTotal || 0);
      totalPremiosQ6 += (ganadores.premioExtra?.['6']?.premioTotal || 0);
      
      // Caja 1: Total Registros
      doc.rect(50, y, 95, 45).fill('#f0f9ff').stroke('#3b82f6');
      doc.fillColor('#1e40af').fontSize(7).text('TICKETS', 55, y + 8);
      doc.fontSize(12).font('Helvetica-Bold').text(formatearNumero(resData.resumen?.registrosValidos || 0), 55, y + 22);
      
      // Caja 2: Total Apuestas
      doc.rect(150, y, 95, 45).fill('#ede9fe').stroke('#8b5cf6');
      doc.fillColor('#6b21a8').fontSize(7).font('Helvetica').text('APUESTAS', 155, y + 8);
      doc.fontSize(12).font('Helvetica-Bold').text(formatearNumero(totalApuestas), 155, y + 22);
      
      // Caja 3: Total Ganadores
      doc.rect(250, y, 95, 45).fill('#f0fdf4').stroke('#22c55e');
      doc.fillColor('#166534').fontSize(7).font('Helvetica').text('GANADORES', 255, y + 8);
      doc.fontSize(12).font('Helvetica-Bold').text(formatearNumero(totalGanadoresQ6), 255, y + 22);
      
      // Caja 4: Recaudación
      doc.rect(350, y, 95, 45).fill('#fef3c7').stroke('#f59e0b');
      doc.fillColor('#92400e').fontSize(7).font('Helvetica').text('RECAUDACIÓN', 355, y + 8);
      doc.fontSize(10).font('Helvetica-Bold').text(formatearMoneda(recaudacion), 355, y + 22);
      
      // Caja 5: Total Premios
      doc.rect(450, y, 95, 45).fill('#dbeafe').stroke('#3b82f6');
      doc.fillColor('#1e40af').fontSize(7).font('Helvetica').text('PREMIOS', 455, y + 8);
      doc.fontSize(10).font('Helvetica-Bold').text(formatearMoneda(totalPremiosQ6), 455, y + 22);
      
      y += 55;

      // ========== EXTRACTO OFICIAL ==========
      doc.rect(50, y, 495, 22).fill('#7c3aed');
      doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold')
         .text('EXTRACTO OFICIAL', 60, y + 6);
      y += 28;
      
      const modalidadesQ6 = [
        { key: 'tradicional.primera', nombre: 'Tradicional 1ª', nums: extractoQ6.tradicional?.primera || [], color: '#3b82f6' },
        { key: 'tradicional.segunda', nombre: 'Tradicional 2ª', nums: extractoQ6.tradicional?.segunda || [], color: '#10b981' },
        { key: 'revancha', nombre: 'Revancha', nums: extractoQ6.revancha || [], color: '#f59e0b' },
        { key: 'siempreSale', nombre: 'Siempre Sale', nums: extractoQ6.siempreSale || [], color: '#9333ea' }
      ];
      
      doc.fontSize(9);
      for (const mod of modalidadesQ6) {
        doc.fillColor(mod.color).font('Helvetica-Bold').text(`${mod.nombre}: `, 60, y, { continued: true });
        doc.fillColor('#333').font('Helvetica').text(mod.nums.length > 0 ? mod.nums.map(n => String(n).padStart(2, '0')).join(' - ') : '-');
        y += 14;
      }
      y += 10;

      // ========== RECAUDACIÓN POR MODALIDAD ==========
      doc.rect(50, y, 495, 18).fill('#334155');
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
         .text('RECAUDACIÓN POR INSTANCIA', 60, y + 4);
      y += 22;
      
      const instancias = [
        { id: '1', nombre: 'Tradicional', color: '#3b82f6', multiplicador: 1 },
        { id: '2', nombre: 'Trad + Revancha', color: '#f59e0b', multiplicador: 2 },
        { id: '3', nombre: 'Trad + Rev + SS', color: '#9333ea', multiplicador: 3 }
      ];
      
      doc.rect(50, y, 495, 14).fill('#f1f5f9');
      doc.fontSize(7).fillColor('#475569').font('Helvetica-Bold');
      doc.text('INSTANCIA', 60, y + 3);
      doc.text('REGISTROS', 170, y + 3);
      doc.text('APUESTAS', 260, y + 3);
      doc.text('RECAUDACIÓN', 380, y + 3);
      y += 16;
      
      doc.font('Helvetica').fillColor('#333').fontSize(8);
      for (const inst of instancias) {
        const data = porInstancia[inst.id] || { registros: 0, apuestas: 0, recaudacion: 0 };
        const apuestas = data.apuestas || (data.registros * inst.multiplicador);
        doc.fillColor(inst.color).font('Helvetica-Bold').text(inst.nombre, 60, y);
        doc.fillColor('#333').font('Helvetica');
        doc.text(formatearNumero(data.registros), 170, y);
        doc.text(formatearNumero(apuestas), 260, y);
        doc.text(formatearMoneda(data.recaudacion), 380, y);
        y += 14;
      }
      y += 10;

      // ========== DESGLOSE DE GANADORES ==========
      doc.rect(50, y, 495, 18).fill('#1e3a5f');
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
         .text('DESGLOSE DE GANADORES POR MODALIDAD', 60, y + 4);
      y += 22;
      
      // Cabecera
      doc.rect(50, y, 495, 14).fill('#f1f5f9');
      doc.fontSize(7).fillColor('#475569').font('Helvetica-Bold');
      doc.text('MODALIDAD', 60, y + 3);
      doc.text('NIVEL', 160, y + 3);
      doc.text('GANADORES', 230, y + 3);
      doc.text('PREMIO UNIT.', 320, y + 3);
      doc.text('TOTAL PREMIOS', 430, y + 3);
      y += 16;
      
      doc.font('Helvetica').fillColor('#333').fontSize(8);
      
      // Tradicional Primera
      for (const nivel of ['6', '5', '4']) {
        const data = ganadores.tradicionalPrimera?.[nivel] || { cantidad: 0, premioUnitario: 0, premioTotal: 0 };
        if (data.cantidad > 0 || nivel === '6') {
          doc.fillColor('#3b82f6').font('Helvetica-Bold').text('Tradicional 1ª', 60, y);
          doc.fillColor('#333').font('Helvetica');
          doc.text(`${nivel} aciertos`, 160, y);
          doc.text(formatearNumero(data.cantidad), 230, y);
          doc.text(formatearMoneda(data.premioUnitario), 320, y);
          doc.fillColor(data.cantidad > 0 ? '#10b981' : '#333').font(data.cantidad > 0 ? 'Helvetica-Bold' : 'Helvetica');
          doc.text(formatearMoneda(data.premioTotal), 430, y);
          doc.font('Helvetica').fillColor('#333');
          y += 12;
        }
      }
      
      // Tradicional Segunda
      for (const nivel of ['6', '5', '4']) {
        const data = ganadores.tradicionalSegunda?.[nivel] || { cantidad: 0, premioUnitario: 0, premioTotal: 0 };
        if (data.cantidad > 0 || nivel === '6') {
          doc.fillColor('#10b981').font('Helvetica-Bold').text('Tradicional 2ª', 60, y);
          doc.fillColor('#333').font('Helvetica');
          doc.text(`${nivel} aciertos`, 160, y);
          doc.text(formatearNumero(data.cantidad), 230, y);
          doc.text(formatearMoneda(data.premioUnitario), 320, y);
          doc.fillColor(data.cantidad > 0 ? '#10b981' : '#333').font(data.cantidad > 0 ? 'Helvetica-Bold' : 'Helvetica');
          doc.text(formatearMoneda(data.premioTotal), 430, y);
          doc.font('Helvetica').fillColor('#333');
          y += 12;
        }
      }
      
      // Revancha
      const revData = ganadores.revancha?.['6'] || { cantidad: 0, premioUnitario: 0, premioTotal: 0 };
      doc.fillColor('#f59e0b').font('Helvetica-Bold').text('Revancha', 60, y);
      doc.fillColor('#333').font('Helvetica');
      doc.text('6 aciertos', 160, y);
      doc.text(formatearNumero(revData.cantidad), 230, y);
      doc.text(formatearMoneda(revData.premioUnitario), 320, y);
      doc.fillColor(revData.cantidad > 0 ? '#10b981' : '#333').font(revData.cantidad > 0 ? 'Helvetica-Bold' : 'Helvetica');
      doc.text(formatearMoneda(revData.premioTotal), 430, y);
      y += 12;
      
      // Siempre Sale
      const ssData = ganadores.siempreSale || { cantidad: 0, premioUnitario: 0, premioTotal: 0, aciertosRequeridos: 6 };
      doc.fillColor('#9333ea').font('Helvetica-Bold').text('Siempre Sale', 60, y);
      doc.fillColor('#333').font('Helvetica');
      doc.text(`${ssData.aciertosRequeridos || 6} aciertos`, 160, y);
      doc.text(formatearNumero(ssData.cantidad), 230, y);
      doc.text(formatearMoneda(ssData.premioUnitario), 320, y);
      doc.fillColor(ssData.cantidad > 0 ? '#10b981' : '#333').font(ssData.cantidad > 0 ? 'Helvetica-Bold' : 'Helvetica');
      doc.text(formatearMoneda(ssData.premioTotal), 430, y);
      y += 12;
      
      // Premio Extra
      const peData = ganadores.premioExtra?.['6'] || { cantidad: 0, premioUnitario: 0, premioTotal: 0 };
      doc.fillColor('#ec4899').font('Helvetica-Bold').text('Premio Extra', 60, y);
      doc.fillColor('#333').font('Helvetica');
      doc.text('6 aciertos', 160, y);
      doc.text(formatearNumero(peData.cantidad), 230, y);
      doc.text(formatearMoneda(peData.premioUnitario), 320, y);
      doc.fillColor(peData.cantidad > 0 ? '#10b981' : '#333').font(peData.cantidad > 0 ? 'Helvetica-Bold' : 'Helvetica');
      doc.text(formatearMoneda(peData.premioTotal), 430, y);
      y += 20;

      // ========== RESUMEN FINAL ==========
      doc.rect(50, y, 495, 36).fill('#f0fdf4').stroke('#22c55e');
      doc.fontSize(9).fillColor('#166534').font('Helvetica-Bold');
      doc.text('TOTAL GANADORES:', 60, y + 8);
      doc.text(formatearNumero(totalGanadoresQ6), 180, y + 8);
      doc.text('TOTAL PREMIOS PAGADOS:', 60, y + 22);
      doc.text(formatearMoneda(totalPremiosQ6), 180, y + 22);
      y += 45;

    } else if (tipoJuego === 'Brinco' || tipoJuego === 'BRINCO') {
      // ══════════════════════════════════════════════════════════════
      // BRINCO - Escrutinio completo
      // ══════════════════════════════════════════════════════════════
      const tradicional = resData.tradicional || {};
      const junior = resData.junior || {};
      const extractoBrinco = resData.extracto || datos.extractoBrinco || {};
      
      // ========== RESUMEN GENERAL ==========
      doc.rect(50, y, 495, 22).fill('#1e3a5f');
      doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold')
         .text('RESUMEN GENERAL', 60, y + 6);
      y += 28;
      
      // Cajas de estadísticas
      const totalGanadoresBrinco = (tradicional.totalGanadores || 0) + (junior.totalGanadores || 0);
      const totalPremiosBrinco = (tradicional.totalPremios || 0) + (junior.totalPremios || 0);
      const recaudacion = resData.resumen?.recaudacion || 0;
      const totalApuestas = resData.resumen?.apuestasTotal || resData.resumen?.registrosValidos || 0;
      
      // Caja 1: Total Registros
      doc.rect(50, y, 95, 45).fill('#f0f9ff').stroke('#3b82f6');
      doc.fillColor('#1e40af').fontSize(7).text('TICKETS', 55, y + 8);
      doc.fontSize(12).font('Helvetica-Bold').text(formatearNumero(resData.resumen?.registrosValidos || 0), 55, y + 22);
      
      // Caja 2: Total Apuestas
      doc.rect(150, y, 95, 45).fill('#ede9fe').stroke('#8b5cf6');
      doc.fillColor('#6b21a8').fontSize(7).font('Helvetica').text('APUESTAS', 155, y + 8);
      doc.fontSize(12).font('Helvetica-Bold').text(formatearNumero(totalApuestas), 155, y + 22);
      
      // Caja 3: Total Ganadores
      doc.rect(250, y, 95, 45).fill('#f0fdf4').stroke('#22c55e');
      doc.fillColor('#166534').fontSize(7).font('Helvetica').text('GANADORES', 255, y + 8);
      doc.fontSize(12).font('Helvetica-Bold').text(formatearNumero(totalGanadoresBrinco), 255, y + 22);
      
      // Caja 4: Recaudación
      doc.rect(350, y, 95, 45).fill('#fef3c7').stroke('#f59e0b');
      doc.fillColor('#92400e').fontSize(7).font('Helvetica').text('RECAUDACIÓN', 355, y + 8);
      doc.fontSize(10).font('Helvetica-Bold').text(formatearMoneda(recaudacion), 355, y + 22);
      
      // Caja 5: Total Premios
      doc.rect(450, y, 95, 45).fill('#dbeafe').stroke('#3b82f6');
      doc.fillColor('#1e40af').fontSize(7).font('Helvetica').text('PREMIOS', 455, y + 8);
      doc.fontSize(10).font('Helvetica-Bold').text(formatearMoneda(totalPremiosBrinco), 455, y + 22);
      
      y += 55;

      // ========== EXTRACTO OFICIAL ==========
      doc.rect(50, y, 495, 22).fill('#f59e0b');
      doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold')
         .text('EXTRACTO OFICIAL', 60, y + 6);
      y += 28;
      
      const numsTrad = extractoBrinco.tradicional?.numeros || [];
      const numsJunior = extractoBrinco.junior?.numeros || numsTrad;
      
      doc.fontSize(9);
      doc.fillColor('#3b82f6').font('Helvetica-Bold').text('BRINCO Tradicional: ', 60, y, { continued: true });
      doc.fillColor('#333').font('Helvetica').text(numsTrad.length > 0 ? numsTrad.map(n => String(n).padStart(2, '0')).join(' - ') : '-');
      y += 16;
      doc.fillColor('#22c55e').font('Helvetica-Bold').text('BRINCO Junior: ', 60, y, { continued: true });
      doc.fillColor('#333').font('Helvetica').text(numsJunior.length > 0 ? numsJunior.map(n => String(n).padStart(2, '0')).join(' - ') : '-');
      y += 20;

      // ========== BRINCO TRADICIONAL ==========
      doc.rect(50, y, 495, 18).fill('#3b82f6');
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
         .text('BRINCO TRADICIONAL', 60, y + 4);
      y += 22;
      
      // Cabecera
      doc.rect(50, y, 495, 14).fill('#f1f5f9');
      doc.fontSize(7).fillColor('#475569').font('Helvetica-Bold');
      doc.text('NIVEL', 60, y + 3);
      doc.text('ACIERTOS', 140, y + 3);
      doc.text('GANADORES TXT', 220, y + 3);
      doc.text('EXTRACTO', 320, y + 3);
      doc.text('PREMIO UNIT.', 395, y + 3);
      doc.text('TOTAL', 480, y + 3);
      y += 16;
      
      const porNivelTrad = tradicional.porNivel || {};
      const nivelLabelsTrad = { 6: '1° Premio', 5: '2° Premio', 4: '3° Premio', 3: '4° Premio' };
      
      doc.font('Helvetica').fillColor('#333').fontSize(8);
      for (const nivel of [6, 5, 4, 3]) {
        const data = porNivelTrad[nivel] || { ganadores: 0, premioUnitario: 0, totalPremios: 0, ganadores_extracto: 0 };
        const coincide = data.ganadores === (data.ganadores_extracto || 0);
        
        doc.fillColor(nivel === 6 ? '#3b82f6' : '#333').font(nivel === 6 ? 'Helvetica-Bold' : 'Helvetica');
        doc.text(nivelLabelsTrad[nivel], 60, y);
        doc.fillColor('#333').font('Helvetica');
        doc.text(`${nivel} aciertos`, 140, y);
        doc.text(formatearNumero(data.ganadores), 220, y);
        doc.fillColor(coincide ? '#22c55e' : '#ef4444');
        doc.text(formatearNumero(data.ganadores_extracto || 0), 320, y);
        doc.fillColor('#333');
        doc.text(formatearMoneda(data.premioUnitario), 395, y);
        doc.fillColor(data.totalPremios > 0 ? '#10b981' : '#333');
        doc.text(formatearMoneda(data.totalPremios), 480, y);
        y += 14;
      }
      y += 8;

      // ========== BRINCO JUNIOR ==========
      doc.rect(50, y, 495, 18).fill('#22c55e');
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
         .text('BRINCO JUNIOR (SIEMPRE SALE)', 60, y + 4);
      y += 22;
      
      // Cabecera
      doc.rect(50, y, 495, 14).fill('#f0fdf4');
      doc.fontSize(7).fillColor('#166534').font('Helvetica-Bold');
      doc.text('NIVEL', 60, y + 3);
      doc.text('ACIERTOS', 140, y + 3);
      doc.text('GANADORES TXT', 220, y + 3);
      doc.text('EXTRACTO', 320, y + 3);
      doc.text('PREMIO UNIT.', 395, y + 3);
      doc.text('TOTAL', 480, y + 3);
      y += 16;
      
      const porNivelJunior = junior.porNivel || {};
      const aciertosJunior = junior.aciertosRequeridos || 5;
      
      doc.font('Helvetica').fillColor('#333').fontSize(8);
      for (const nivel of [6, 5]) {
        const data = porNivelJunior[nivel] || { ganadores: 0, premioUnitario: 0, totalPremios: 0, ganadores_extracto: 0 };
        if (nivel < aciertosJunior && data.ganadores === 0) continue;
        
        const coincide = data.ganadores === (data.ganadores_extracto || 0);
        
        doc.fillColor('#166534').font('Helvetica-Bold');
        doc.text(nivel === 6 ? 'Pozo' : 'Siempre Sale', 60, y);
        doc.fillColor('#333').font('Helvetica');
        doc.text(`${nivel} aciertos`, 140, y);
        doc.text(formatearNumero(data.ganadores), 220, y);
        doc.fillColor(coincide ? '#22c55e' : '#ef4444');
        doc.text(formatearNumero(data.ganadores_extracto || 0), 320, y);
        doc.fillColor('#333');
        doc.text(formatearMoneda(data.premioUnitario), 395, y);
        doc.fillColor(data.totalPremios > 0 ? '#10b981' : '#333');
        doc.text(formatearMoneda(data.totalPremios), 480, y);
        y += 14;
      }
      y += 10;

      // ========== COMPARACIÓN ==========
      const comp = resData.comparacion || {};
      if (comp.tradicional || comp.junior) {
        doc.rect(50, y, 495, 18).fill('#334155');
        doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
           .text('COMPARACIÓN TXT vs EXTRACTO', 60, y + 4);
        y += 22;
        
        let hayDiferencias = false;
        
        // Verificar diferencias en tradicional
        if (comp.tradicional) {
          for (const nivel of [6, 5, 4, 3]) {
            if (comp.tradicional[nivel]?.diferencia !== 0) {
              hayDiferencias = true;
              doc.fillColor('#ef4444').fontSize(8);
              doc.text(`DIFERENCIA Tradicional ${nivel} aciertos: ${comp.tradicional[nivel].diferencia > 0 ? '+' : ''}${comp.tradicional[nivel].diferencia}`, 60, y);
              y += 14;
            }
          }
        }
        
        // Verificar diferencias en junior
        if (comp.junior) {
          for (const nivel of [6, 5]) {
            if (comp.junior[nivel]?.diferencia !== 0) {
              hayDiferencias = true;
              doc.fillColor('#ef4444').fontSize(8);
              doc.text(`DIFERENCIA Junior ${nivel} aciertos: ${comp.junior[nivel].diferencia > 0 ? '+' : ''}${comp.junior[nivel].diferencia}`, 60, y);
              y += 14;
            }
          }
        }
        
        if (!hayDiferencias) {
          doc.fillColor('#22c55e').fontSize(9);
          doc.text('✓ TODOS LOS NIVELES COINCIDEN CON EXTRACTO', 60, y);
          y += 14;
        }
        y += 10;
      }

      // ========== TICKETS GANADORES TRADICIONAL 6 ACIERTOS ==========
      const ganadoresTrad6 = tradicional.porNivel?.[6]?.agenciasGanadoras || [];
      if (ganadoresTrad6.length > 0) {
        // Nueva página si no hay espacio
        if (y > 650) {
          doc.addPage();
          y = 50;
        }
        
        doc.rect(50, y, 495, 18).fill('#3b82f6');
        doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
           .text(`TICKETS GANADORES - TRADICIONAL 6 ACIERTOS (${ganadoresTrad6.length})`, 60, y + 4);
        y += 22;
        
        // Números ganadores
        const numsTrad = extractoBrinco.tradicional?.numeros || [];
        doc.fillColor('#333').fontSize(8).font('Helvetica');
        doc.text('Números Ganadores: ', 60, y, { continued: true });
        doc.font('Helvetica-Bold').fillColor('#3b82f6');
        doc.text(numsTrad.map(n => String(n).padStart(2, '0')).join(' - '));
        y += 14;
        
        // Cabecera tabla
        doc.rect(50, y, 495, 12).fill('#f1f5f9');
        doc.fontSize(7).fillColor('#475569').font('Helvetica-Bold');
        doc.text('TICKET', 55, y + 2);
        doc.text('AGENCIA', 140, y + 2);
        doc.text('NÚMEROS JUGADOS', 230, y + 2);
        doc.text('IMPORTE', 450, y + 2);
        y += 14;
        
        doc.font('Helvetica').fillColor('#333').fontSize(7);
        for (const g of ganadoresTrad6.slice(0, 10)) { // Limitar a 10 para espacio
          doc.text(g.ticket || '-', 55, y);
          doc.text(g.ctaCte || g.agencia || '-', 140, y);
          const nums = (g.numerosJugados || []).map(n => String(n).padStart(2, '0')).join('-');
          doc.text(nums + (g.esMultiple ? ` (×${g.cantidad || g.cantidadCombinaciones})` : ''), 230, y);
          doc.text(formatearMoneda(g.importe || 0), 450, y);
          y += 12;
        }
        if (ganadoresTrad6.length > 10) {
          doc.fontSize(7).fillColor('#666');
          doc.text(`... y ${ganadoresTrad6.length - 10} ganadores más`, 55, y);
          y += 12;
        }
        y += 10;
      }

      // ========== TICKETS GANADORES JUNIOR 5+ ACIERTOS ==========
      const ganadoresJunior5 = junior.porNivel?.[5]?.agenciasGanadoras || [];
      const ganadoresJunior6 = junior.porNivel?.[6]?.agenciasGanadoras || [];
      const todosGanadoresJunior = [...ganadoresJunior6, ...ganadoresJunior5];
      
      if (todosGanadoresJunior.length > 0) {
        // Nueva página si no hay espacio
        if (y > 650) {
          doc.addPage();
          y = 50;
        }
        
        doc.rect(50, y, 495, 18).fill('#22c55e');
        doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
           .text(`TICKETS GANADORES - JUNIOR SIEMPRE SALE (${todosGanadoresJunior.length})`, 60, y + 4);
        y += 22;
        
        // Números ganadores
        const numsJunior = extractoBrinco.junior?.numeros || extractoBrinco.tradicional?.numeros || [];
        doc.fillColor('#333').fontSize(8).font('Helvetica');
        doc.text('Números Ganadores: ', 60, y, { continued: true });
        doc.font('Helvetica-Bold').fillColor('#22c55e');
        doc.text(numsJunior.map(n => String(n).padStart(2, '0')).join(' - '));
        y += 14;
        
        // Cabecera tabla
        doc.rect(50, y, 495, 12).fill('#f0fdf4');
        doc.fontSize(7).fillColor('#166534').font('Helvetica-Bold');
        doc.text('TICKET', 55, y + 2);
        doc.text('AGENCIA', 130, y + 2);
        doc.text('ACIERTOS', 200, y + 2);
        doc.text('NÚMEROS JUGADOS', 260, y + 2);
        doc.text('IMPORTE', 450, y + 2);
        y += 14;
        
        doc.font('Helvetica').fillColor('#333').fontSize(7);
        for (const g of todosGanadoresJunior.slice(0, 10)) { // Limitar a 10
          doc.text(g.ticket || '-', 55, y);
          doc.text(g.ctaCte || g.agencia || '-', 130, y);
          doc.text(String(g.aciertos || 5), 200, y);
          const nums = (g.numerosJugados || []).map(n => String(n).padStart(2, '0')).join('-');
          doc.text(nums + (g.esMultiple ? ` (×${g.cantidadCombinaciones})` : ''), 260, y);
          doc.text(formatearMoneda(g.importe || 0), 450, y);
          y += 12;
        }
        if (todosGanadoresJunior.length > 10) {
          doc.fontSize(7).fillColor('#666');
          doc.text(`... y ${todosGanadoresJunior.length - 10} ganadores más`, 55, y);
          y += 12;
        }
        y += 10;
      }

      // ========== RESUMEN FINAL ==========
      doc.rect(50, y, 495, 36).fill('#f0fdf4').stroke('#22c55e');
      doc.fontSize(9).fillColor('#166534').font('Helvetica-Bold');
      doc.text('TOTAL GANADORES:', 60, y + 8);
      doc.text(formatearNumero(totalGanadoresBrinco), 180, y + 8);
      doc.text('TOTAL PREMIOS PAGADOS:', 60, y + 22);
      doc.text(formatearMoneda(totalPremiosBrinco), 180, y + 22);
      y += 45;

    } else {
      // ══════════════════════════════════════════════════════════════
      // POCEADA / TOMBOLINA - Código existente
      // ══════════════════════════════════════════════════════════════
      const porNivel = resData.porNivel || {};
      const agenciero = resData.agenciero || {};

      // ========== EXTRACTO ==========
      doc.fontSize(11).fillColor('#1e293b').font('Helvetica-Bold').text('EXTRACTO DEL SORTEO', 50, y);
      y += 18;
      
      const extracto = resData.extractoUsado || {};
      doc.fontSize(10).fillColor('#333').font('Helvetica');
      doc.text(`Números: ${ (extracto.numeros || []).join(' - ') }`, 60, y);
      y += 15;
      doc.text(`Letras: ${ (extracto.letras || '') }`, 60, y);
      y += 25;

      // ========== DETALLE DE PREMIOS ==========
      doc.fontSize(11).fillColor('#1e293b').font('Helvetica-Bold').text('DETALLE DE PREMIOS POR NIVEL', 50, y);
      y += 18;

      // Cabecera de tabla
      doc.rect(50, y, 495, 18).fill('#1e3a5f');
      doc.fontSize(8).fillColor('#ffffff').font('Helvetica-Bold');
      doc.text('NIVEL', 55, y + 5);
      doc.text('GANADORES', 150, y + 5);
      doc.text('PREMIO UNIT.', 250, y + 5);
      doc.text('TOTAL PREMIOS', 350, y + 5);
      doc.text('VACANTE', 450, y + 5);
      y += 22;

      const niveles = [
        { label: '8 ACIERTOS', id: 8 },
        { label: '7 ACIERTOS', id: 7 },
        { label: '6 ACIERTOS', id: 6 },
        { label: 'LETRAS', id: 'letras' }
      ];

      doc.font('Helvetica').fontSize(9);
      for (const nivel of niveles) {
        const n = porNivel[nivel.id] || { ganadores: 0, premioUnitario: 0, totalPremios: 0, pozoVacante: 0 };
        
        if (nivel.id === 'letras') {
          doc.rect(50, y - 3, 495, 16).fill('#f0f9ff');
        }

        doc.fillColor('#1e293b').font(nivel.id === 8 ? 'Helvetica-Bold' : 'Helvetica');
        doc.text(nivel.label, 55, y);
        doc.font('Helvetica');
        doc.text(formatearNumero(n.ganadores), 150, y);
        doc.text(formatearMoneda(n.premioUnitario), 250, y);
        doc.text(formatearMoneda(n.totalPremios), 350, y);
        doc.fillColor(n.ganadores === 0 ? '#ef4444' : '#1e293b');
        doc.text(n.ganadores === 0 ? formatearMoneda(n.pozoVacante) : '-', 450, y);
        
        y += 18;

        if (nivel.id === 8) {
          doc.rect(50, y - 3, 495, 16).fill('#fff7ed');
          
          doc.fillColor('#9a3412').font('Helvetica-Bold');
          doc.text('ESTÍMULO AG.', 65, y);
          doc.font('Helvetica');
          doc.text(formatearNumero(agenciero.ganadores || 0), 150, y);
          doc.text(formatearMoneda(agenciero.premioUnitario || 0), 250, y);
          doc.text(formatearMoneda(agenciero.totalPremios || 0), 350, y);
          doc.text(agenciero.pozoVacante > 0 ? formatearMoneda(agenciero.pozoVacante) : '-', 450, y);
          y += 18;

          if (agenciero.detalles && agenciero.detalles.length > 0) {
            const ags = agenciero.detalles.map(d => d.ctaCte || d.agencia).join(', ');
            doc.fontSize(8).fillColor('#431407').font('Helvetica-Bold')
               .text(`Cta. Cte. Ganadora(s): ${ags}`, 70, y);
            y += 15;
          }
          doc.fontSize(9);
        }
      }

      // ========== COMPARACIÓN CONTROL PREVIO ==========
      y += 15;
      doc.fontSize(11).fillColor('#1e293b').font('Helvetica-Bold').text('COMPARACIÓN CON CONTROL PREVIO', 50, y);
      y += 18;

      const comp = resData.comparacion || {};
      
      const compTable = [
        { item: 'Registros Válidos', cp: comp.registros?.controlPrevio, cs: comp.registros?.controlPosterior, ok: comp.registros?.coincide },
        { item: 'Apuestas Totales', cp: comp.apuestas?.controlPrevio, cs: comp.apuestas?.controlPosterior, ok: comp.apuestas?.coincide },
        { item: 'Recaudación Bruta', cp: comp.recaudacion?.controlPrevio, cs: comp.recaudacion?.controlPosterior, ok: comp.recaudacion?.coincide, isMoney: true }
      ];

      doc.rect(50, y, 495, 16).fill('#f1f5f9');
      doc.fontSize(8).fillColor('#475569').font('Helvetica-Bold');
      doc.text('CONCEPTO', 60, y + 4);
      doc.text('CONTROL PREVIO', 180, y + 4);
      doc.text('ESCRUTINIO', 330, y + 4);
      doc.text('ESTADO', 480, y + 4);
      y += 18;

      doc.font('Helvetica').fillColor('#333').fontSize(9);
      compTable.forEach(row => {
        doc.text(row.item, 60, y);
        doc.text(row.isMoney ? formatearMoneda(row.cp) : formatearNumero(row.cp), 180, y);
        doc.text(row.isMoney ? formatearMoneda(row.cs) : formatearNumero(row.cs), 330, y);
        doc.fillColor(row.ok ? '#10b981' : '#ef4444').font('Helvetica-Bold');
        doc.text(row.ok ? '✓ OK' : '✗ DIF', 480, y);
        doc.font('Helvetica').fillColor('#333');
        y += 16;
      });
    }

    // ══════════════════════════════════════════════════════════════
    // PIE DE PÁGINA Y FIRMAS
    // ══════════════════════════════════════════════════════════════
    doc.fontSize(8).fillColor('#94a3b8').font('Helvetica');
    doc.text(`Generado: ${fechaHoy} a las ${horaHoy} | Sistema SIMBA v2`, 50, 770, { width: 495, align: 'center' });

    // Finalizar
    doc.end();

  } catch (error) {
    console.error('Error generando acta control posterior:', error);
    res.status(500).json({
      success: false,
      message: 'Error generando PDF: ' + error.message
    });
  }
}

// ══════════════════════════════════════════════════════════════════════
// ACTA CONTROL PREVIO - QUINI 6
// ══════════════════════════════════════════════════════════════════════
async function generarActaControlPrevioQuini6(req, res, datos) {
  try {
    const resumen = datos.resumen || {};
    const comparacion = datos.comparacion || {};
    const seguridad = datos.seguridad || {};
    const porModalidad = datos.porModalidad || {};
    
    const doc = new PDFDocument({ 
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 }
    });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=Acta_ControlPrevio_Quini6_${datos.sorteo || 'sorteo'}.pdf`);
    doc.pipe(res);

    const fechaHoy = new Date().toLocaleDateString('es-AR', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    const horaHoy = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

    // ENCABEZADO
    doc.fontSize(10).fillColor('#666')
       .text('LOTERÍA DE LA CIUDAD DE BUENOS AIRES S.E.', 50, 30)
       .text('CONTROL PREVIO', 450, 30, { align: 'right' });
    doc.moveTo(50, 55).lineTo(545, 55).stroke('#ddd');

    // TÍTULO
    doc.fontSize(20).fillColor('#1e293b')
       .text('ACTA DE CONTROL PREVIO', 50, 80, { align: 'center' });
    doc.fontSize(14).fillColor('#7c3aed')
       .text('QUINI 6', 50, 105, { align: 'center' });
    doc.fontSize(12).fillColor('#64748b')
       .text(`Sorteo N° ${datos.sorteo || 'N/A'} - Archivo: ${datos.archivo || 'N/A'}`, 50, 125, { align: 'center' });
    doc.text(`${fechaHoy} - ${horaHoy}`, 50, 142, { align: 'center' });

    let y = 170;

    // RESUMEN GENERAL
    doc.fontSize(12).fillColor('#1e293b').font('Helvetica-Bold')
       .text('RESUMEN DE VENTAS', 50, y);
    y += 20;
    
    doc.fontSize(10).font('Helvetica').fillColor('#334155');
    const formatNum = (n) => (n || 0).toLocaleString('es-AR');
    const formatMoney = (n) => '$' + (n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 });
    
    doc.text(`Registros Válidos: ${formatNum(resumen.registros)}`, 50, y);
    doc.text(`Registros Anulados: ${formatNum(resumen.anulados)}`, 300, y);
    y += 18;
    doc.text(`Apuestas Totales: ${formatNum(resumen.apuestasTotal)}`, 50, y);
    doc.text(`Recaudación: ${formatMoney(resumen.recaudacion)}`, 300, y);
    y += 25;

    // COMPARACIÓN TXT vs XML
    if (comparacion.registros) {
      doc.fontSize(12).fillColor('#1e293b').font('Helvetica-Bold')
         .text('COMPARACIÓN TXT vs XML', 50, y);
      y += 20;
      
      doc.fontSize(9).font('Helvetica');
      
      // Cabecera tabla
      doc.fillColor('#64748b')
         .text('CONCEPTO', 50, y)
         .text('CALCULADO', 200, y)
         .text('OFICIAL', 300, y)
         .text('DIFERENCIA', 420, y);
      y += 15;
      doc.moveTo(50, y).lineTo(520, y).stroke('#e2e8f0');
      y += 8;
      
      const filas = [
        ['Registros Válidos', comparacion.registros?.calculado, comparacion.registros?.oficial, comparacion.registros?.diferencia],
        ['Registros Anulados', comparacion.anulados?.calculado, comparacion.anulados?.oficial, comparacion.anulados?.diferencia],
        ['Apuestas', comparacion.apuestas?.calculado, comparacion.apuestas?.oficial, comparacion.apuestas?.diferencia],
        ['Recaudación', comparacion.recaudacion?.calculado, comparacion.recaudacion?.oficial, comparacion.recaudacion?.diferencia]
      ];
      
      doc.fillColor('#334155');
      for (const fila of filas) {
        const esRecaudacion = fila[0] === 'Recaudación';
        doc.text(fila[0], 50, y);
        doc.text(esRecaudacion ? formatMoney(fila[1]) : formatNum(fila[1]), 200, y);
        doc.text(esRecaudacion ? formatMoney(fila[2]) : formatNum(fila[2]), 300, y);
        const dif = fila[3] || 0;
        doc.fillColor(dif === 0 ? '#22c55e' : '#ef4444')
           .text(dif === 0 ? '✓ OK' : (esRecaudacion ? formatMoney(dif) : formatNum(dif)), 420, y);
        doc.fillColor('#334155');
        y += 15;
      }
      y += 15;
    }

    // DESGLOSE Y COMPARACIÓN POR MODALIDAD
    const comparacionModalidad = datos.comparacionModalidad || {};
    
    if (porModalidad.tradicional || porModalidad.revancha || porModalidad.siempreSale) {
      doc.fontSize(12).fillColor('#1e293b').font('Helvetica-Bold')
         .text('COMPARACIÓN POR MODALIDAD (TXT vs XML)', 50, y);
      y += 20;
      
      doc.fontSize(8).font('Helvetica').fillColor('#64748b')
         .text('MODALIDAD', 50, y)
         .text('REG TXT', 130, y)
         .text('REG XML', 180, y)
         .text('DIF', 225, y)
         .text('REC TXT', 270, y)
         .text('REC XML', 350, y)
         .text('DIF', 430, y)
         .text('%', 480, y);
      y += 12;
      doc.moveTo(50, y).lineTo(520, y).stroke('#e2e8f0');
      y += 6;
      
      doc.fillColor('#334155').fontSize(8);
      const totalReg = resumen.registros || 1;
      
      // Función para mostrar fila de modalidad con comparación
      const filaModalidad = (nombre, mod, comp, color) => {
        const pct = ((mod?.registros || 0) / totalReg * 100).toFixed(1);
        const difReg = comp?.registros?.diferencia || 0;
        const difRec = Math.round(comp?.recaudacion?.diferencia || 0);
        
        doc.fillColor(color).text(nombre, 50, y);
        doc.fillColor('#334155')
           .text(formatNum(mod?.registros || 0), 130, y)
           .text(formatNum(comp?.registros?.oficial || 0), 180, y);
        doc.fillColor(difReg === 0 ? '#22c55e' : '#ef4444')
           .text(difReg === 0 ? '✓' : formatNum(difReg), 225, y);
        doc.fillColor('#334155')
           .text(formatMoney(mod?.recaudacion || 0), 270, y)
           .text(formatMoney(comp?.recaudacion?.oficial || 0), 350, y);
        doc.fillColor(difRec === 0 ? '#22c55e' : '#ef4444')
           .text(difRec === 0 ? '✓' : formatMoney(difRec), 430, y);
        doc.fillColor('#7c3aed').text(pct + '%', 480, y);
        y += 13;
      };
      
      if (porModalidad.tradicional) {
        filaModalidad('Tradicional', porModalidad.tradicional, comparacionModalidad.tradicional, '#22c55e');
      }
      if (porModalidad.revancha) {
        filaModalidad('Revancha', porModalidad.revancha, comparacionModalidad.revancha, '#3b82f6');
      }
      if (porModalidad.siempreSale) {
        filaModalidad('Siempre Sale', porModalidad.siempreSale, comparacionModalidad.siempreSale, '#f59e0b');
      }
      y += 10;
    }

    // VERIFICACIÓN DE SEGURIDAD
    doc.fontSize(12).fillColor('#1e293b').font('Helvetica-Bold')
       .text('VERIFICACIÓN DE SEGURIDAD', 50, y);
    y += 20;
    
    doc.fontSize(9).font('Helvetica');
    const archivos = seguridad.archivos || {};
    doc.fillColor(archivos.txt ? '#22c55e' : '#ef4444')
       .text(`${archivos.txt ? '✓' : '✗'} Archivo TXT`, 50, y);
    doc.fillColor(archivos.xml ? '#22c55e' : '#ef4444')
       .text(`${archivos.xml ? '✓' : '✗'} Archivo XML`, 150, y);
    doc.fillColor(archivos.hash ? '#22c55e' : '#ef4444')
       .text(`${archivos.hash ? '✓' : '✗'} Hash TXT`, 250, y);
    doc.fillColor(archivos.hashCP ? '#22c55e' : '#ef4444')
       .text(`${archivos.hashCP ? '✓' : '✗'} Hash XML`, 350, y);
    y += 18;
    
    const hashTxt = seguridad.verificado;
    const hashXml = seguridad.verificadoXml;
    doc.fillColor(hashTxt === true ? '#22c55e' : hashTxt === false ? '#ef4444' : '#f59e0b')
       .text(`Hash TXT: ${hashTxt === true ? '✓ Verificado' : hashTxt === false ? '✗ NO Coincide' : '? No verificable'}`, 50, y);
    doc.fillColor(hashXml === true ? '#22c55e' : hashXml === false ? '#ef4444' : '#f59e0b')
       .text(`Hash XML: ${hashXml === true ? '✓ Verificado' : hashXml === false ? '✗ NO Coincide' : '? No verificable'}`, 250, y);

    // PIE DE PÁGINA
    doc.fontSize(8).fillColor('#94a3b8').font('Helvetica');
    doc.text(`Generado: ${fechaHoy} a las ${horaHoy} | Sistema SIMBA v2`, 50, 770, { width: 495, align: 'center' });

    doc.end();

  } catch (error) {
    console.error('Error generando acta QUINI 6:', error);
    res.status(500).json({ success: false, message: 'Error generando PDF: ' + error.message });
  }
}

// ══════════════════════════════════════════════════════════════════════
// ACTA CONTROL PREVIO - BRINCO
// ══════════════════════════════════════════════════════════════════════
async function generarActaControlPrevioBrinco(req, res, datos) {
  try {
    const resumen = datos.resumen || {};
    const comparacion = datos.comparacion || {};
    const seguridad = datos.seguridad || {};
    
    const doc = new PDFDocument({ 
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 }
    });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=Acta_ControlPrevio_Brinco_${datos.sorteo || 'sorteo'}.pdf`);
    doc.pipe(res);

    const fechaHoy = new Date().toLocaleDateString('es-AR', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    const horaHoy = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

    // ENCABEZADO
    doc.fontSize(10).fillColor('#666')
       .text('LOTERÍA DE LA CIUDAD DE BUENOS AIRES S.E.', 50, 30)
       .text('CONTROL PREVIO', 450, 30, { align: 'right' });
    doc.moveTo(50, 55).lineTo(545, 55).stroke('#ddd');

    // TÍTULO
    doc.fontSize(20).fillColor('#1e293b')
       .text('ACTA DE CONTROL PREVIO', 50, 80, { align: 'center' });
    doc.fontSize(14).fillColor('#f59e0b')
       .text('BRINCO', 50, 105, { align: 'center' });
    doc.fontSize(12).fillColor('#64748b')
       .text(`Sorteo N° ${datos.sorteo || 'N/A'} - Archivo: ${datos.archivo || 'N/A'}`, 50, 125, { align: 'center' });
    doc.text(`${fechaHoy} - ${horaHoy}`, 50, 142, { align: 'center' });

    let y = 170;

    // RESUMEN GENERAL
    doc.fontSize(12).fillColor('#1e293b').font('Helvetica-Bold')
       .text('RESUMEN DE VENTAS', 50, y);
    y += 20;
    
    doc.fontSize(10).font('Helvetica').fillColor('#334155');
    const formatNum = (n) => (n || 0).toLocaleString('es-AR');
    const formatMoney = (n) => '$' + (n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 });
    
    doc.text(`Registros Válidos: ${formatNum(resumen.registros)}`, 50, y);
    doc.text(`Registros Anulados: ${formatNum(resumen.anulados)}`, 300, y);
    y += 18;
    doc.text(`Apuestas Totales: ${formatNum(resumen.apuestasTotal)}`, 50, y);
    doc.text(`Recaudación: ${formatMoney(resumen.recaudacion)}`, 300, y);
    y += 25;

    // COMPARACIÓN TXT vs XML
    if (comparacion.registros) {
      doc.fontSize(12).fillColor('#1e293b').font('Helvetica-Bold')
         .text('COMPARACIÓN TXT vs XML', 50, y);
      y += 20;
      
      doc.fontSize(9).font('Helvetica');
      
      // Cabecera tabla
      doc.fillColor('#64748b')
         .text('CONCEPTO', 50, y)
         .text('CALCULADO', 200, y)
         .text('OFICIAL', 300, y)
         .text('DIFERENCIA', 420, y);
      y += 15;
      doc.moveTo(50, y).lineTo(520, y).stroke('#e2e8f0');
      y += 8;
      
      const filas = [
        ['Registros Válidos', comparacion.registros?.calculado, comparacion.registros?.oficial, comparacion.registros?.diferencia],
        ['Registros Anulados', comparacion.anulados?.calculado, comparacion.anulados?.oficial, comparacion.anulados?.diferencia],
        ['Apuestas', comparacion.apuestas?.calculado, comparacion.apuestas?.oficial, comparacion.apuestas?.diferencia],
        ['Recaudación', comparacion.recaudacion?.calculado, comparacion.recaudacion?.oficial, comparacion.recaudacion?.diferencia]
      ];
      
      doc.fillColor('#334155');
      for (const fila of filas) {
        const esRecaudacion = fila[0] === 'Recaudación';
        doc.text(fila[0], 50, y);
        doc.text(esRecaudacion ? formatMoney(fila[1]) : formatNum(fila[1]), 200, y);
        doc.text(esRecaudacion ? formatMoney(fila[2]) : formatNum(fila[2]), 300, y);
        const dif = fila[3] || 0;
        doc.fillColor(dif === 0 ? '#22c55e' : '#ef4444')
           .text(dif === 0 ? '✓ OK' : (esRecaudacion ? formatMoney(dif) : formatNum(dif)), 420, y);
        doc.fillColor('#334155');
        y += 15;
      }
      y += 15;
    }

    // VERIFICACIÓN DE SEGURIDAD
    doc.fontSize(12).fillColor('#1e293b').font('Helvetica-Bold')
       .text('VERIFICACIÓN DE SEGURIDAD', 50, y);
    y += 20;
    
    doc.fontSize(9).font('Helvetica');
    const archivos = seguridad.archivos || {};
    doc.fillColor(archivos.txt ? '#22c55e' : '#ef4444')
       .text(`${archivos.txt ? '✓' : '✗'} Archivo TXT`, 50, y);
    doc.fillColor(archivos.xml ? '#22c55e' : '#ef4444')
       .text(`${archivos.xml ? '✓' : '✗'} Archivo XML`, 150, y);
    doc.fillColor(archivos.hash ? '#22c55e' : '#ef4444')
       .text(`${archivos.hash ? '✓' : '✗'} Hash TXT`, 250, y);
    doc.fillColor(archivos.hashCP ? '#22c55e' : '#ef4444')
       .text(`${archivos.hashCP ? '✓' : '✗'} Hash XML`, 350, y);
    y += 18;
    
    const hashTxt = seguridad.verificado;
    const hashXml = seguridad.verificadoXml;
    doc.fillColor(hashTxt === true ? '#22c55e' : hashTxt === false ? '#ef4444' : '#f59e0b')
       .text(`Hash TXT: ${hashTxt === true ? '✓ Verificado' : hashTxt === false ? '✗ NO Coincide' : '? No verificable'}`, 50, y);
    doc.fillColor(hashXml === true ? '#22c55e' : hashXml === false ? '#ef4444' : '#f59e0b')
       .text(`Hash XML: ${hashXml === true ? '✓ Verificado' : hashXml === false ? '✗ NO Coincide' : '? No verificable'}`, 250, y);

    // PIE DE PÁGINA
    doc.fontSize(8).fillColor('#94a3b8').font('Helvetica');
    doc.text(`Generado: ${fechaHoy} a las ${horaHoy} | Sistema SIMBA v2`, 50, 770, { width: 495, align: 'center' });

    doc.end();

  } catch (error) {
    console.error('Error generando acta BRINCO:', error);
    res.status(500).json({ success: false, message: 'Error generando PDF: ' + error.message });
  }
}

module.exports = {
  generarActaControlPrevio,
  generarActaNotarial,
  generarActaControlPosterior
};

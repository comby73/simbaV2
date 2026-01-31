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
        doc.rect(50, y, 495, 18).fill('#f1f5f9');
        doc.fillColor('#334155').text('Archivo', 55, y + 5);
        doc.text('Estado', 110, y + 5);
        doc.text('Hash (primeros 32 caracteres)', 170, y + 5);
        y += 18;
        // TXT
        let estadoTxt = '-';
        if (seg.hashOficial && seg.hashCalculado) {
          estadoTxt = seg.verificado ? 'OK' : 'NO COINCIDE';
        } else {
          estadoTxt = 'No disponible';
        }
        doc.fontSize(9).fillColor('#333').text('TXT', 55, y + 3);
        doc.fillColor(seg.verificado ? '#10b981' : '#ef4444').text(estadoTxt, 110, y + 3);
        const hashTxtShort = seg.hashCalculado ? seg.hashCalculado.substring(0, 32) + '...' : '-';
        doc.fontSize(7).fillColor('#555').text(hashTxtShort, 170, y + 4);
        y += 15;
        // XML
        let estadoXml = '-';
        if (seg.hashXmlOficial && seg.hashXmlCalculado) {
          estadoXml = seg.verificadoXml ? 'OK' : 'NO COINCIDE';
        } else {
          estadoXml = 'No disponible';
        }
        doc.fontSize(9).fillColor('#333').text('XML', 55, y + 3);
        doc.fillColor(seg.verificadoXml ? '#10b981' : '#ef4444').text(estadoXml, 110, y + 3);
        const hashXmlShort = seg.hashXmlCalculado ? seg.hashXmlCalculado.substring(0, 32) + '...' : '-';
        doc.fontSize(7).fillColor('#555').text(hashXmlShort, 170, y + 4);
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

    } else if (tipoJuego === 'Tombolina') {
      // ══════════════════════════════════════════════════════════════
      // TOMBOLINA - Reporte Específico
      // ══════════════════════════════════════════════════════════════
      const cp = resData.datosControlPrevio || {};
      const recValida = parseFloat(cp.recaudacion) || 0;
      const recAnulada = parseFloat(cp.recaudacionAnulada) || 0;
      const recTotal = recValida + recAnulada;

      // ========== RESUMEN GENERAL ==========
      doc.rect(50, y, 495, 22).fill('#1e3a5f');
      doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text('RESUMEN GENERAL', 60, y + 6);
      y += 28;

      const stats = [
        { label: 'RECAUDACIÓN BRUTA', value: formatearMoneda(recTotal), color: '#f59e0b', bg: '#fffbeb', border: '#fef3c7' },
        { label: 'RECAUDACIÓN NETA', value: formatearMoneda(recValida), color: '#10b981', bg: '#f0fdf4', border: '#dcfce7' },
        { label: 'TOTAL PREMIOS', value: formatearMoneda(resData.totalPremios), color: '#3b82f6', bg: '#eff6ff', border: '#dbeafe' },
        { label: 'TOTAL GANADORES', value: formatearNumero(resData.totalGanadores), color: '#7c3aed', bg: '#f5f3ff', border: '#ede9fe' }
      ];

      stats.forEach((s, i) => {
        const x = 50 + (i * 125);
        doc.rect(x, y, 120, 45).fill(s.bg).stroke(s.border);
        doc.fillColor(s.color).fontSize(7).font('Helvetica').text(s.label, x + 5, y + 8);
        doc.fontSize(12).font('Helvetica-Bold').text(s.value, x + 5, y + 22);
      });
      y += 55;

      // ========== COMPARACIÓN CON CONTROL PREVIO ==========
      doc.rect(50, y, 495, 20).fill('#334155');
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold').text('COMPARACIÓN CON CONTROL PREVIO', 60, y + 5);
      y += 25;

      const comp = resData.comparacion || {};
      const compRows = [
        {
          item: 'Tickets Válidos',
          cp: comp.registros?.controlPrevio || cp.registros || 0,
          cs: comp.registros?.controlPosterior || 0,
          ok: comp.registros?.coincide
        },
        {
          item: 'Tickets Anulados',
          cp: comp.registros?.anulados || cp.anulados || 0,
          cs: comp.registros?.anulados || 0,
          ok: true
        },
        {
          item: 'Recaudación Bruta',
          cp: comp.recaudacion?.controlPrevio ? comp.recaudacion.controlPrevio + (recAnulada) : recTotal,
          cs: comp.recaudacion?.controlPosterior ? comp.recaudacion.controlPosterior + (recAnulada) : recTotal,
          ok: comp.recaudacion?.coincide,
          isMoney: true
        },
        {
          item: 'Recaudación Válida',
          cp: comp.recaudacion?.controlPrevio || recValida,
          cs: comp.recaudacion?.controlPosterior || 0,
          ok: comp.recaudacion?.coincide,
          isMoney: true
        }
      ];

      doc.rect(50, y, 495, 16).fill('#e2e8f0');
      doc.fillColor('#475569').fontSize(8).font('Helvetica-Bold');
      doc.text('CONCEPTO', 60, y + 4);
      doc.text('CONTROL PREVIO', 200, y + 4);
      doc.text('ESCRUTINIO', 330, y + 4);
      doc.text('ESTADO', 470, y + 4);
      y += 18;

      compRows.forEach((row, i) => {
        if (i % 2 === 0) doc.rect(50, y - 2, 495, 16).fill('#f8fafc');
        doc.fillColor('#333').font('Helvetica').fontSize(9);
        doc.text(row.item, 60, y);
        doc.text(row.isMoney ? formatearMoneda(row.cp) : formatearNumero(row.cp), 200, y);
        doc.text(row.isMoney ? formatearMoneda(row.cs) : formatearNumero(row.cs), 330, y);
        doc.fillColor('#16a34a').font('Helvetica-Bold').text('✓ OK', 470, y);
        y += 16;
      });
      y += 15;

      // ========== DETALLE DE PREMIOS POR NIVEL ==========
      doc.rect(50, y, 495, 20).fill('#1e3a5f');
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold').text('DETALLE DE PREMIOS POR NIVEL DE ACIERTOS', 60, y + 5);
      y += 25;

      doc.rect(50, y, 495, 18).fill('#e2e8f0');
      doc.fillColor('#475569').fontSize(8).font('Helvetica-Bold');
      doc.text('NIVEL/CATEGORÍA', 60, y + 5);
      doc.text('DESCRIPCIÓN', 200, y + 5);
      doc.text('GANADORES', 320, y + 5, { width: 70, align: 'right' });
      doc.text('TOTAL PREMIOS', 420, y + 5, { width: 100, align: 'right' });
      y += 20;

      const reporte = resData.reporte || {};
      const niveles = [
        { label: '7 ACIERTOS', desc: 'Siete aciertos', data: reporte.aciertos7 },
        { label: '6 ACIERTOS', desc: 'Seis aciertos', data: reporte.aciertos6 },
        { label: '5 ACIERTOS', desc: 'Cinco aciertos', data: reporte.aciertos5 },
        { label: '4 ACIERTOS', desc: 'Cuatro aciertos', data: reporte.aciertos4 },
        { label: '3 ACIERTOS', desc: 'Tres aciertos', data: reporte.aciertos3 },
        { label: 'LETRAS', desc: '4 Letras exactas', data: reporte.letras, isLetra: true }
      ];

      niveles.forEach((n, i) => {
        const item = n.data || { ganadores: 0, premio: 0 };
        if (i % 2 === 0) doc.rect(50, y - 2, 495, 16).fill('#f8fafc');
        doc.fillColor(n.isLetra ? '#7c3aed' : '#1e293b').font('Helvetica-Bold').fontSize(8);
        doc.text(n.label, 60, y);
        doc.font('Helvetica').fillColor('#64748b').text(n.desc, 200, y);
        doc.fillColor('#333').text(formatearNumero(item.ganadores), 320, y, { width: 70, align: 'right' });
        doc.fillColor('#16a34a').font('Helvetica-Bold').text(formatearMoneda(item.premio), 420, y, { width: 100, align: 'right' });
        y += 16;
      });

      y += 20;

      // ========== EXTRACTO (20 NÚMEROS) ==========
      doc.rect(50, y, 495, 20).fill('#334155');
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold').text('EXTRACTO SORTEADO', 60, y + 5);
      y += 25;

      const extracto = resData.extracto || {};
      const numerosPoc = extracto.numeros || [];
      const letrasPoc = extracto.letras || [];

      doc.rect(50, y, 495, 55).fill('#f1f5f9').stroke('#e2e8f0');
      doc.fillColor('#1e40af').fontSize(14).font('Helvetica-Bold').text(numerosPoc.slice(0, 10).join(' - '), 60, y + 10, { align: 'center', width: 475 });
      doc.text(numerosPoc.slice(10, 20).join(' - '), 60, y + 30, { align: 'center', width: 475 });

      if (letrasPoc.length > 0) {
        doc.fillColor('#f59e0b').fontSize(16).text(letrasPoc.join(' '), 450, y + 10, { align: 'right', width: 80 });
      }

    } else {
      // ══════════════════════════════════════════════════════════════
      // POCEADA - Código existente
      // ══════════════════════════════════════════════════════════════
      const porNivel = resData.porNivel || {};
      const agenciero = resData.agenciero || {};

      // ========== RESUMEN GENERAL ==========
      doc.rect(50, y, 495, 22).fill('#1e3a5f');
      doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold')
        .text('RESUMEN GENERAL', 60, y + 6);
      y += 28;

      const totalPremiosPoc = resData.totalPremios || 0;
      const totalGanadoresPoc = resData.totalGanadores || 0;
      const recaudacionPoc = resData.comparacion?.recaudacion?.controlPrevio || 0;
      const tasaDevPoc = recaudacionPoc > 0 ? (totalPremiosPoc / recaudacionPoc * 100) : 0;

      const statsPoc = [
        { label: 'GANADORES TOTALES', value: formatearNumero(totalGanadoresPoc), color: '#10b981', bg: '#f0fdf4', border: '#dcfce7' },
        { label: 'TOTAL PREMIOS', value: formatearMoneda(totalPremiosPoc), color: '#3b82f6', bg: '#eff6ff', border: '#dbeafe' },
        { label: 'RECAUDACIÓN BRUTA', value: formatearMoneda(recaudacionPoc), color: '#f59e0b', bg: '#fffbeb', border: '#fef3c7' },
        { label: 'TASA DEVOLUCIÓN', value: `${tasaDevPoc.toFixed(2)}%`, color: '#7c3aed', bg: '#f5f3ff', border: '#ede9fe' }
      ];

      statsPoc.forEach((s, i) => {
        const x = 50 + (i * 125);
        doc.rect(x, y, 120, 45).fill(s.bg).stroke(s.border);
        doc.fillColor(s.color).fontSize(7).font('Helvetica').text(s.label, x + 5, y + 8);
        doc.fontSize(12).font('Helvetica-Bold').text(s.value, x + 5, y + 22);
      });
      y += 55;

      // ========== EXTRACTO ==========
      doc.fontSize(11).fillColor('#1e293b').font('Helvetica-Bold').text('EXTRACTO DEL SORTEO', 50, y);
      y += 18;

      const extracto = resData.extractoUsado || {};
      doc.fontSize(10).fillColor('#333').font('Helvetica');
      doc.text(`Números: ${(extracto.numeros || []).join(' - ')}`, 60, y);
      y += 15;
      doc.text(`Letras: ${(extracto.letras || '')}`, 60, y);
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

module.exports = {
  generarActaControlPrevio,
  generarActaNotarial,
  generarActaControlPosterior
};

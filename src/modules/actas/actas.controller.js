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

    // Crear cajas de estadísticas (4 en una fila)
    const boxWidth = 115;
    const boxHeight = 55;
    const boxes = [
      { label: 'Registros Válidos', value: formatearNumero(calc.registros), color: '#2563eb' },
      { label: 'Apuestas Totales', value: formatearNumero(calc.apuestasTotal), color: '#10b981' },
      { label: 'Recaudación', value: formatearMoneda(calc.recaudacion), color: '#f59e0b' },
      { label: 'Anulados', value: formatearNumero(calc.registrosAnulados), color: '#ef4444' }
    ];

    boxes.forEach((box, i) => {
      const x = 50 + (i * (boxWidth + 10));
      doc.roundedRect(x, y, boxWidth, boxHeight, 3).fillAndStroke('#f1f5f9', '#e2e8f0');
      doc.fontSize(8).fillColor('#666').text(box.label, x + 10, y + 8, { width: boxWidth - 20 });
      doc.fontSize(14).fillColor(box.color).text(box.value, x + 10, y + 25, { width: boxWidth - 20 });
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

      const comparaciones = [
        { concepto: 'Registros Válidos', calc: calc.registros, oficial: oficial.registrosValidos },
        { concepto: 'Registros Anulados', calc: calc.registrosAnulados, oficial: oficial.registrosAnulados },
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

    // Cajas de estadísticas (5 en una fila)
    const boxWidth = 95;
    const boxHeight = 50;
    const boxes = [
      { label: 'Registros Válidos', value: formatearNumero(resumen.registros), color: '#7c3aed' },
      { label: 'Anulados', value: formatearNumero(resumen.anulados), color: '#ef4444' },
      { label: 'Apuestas', value: formatearNumero(resumen.apuestasTotal), color: '#10b981' },
      { label: 'Recaudación', value: formatearMoneda(resumen.recaudacion), color: '#f59e0b' },
      { label: 'Venta Web', value: formatearNumero(resumen.ventaWeb || 0), color: '#3b82f6' }
    ];

    boxes.forEach((box, i) => {
      const x = 50 + (i * (boxWidth + 5));
      doc.roundedRect(x, y, boxWidth, boxHeight, 3).fillAndStroke('#f1f5f9', '#e2e8f0');
      doc.fontSize(7).fillColor('#666').text(box.label, x + 5, y + 6, { width: boxWidth - 10 });
      doc.fontSize(12).fillColor(box.color).text(box.value, x + 5, y + 22, { width: boxWidth - 10 });
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

      const items = [
        { concepto: 'Registros Válidos', calc: comparacion.registros?.calculado, oficial: comparacion.registros?.oficial },
        { concepto: 'Registros Anulados', calc: comparacion.anulados?.calculado, oficial: comparacion.anulados?.oficial },
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
    const tipoJuego = datos.tipoJuego || 'Poceada';
    
    // Crear documento PDF
    const doc = new PDFDocument({ 
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 }
    });
    
    // Configurar respuesta
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=Acta_ControlPosterior_${datos.numeroSorteo || 'sorteo'}.pdf`);
    
    doc.pipe(res);

    const fechaHoy = new Date().toLocaleDateString('es-AR', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    const horaHoy = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

    // ========== ENCABEZADO ==========
    doc.fontSize(10).fillColor('#666')
       .text('LOTERÍA DE LA CIUDAD', 50, 30)
       .text('CONTROL POSTERIOR', 450, 30, { align: 'right' });
    
    doc.moveTo(50, 45).lineTo(545, 45).stroke('#ddd');

    // ========== TÍTULO ==========
    doc.fontSize(18).fillColor('#1e293b')
       .text('ACTA DE CONTROL POSTERIOR (ESCRUTINIO)', 50, 70, { align: 'center' });
    
    doc.fontSize(14).fillColor('#2563eb')
       .text(tipoJuego.toUpperCase(), 50, 95, { align: 'center' });

    const resData = datos.resultado || {};
    const numeroSorteoReal = (datos.numeroSorteo && datos.numeroSorteo !== 'S/N') ? datos.numeroSorteo : (resData.numeroSorteo || 'S/N');
    const fechaSorteoReal = (datos.fechaSorteo && datos.fechaSorteo !== '-') ? datos.fechaSorteo : (resData.fechaSorteo || '-');

    // ========== INFORMACIÓN DEL SORTEO ==========
    doc.roundedRect(50, 125, 495, 60, 5).stroke('#e2e8f0');
    
    doc.fontSize(10).fillColor('#666').text('SORTEO N°', 70, 140);
    doc.fontSize(16).fillColor('#2563eb').text(numeroSorteoReal, 70, 155);
    
    doc.fontSize(9).fillColor('#666').text('FECHA SORTEO', 250, 140);
    doc.fontSize(10).fillColor('#333').text(fechaSorteoReal, 250, 155);
    
    doc.fontSize(9).fillColor('#666').text('FECHA PROCESAMIENTO', 400, 140);
    doc.fontSize(10).fillColor('#333').text(fechaHoy + ' ' + horaHoy, 400, 155);

    let y = 205;

    if (tipoJuego === 'Poceada') {
      const porNivel = resData.porNivel || {};
      const agenciero = resData.agenciero || {};

      // ========== EXTRACTO ==========
      doc.fontSize(12).fillColor('#1e293b').text('EXTRACTO DEL SORTEO', 50, y, { underline: true });
      y += 20;
      
      const extracto = resData.extractoUsado || {};
      doc.fontSize(10).fillColor('#333').text(`Números: ${ (extracto.numeros || []).join(' - ') }`, 60, y);
      y += 15;
      doc.text(`Letras: ${ (extracto.letras || '') }`, 60, y);
      y += 25;

      // ========== DETALLE DE PREMIOS ==========
      doc.fontSize(12).fillColor('#1e293b').text('DETALLE DE PREMIOS POR NIVEL', 50, y, { underline: true });
      y += 20;

      // Cabecera de tabla
      doc.rect(50, y, 495, 20).fill('#1e3a5f');
      doc.fontSize(9).fillColor('#ffffff').font('Helvetica-Bold');
      doc.text('NIVEL', 55, y + 6);
      doc.text('GANADORES', 150, y + 6);
      doc.text('PREMIO UNIT.', 250, y + 6);
      doc.text('TOTAL PREMIOS', 350, y + 6);
      doc.text('VACANTE', 450, y + 6);
      y += 28;

      const niveles = [
        { label: '8 ACIERTOS', id: 8 },
        { label: '7 ACIERTOS', id: 7 },
        { label: '6 ACIERTOS', id: 6 },
        { label: 'LETRAS', id: 'letras' }
      ];

      doc.font('Helvetica');
      levelsLoop: for (const nivel of niveles) {
        const n = porNivel[nivel.id] || { ganadores: 0, premioUnitario: 0, totalPremios: 0, pozoVacante: 0 };
        
        // Destacar fila de LETRAS
        if (nivel.id === 'letras') {
          doc.rect(50, y - 5, 495, 20).fill('#f0f9ff'); // Azul muy claro
        }

        doc.fillColor('#1e293b').font(nivel.id === 8 ? 'Helvetica-Bold' : 'Helvetica');
        doc.text(nivel.label, 55, y);
        doc.font('Helvetica');
        doc.text(formatearNumero(n.ganadores), 150, y);
        doc.text(formatearMoneda(n.premioUnitario), 250, y);
        doc.text(formatearMoneda(n.totalPremios), 350, y);
        doc.fillColor(n.ganadores === 0 ? '#ef4444' : '#1e293b');
        doc.text(n.ganadores === 0 ? formatearMoneda(n.pozoVacante) : '-', 450, y);
        
        y += 20;

        // Si es 8 aciertos, mostrar estímulo agenciero después
        if (nivel.id === 8) {
          // Fondo para estímulo
          doc.rect(50, y - 5, 495, 20).fill('#fff7ed'); // Naranja muy claro
          
          doc.fillColor('#9a3412').font('Helvetica-Bold');
          doc.text('ESTÍMULO AG.', 65, y);
          doc.font('Helvetica');
          doc.text(formatearNumero(agenciero.ganadores || 0), 150, y);
          doc.text(formatearMoneda(agenciero.premioUnitario || 0), 250, y);
          doc.text(formatearMoneda(agenciero.totalPremios || 0), 350, y);
          doc.text(agenciero.pozoVacante > 0 ? formatearMoneda(agenciero.pozoVacante) : '-', 450, y);
          y += 20;

          // Mostrar detalles de agencias si hay ganadores
          if (agenciero.detalles && agenciero.detalles.length > 0) {
            const ags = agenciero.detalles.map(d => d.ctaCte || d.agencia).join(', ');
            doc.fontSize(8.5).fillColor('#431407').font('Helvetica-Bold')
               .text(`Cta. Cte. Ganadora(s): ${ags}`, 70, y);
            y += 15;
          }
          doc.fontSize(9);
        }
      }

      // ========== COMPARACIÓN CONTROL PREVIO ==========
      y += 20;
      doc.fontSize(12).fillColor('#1e293b').text('COMPARACIÓN CON CONTROL PREVIO', 50, y, { underline: true });
      y += 20;

      const comp = resData.comparacion || {};
      
      const compTable = [
        { item: 'Registros Válidos', cp: comp.registros?.controlPrevio, cs: comp.registros?.controlPosterior, ok: comp.registros?.coincide },
        { item: 'Apuestas Totales', cp: comp.apuestas?.controlPrevio, cs: comp.apuestas?.controlPosterior, ok: comp.apuestas?.coincide },
        { item: 'Recaudación Bruta', cp: comp.recaudacion?.controlPrevio, cs: comp.recaudacion?.controlPosterior, ok: comp.recaudacion?.coincide, isMoney: true }
      ];

      doc.rect(50, y, 495, 18).fill('#f1f5f9');
      doc.fontSize(9).fillColor('#475569').font('Helvetica-Bold');
      doc.text('CONCEPTO', 60, y + 5);
      doc.text('CONTROL PREVIO', 180, y + 5);
      doc.text('ESCRUTINIO', 330, y + 5);
      doc.text('ESTADO', 480, y + 5);
      y += 22;

      doc.font('Helvetica').fillColor('#333');
      compTable.forEach(row => {
        doc.text(row.item, 60, y);
        doc.text(row.isMoney ? formatearMoneda(row.cp) : formatearNumero(row.cp), 180, y);
        doc.text(row.isMoney ? formatearMoneda(row.cs) : formatearNumero(row.cs), 330, y);
        doc.fillColor(row.ok ? '#10b981' : '#ef4444').text(row.ok ? 'OK' : 'DIFERENCIA', 480, y);
        doc.fillColor('#333');
        y += 18;
      });
    }

    // ========== FIRMAS ==========
    y = 700;
    doc.moveTo(100, y).lineTo(250, y).stroke('#333');
    doc.moveTo(350, y).lineTo(500, y).stroke('#333');
    
    doc.fontSize(10).fillColor('#666').font('Helvetica');
    doc.text('Firma Operador', 100, y + 5, { width: 150, align: 'center' });
    doc.text('Firma Supervisor', 350, y + 5, { width: 150, align: 'center' });

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

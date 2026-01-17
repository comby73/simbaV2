const PDFDocument = require('pdfkit');

// Generar PDF de Acta de Control Previo
const generarActaControlPrevio = async (req, res) => {
  try {
    const datos = req.body;
    
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
       .text('LOTERÍA NACIONAL S.E.', 50, 30)
       .text('CONTROL PREVIO', 450, 30, { align: 'right' });
    
    doc.moveTo(50, 55).lineTo(545, 55).stroke('#ddd');

    // ========== TÍTULO ==========
    doc.fontSize(20).fillColor('#1e293b')
       .text('ACTA DE CONTROL PREVIO', 50, 80, { align: 'center' });
    
    doc.fontSize(14).fillColor('#2563eb')
       .text('QUINIELA DE LA CIUDAD', 50, 105, { align: 'center' });

    // ========== INFORMACIÓN DEL SORTEO ==========
    doc.roundedRect(50, 135, 495, 70, 5).fillAndStroke('#f8fafc', '#e2e8f0');
    
    doc.fontSize(10).fillColor('#666').text('SORTEO N°', 70, 150);
    doc.fontSize(18).fillColor('#2563eb').text(calc.numeroSorteo || '-', 70, 165);
    
    doc.fontSize(9).fillColor('#666').text('ARCHIVO PROCESADO', 250, 150);
    doc.fontSize(10).fillColor('#333').text(datos.archivo || '-', 250, 165);
    
    doc.fontSize(9).fillColor('#666').text('FECHA PROCESAMIENTO', 250, 180);
    doc.fontSize(10).fillColor('#333').text(new Date(datos.fechaProcesamiento).toLocaleString('es-AR'), 250, 192);

    // ========== RESUMEN DE DATOS ==========
    let y = 220;
    
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
    y += 20;

    const online = calc.online || {};
    doc.fontSize(9).fillColor('#333');
    doc.text(`Registros: ${formatearNumero(online.registros || 0)}`, 55, y);
    doc.text(`Apuestas: ${formatearNumero(online.apuestas || 0)}`, 170, y);
    doc.text(`Recaudación: ${formatearMoneda(online.recaudacion || 0)}`, 285, y);
    doc.text(`Anulados: ${formatearNumero(online.anulados || 0)}`, 430, y);

    // ========== VERIFICACIÓN DE SEGURIDAD ==========
    y += 30;
    doc.fontSize(11).fillColor('#1e293b')
       .text('VERIFICACIÓN DE ARCHIVOS', 50, y, { underline: true });
    y += 20;

    if (seguridad.archivos) {
      const arch = seguridad.archivos;
      const items = [
        { label: 'TXT', ok: arch.txt },
        { label: 'XML', ok: arch.xml },
        { label: 'Hash TXT', ok: arch.hash },
        { label: 'Hash XML', ok: arch.hashCP },
        { label: 'PDF', ok: arch.pdf }
      ];
      
      doc.fontSize(9);
      items.forEach((item, i) => {
        const x = 55 + (i * 90);
        doc.fillColor(item.ok ? '#10b981' : '#ef4444')
           .text(`${item.ok ? '✓' : '✗'} ${item.label}`, x, y);
      });
      
      if (seguridad.verificado !== null) {
        y += 18;
        doc.fillColor(seguridad.verificado ? '#10b981' : '#ef4444')
           .fontSize(10)
           .text(`Hash: ${seguridad.verificado ? '✓ VERIFICADO' : '✗ NO COINCIDE'}`, 55, y);
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
    doc.text('Página 1 de 1', 450, 780, { align: 'right' });

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

function formatearMoneda(num) {
  return '$' + (num || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

module.exports = {
  generarActaControlPrevio,
  generarActaNotarial
};

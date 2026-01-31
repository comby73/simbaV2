const { successResponse, errorResponse } = require('../../shared/helpers');
const { guardarEscrutinioTombolina } = require('../../shared/escrutinio.helper');

/**
 * Tabla de premios de Tombolina (según referencia Python)
 * Estructura: [cantidad_numeros_jugados]: { [aciertos]: multiplicador }
 */
const PRIZE_TABLE = {
    3: { 3: 50 },
    4: { 4: 140, 3: 7 },
    5: { 5: 700, 4: 20, 3: 2.5 },
    6: { 6: 3500, 5: 70, 4: 7, 3: 1.5 },
    7: { 7: 8000, 6: 500, 5: 25, 4: 2.5, 3: 1 }
};

const LETTERS_PRIZE_FIXED = 1000;

/**
 * Ejecuta el escrutinio de Tombolina
 */
const ejecutarEscrutinioTombolina = async (req, res) => {
    try {
        const { registrosNTF, extracto, datosControlPrevio } = req.body;

        if (!registrosNTF || !extracto) {
            return errorResponse(res, 'Se requieren registros NTF y extracto de 20 números', 400);
        }

        const numerosSorteados = extracto.numeros || [];
        const letrasSorteados = extracto.letras || [];

        if (numerosSorteados.length < 20) {
            return errorResponse(res, 'El extracto debe tener 20 números', 400);
        }

        // Normalizar números del extracto (últimos 2 dígitos si vienen como 4)
        const setSorteados = new Set(
            numerosSorteados.map(n => String(n).padStart(2, '0').slice(-2))
        );

        const reporte = {
            aciertos7: { ganadores: 0, premio: 0 },
            aciertos6: { ganadores: 0, premio: 0 },
            aciertos5: { ganadores: 0, premio: 0 },
            aciertos4: { ganadores: 0, premio: 0 },
            aciertos3: { ganadores: 0, premio: 0 },
            letras: { ganadores: 0, premio: 0 }
        };

        const ganadoresDetalle = [];
        let totalPremios = 0;
        let totalGanadores = 0;

        for (const reg of registrosNTF) {
            const numerosJugados = reg.numeros || [];
            const cantNumerosJugados = parseInt(reg.cantidadNumeros) || numerosJugados.length;
            const stake = parseFloat(reg.valorApuesta) || 0;

            let aciertos = 0;
            const numerosAcertados = [];

            for (const num of numerosJugados) {
                const numNorm = String(num).padStart(2, '0');
                if (setSorteados.has(numNorm)) {
                    aciertos++;
                    numerosAcertados.push(numNorm);
                }
            }

            let ganoPorNumeros = false;
            let premioTicket = 0;

            // Verificar si ganó por números
            if (PRIZE_TABLE[cantNumerosJugados] && PRIZE_TABLE[cantNumerosJugados][aciertos]) {
                const multiplicador = PRIZE_TABLE[cantNumerosJugados][aciertos];
                premioTicket = stake * multiplicador;
                ganoPorNumeros = true;

                const key = `aciertos${aciertos}`;
                if (reporte[key]) {
                    reporte[key].ganadores++;
                    reporte[key].premio += premioTicket;
                }

                ganadoresDetalle.push({
                    ticket: reg.numeroTicket,
                    agencia: reg.agencia,
                    tipo: `Tombolina (${cantNumerosJugados} jugados, ${aciertos} aciertos)`,
                    aciertos: aciertos,
                    jugados: cantNumerosJugados,
                    numerosApostados: numerosJugados.join('-'),
                    detalle: `${aciertos} de ${cantNumerosJugados}`,
                    premio: premioTicket
                });
            }

            // Si no ganó por números, verificar letras
            if (!ganoPorNumeros && reg.letras && letrasSorteados.length === 4) {
                const letrasJugadas = String(reg.letras).trim().toUpperCase();
                const letrasExtracto = letrasSorteados.join('').toUpperCase();

                if (letrasJugadas === letrasExtracto) {
                    premioTicket = LETTERS_PRIZE_FIXED;
                    reporte.letras.ganadores++;
                    reporte.letras.premio += premioTicket;

                    ganadoresDetalle.push({
                        ticket: reg.numeroTicket,
                        agencia: reg.agencia,
                        tipo: 'Tombolina Letras',
                        aciertos: 0,
                        jugados: cantNumerosJugados,
                        numerosApostados: numerosJugados.join('-'),
                        detalle: `4 Letras (${letrasJugadas})`,
                        premio: premioTicket
                    });
                }
            }

            if (premioTicket > 0) {
                totalGanadores++;
                totalPremios += premioTicket;
            }
        }

        const totalAgenciero = totalPremios * 0.01;

        // Construir objeto de comparación si hay datos previo
        let comparacion = null;
        if (datosControlPrevio) {
            const cp = datosControlPrevio;
            // Sumamos los registros del NTF recibidos (válidos)
            const registrosPosterior = registrosNTF.length;
            const apuestasPosterior = registrosNTF.reduce((a, b) => a + (parseFloat(b.valorApuesta) || 0), 0);

            comparacion = {
                registros: {
                    controlPrevio: cp.totalApuestas || cp.registros || 0,
                    controlPosterior: registrosPosterior,
                    anulados: cp.totalAnulados || cp.anulados || 0,
                    coincide: (cp.totalApuestas || cp.registros || 0) === registrosPosterior
                },
                apuestas: {
                    controlPrevio: cp.totalApuestas || cp.registros || 0, // En tombola 1 reg = 1 apuesta
                    controlPosterior: registrosPosterior,
                    coincide: (cp.totalApuestas || cp.registros || 0) === registrosPosterior
                },
                recaudacion: {
                    controlPrevio: cp.totalRecaudacion || cp.recaudacion || 0,
                    controlPosterior: apuestasPosterior,
                    coincide: Math.abs((cp.totalRecaudacion || cp.recaudacion || 0) - apuestasPosterior) < 1
                }
            };
        }

        // GUARDAR EN BASE DE DATOS (resguardo)
        try {
            const resguardo = await guardarEscrutinioTombolina({
                totalPremios, totalGanadores, totalAgenciero, reporte, ganadoresDetalle, extracto: { numeros: Array.from(setSorteados), letras: letrasSorteados }
            }, datosControlPrevio, req.user);
            // Si quieres puedes adjuntar el resguardo a la respuesta
        } catch (errGuardar) {
            console.error('⚠️ Error guardando escrutinio Tombolina (no crítico):', errGuardar.message);
        }

        return successResponse(res, {
            totalPremios,
            totalGanadores,
            totalAgenciero,
            reporte,
            ganadoresDetalle,
            datosControlPrevio,
            comparacion,
            extracto: {
                numeros: Array.from(setSorteados),
                letras: letrasSorteados
            },
            reportePorExtracto: buildReportePorProvinciasTombolina(ganadoresDetalle)
        }, 'Escrutinio Tombolina completado');

    } catch (error) {
        console.error('Error escrutinio Tombolina:', error);
        return errorResponse(res, 'Error ejecutando escrutinio: ' + error.message, 500);
    }
};

/**
 * Construye el desglose por provincias para Tombolina
 */
function buildReportePorProvinciasTombolina(ganadoresDetalle) {
    const PROVINCIAS = [
        { codigo: '51', nombre: 'CABA' },
        { codigo: '53', nombre: 'Buenos Aires' },
        { codigo: '55', nombre: 'Córdoba' },
        { codigo: '72', nombre: 'Santa Fe' },
        { codigo: '00', nombre: 'Montevideo' },
        { codigo: '64', nombre: 'Mendoza' },
        { codigo: '59', nombre: 'Entre Ríos' }
    ];

    return PROVINCIAS.map(prov => {
        const ganadoresProv = ganadoresDetalle.filter(g => g.provincia === prov.codigo);

        // Agrupar por nivel de aciertos (3-7 y letras)
        const porNivelProv = {
            3: { ganadores: 0, pagado: 0 },
            4: { ganadores: 0, pagado: 0 },
            5: { ganadores: 0, pagado: 0 },
            6: { ganadores: 0, pagado: 0 },
            7: { ganadores: 0, pagado: 0 },
            letras: { ganadores: 0, pagado: 0 }
        };

        let totalPagado = 0;
        ganadoresProv.forEach(g => {
            const hits = g.aciertos || (g.tipo.includes('Letras') ? 'letras' : 0);
            if (porNivelProv[hits]) {
                porNivelProv[hits].ganadores++;
                porNivelProv[hits].pagado += (g.premio || 0);
                totalPagado += (g.premio || 0);
            }
        });

        return {
            codigo: prov.codigo,
            nombre: prov.nombre,
            totalGanadores: ganadoresProv.length,
            totalPagado: totalPagado,
            porNivel: porNivelProv,
            cargado: true
        };
    });
}

module.exports = {
    ejecutarEscrutinioTombolina
};

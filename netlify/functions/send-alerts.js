const admin = require('firebase-admin');
 
// Inicializar Firebase
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  } catch (error) {
    console.log("Fallo al inicializar Firebase:", error);
  }
}
 
// ─── Helpers de fecha en Argentina (UTC-3) ────────────────────────────────────
function fechaARG(timestamp) {
  const d = new Date(timestamp - 3 * 60 * 60 * 1000);
  return { anio: d.getUTCFullYear(), mes: d.getUTCMonth(), dia: d.getUTCDate() };
}
 
function mismaFecha(a, b) {
  return a.anio === b.anio && a.mes === b.mes && a.dia === b.dia;
}
 
// ─── Tipo de alerta que corresponde a cada item ───────────────────────────────
function tipoAlerta(item) {
  const ahora    = Date.now();
  const recargado = item.recargadoEn || item.creadoEn || ahora;
  const duracion  = (item.diasDuracion || 1) * 24 * 60 * 60 * 1000;
  const agota     = recargado + duracion;
 
  const hoyARG    = fechaARG(ahora);
  const mananaARG = fechaARG(ahora + 24 * 60 * 60 * 1000);
  const agotaARG  = fechaARG(agota);
 
  // Dura 1 día o menos → avisar hoy mismo
  if (item.diasDuracion <= 1 && mismaFecha(agotaARG, mananaARG)) return 'hoy';
 
  // Caso normal → avisar el día anterior al agotamiento
  if (mismaFecha(agotaARG, mananaARG)) return 'manana';
 
  // Ya se agotó hoy → aviso urgente
  if (mismaFecha(agotaARG, hoyARG)) return 'urgente';
 
  return null;
}
 
// ─── Verificar si es la hora configurada por el usuario ──────────────────────
function esHoraDeAviso(horaConfig) {
  const ahora    = Date.now();
  const ahoraARG = new Date(ahora - 3 * 60 * 60 * 1000);
  const horaARG  = ahoraARG.getUTCHours();
  const minARG   = ahoraARG.getUTCMinutes();
 
  const [horaConf, minConf] = (horaConfig || '09:00').split(':').map(Number);
 
  const minActual = horaARG * 60 + minARG;
  const minConf2  = horaConf * 60 + minConf;
 
  // Ventana de 29 minutos (el cron corre cada hora)
  return Math.abs(minActual - minConf2) <= 29;
}
 
exports.handler = async (event, context) => {
  try {
    const db        = admin.firestore();
    const messaging = admin.messaging();
 
    // Hora actual en Argentina para el log
    const ahoraARG = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const horaLog  = `${ahoraARG.getUTCHours()}:${String(ahoraARG.getUTCMinutes()).padStart(2,'0')}`;
 
    // Leer todos los usuarios de Firestore
    const snapshot = await db.collection('usuarios').get();
 
    let revisados = 0;
    let enviados  = 0;
    const resultados = [];
 
    for (const doc of snapshot.docs) {
      const usuario = doc.data();
      const config  = usuario.config || {};
      const items   = usuario.items  || [];
      revisados++;
 
      // Saltar si notificaciones desactivadas
      if (config.notifOff) continue;
 
      // Saltar si no es la hora configurada por este usuario
      if (!esHoraDeAviso(config.hora || '09:00')) continue;
 
      // Verificar que no se mandó alerta hoy ya
      const hoyKey = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
      if (usuario.ultimaAlerta === hoyKey) continue;
 
      const persona  = config.persona || 'la persona cuidada';
      const cuidador = config.nombre  || 'Cuidador/a';
      const topic    = `alertas-${doc.id.slice(0, 20).replace(/[^a-zA-Z0-9]/g, '')}`;
 
      // Revisar qué items necesitan alerta
      const itemsConAlerta = [];
      items.forEach(item => {
        const alerta = tipoAlerta(item);
        if (alerta) itemsConAlerta.push({ item, alerta });
      });
 
      if (itemsConAlerta.length === 0) continue;
 
      // Armar y mandar una notificación por cada item con alerta
      for (const { item, alerta } of itemsConAlerta) {
        const nombre = item.nombre || 'un producto';
        let title, body;
 
        if (alerta === 'manana') {
          title = `🌿 Cuidado Diario`;
          body  = `Hola ${cuidador}, a ${persona} le queda 1 día de ${nombre}. Mañana se agota — acordate de comprarlo.`;
        } else if (alerta === 'hoy') {
          title = `🌿 Cuidado Diario`;
          body  = `Hola ${cuidador}, ${nombre} de ${persona} se agota hoy. Tené todo listo.`;
        } else if (alerta === 'urgente') {
          title = `⚠️ Cuidado Diario`;
          body  = `Hola ${cuidador}, hoy se agotó ${nombre} de ${persona}. ¡Necesitás comprarlo!`;
        }
 
        try {
          // Intentar mandar por token directo primero, sino por topic
          const token = usuario.token;
          const mensaje = {
            notification: { title, body },
            android: {
              priority: 'high',
              notification: { sound: 'default', channelId: 'cuidado-alertas' }
            },
            apns: {
              payload: { aps: { sound: 'default', badge: 1 } }
            }
          };
 
          if (token) {
            await messaging.send({ ...mensaje, token });
          } else {
            await messaging.send({ ...mensaje, topic });
          }
 
          enviados++;
          resultados.push({ persona, item: nombre, tipo: alerta });
        } catch (e) {
          console.error(`Error enviando notif para ${nombre}:`, e.message);
        }
      }
 
      // Marcar que ya se mandó alerta hoy
      await db.collection('usuarios').doc(doc.id).update({ ultimaAlerta: hoyKey });
    }
 
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, horaARG: horaLog, revisados, enviados, resultados })
    };
 
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: error.message })
    };
  }
};

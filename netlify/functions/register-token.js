const admin = require('firebase-admin');
 
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
 
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type':                 'application/json'
  };
 
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
 
  try {
    const { token, config, items, fijos } = JSON.parse(event.body || '{}');
    if (!token) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Token requerido' }) };
 
    const db = admin.firestore();
 
    // Guardar/actualizar usuario en Firestore
    await db.collection('usuarios').doc(token).set({
      token,
      config:    config || {},
      items:     items  || [],
      fijos:     fijos  || [],
      updatedAt: new Date().toISOString()
    });
 
    // Suscribir el token al topic de alertas (como respaldo)
    const topicId = token.slice(0, 20).replace(/[^a-zA-Z0-9]/g, '');
    try {
      await admin.messaging().subscribeToTopic(token, `alertas-${topicId}`);
    } catch(e) {
      // No crítico si falla la suscripción al topic
      console.log('Topic subscription warning:', e.message);
    }
 
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, message: 'Usuario registrado correctamente' })
    };
 
  } catch(err) {
    console.error('register-token error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};

const admin = require('firebase-admin');

// 1. Inicializamos Firebase de forma segura
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Esto soluciona problemas comunes con los saltos de línea de la clave
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  } catch (error) {
    console.log("Fallo al inicializar Firebase:", error);
  }
}

exports.handler = async (event, context) => {
  try {
    // 2. Armamos la notificación de prueba
    const mensaje = {
      notification: {
        title: '¡Alerta de Cuidado Diario!',
        body: 'Hola Benjamín, a Hugo le quedan pocos cigarrillos y se acaban mañana. Acordate de comprarle.',
      },
      // Enviamos la alerta a todos los celulares suscritos a este "tema"
      topic: 'alertas-hugo'
    };

    // 3. Disparamos la alerta
    const response = await admin.messaging().send(mensaje);

    // 4. Le avisamos a Netlify y a cron-job que todo salió bien
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        ok: true, 
        mensaje: "¡Notificación enviada con éxito a Firebase!",
        respuesta: response
      })
    };

  } catch (error) {
    // Si hay un error, lo mostramos claramente en la pantalla
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        ok: false, 
        error: error.message 
      })
    };
  }
};

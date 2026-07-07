// Netlify Function: register-token.js
// Guarda el token FCM del usuario junto con sus items y configuración
// Usa el filesystem temporal de Netlify Functions + una variable de entorno
// como almacén simple. En producción real usarías una DB, pero para uso
// personal/familiar esto es suficiente y gratuito.

const fs   = require('fs');
const path = require('path');

// Netlify Functions tienen acceso a /tmp para escritura temporal,
// pero se pierde entre invocaciones. Usamos una variable de entorno
// TOKENS_DATA para persistencia real (se guarda como JSON en env var).
// La actualizamos vía la Netlify API en cada registro.

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { token, config, items, fijos } = body;

    if (!token) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Token requerido' }) };
    }

    // Leer tokens existentes del env var TOKENS_DATA
    let tokensData = {};
    try {
      const raw = process.env.TOKENS_DATA || '{}';
      tokensData = JSON.parse(raw);
    } catch(e) { tokensData = {}; }

    // Guardar/actualizar este usuario
    tokensData[token] = {
      token,
      config:      config  || {},
      items:       items   || [],
      fijos:       fijos   || [],
      updatedAt:   new Date().toISOString()
    };

    // Persistir actualizando la variable de entorno via Netlify API
    const siteId  = process.env.NETLIFY_SITE_ID;
    const apiKey  = process.env.NETLIFY_API_KEY;

    if (siteId && apiKey) {
      await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/env/TOKENS_DATA`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: [{ value: JSON.stringify(tokensData), context: 'all' }]
        })
      });
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, message: 'Token registrado correctamente' })
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

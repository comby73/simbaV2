const https = require('https');
https.get('https://chatomar.shop/', res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const scoring = data.match(/scoring-agencias\.js\?v=[\w]+/g);
    const styles = data.match(/styles\.css\?v=[\w]+/g);
    const appjs = data.match(/app\.js\?v=[\w]+/g);
    console.log('scoring-agencias.js en produccion:', scoring);
    console.log('styles.css en produccion:', styles);
    console.log('app.js en produccion:', appjs);
  });
}).on('error', e => console.error('Error:', e.message));

const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = dir + '/' + file;
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else { 
      if (file.endsWith('.tsx') || file.endsWith('.ts')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk('src/features');
files.forEach(file => {
  if (file.includes('EndUser') || file.includes('Login') || file.includes('CatalogForm')) return;
  
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;
  
  // Replace navigate('/path') with navigate('/app/path')
  const newContent = content.replace(/navigate\(['"]\/(?!app\/|portal\/)([^'"]+)['"]\)/g, (match, p1) => {
    changed = true;
    return `navigate('/app/${p1}')`;
  }).replace(/navigate\(`\/(?!app\/|portal\/)([^`]+)`\)/g, (match, p1) => {
    changed = true;
    return `navigate(\`/app/${p1}\`)`;
  });
  
  if (changed) {
    fs.writeFileSync(file, newContent, 'utf8');
    console.log('Fixed', file);
  }
});

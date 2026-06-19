const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
const bible  = JSON.parse(fs.readFileSync(path.join(dataDir, 'bible.json'), 'utf8'));
const refs   = JSON.parse(fs.readFileSync(path.join(dataDir, 'bible_100.json'), 'utf8'));

const verses = refs
  .map(ref => ({ ref, text: (bible[ref] || '').trim() }))
  .filter(v => v.text);

fs.writeFileSync(path.join(dataDir, 'verses.json'), JSON.stringify(verses, null, 2), 'utf8');
console.log(`verses.json 생성 완료: ${verses.length}구절`);

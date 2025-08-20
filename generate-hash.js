const bcrypt = require('bcrypt');

bcrypt.hash('Derkv10', 10).then(hash => {
  console.log('Hash généré :', hash);
});
